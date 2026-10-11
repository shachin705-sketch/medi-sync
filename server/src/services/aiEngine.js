const { db } = require('../db/database');
const { calculateHaversineDistance, estimateRoadTravel } = require('./haversineService');
const { calculateMedicineStockMetrics } = require('./stockService');

/**
 * Seasonal Multiplier Matrix for Tamil Nadu Public Health Epidemiology:
 * - Oct - Dec: Northeast Monsoon -> Spike in Viral fevers, Dengue, Flu (PCM, Antibiotics, Antihistamines, ASV)
 * - Apr - Jun: Peak Summer (Agni Nakshatram) -> Surge in Pediatric Dehydration / Diarrhea (ORS, Zinc)
 * - Jul - Sep: Southwest Monsoon edge -> Steady rural trauma & snakebites
 */
function getSeasonalMultiplier(category, medicineName, month = new Date().getMonth() + 1) {
  const name = (medicineName || '').toLowerCase();
  const cat = (category || '').toLowerCase();

  // Monsoon season in TN (October, November, December)
  if (month >= 10 && month <= 12) {
    if (name.includes('paracetamol') || name.includes('amoxicillin') || name.includes('cetirizine')) {
      return { multiplier: 1.55, season: 'Northeast Monsoon (Fever & RTI Surge)', bufferIncreaseDays: 14 };
    }
    if (name.includes('snake') || name.includes('asv') || name.includes('antidote')) {
      return { multiplier: 1.45, season: 'Monsoon Flooding & Agricultural Snakebite Surge', bufferIncreaseDays: 12 };
    }
  }

  // Peak Summer season (April, May, June)
  if (month >= 4 && month <= 6) {
    if (name.includes('ors') || name.includes('zinc') || name.includes('rehydration')) {
      return { multiplier: 1.65, season: 'Tamil Nadu Summer Heatwave (Dehydration & Diarrhea)', bufferIncreaseDays: 15 };
    }
  }

  // Winter / Post-monsoon (January, February)
  if (month === 1 || month === 2) {
    if (name.includes('salbutamol') || name.includes('inhaler') || name.includes('cetirizine')) {
      return { multiplier: 1.30, season: 'Winter Morning Smog & Bronchospasm', bufferIncreaseDays: 7 };
    }
  }

  return { multiplier: 1.0, season: 'Standard Baseline Season', bufferIncreaseDays: 0 };
}

/**
 * 1. Time-Series Consumption Forecasting & Run-Out Date Prediction
 */
function getMedicineForecast(phcId, medicineId) {
  const metrics = calculateMedicineStockMetrics(phcId, medicineId);
  if (!metrics) return null;

  // Retrieve 60 days historical daily consumption
  const history = db.prepare(`
    SELECT entry_date, dispensed_quantity, closing_stock
    FROM stock_entries
    WHERE phc_id = ? AND medicine_id = ?
    ORDER BY entry_date DESC
    LIMIT 60
  `).all(phcId, medicineId);

  // Reverse so it is chronological (oldest to newest)
  const chronological = [...history].reverse();
  const dispensedSeries = chronological.map(r => r.dispensed_quantity || 0);

  // Exponential Smoothing with alpha = 0.35
  const alpha = 0.35;
  let smoothed = dispensedSeries.length > 0 ? dispensedSeries[0] : metrics.effective_adc;
  dispensedSeries.forEach(val => {
    smoothed = alpha * val + (1 - alpha) * smoothed;
  });

  // Factor in Seasonality
  const currentMonth = new Date().getMonth() + 1;
  const seasonal = getSeasonalMultiplier(metrics.category, metrics.medicine_name, currentMonth);
  const forecastedDailyRate = Math.max(0.1, Math.round(smoothed * seasonal.multiplier * 10) / 10);

  // Projected Run-out Date
  const projectedDaysLeft = Math.round((metrics.current_quantity / forecastedDailyRate) * 10) / 10;
  const runOutDate = new Date();
  runOutDate.setDate(runOutDate.getDate() + Math.floor(projectedDaysLeft));

  // Next 14-day projection
  const futureProjections = [];
  let simulatedStock = metrics.current_quantity;
  for (let i = 1; i <= 14; i++) {
    const projDate = new Date();
    projDate.setDate(projDate.getDate() + i);
    simulatedStock = Math.max(0, simulatedStock - forecastedDailyRate);
    futureProjections.push({
      day: i,
      date: projDate.toISOString().split('T')[0],
      projectedStock: Math.round(simulatedStock),
      projectedDailyDispense: forecastedDailyRate
    });
  }

  return {
    phc_id: phcId,
    phc_name: metrics.phc_name,
    medicine_id: medicineId,
    medicine_name: metrics.medicine_name,
    current_stock: metrics.current_quantity,
    unit: metrics.unit,
    baseline_adc: metrics.effective_adc,
    smoothed_rate: Math.round(smoothed * 10) / 10,
    forecasted_daily_rate: forecastedDailyRate,
    projected_days_left: projectedDaysLeft,
    projected_runout_date: runOutDate.toISOString().split('T')[0],
    seasonal_context: seasonal,
    historical_points: history.slice(0, 14).reverse().map(h => ({
      date: h.entry_date,
      dispensed: h.dispensed_quantity,
      closing: h.closing_stock
    })),
    future_projections: futureProjections
  };
}

