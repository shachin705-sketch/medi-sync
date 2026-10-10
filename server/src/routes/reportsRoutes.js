const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { getPhcDaysOfStock } = require('../services/stockService');

// GET District Executive Summary
router.get('/district-summary', (req, res) => {
  // Total PHCs
  const totalPhcs = db.prepare('SELECT COUNT(id) as count FROM phcs').get().count;

  // Total medicines
  const totalMedicines = db.prepare('SELECT COUNT(id) as count FROM medicines').get().count;

  // Stockout count across district
  const stockoutRow = db.prepare(`
    SELECT COUNT(id) as count FROM current_stock WHERE quantity = 0
  `).get();

  // Active Critical Alerts
  const criticalAlertsRow = db.prepare(`
    SELECT COUNT(id) as count FROM alerts WHERE severity = 'critical' AND status IN ('new', 'acknowledged')
  `).get();

  // Near Expiry Count (< 60 days)
  const nearExpiryRow = db.prepare(`
    SELECT COUNT(id) as count FROM current_stock 
    WHERE expiry_date IS NOT NULL AND julianday(expiry_date) - julianday('now') <= 60
  `).get();

  // Total Transfers Completed and In Progress
  const transferStats = db.prepare(`
    SELECT 
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_transfers,
      SUM(CASE WHEN status IN ('requested', 'approved', 'in_transit') THEN 1 ELSE 0 END) as pending_transfers
    FROM transfer_requests
  `).get();

  // Top Shortage Medicines across the district
  const topShortages = db.prepare(`
    SELECT m.id, m.name, m.category, m.unit, m.critical_flag,
           COUNT(cs.id) as low_stock_phc_count,
           SUM(cs.quantity) as total_district_stock
    FROM current_stock cs
    JOIN medicines m ON cs.medicine_id = m.id
    WHERE cs.quantity < 30
    GROUP BY m.id
    ORDER BY low_stock_phc_count DESC
    LIMIT 6
  `).all();

  // Block-wise risk breakdown
  const blocks = db.prepare(`SELECT DISTINCT block FROM phcs`).all().map(b => b.block);
  const blockStats = blocks.map(blockName => {
    const phcsInBlock = db.prepare(`SELECT id, name FROM phcs WHERE block = ?`).all(blockName);
    let redCount = 0;
    let amberCount = 0;
    let greenCount = 0;

    phcsInBlock.forEach(p => {
      const items = getPhcDaysOfStock(p.id);
      const reds = items.filter(i => i.status === 'red').length;
      const ambers = items.filter(i => i.status === 'amber').length;
      if (reds > 0) redCount++;
      else if (ambers > 2) amberCount++;
      else greenCount++;
    });

    return {
      block: blockName,
      phc_count: phcsInBlock.length,
      red_risk_phcs: redCount,
      amber_risk_phcs: amberCount,
      green_risk_phcs: greenCount,
      overall_risk: redCount > 0 ? 'HIGH' : (amberCount > 0 ? 'MODERATE' : 'LOW')
    };
  });

  res.json({
    district_name: 'Chengalpattu District, Tamil Nadu',
    total_phcs: totalPhcs,
    total_medicines: totalMedicines,
    total_stockouts: stockoutRow.count,
    critical_alerts: criticalAlertsRow.count,
    near_expiry_count: nearExpiryRow.count,
    completed_transfers: transferStats.completed_transfers || 0,
    pending_transfers: transferStats.pending_transfers || 0,
    avg_redistribution_response_hours: 4.2,
    top_shortage_medicines: topShortages,
    block_risk_breakdown: blockStats
  });
});

// GET Block Risk Map Data
router.get('/block-risk-map', (req, res) => {
  const { block } = req.query;
  let sql = 'SELECT * FROM phcs WHERE 1=1';
  const params = [];
  if (block) {
    sql += ' AND block = ?';
    params.push(block);
  }

  const phcs = db.prepare(sql).all(...params);

  const mapped = phcs.map(phc => {
    const stockStats = getPhcDaysOfStock(phc.id);
    const redItems = stockStats.filter(s => s.status === 'red');
    const amberItems = stockStats.filter(s => s.status === 'amber');
    const greenItems = stockStats.filter(s => s.status === 'green');

    let riskLevel = 'green';
    if (redItems.length >= 2) riskLevel = 'red';
    else if (redItems.length === 1 || amberItems.length >= 3) riskLevel = 'amber';

    return {
      id: phc.id,
      name: phc.name,
      code: phc.code,
      block: phc.block,
      district: phc.district,
      latitude: phc.latitude,
      longitude: phc.longitude,
      phone: phc.phone,
      contact_person: phc.contact_person,
      population_served: phc.population_served,
      risk_level: riskLevel,
      red_medicines_count: redItems.length,
      amber_medicines_count: amberItems.length,
      green_medicines_count: greenItems.length,
      critical_shortages: redItems.slice(0, 3).map(r => ({
        medicine_name: r.medicine_name,
        days_left: r.days_left,
        current_quantity: r.current_quantity,
        unit: r.unit
      }))
    };
  });

  res.json(mapped);
});

// GET CSV Export
router.get('/export-csv', (req, res) => {
  const { phc, type = 'stock' } = req.query;
  const phcId = phc || 'phc-thiruporur';

  if (type === 'stock') {
    const data = getPhcDaysOfStock(phcId);
    let csv = 'Medicine Name,Generic Name,Category,Current Stock,Unit,7-Day ADC,Days Left,Status,Trend,Rate of Decline\n';
    data.forEach(d => {
      csv += `"${d.medicine_name}","${d.generic_name}","${d.category}",${d.current_quantity},"${d.unit}",${d.adc7},${d.days_left},"${d.status_label}","${d.trend}",${d.rate_of_decline}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=MediSync_Stock_${phcId}.csv`);
    return res.send(csv);
  }

  if (type === 'alerts') {
    const alerts = db.prepare(`
      SELECT a.*, m.name as medicine_name, p.name as phc_name
      FROM alerts a
      JOIN medicines m ON a.medicine_id = m.id
      JOIN phcs p ON a.phc_id = p.id
    `).all();

    let csv = 'Alert ID,PHC Name,Medicine Name,Type,Severity,Days Left,Status,Created At,Message\n';
    alerts.forEach(a => {
      csv += `"${a.id}","${a.phc_name}","${a.medicine_name}","${a.alert_type}","${a.severity}",${a.days_left || ''},"${a.status}","${a.created_at}","${a.message.replace(/"/g, '""')}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=MediSync_Alerts.csv');
    return res.send(csv);
  }

  res.status(400).send('Invalid export type');
});

module.exports = router;
