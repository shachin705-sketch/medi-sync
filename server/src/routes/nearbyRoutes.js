const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { calculateHaversineDistance, estimateRoadTravel } = require('../services/haversineService');
const { calculateMedicineStockMetrics } = require('../services/stockService');

// GET nearby stock for a single medicine
// /nearby-stock?medicine=med-pcm-syp&phc=phc-thiruporur&radius=50
router.get('/', (req, res) => {
  const { medicine, phc, radius = 100 } = req.query;

  if (!medicine) {
    return res.status(400).json({ error: 'Medicine parameter is required' });
  }

  const requestingPhcId = phc || 'phc-thiruporur';
  const requestingPhc = db.prepare('SELECT * FROM phcs WHERE id = ?').get(requestingPhcId);
  if (!requestingPhc) {
    return res.status(404).json({ error: 'Requesting PHC not found' });
  }

  const medicineInfo = db.prepare('SELECT * FROM medicines WHERE id = ?').get(medicine);
  if (!medicineInfo) {
    return res.status(404).json({ error: 'Medicine not found' });
  }

  // Find all other PHCs having this medicine
  const otherPhcs = db.prepare(`
    SELECT cs.quantity, cs.batch_number, cs.expiry_date,
           p.id as phc_id, p.name as phc_name, p.block, p.district, p.latitude, p.longitude, p.phone, p.cold_chain_equipped
    FROM current_stock cs
    JOIN phcs p ON cs.phc_id = p.id
    WHERE cs.medicine_id = ? AND cs.phc_id != ?
  `).all(medicine, requestingPhcId);

  const results = [];

  otherPhcs.forEach(target => {
    const crowDist = calculateHaversineDistance(
      requestingPhc.latitude,
      requestingPhc.longitude,
      target.latitude,
      target.longitude
    );

    if (crowDist <= Number(radius)) {
      const metrics = calculateMedicineStockMetrics(target.phc_id, medicine);
      const safeBufferDays = medicineInfo.critical_flag ? 30 : 25;
      const spareableSurplus = metrics ? Math.max(0, Math.round(metrics.current_quantity - (metrics.effective_adc * safeBufferDays))) : 0;
      const road = estimateRoadTravel(crowDist);

      results.push({
        phc_id: target.phc_id,
        phc_name: target.phc_name,
        block: target.block,
        district: target.district,
        latitude: target.latitude,
        longitude: target.longitude,
        phone: target.phone,
        cold_chain_equipped: Boolean(target.cold_chain_equipped),
        current_stock: target.quantity,
        spareable_surplus: spareableSurplus,
        days_left: metrics ? metrics.days_left : 0,
        status: metrics ? metrics.status : 'green',
        status_label: metrics ? metrics.status_label : 'Available',
        batch_number: target.batch_number,
        expiry_date: target.expiry_date,
        distance_km: crowDist,
        road_distance_km: road.roadDistanceKm,
        estimated_minutes: road.estimatedMinutes,
        can_fulfill_surplus: spareableSurplus > 0
      });
    }
  });

  // Sort nearest first
  results.sort((a, b) => a.distance_km - b.distance_km);

  // Requesting PHC metrics
  const requestingMetrics = calculateMedicineStockMetrics(requestingPhcId, medicine);

  res.json({
    requesting_phc: {
      ...requestingPhc,
      current_metrics: requestingMetrics
    },
    medicine: medicineInfo,
    results
  });
});

// POST multi-medicine basket search: finds PHCs that can fulfill multiple shortages together
router.post('/multi-basket', (req, res) => {
  const { medicines, phc = 'phc-thiruporur', radius = 100 } = req.body;
  if (!Array.isArray(medicines) || medicines.length === 0) {
    return res.status(400).json({ error: 'Medicines array is required' });
  }

  const requestingPhc = db.prepare('SELECT * FROM phcs WHERE id = ?').get(phc);
  if (!requestingPhc) {
    return res.status(404).json({ error: 'Requesting PHC not found' });
  }

  // Get all other PHCs
  const allOtherPhcs = db.prepare('SELECT * FROM phcs WHERE id != ?').all(phc);
  const phcEvaluations = [];

  allOtherPhcs.forEach(candidate => {
    const crowDist = calculateHaversineDistance(
      requestingPhc.latitude,
      requestingPhc.longitude,
      candidate.latitude,
      candidate.longitude
    );

    if (crowDist > Number(radius)) return;

    const road = estimateRoadTravel(crowDist);
    let matchedItems = [];
    let totalSurplusUnits = 0;

    medicines.forEach(medId => {
      const medRow = db.prepare('SELECT * FROM medicines WHERE id = ?').get(medId);
      const stockRow = db.prepare('SELECT * FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(candidate.id, medId);

      if (stockRow && stockRow.quantity > 0) {
        const metrics = calculateMedicineStockMetrics(candidate.id, medId);
        const safeBufferDays = medRow.critical_flag ? 30 : 25;
        const surplus = metrics ? Math.max(0, Math.round(metrics.current_quantity - (metrics.effective_adc * safeBufferDays))) : 0;

        if (surplus > 0) {
          totalSurplusUnits += surplus;
          matchedItems.push({
            medicine_id: medId,
            medicine_name: medRow.name,
            unit: medRow.unit,
            current_stock: stockRow.quantity,
            surplus,
            days_left: metrics ? metrics.days_left : 0,
            cold_chain_flag: Boolean(medRow.cold_chain_flag)
          });
        }
      }
    });

    if (matchedItems.length > 0) {
      phcEvaluations.push({
        phc_id: candidate.id,
        phc_name: candidate.name,
        block: candidate.block,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        phone: candidate.phone,
        distance_km: crowDist,
        road_distance_km: road.roadDistanceKm,
        estimated_minutes: road.estimatedMinutes,
        fulfilled_count: matchedItems.length,
        total_requested: medicines.length,
        coverage_percent: Math.round((matchedItems.length / medicines.length) * 100),
        items: matchedItems
      });
    }
  });

  // Sort by coverage percent descending, then distance ascending
  phcEvaluations.sort((a, b) => b.fulfilled_count - a.fulfilled_count || a.distance_km - b.distance_km);

  res.json({
    requesting_phc: requestingPhc,
    basket_count: medicines.length,
    candidates: phcEvaluations
  });
});

module.exports = router;