/**
 * 2. Z-Score Anomaly Detection
 * Flags unexpected consumption surges (> 2.0 std dev) or severe stock drops
 */
function detectAnomalies(phcId, medicineId = null) {
  let query = `
    SELECT phc_id, medicine_id
    FROM current_stock
  `;
  const params = [];
  if (phcId) {
    query += ` WHERE phc_id = ?`;
    params.push(phcId);
    if (medicineId) {
      query += ` AND medicine_id = ?`;
      params.push(medicineId);
    }
  }

  const rows = db.prepare(query).all(...params);
  const anomalies = [];

  rows.forEach(row => {
    const history = db.prepare(`
      SELECT entry_date, dispensed_quantity, closing_stock
      FROM stock_entries
      WHERE phc_id = ? AND medicine_id = ?
      ORDER BY entry_date DESC
      LIMIT 30
    `).all(row.phc_id, row.medicine_id);

    if (history.length < 7) return;

    const values = history.map(h => h.dispensed_quantity || 0);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Latest day consumption
    const latestDispensed = values[0];
    const zScore = stdDev > 0 ? (latestDispensed - mean) / stdDev : 0;

    if (zScore >= 2.0 || (mean > 5 && latestDispensed >= mean * 2)) {
      const medInfo = db.prepare(`
        SELECT m.name, m.unit, p.name as phc_name
        FROM medicines m, phcs p
        WHERE m.id = ? AND p.id = ?
      `).get(row.medicine_id, row.phc_id);

      anomalies.push({
        phc_id: row.phc_id,
        phc_name: medInfo.phc_name,
        medicine_id: row.medicine_id,
        medicine_name: medInfo.name,
        date: history[0].entry_date,
        dispensed: latestDispensed,
        mean: Math.round(mean * 10) / 10,
        std_dev: Math.round(stdDev * 10) / 10,
        z_score: Math.round(zScore * 100) / 100,
        anomaly_type: 'DEMAND_SURGE',
        severity: zScore > 3.0 ? 'critical' : 'warning',
        explanation: `Dispensing of ${latestDispensed} ${medInfo.unit} is ${Math.round(zScore * 10) / 10} standard deviations above the 30-day mean (${Math.round(mean * 10) / 10}/day).`
      });
    }
  });

  return anomalies;
}

/**
 * 3. AI Redistribution Recommender
 * Multi-criteria ranking:
 * - Identifies centres facing shortages (< 15 days or critical buffer)
 * - Identifies nearby centres with surplus stock (> 30 days)
 * - Computes Haversine distance and travel time
 * - Ranks candidates and prioritizes near-expiry stock (FEFO)
 * - Combines multi-medicine shortages into a single consolidated trip
 */
