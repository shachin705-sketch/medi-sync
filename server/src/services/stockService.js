const { db } = require('../db/database');
const { sendNotification } = require('./notificationService');
const { logAudit } = require('./auditService');

/**
 * Calculates stock statistics (ADC 7, ADC 30, Days of Stock Left, Trend, Status)
 * for a specific medicine at a specific PHC.
 */
function calculateMedicineStockMetrics(phcId, medicineId) {
  // 1. Get current stock
  const current = db.prepare(`
    SELECT cs.*, m.name, m.generic_name, m.category, m.form, m.strength, m.unit,
           m.cold_chain_flag, m.critical_flag, m.standard_buffer_days, m.critical_buffer_days,
           p.name as phc_name, p.block as phc_block, p.phone as phc_phone
    FROM current_stock cs
    JOIN medicines m ON cs.medicine_id = m.id
    JOIN phcs p ON cs.phc_id = p.id
    WHERE cs.phc_id = ? AND cs.medicine_id = ?
  `).get(phcId, medicineId);

  if (!current) {
    return null;
  }

  // 2. Fetch last 30 days history
  const history = db.prepare(`
    SELECT entry_date, dispensed_quantity, received_quantity, closing_stock
    FROM stock_entries
    WHERE phc_id = ? AND medicine_id = ?
    ORDER BY entry_date DESC
    LIMIT 30
  `).all(phcId, medicineId);

  const last7 = history.slice(0, 7);
  const sum7 = last7.reduce((acc, row) => acc + (row.dispensed_quantity || 0), 0);
  const adc7 = last7.length > 0 ? (sum7 / last7.length) : 0;

  const sum30 = history.reduce((acc, row) => acc + (row.dispensed_quantity || 0), 0);
  const adc30 = history.length > 0 ? (sum30 / history.length) : 0;

  // Use adc7 as primary consumption rate, fallback to adc30 or small floor
  const effectiveAdc = adc7 > 0 ? adc7 : (adc30 > 0 ? adc30 : 0.1);
  const daysLeft = Math.round((current.quantity / effectiveAdc) * 10) / 10;

  // Determine threshold
  const redThreshold = current.critical_flag ? (current.critical_buffer_days || 21) : 15;
  const amberThreshold = current.standard_buffer_days || 30;

  let status = 'green';
  let statusLabel = 'Optimal';
  if (daysLeft < redThreshold) {
    status = 'red';
    statusLabel = 'Critical Shortage';
  } else if (daysLeft <= amberThreshold) {
    status = 'amber';
    statusLabel = 'Warning / Low Buffer';
  } else {
    status = 'green';
    statusLabel = 'Sufficient';
  }

  // Trend direction
  let trend = 'stable';
  let rateOfDecline = Math.round(effectiveAdc * 10) / 10;
  if (adc7 > adc30 * 1.3) {
    trend = 'rapidly_falling';
  } else if (adc7 > adc30 * 1.05) {
    trend = 'falling';
  } else if (adc7 < adc30 * 0.85) {
    trend = 'accumulating';
  }

  // Check expiry in days
  let daysToExpiry = null;
  if (current.expiry_date) {
    const expDate = new Date(current.expiry_date);
    const now = new Date();
    daysToExpiry = Math.round((expDate - now) / (1000 * 60 * 60 * 24));
  }

  return {
    phc_id: phcId,
    phc_name: current.phc_name,
    phc_block: current.phc_block,
    medicine_id: medicineId,
    medicine_name: current.name,
    generic_name: current.generic_name,
    category: current.category,
    form: current.form,
    strength: current.strength,
    unit: current.unit,
    cold_chain_flag: Boolean(current.cold_chain_flag),
    critical_flag: Boolean(current.critical_flag),
    current_quantity: current.quantity,
    batch_number: current.batch_number,
    expiry_date: current.expiry_date,
    days_to_expiry: daysToExpiry,
    adc7: Math.round(adc7 * 10) / 10,
    adc30: Math.round(adc30 * 10) / 10,
    effective_adc: Math.round(effectiveAdc * 10) / 10,
    days_left: daysLeft,
    status,
    status_label: statusLabel,
    trend,
    rate_of_decline: rateOfDecline,
    red_threshold: redThreshold,
    amber_threshold: amberThreshold
  };
}

