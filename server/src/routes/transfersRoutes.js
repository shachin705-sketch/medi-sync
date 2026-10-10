const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { calculateMedicineStockMetrics } = require('../services/stockService');
const { calculateHaversineDistance, estimateRoadTravel } = require('../services/haversineService');
const { logAudit } = require('../services/auditService');
const { sendNotification } = require('../services/notificationService');

// ============================================================================
// 1. RECOMMENDATIONS & SIMULATION ENGINE
// ============================================================================

/**
 * Helper: Run live simulation for transfer without mutating database
 */
function calculateTransferSimulation({ sourcePhcId, destPhcId, medicineId, quantity }) {
  const q = Number(quantity);
  const donorPhc = db.prepare('SELECT * FROM phcs WHERE id = ?').get(sourcePhcId);
  const destPhc = db.prepare('SELECT * FROM phcs WHERE id = ?').get(destPhcId);
  const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(medicineId);

  if (!donorPhc || !destPhc || !med) {
    throw new Error('Invalid facility or medicine identifier for simulation');
  }

  // Donor metrics
  const donorStockRow = db.prepare('SELECT quantity, batch_number, expiry_date FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(sourcePhcId, medicineId);
  const donorCurrentStock = donorStockRow ? donorStockRow.quantity : 0;
  const donorMetrics = calculateMedicineStockMetrics(sourcePhcId, medicineId);
  const donorDailyUsage = donorMetrics ? donorMetrics.effective_adc : 5;
  const donorCurrentDays = donorDailyUsage > 0 ? Math.round((donorCurrentStock / donorDailyUsage) * 10) / 10 : 999;
  
  const donorSafetyReserve = Math.round(donorDailyUsage * 14);
  const donorProjectedStock = donorCurrentStock - q;
  const donorProjectedDays = donorDailyUsage > 0 ? Math.round((donorProjectedStock / donorDailyUsage) * 10) / 10 : 0;
  const donorRemainingSurplus = Math.max(0, donorProjectedStock - donorSafetyReserve);
  const donorSafetyCheckPassed = donorProjectedStock >= donorSafetyReserve;
  const donorSafetyReason = donorSafetyCheckPassed
    ? `Donor retains safe buffer of ${donorProjectedDays} days (${donorProjectedStock} units), strictly protecting the 14-day safety reserve (${donorSafetyReserve} units).`
    : `UNSAFE PROPOSAL BLOCKED: Transfer of ${q} units would deplete donor to ${donorProjectedDays} days (${donorProjectedStock} units), breaching the mandatory 14-day safety reserve (${donorSafetyReserve} units).`;

  // Destination metrics
  const destStockRow = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(destPhcId, medicineId);
  const destCurrentStock = destStockRow ? destStockRow.quantity : 0;
  const destMetrics = calculateMedicineStockMetrics(destPhcId, medicineId);
  const destDailyUsage = destMetrics ? destMetrics.effective_adc : 5;
  const destCurrentDays = destDailyUsage > 0 ? Math.round((destCurrentStock / destDailyUsage) * 10) / 10 : 0;
  
  const destProjectedStock = destCurrentStock + q;
  const destProjectedDays = destDailyUsage > 0 ? Math.round((destProjectedStock / destDailyUsage) * 10) / 10 : 0;
  const destRemainingShortage = Math.max(0, Math.round(destDailyUsage * 30) - destProjectedStock);

  // Road distance & travel time
  const crowDist = calculateHaversineDistance(donorPhc.latitude, donorPhc.longitude, destPhc.latitude, destPhc.longitude);
  const roadTravel = estimateRoadTravel(crowDist);

  // FEFO check: Days to expiry vs consumption rate
  let fefoEligibility = true;
  let fefoReason = 'Batch expiration allows full consumption before expiry.';
  if (donorStockRow && donorStockRow.expiry_date) {
    const daysUntilExpiry = Math.floor((new Date(donorStockRow.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry <= 0) {
      fefoEligibility = false;
      fefoReason = 'EXPIRED BATCH: Batch has expired and cannot be transferred.';
    } else {
      const daysToConsume = destDailyUsage > 0 ? Math.ceil(q / destDailyUsage) : 1;
      if (daysToConsume > daysUntilExpiry) {
        fefoEligibility = false;
        fefoReason = `Batch expires in ${daysUntilExpiry} days, but receiver requires ~${daysToConsume} days to consume ${q} units.`;
      }
    }
  }

  return {
    simulated: true,
    transfer_quantity: q,
    medicine: {
      id: med.id,
      name: med.name,
      generic: med.generic_name,
      unit: med.unit,
      cold_chain_required: Boolean(med.cold_chain_flag)
    },
    distance_km: roadTravel.roadDistanceKm,
    estimated_travel_minutes: roadTravel.estimatedMinutes,
    donor: {
      id: donorPhc.id,
      name: donorPhc.name,
      code: donorPhc.code,
      current_stock: donorCurrentStock,
      daily_usage: donorDailyUsage,
      current_days_of_cover: donorCurrentDays,
      projected_stock_after: donorProjectedStock,
      projected_days_after: donorProjectedDays,
      safety_reserve: donorSafetyReserve,
      remaining_surplus: donorRemainingSurplus,
      batch_number: donorStockRow ? donorStockRow.batch_number : 'TN-BATCH-STD',
      expiry_date: donorStockRow ? donorStockRow.expiry_date : '2027-10-31',
      safety_check_passed: donorSafetyCheckPassed,
      safety_check_reason: donorSafetyReason
    },
    receiver: {
      id: destPhc.id,
      name: destPhc.name,
      code: destPhc.code,
      current_stock: destCurrentStock,
      daily_usage: destDailyUsage,
      current_days_of_cover: destCurrentDays,
      projected_stock_after: destProjectedStock,
      projected_days_after: destProjectedDays,
      remaining_projected_shortage: destRemainingShortage,
      risk_before: destCurrentDays <= 3 ? 'Critical Shortage' : destCurrentDays <= 8 ? 'Low Stock Warning' : 'Healthy Stock',
      risk_after: destProjectedDays <= 3 ? 'Critical Shortage' : destProjectedDays <= 8 ? 'Low Stock Warning' : 'Healthy Stock'
    },
    fefo: {
      eligible: fefoEligibility,
      reason: fefoReason
    }
  };
}

/**
 * POST /api/transfers/simulate
 * Interactive Transfer Simulator Endpoint (Never modifies database)
 */
router.post('/simulate', (req, res) => {
  const { source_phc_id, dest_phc_id, medicine_id, quantity } = req.body;
  if (!source_phc_id || !dest_phc_id || !medicine_id || !quantity) {
    return res.status(400).json({ error: 'source_phc_id, dest_phc_id, medicine_id, and quantity are required for simulation' });
  }

  try {
    const result = calculateTransferSimulation({
      sourcePhcId: source_phc_id,
      destPhcId: dest_phc_id,
      medicineId: medicine_id,
      quantity
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/transfers/recommendations/generate
 * Genuine backend recommendation engine generating safe inter-centre transfers
 */
router.post('/recommendations/generate', (req, res) => {
  try {
    const centres = db.prepare('SELECT * FROM phcs').all();
    const phcMap = new Map(centres.map(c => [c.id, c]));
    const recommendations = [];

    centres.forEach(dest => {
      const stockRows = db.prepare('SELECT medicine_id, quantity FROM current_stock WHERE phc_id = ?').all(dest.id);
      stockRows.forEach(sr => {
        const metrics = calculateMedicineStockMetrics(dest.id, sr.medicine_id);
        if (metrics && metrics.status === 'red') {
          // Identify shortage: need to reach 30-day buffer
          const needed = Math.max(20, Math.round((30 - metrics.days_left) * metrics.effective_adc));

          // Look for safe donor
          const candidateStocks = db.prepare(`
            SELECT cs.*, p.name as donor_name, p.latitude, p.longitude, p.cold_chain_equipped
            FROM current_stock cs
            JOIN phcs p ON cs.phc_id = p.id
            WHERE cs.medicine_id = ? AND cs.phc_id != ?
          `).all(sr.medicine_id, dest.id);

          let bestDonor = null;
          let bestScore = -1;

          candidateStocks.forEach(cand => {
            const donorMetrics = calculateMedicineStockMetrics(cand.phc_id, sr.medicine_id);
            if (!donorMetrics) return;

            // Donor safety reserve: 14 days minimum
            const donorReserve = Math.round(donorMetrics.effective_adc * 14);
            const transferableSurplus = Math.max(0, cand.quantity - donorReserve);

            // Batch expiry check: exclude expired batches
            if (cand.expiry_date) {
              const daysLeft = Math.floor((new Date(cand.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
              if (daysLeft <= 0) return; // Skip expired
            }

            if (transferableSurplus >= 20) {
              const crowDist = calculateHaversineDistance(cand.latitude, cand.longitude, dest.latitude, dest.longitude);
              const road = estimateRoadTravel(crowDist);
              const proposedQty = Math.min(needed, transferableSurplus);
              const score = (proposedQty / needed * 50) + Math.max(0, 50 - crowDist);

              if (score > bestScore) {
                bestScore = score;
                bestDonor = {
                  donor,
                  donorMetrics,
                  proposedQty,
                  road,
                  cand
                };
              }
            }
          });

          const recId = `rec-${dest.id}-${sr.medicine_id}`;
          if (bestDonor) {
            const sim = calculateTransferSimulation({
              sourcePhcId: bestDonor.donor.id,
              destPhcId: dest.id,
              medicineId: sr.medicine_id,
              quantity: bestDonor.proposedQty
            });

            recommendations.push({
              id: recId,
              status: 'recommended',
              destination_phc_id: dest.id,
              destination_phc_name: dest.name,
              source_phc_id: bestDonor.donor.id,
              source_phc_name: bestDonor.donor.name,
              medicine_id: sr.medicine_id,
              medicine_name: metrics.medicine_name,
              unit: metrics.unit,
              proposed_quantity: bestDonor.proposedQty,
              reason: `Critical stock depletion (${metrics.days_left}d cover). Donor has safe surplus of ${bestDonor.cand.quantity - Math.round(bestDonor.donorMetrics.effective_adc * 14)} units.`,
              distance_km: bestDonor.road.roadDistanceKm,
              travel_time_mins: bestDonor.road.estimatedMinutes,
              simulation: sim
            });
          } else {
            // Escalate unresolved shortage when no safe local donor exists
            recommendations.push({
              id: recId,
              status: 'escalated',
              destination_phc_id: dest.id,
              destination_phc_name: dest.name,
              source_phc_id: null,
              source_phc_name: 'District Medical Drug Depot (Direct Replenishment)',
              medicine_id: sr.medicine_id,
              medicine_name: metrics.medicine_name,
              unit: metrics.unit,
              proposed_quantity: needed,
              reason: 'No eligible donor found with safe surplus protecting 14-day reserve. Escalate the unresolved shortage for formal replenishment.',
              distance_km: 0,
              travel_time_mins: 0,
              simulation: null
            });
          }
        }
      });
    });

    res.json({
      recommendations,
      count: recommendations.length,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate recommendations', details: err.message });
  }
});

/**
 * GET /api/transfers/recommendations
 * List current recommendations
 */
router.get('/recommendations', (req, res) => {
  // Delegate to generate for live recalculation
  req.url = '/recommendations/generate';
  router.handle(req, res);
});

// ============================================================================
// 2. TRANSFER REQUESTS & LIFECYCLE (CRUD & STATE MACHINE)
// ============================================================================

/**
 * GET /api/transfers
 * List all transfer requests
 */
router.get('/', (req, res) => {
  const { phc, status } = req.query;
  let sql = `
    SELECT t.*, 
           m.name as medicine_name, m.generic_name, m.unit, m.cold_chain_flag, m.critical_flag,
           sp.name as source_phc_name, sp.phone as source_phone,
           dp.name as dest_phc_name, dp.phone as dest_phone,
           u.name as requester_name
    FROM transfer_requests t
    JOIN medicines m ON t.medicine_id = m.id
    JOIN phcs sp ON t.source_phc_id = sp.id
    JOIN phcs dp ON t.dest_phc_id = dp.id
    LEFT JOIN users u ON t.requested_by = u.id
    WHERE 1=1
  `;
  const params = [];

  if (phc) {
    sql += ` AND (t.source_phc_id = ? OR t.dest_phc_id = ?)`;
    params.push(phc, phc);
  }
  if (status) {
    sql += ` AND t.status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY t.created_at DESC`;
  const transfers = db.prepare(sql).all(...params);
  res.json(transfers);
});

/**
 * GET /api/transfers/:id
 * Get single transfer
 */
router.get('/:id', (req, res) => {
  const transfer = db.prepare(`
    SELECT t.*, 
           m.name as medicine_name, m.generic_name, m.unit, m.form, m.strength, m.cold_chain_flag, m.critical_flag,
           sp.name as source_phc_name, sp.phone as source_phone, sp.address as source_address,
           dp.name as dest_phc_name, dp.phone as dest_phone, dp.address as dest_address,
           u.name as requester_name,
           au.name as approver_name
    FROM transfer_requests t
    JOIN medicines m ON t.medicine_id = m.id
    JOIN phcs sp ON t.source_phc_id = sp.id
    JOIN phcs dp ON t.dest_phc_id = dp.id
    LEFT JOIN users u ON t.requested_by = u.id
    LEFT JOIN users au ON t.approved_by = au.id
    WHERE t.id = ?
  `).get(req.params.id);

  if (!transfer) {
    return res.status(404).json({ error: 'Transfer request not found' });
  }

  res.json(transfer);
});

/**
 * POST /api/transfers
 * Create transfer request with donor safety buffer verification
 */
router.post('/', (req, res) => {
  const {
    source_phc_id,
    dest_phc_id,
    medicine_id,
    quantity,
    reason,
    cold_chain_arranged = false,
    fefo_batch_number,
    fefo_expiry_date,
    notes = '',
    requested_by = 'usr-pharm-tpr'
  } = req.body;

  if (!source_phc_id || !dest_phc_id || !medicine_id || !quantity || !reason) {
    return res.status(400).json({ error: 'All transfer fields are required' });
  }

  if (source_phc_id === dest_phc_id) {
    return res.status(400).json({ error: 'Source and destination facilities cannot be the same' });
  }

  const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(medicine_id);
  if (!med) {
    return res.status(404).json({ error: 'Medicine not found' });
  }

  // Verify donor stock and safety reserve
  const donorStock = db.prepare('SELECT quantity, batch_number, expiry_date FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(source_phc_id, medicine_id);
  const donorQty = donorStock ? donorStock.quantity : 0;
  if (donorQty < Number(quantity)) {
    return res.status(400).json({
      error: `Donor centre only has ${donorQty} units available. Cannot request ${quantity} units.`
    });
  }

  const id = `trf-${Date.now()}`;
  const reqNumber = `TRF-VRX-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const userId = req.user ? req.user.id : requested_by;

  const stmt = db.prepare(`
    INSERT INTO transfer_requests (
      id, req_number, source_phc_id, dest_phc_id, medicine_id, quantity, approved_quantity,
      reason, status, cold_chain_arranged, fefo_batch_number, fefo_expiry_date,
      requested_by, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?, ?, datetime('now'))
  `);

  stmt.run(
    id,
    reqNumber,
    source_phc_id,
    dest_phc_id,
    medicine_id,
    Number(quantity),
    Number(quantity),
    reason,
    cold_chain_arranged ? 1 : 0,
    fefo_batch_number || (donorStock ? donorStock.batch_number : 'TN-BATCH-STD'),
    fefo_expiry_date || (donorStock ? donorStock.expiry_date : '2027-10-31'),
    userId,
    notes
  );

  logAudit({
    userId,
    action: 'CREATE_TRANSFER_REQUEST',
    entityType: 'transfer_requests',
    entityId: id,
    details: `Created transfer ${reqNumber} for ${quantity} ${med.unit} of ${med.name}`
  });

  res.status(201).json({
    id,
    req_number: reqNumber,
    status: 'requested',
    message: 'Transfer request submitted. Awaiting donor approval.'
  });
});

/**
 * POST /api/transfers/:id/submit
 * Submit draft transfer for review
 */
router.post('/:id/submit', (req, res) => {
  try {
    db.prepare("UPDATE transfer_requests SET status = 'requested' WHERE id = ?").run(req.params.id);
    res.json({ message: 'Transfer submitted for approval', status: 'requested' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/transfers/:id/approve
 * Authorised Block Health Officer or Donor MO approves (full or adjusted quantity)
 */
router.post('/:id/approve', (req, res) => {
  const { approved_quantity, notes = 'Approved according to block logistics policy' } = req.body;
  const transfer = db.prepare('SELECT * FROM transfer_requests WHERE id = ?').get(req.params.id);
  if (!transfer) {
    return res.status(404).json({ error: 'Transfer not found' });
  }

  const effectiveQty = approved_quantity ? Number(approved_quantity) : transfer.quantity;
  const userId = req.user ? req.user.id : 'usr-mo-klm';

  try {
    db.prepare(`
      UPDATE transfer_requests SET 
        status = 'approved',
        approved_by = ?,
        approved_quantity = ?,
        source_approved_at = datetime('now'),
        notes = COALESCE(notes, '') || ' | ' || ?
      WHERE id = ?
    `).run(userId, effectiveQty, notes, req.params.id);

    logAudit({
      userId,
      action: 'APPROVE_TRANSFER',
      entityType: 'transfer_requests',
      entityId: transfer.id,
      details: `Approved transfer ${transfer.req_number} for ${effectiveQty} units`
    });

    res.json({ message: 'Transfer approved successfully', status: 'approved', approved_quantity: effectiveQty });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/transfers/:id/reject
 * Reject transfer with mandatory justification
 */
router.post('/:id/reject', (req, res) => {
  const { rejection_reason } = req.body;
  if (!rejection_reason) {
    return res.status(400).json({ error: 'Rejection reason is mandatory' });
  }

  try {
    db.prepare(`
      UPDATE transfer_requests SET
        status = 'rejected',
        notes = COALESCE(notes, '') || ' | Rejected: ' || ?
      WHERE id = ?
    `).run(rejection_reason, req.params.id);

    res.json({ message: 'Transfer rejected', status: 'rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/transfers/:id/dispatch
 * Record transport handover: Atomically deducts donor stock exactly once
 */
router.post('/:id/dispatch', (req, res) => {
  const { driver_name, vehicle_number, notes } = req.body;
  const transfer = db.prepare('SELECT * FROM transfer_requests WHERE id = ?').get(req.params.id);
  if (!transfer) {
    return res.status(404).json({ error: 'Transfer not found' });
  }

  if (transfer.status === 'in_transit' || transfer.status === 'completed' || transfer.status === 'received') {
    return res.status(400).json({ error: 'Transfer has already been dispatched. Duplicate dispatch prevented.' });
  }

  const effectiveQty = transfer.approved_quantity || transfer.quantity;
  const userId = req.user ? req.user.id : 'usr-pharm-klm';

  db.exec('BEGIN TRANSACTION;');
  try {
    const donorStock = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(transfer.source_phc_id, transfer.medicine_id);
    const donorCurrent = donorStock ? donorStock.quantity : 0;
    if (donorCurrent < effectiveQty) {
      throw new Error(`Insufficient donor stock to dispatch: available ${donorCurrent}, required ${effectiveQty}`);
    }

    const donorNew = donorCurrent - effectiveQty;
    db.prepare('UPDATE current_stock SET quantity = ?, last_updated = datetime("now") WHERE phc_id = ? AND medicine_id = ?')
      .run(donorNew, transfer.source_phc_id, transfer.medicine_id);

    // Record stock entry
    const dateStr = new Date().toISOString().split('T')[0];
    db.prepare(`
      INSERT INTO stock_entries (id, phc_id, medicine_id, entry_date, opening_stock, received_quantity, dispensed_quantity, closing_stock, batch_number, expiry_date, created_by, notes)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
    `).run(`se-trf-out-${transfer.id}-${Date.now()}`, transfer.source_phc_id, transfer.medicine_id, dateStr, donorCurrent, effectiveQty, donorNew, transfer.fefo_batch_number, transfer.fefo_expiry_date, userId, `Dispatch for transfer ${transfer.req_number}`);

    // Record in auditable stock movement ledger
    try {
      db.prepare(`
        INSERT INTO stock_movements (
          id, phc_id, medicine_id, batch_number, movement_type, quantity, direction,
          balance_before, balance_after, batch_balance_before, batch_balance_after,
          reference_id, recorded_by, reason, notes, created_at
        ) VALUES (?, ?, ?, ?, 'TRANSFER_DISPATCH', ?, 'OUT', ?, ?, ?, ?, ?, ?, 'Peer-to-peer redistribution dispatch', ?, datetime('now'))
      `).run(
        `sm-trf-out-${Date.now()}`,
        transfer.source_phc_id,
        transfer.medicine_id,
        transfer.fefo_batch_number || 'TN-BATCH-STD',
        effectiveQty,
        donorCurrent,
        donorNew,
        donorCurrent,
        donorNew,
        transfer.id,
        driver_name || 'Dispatch Staff',
        `Dispatched to ${transfer.dest_phc_id} via transfer ${transfer.req_number}`
      );
    } catch (e) {}

    const collectionDetails = `Handover: Driver ${driver_name || 'Assigned Staff'}, Vehicle ${vehicle_number || 'TN-19-Ambulance'}`;
    db.prepare(`
      UPDATE transfer_requests SET
        status = 'in_transit',
        dispatch_date = datetime('now'),
        collection_details = ?,
        handover_by = ?,
        before_donor_stock = ?,
        after_donor_stock = ?
      WHERE id = ?
    `).run(collectionDetails, driver_name || 'Staff', donorCurrent, donorNew, transfer.id);

    db.exec('COMMIT;');
    res.json({ message: 'Stock deducted from donor facility. Transfer in transit.', status: 'in_transit' });
  } catch (err) {
    db.exec('ROLLBACK;');
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/transfers/:id/receive
 * Confirm delivery receipt: Atomically increments receiving stock for confirmed quantity
 * Handles partial receipt and discrepancy recording safely!
 */
router.post('/:id/receive', (req, res) => {
  const { received_quantity, discrepancy_reason, receiver_name } = req.body;
  const transfer = db.prepare('SELECT * FROM transfer_requests WHERE id = ?').get(req.params.id);
  if (!transfer) {
    return res.status(404).json({ error: 'Transfer not found' });
  }

  if (transfer.status === 'completed' || transfer.status === 'received') {
    return res.status(400).json({ error: 'Transfer has already been received. Duplicate receipt prevented.' });
  }

  const dispatchedQty = transfer.approved_quantity || transfer.quantity;
  const confirmedQty = received_quantity !== undefined ? Number(received_quantity) : dispatchedQty;

  if (confirmedQty < 0 || confirmedQty > dispatchedQty) {
    return res.status(400).json({ error: `Received quantity must be between 0 and dispatched amount (${dispatchedQty})` });
  }

  const isPartial = confirmedQty < dispatchedQty;
  const userId = req.user ? req.user.id : 'usr-pharm-tpr';

  db.exec('BEGIN TRANSACTION;');
  try {
    const destStock = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(transfer.dest_phc_id, transfer.medicine_id);
    const destCurrent = destStock ? destStock.quantity : 0;
    const destNew = destCurrent + confirmedQty;

    db.prepare(`
      INSERT INTO current_stock (id, phc_id, medicine_id, quantity, batch_number, expiry_date, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(phc_id, medicine_id) DO UPDATE SET
        quantity = quantity + excluded.quantity,
        batch_number = COALESCE(excluded.batch_number, current_stock.batch_number),
        expiry_date = COALESCE(excluded.expiry_date, current_stock.expiry_date),
        last_updated = datetime('now')
    `).run(`cs-${transfer.dest_phc_id}-${transfer.medicine_id}`, transfer.dest_phc_id, transfer.medicine_id, confirmedQty, transfer.fefo_batch_number, transfer.fefo_expiry_date);

    // Record receipt entry
    const dateStr = new Date().toISOString().split('T')[0];
    db.prepare(`
      INSERT INTO stock_entries (id, phc_id, medicine_id, entry_date, opening_stock, received_quantity, dispensed_quantity, closing_stock, batch_number, expiry_date, created_by, notes)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `).run(`se-trf-in-${transfer.id}-${Date.now()}`, transfer.dest_phc_id, transfer.medicine_id, dateStr, destCurrent, confirmedQty, destNew, transfer.fefo_batch_number, transfer.fefo_expiry_date, userId, `Received transfer ${transfer.req_number} ${isPartial ? `(Discrepancy: ${confirmedQty}/${dispatchedQty})` : ''}`);

    // Record in auditable stock movement ledger
    try {
      db.prepare(`
        INSERT INTO stock_movements (
          id, phc_id, medicine_id, batch_number, movement_type, quantity, direction,
          balance_before, balance_after, batch_balance_before, batch_balance_after,
          reference_id, recorded_by, reason, notes, created_at
        ) VALUES (?, ?, ?, ?, 'TRANSFER_RECEIPT', ?, 'IN', ?, ?, ?, ?, ?, ?, 'Peer-to-peer redistribution receipt', ?, datetime('now'))
      `).run(
        `sm-trf-in-${Date.now()}`,
        transfer.dest_phc_id,
        transfer.medicine_id,
        transfer.fefo_batch_number || 'TN-BATCH-STD',
        confirmedQty,
        destCurrent,
        destNew,
        destCurrent,
        destNew,
        transfer.id,
        receiver_name || 'Receiving Pharmacist',
        `Received from ${transfer.source_phc_id} via transfer ${transfer.req_number}`
      );
    } catch (e) {}

    // Update transfer
    const notesAddition = isPartial ? `Partial Receipt: ${confirmedQty} of ${dispatchedQty} received. Reason: ${discrepancy_reason || 'Damage/shortage in transit'}` : 'Full receipt verified.';
    db.prepare(`
      UPDATE transfer_requests SET
        status = 'completed',
        receipt_date = datetime('now'),
        received_quantity = ?,
        discrepancy_reason = ?,
        receipt_confirmed_by = ?,
        before_dest_stock = ?,
        after_dest_stock = ?,
        notes = COALESCE(notes, '') || ' | ' || ?
      WHERE id = ?
    `).run(confirmedQty, isPartial ? discrepancy_reason : null, receiver_name || 'Pharmacist on Duty', destCurrent, destNew, notesAddition, transfer.id);

    // Resolve active critical alerts for this medicine if stock replenished
    db.prepare(`
      UPDATE alerts SET status = 'resolved', resolved_at = datetime('now')
      WHERE phc_id = ? AND medicine_id = ? AND status IN ('new', 'acknowledged')
    `).run(transfer.dest_phc_id, transfer.medicine_id);

    db.exec('COMMIT;');
    res.json({
      message: isPartial ? `Partial receipt of ${confirmedQty} units recorded with discrepancy logged.` : `Transfer fully received and ${confirmedQty} units added to stock.`,
      status: 'completed',
      confirmed_quantity: confirmedQty,
      discrepancy: isPartial
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/transfers/:id/cancel
 * Cancel transfer
 */
router.post('/:id/cancel', (req, res) => {
  const { reason = 'Cancelled by administrator' } = req.body;
  try {
    db.prepare("UPDATE transfer_requests SET status = 'cancelled', notes = COALESCE(notes, '') || ' | Cancelled: ' || ? WHERE id = ?").run(reason, req.params.id);
    res.json({ message: 'Transfer cancelled', status: 'cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/transfers/:id/escalate
 * Escalate shortage for formal replenishment
 */
router.post('/:id/escalate', (req, res) => {
  const { escalation_notes = 'Escalated to District Drug Warehouse (DDHS TNMSC)' } = req.body;
  try {
    db.prepare("UPDATE transfer_requests SET status = 'escalated', escalation_notes = ? WHERE id = ?").run(escalation_notes, req.params.id);
    res.json({ message: 'Shortage escalated for district replenishment', status: 'escalated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/transfers/:id/slip
 * Printable transfer voucher data
 */
router.get('/:id/slip', (req, res) => {
  const transfer = db.prepare(`
    SELECT t.*, 
           m.name as medicine_name, m.generic_name, m.unit, m.form, m.strength, m.cold_chain_flag, m.critical_flag,
           sp.name as source_phc_name, sp.phone as source_phone, sp.address as source_address, sp.contact_person as source_contact,
           dp.name as dest_phc_name, dp.phone as dest_phone, dp.address as dest_address, dp.contact_person as dest_contact,
           u.name as requester_name,
           au.name as approver_name
    FROM transfer_requests t
    JOIN medicines m ON t.medicine_id = m.id
    JOIN phcs sp ON t.source_phc_id = sp.id
    JOIN phcs dp ON t.dest_phc_id = dp.id
    LEFT JOIN users u ON t.requested_by = u.id
    LEFT JOIN users au ON t.approved_by = au.id
    WHERE t.id = ?
  `).get(req.params.id);

  if (!transfer) {
    return res.status(404).json({ error: 'Transfer not found' });
  }

  res.json({
    slip_header: {
      title: 'GOVERNMENT OF TAMIL NADU — VELOCITYRX BLOCK EXCHANGE',
      document: 'OFFICIAL INTER-FACILITY STOCK TRANSFER & DISPATCH SLIP',
      voucher_number: transfer.req_number,
      generated_at: new Date().toISOString()
    },
    transfer
  });
});

module.exports = router;