function getRedistributionRecommendations(targetPhcId = null) {
  // 1. Get all PHCs
  const allPhcs = db.prepare(`SELECT * FROM phcs`).all();
  const phcMap = new Map(allPhcs.map(p => [p.id, p]));

  // 2. Identify all medicines with status 'red' (shortages)
  const candidatePhcs = targetPhcId ? [phcMap.get(targetPhcId)] : allPhcs;
  const shortages = [];

  candidatePhcs.forEach(p => {
    if (!p) return;
    const stockRows = db.prepare(`SELECT medicine_id FROM current_stock WHERE phc_id = ?`).all(p.id);
    stockRows.forEach(sr => {
      const metric = calculateMedicineStockMetrics(p.id, sr.medicine_id);
      if (metric && metric.status === 'red') {
        shortages.push(metric);
      }
    });
  });

  const recommendations = [];

  // 3. For each shortage, search for nearby centres with surplus
  shortages.forEach(shortage => {
    const requestingPhc = phcMap.get(shortage.phc_id);
    if (!requestingPhc) return;

    // Required quantity to bring stock to a safe 30-day buffer
    const targetBufferDays = shortage.critical_flag ? 30 : 25;
    const neededQuantity = Math.max(10, Math.round((targetBufferDays - shortage.days_left) * shortage.effective_adc));

    // Find all other peer PHCs holding this medicine (exclude warehouses)
    const otherPhcStocks = db.prepare(`
      SELECT cs.*, p.name as donor_name, p.block as donor_block, p.district as donor_district, p.latitude, p.longitude, p.phone as donor_phone, p.cold_chain_equipped, p.is_warehouse
      FROM current_stock cs
      JOIN phcs p ON cs.phc_id = p.id
      WHERE cs.medicine_id = ? AND cs.phc_id != ? AND (p.is_warehouse = 0 OR p.is_warehouse IS NULL)
    `).all(shortage.medicine_id, shortage.phc_id);

    const surplusCandidates = [];

    otherPhcStocks.forEach(donor => {
      const donorMetrics = calculateMedicineStockMetrics(donor.phc_id, shortage.medicine_id);
      if (!donorMetrics) return;

      // Donor must have stock well above 30 days to spare
      const donorSafeBuffer = donorMetrics.critical_flag ? 30 : 25;
      const donorSurplusUnits = Math.round(donorMetrics.current_quantity - (donorMetrics.effective_adc * donorSafeBuffer));

      if (donorSurplusUnits > 0) {
        const crowDist = calculateHaversineDistance(
          requestingPhc.latitude,
          requestingPhc.longitude,
          donor.latitude,
          donor.longitude
        );
        const roadInfo = estimateRoadTravel(crowDist);

        // Cold-chain compatibility check
        if (shortage.cold_chain_flag && !donor.cold_chain_equipped) {
          return; // Skip if donor cannot handle cold chain
        }

        // Expiry priority bonus (FEFO)
        let expiryBonus = 0;
        if (donorMetrics.days_to_expiry !== null && donorMetrics.days_to_expiry <= 90) {
          expiryBonus = 25; // Bonus score to move soon-to-expire stock first
        }

        // Same-district priority bonus (same district peers first)
        const isSameDistrict = donor.donor_district === requestingPhc.district;
        const sameDistrictBonus = isSameDistrict ? 50 : 0;

        // Distance score penalty (closer is exponentially better)
        const distanceScore = Math.max(0, 100 - (crowDist * 3));

        // Transfer capability: how much of the needed quantity can they spare?
        const transferrableQty = Math.min(neededQuantity, donorSurplusUnits);
        const coverageRatio = transferrableQty / neededQuantity;

        // Composite Recommendation Score (0 - 100)
        const compositeScore = Math.round(
          (coverageRatio * 30) +
          (distanceScore * 0.30) +
          sameDistrictBonus +
          expiryBonus
        );

        surplusCandidates.push({
          source_phc_id: donor.phc_id,
          source_phc_name: donor.donor_name,
          source_phc_block: donor.donor_block,
          source_phc_district: donor.donor_district,
          source_phone: donor.donor_phone,
          crow_distance_km: crowDist,
          road_distance_km: roadInfo.roadDistanceKm,
          estimated_travel_minutes: roadInfo.estimatedMinutes,
          available_surplus: donorSurplusUnits,
          current_stock: donorMetrics.current_quantity,
          days_left_at_source: donorMetrics.days_left,
          proposed_transfer_quantity: transferrableQty,
          batch_number: donorMetrics.batch_number,
          expiry_date: donorMetrics.expiry_date,
          days_to_expiry: donorMetrics.days_to_expiry,
          recommendation_score: Math.min(100, compositeScore)
        });
      }
    });

    // Sort surplus candidates: highest score first, then lowest distance
    surplusCandidates.sort((a, b) => b.recommendation_score - a.recommendation_score || a.crow_distance_km - b.crow_distance_km);

    if (surplusCandidates.length > 0) {
      recommendations.push({
        id: `rec-${shortage.phc_id}-${shortage.medicine_id}`,
        destination_phc_id: shortage.phc_id,
        destination_phc_name: shortage.phc_name,
        destination_block: shortage.phc_block,
        medicine_id: shortage.medicine_id,
        medicine_name: shortage.medicine_name,
        unit: shortage.unit,
        cold_chain_flag: shortage.cold_chain_flag,
        critical_flag: shortage.critical_flag,
        current_stock: shortage.current_quantity,
        current_days_left: shortage.days_left,
        needed_quantity: neededQuantity,
        urgency: shortage.days_left <= 3 ? 'IMMEDIATE' : 'HIGH',
        best_match: surplusCandidates[0],
        all_matches: surplusCandidates,
        ai_rationale: `AI matched ${shortage.medicine_name} shortage at ${shortage.phc_name} with ${surplusCandidates[0].source_phc_name} located ${surplusCandidates[0].crow_distance_km} km away (${surplusCandidates[0].estimated_travel_minutes} mins). Transfer of ${surplusCandidates[0].proposed_transfer_quantity} ${shortage.unit} resolves shortage while leaving source with ${surplusCandidates[0].days_left_at_source} days buffer.`
      });
    }
  });

  return recommendations;
}