/**
 * Get Days-of-Stock for all medicines at a PHC
 */
function getPhcDaysOfStock(phcId, filters = {}) {
  let query = `
    SELECT medicine_id
    FROM current_stock
    WHERE phc_id = ?
  `;
  const params = [phcId];

  const medicineRows = db.prepare(query).all(...params);
  let results = medicineRows.map(row => calculateMedicineStockMetrics(phcId, row.medicine_id));

  if (filters.status) {
    results = results.filter(r => r.status === filters.status);
  }
  if (filters.category) {
    results = results.filter(r => r.category.toLowerCase().includes(filters.category.toLowerCase()));
  }
  if (filters.criticalOnly) {
    results = results.filter(r => r.critical_flag);
  }
  if (filters.coldChainOnly) {
    results = results.filter(r => r.cold_chain_flag);
  }
  if (filters.search) {
    const s = filters.search.toLowerCase();
    results = results.filter(r =>
      r.medicine_name.toLowerCase().includes(s) ||
      r.generic_name.toLowerCase().includes(s)
    );
  }

  // Sort: Red first, then Amber, then Green, then by days_left ascending
  const rank = { red: 1, amber: 2, green: 3 };
  results.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) {
      return rank[a.status] - rank[b.status];
    }
    return a.days_left - b.days_left;
  });

  return results;
}

/**
 * Add or update daily stock entry and evaluate alerts
 */
function recordStockEntry({
  phcId,
  medicineId,
  entryDate,
  openingStock,
  receivedQuantity = 0,
  dispensedQuantity = 0,
  batchNumber,
  expiryDate,
  userId,
  notes = ''
}) {
  const calculatedClosing = openingStock + receivedQuantity - dispensedQuantity;
  const id = `se-${phcId}-${medicineId}-${entryDate || new Date().toISOString().split('T')[0]}`;
  const todayStr = entryDate || new Date().toISOString().split('T')[0];

  // Insert or replace stock entry
  const insertEntry = db.prepare(`
    INSERT INTO stock_entries (id, phc_id, medicine_id, entry_date, opening_stock, received_quantity, dispensed_quantity, closing_stock, batch_number, expiry_date, created_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      opening_stock = excluded.opening_stock,
      received_quantity = excluded.received_quantity,
      dispensed_quantity = excluded.dispensed_quantity,
      closing_stock = excluded.closing_stock,
      batch_number = excluded.batch_number,
      expiry_date = excluded.expiry_date,
      notes = excluded.notes
  `);

  insertEntry.run(
    id,
    phcId,
    medicineId,
    todayStr,
    openingStock,
    receivedQuantity,
    dispensedQuantity,
    calculatedClosing,
    batchNumber,
    expiryDate,
    userId,
    notes
  );

  // Update current stock
  const updateCurrent = db.prepare(`
    INSERT INTO current_stock (id, phc_id, medicine_id, quantity, batch_number, expiry_date, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(phc_id, medicine_id) DO UPDATE SET
      quantity = excluded.quantity,
      batch_number = excluded.batch_number,
      expiry_date = excluded.expiry_date,
      last_updated = datetime('now')
  `);

  updateCurrent.run(
    `cs-${phcId}-${medicineId}`,
    phcId,
    medicineId,
    calculatedClosing,
    batchNumber,
    expiryDate
  );

  // Audit Log
  logAudit({
    userId,
    action: 'RECORD_STOCK_ENTRY',
    entityType: 'stock_entries',
    entityId: id,
    details: `Updated stock: Open: ${openingStock}, Rec: ${receivedQuantity}, Disp: ${dispensedQuantity}, Close: ${calculatedClosing}`
  });

  // Check metrics and trigger alerts if needed
  const metrics = calculateMedicineStockMetrics(phcId, medicineId);
  checkAndTriggerAlerts(metrics, userId);

  return {
    success: true,
    entry: {
      id,
      phcId,
      medicineId,
      entryDate: todayStr,
      openingStock,
      receivedQuantity,
      dispensedQuantity,
      closingStock: calculatedClosing,
      metrics
    }
  };
}