/**
 * 4. Multi-Medicine Consolidation Optimizer
 * Groups multiple medicine shortages that can be supplied by the same donor PHC
 * to minimize road transport overhead and fuel.
 */
function getConsolidatedDeliveryRoutes(targetPhcId = null) {
  const recommendations = getRedistributionRecommendations(targetPhcId);
  const routeMap = new Map();

  recommendations.forEach(rec => {
    const key = `${rec.best_match.source_phc_id}-->${rec.destination_phc_id}`;
    if (!routeMap.has(key)) {
      routeMap.set(key, {
        source_phc_id: rec.best_match.source_phc_id,
        source_phc_name: rec.best_match.source_phc_name,
        destination_phc_id: rec.destination_phc_id,
        destination_phc_name: rec.destination_phc_name,
        crow_distance_km: rec.best_match.crow_distance_km,
        road_distance_km: rec.best_match.road_distance_km,
        estimated_travel_minutes: rec.best_match.estimated_travel_minutes,
        items: [],
        has_cold_chain: false
      });
    }

    const route = routeMap.get(key);
    route.items.push({
      medicine_id: rec.medicine_id,
      medicine_name: rec.medicine_name,
      quantity: rec.best_match.proposed_transfer_quantity,
      unit: rec.unit,
      cold_chain_flag: rec.cold_chain_flag,
      urgency: rec.urgency
    });
    if (rec.cold_chain_flag) {
      route.has_cold_chain = true;
    }
  });

  return Array.from(routeMap.values());
}

/**
 * 5. Smart Emergency Indent Auto-Draft
 * Automatically crafts a pre-filled emergency indent for the Medical Officer
 */
function autoDraftEmergencyIndent(phcId, medicineId) {
  const metrics = calculateMedicineStockMetrics(phcId, medicineId);
  if (!metrics) return null;

  const currentMonth = new Date().getMonth() + 1;
  const seasonal = getSeasonalMultiplier(metrics.category, metrics.medicine_name, currentMonth);

  // Suggested calculation: 30 days buffer + seasonal buffer adjustment - current stock
  const targetDays = 30 + seasonal.bufferIncreaseDays;
  const calculatedQty = Math.max(50, Math.round((targetDays - metrics.days_left) * metrics.effective_adc * seasonal.multiplier));

  const reason = `Automated Emergency Indent: ${metrics.medicine_name} currently has ${metrics.days_left} days of stock remaining (${metrics.current_quantity} ${metrics.unit}). Consumption rate is ${metrics.effective_adc} ${metrics.unit}/day. Seasonal alert: ${seasonal.season} requires an increased safety buffer of ${targetDays} days.`;

  return {
    phc_id: phcId,
    phc_name: metrics.phc_name,
    medicine_id: medicineId,
    medicine_name: metrics.medicine_name,
    unit: metrics.unit,
    current_quantity: metrics.current_quantity,
    days_left: metrics.days_left,
    consumption_rate: metrics.effective_adc,
    target_buffer_days: targetDays,
    seasonal_disease: seasonal.season,
    suggested_quantity: calculatedQty,
    draft_reason: reason,
    cold_chain_flag: metrics.cold_chain_flag,
    critical_flag: metrics.critical_flag
  };
}

/**
 * 6. Staff Chatbot AI Query Assistant (English & Tamil)
 * Uses intelligent rule-based & function-calling execution over real database records.
 */
function queryStaffChatbot(queryText, userContext = {}) {
  const text = (queryText || '').toLowerCase().trim();
  const userPhcId = userContext.phc_id || 'phc-thiruporur';
  const userPhc = db.prepare(`SELECT * FROM phcs WHERE id = ?`).get(userPhcId) || { name: 'Thiruporur PHC', id: userPhcId };

  // Detect language
  const isTamil = /[\u0B80-\u0BFF]/.test(queryText) || text.includes('vanakkam') || text.includes('marunthu');

  // Intent 1: "Who nearby has [medicine] and how far is it?"
  const medicineKeywords = [
    { key: 'ors', id: 'med-ors', name: 'ORS Sachets' },
    { key: 'paracetamol', id: 'med-pcm-syp', name: 'Paracetamol Suspension' },
    { key: 'amoxicillin', id: 'med-amox-syp', name: 'Amoxicillin Suspension' },
    { key: 'insulin', id: 'med-insulin-reg', name: 'Human Regular Insulin' },
    { key: 'snake', id: 'med-asv', name: 'Anti-Snake Venom (ASV)' },
    { key: 'metformin', id: 'med-metformin', name: 'Metformin 500mg' }
  ];

  const matchedMed = medicineKeywords.find(m => text.includes(m.key));

  if (matchedMed && (text.includes('nearby') || text.includes('who') || text.includes('far') || text.includes('distance') || text.includes('surplus') || text.includes('யாருக்கு') || text.includes('அருகில்'))) {
    // Look up nearby centres with surplus
    const donors = db.prepare(`
      SELECT cs.quantity, p.name as donor_name, p.latitude, p.longitude, p.phone
      FROM current_stock cs
      JOIN phcs p ON cs.phc_id = p.id
      WHERE cs.medicine_id = ? AND cs.phc_id != ? AND cs.quantity > 50
    `).all(matchedMed.id, userPhcId);

    if (donors.length === 0) {
      return {
        answer: isTamil
          ? `மன்னிக்கவும், ${matchedMed.name} உபரி இருப்பு அருகிலுள்ள எந்த ஆரம்ப சுகாதார நிலையத்திலும் இல்லை. மாவட்ட கிடங்கு அவசர கோரிக்கை (Emergency Indent) பரிந்துரைக்கப்படுகிறது.`
          : `No nearby PHCs currently report significant surplus stock for ${matchedMed.name}. We suggest submitting an Emergency Indent to the District Drug Warehouse.`,
        data: []
      };
    }

    // Sort by distance from user PHC
    const enriched = donors.map(d => {
      const dist = calculateHaversineDistance(userPhc.latitude, userPhc.longitude, d.latitude, d.longitude);
      const road = estimateRoadTravel(dist);
      return {
        name: d.donor_name,
        quantity: d.quantity,
        distance_km: dist,
        travel_time: road.estimatedMinutes,
        phone: d.phone
      };
    }).sort((a, b) => a.distance_km - b.distance_km);

    const top = enriched[0];

    const answer = isTamil
      ? `அருகிலுள்ள ஆரம்ப சுகாதார நிலையம்: **${top.name}**\n• இருப்பு: **${top.quantity}** அலகுகள்\n• தூரம்: **${top.distance_km} கி.மீ** (சுமார் ${top.travel_time} நிமிடங்கள்)\n• தொடர்பு: ${top.phone}\n\nஉடனடி இடமாற்ற கோரிக்கையை (Transfer Request) தொடங்க MediSync Transfers பக்கத்தைப் பயன்படுத்தவும்.`
      : `Nearest centre holding **${matchedMed.name}** is **${top.name}**:\n• Available Stock: **${top.quantity}** units\n• Distance: **${top.distance_km} km** (~${top.travel_time} mins drive)\n• Contact: ${top.phone}\n\nYou can initiate an instant Inter-PHC transfer directly from the Transfers tab.`;

    return {
      answer,
      data: enriched.slice(0, 3)
    };
  }

  // Intent 2: "How many days of [medicine] do we have?"
  if (matchedMed && (text.includes('days') || text.includes('left') || text.includes('stock') || text.includes('நாட்கள்') || text.includes('இருப்பு'))) {
    const metrics = calculateMedicineStockMetrics(userPhcId, matchedMed.id);
    if (metrics) {
      const answer = isTamil
        ? `**${userPhc.name}** - ${metrics.medicine_name} நிலவரம்:\n• தற்போதைய இருப்பு: **${metrics.current_quantity} ${metrics.unit}**\n• மீதமுள்ள நாட்கள்: **${metrics.days_left} நாட்கள்**\n• தினசரி பயன்பாடு: **${metrics.effective_adc} ${metrics.unit}/நாள்**\n• நிலை: **${metrics.status_label}**`
        : `Stock status for **${metrics.medicine_name}** at **${userPhc.name}**:\n• Current Stock: **${metrics.current_quantity} ${metrics.unit}**\n• Days Remaining: **${metrics.days_left} days**\n• Consumption Rate: **${metrics.effective_adc} ${metrics.unit}/day**\n• Alert Status: **${metrics.status.toUpperCase()} (${metrics.status_label})**`;
      return {
        answer,
        data: metrics
      };
    }
  }

  // Intent 3: "What are our alerts / shortages?"
  if (text.includes('alert') || text.includes('shortage') || text.includes('low') || text.includes('எச்சரிக்கை') || text.includes('குறைவு')) {
    const alerts = db.prepare(`
      SELECT a.*, m.name as medicine_name
      FROM alerts a
      JOIN medicines m ON a.medicine_id = m.id
      WHERE a.phc_id = ? AND a.status IN ('new', 'acknowledged')
      ORDER BY a.created_at DESC
      LIMIT 5
    `).all(userPhcId);

    if (alerts.length === 0) {
      return {
        answer: isTamil
          ? `${userPhc.name} நிலையத்தில் தற்போது அவசர எச்சரிக்கைகள் எதுவும் இல்லை. அனைத்து மருந்துகளும் போதுமான அளவில் உள்ளன.`
          : `Great news! ${userPhc.name} currently has no active critical shortages or unresolved alerts.`,
        data: []
      };
    }

    const alertList = alerts.map(a => `• **${a.medicine_name}**: ${a.message}`).join('\n');
    const answer = isTamil
      ? `**${userPhc.name}** க்கான தற்போதைய அவசர எச்சரிக்கைகள் (${alerts.length}):\n${alertList}`
      : `Active alerts for **${userPhc.name}** (${alerts.length}):\n${alertList}`;

    return {
      answer,
      data: alerts
    };
  }

  // Intent 4: General AI help / Default response
  const answer = isTamil
    ? `வணக்கம்! நான் MediSync AI உதவியாளர். நீங்கள் கேட்கலாம்:\n1. "Who nearby has ORS and how far is it?"\n2. "How many days of amoxicillin do we have?"\n3. "What are our critical alerts today?"\n\nஅனைத்து AI முடிவுகளும் பரிந்துரைகள் மட்டுமே; மாற்றங்களுக்கு மருத்துவ அலுவலரின் ஒப்புதல் அவசியம்.`
    : `Hello! I am MediSync Clinical Stock AI Assistant. You can ask me:\n1. *"Who nearby has Paracetamol Syrup and how far is it?"*\n2. *"How many days of amoxicillin do we have left?"*\n3. *"What are our active stock alerts today?"*\n4. *"Show seasonal disease buffer recommendations"*\n\n*(Note: All AI outputs are clinical recommendations. Medical Officer approval is mandatory for all transfers.)*`;

  return {
    answer,
    data: null
  };
}

module.exports = {
  getSeasonalMultiplier,
  getMedicineForecast,
  detectAnomalies,
  getRedistributionRecommendations,
  getConsolidatedDeliveryRoutes,
  autoDraftEmergencyIndent,
  queryStaffChatbot
};