/**
 * Trigger alerts for low days of stock, sudden spikes, or expiry
 */
function checkAndTriggerAlerts(metrics, userId) {
  if (!metrics) return;

  const { phc_id, medicine_id, days_left, red_threshold, days_to_expiry, medicine_name, phc_name, phc_phone, trend } = metrics;

  // 1. Stockout imminent or below threshold
  if (days_left < red_threshold) {
    const alertId = `alt-${phc_id}-${medicine_id}-${Date.now()}`;
    const severity = days_left <= 5 ? 'critical' : 'warning';
    const alertType = days_left <= 5 ? 'stockout_imminent' : 'below_threshold';
    const message = `${severity === 'critical' ? 'CRITICAL STOCK-OUT RISK' : 'LOW BUFFER ALERT'}: ${medicine_name} at ${phc_name} has only ${days_left} days left (Current: ${metrics.current_quantity} ${metrics.unit}). Threshold is ${red_threshold} days.`;

    // Check if duplicate unresolved alert already exists
    const existing = db.prepare(`
      SELECT id FROM alerts
      WHERE phc_id = ? AND medicine_id = ? AND status IN ('new', 'acknowledged') AND alert_type IN ('stockout_imminent', 'below_threshold')
    `).get(phc_id, medicine_id);

    if (!existing) {
      db.prepare(`
        INSERT INTO alerts (id, phc_id, medicine_id, alert_type, severity, days_left, message, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'new')
      `).run(alertId, phc_id, medicine_id, alertType, severity, days_left, message);

      // Send SMS alert to PHC phone
      if (phc_phone) {
        sendNotification({
          recipientPhone: phc_phone,
          channel: 'sms',
          alertId,
          message: `[MediSync TN Alert] ${phc_name}: ${medicine_name} is critically low (${days_left} days left). Log in to MediSync to request nearby surplus transfer.`
        });
      }
    }
  }

  // 2. Near Expiry Alert (< 60 days)
  if (days_to_expiry !== null && days_to_expiry <= 60 && days_to_expiry > 0) {
    const existing = db.prepare(`
      SELECT id FROM alerts
      WHERE phc_id = ? AND medicine_id = ? AND alert_type = 'near_expiry' AND status IN ('new', 'acknowledged')
    `).get(phc_id, medicine_id);

    if (!existing) {
      const alertId = `alt-exp-${phc_id}-${medicine_id}-${Date.now()}`;
      const message = `EXPIRY RISK: Batch ${metrics.batch_number} of ${medicine_name} expires in ${days_to_expiry} days. Prioritize dispensing or initiate redistribution.`;
      db.prepare(`
        INSERT INTO alerts (id, phc_id, medicine_id, alert_type, severity, days_left, message, status)
        VALUES (?, ?, ?, 'near_expiry', 'warning', ?, ?, 'new')
      `).run(alertId, phc_id, medicine_id, days_left, message);
    }
  }

  // 3. Rapid Consumption Anomaly Alert
  if (trend === 'rapidly_falling') {
    const existing = db.prepare(`
      SELECT id FROM alerts
      WHERE phc_id = ? AND medicine_id = ? AND alert_type = 'rapid_consumption' AND status IN ('new', 'acknowledged')
    `).get(phc_id, medicine_id);

    if (!existing) {
      const alertId = `alt-rc-${phc_id}-${medicine_id}-${Date.now()}`;
      const message = `UNUSUAL DEMAND SPIKE: ${medicine_name} consumption at ${phc_name} surged 30%+ above monthly baseline (7-day rate: ${metrics.adc7}/day vs 30-day: ${metrics.adc30}/day).`;
      db.prepare(`
        INSERT INTO alerts (id, phc_id, medicine_id, alert_type, severity, days_left, message, status)
        VALUES (?, ?, ?, 'rapid_consumption', 'warning', ?, ?, 'new')
      `).run(alertId, phc_id, medicine_id, days_left, message);
    }
  }
}

module.exports = {
  calculateMedicineStockMetrics,
  getPhcDaysOfStock,
  recordStockEntry,
  checkAndTriggerAlerts
};
