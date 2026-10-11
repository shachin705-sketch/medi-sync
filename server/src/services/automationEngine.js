const { db } = require('../db/database');
const { calculateMedicineStockMetrics } = require('./stockService');
const { calculateHaversineDistance, estimateRoadTravel } = require('./haversineService');
const { getPlainLanguageExplanation } = require('./plainLanguageAlerts');
const { logAudit } = require('./auditService');
const { syncCurrentStock } = require('./billingService');

let backgroundTimer = null;

// ============================================================================
// SETTINGS HELPERS
// ============================================================================
function getSetting(key, defaultValue) {
  try {
    const row = db.prepare('SELECT value FROM application_settings WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

function setSetting(key, value) {
  try {
    db.prepare(`
      INSERT INTO application_settings (key, value, updated_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, String(value));
    return true;
  } catch (e) {
    console.error(`Failed to set application setting ${key}:`, e);
    return false;
  }
}

// ============================================================================
// USABLE STOCK AND RESERVATION CALCULATIONS
// ============================================================================

/**
 * Returns usable stock details for a medicine at a centre, strictly factoring in
 * active stock reservations to prevent double-allocation across requisitions.
 */
function getUsableBatchStock(phcId, medicineId) {
  // 1. Total usable stock from active, non-expired, non-recalled batches
  const batches = db.prepare(`
    SELECT cbs.*, 
           CAST((julianday(cbs.expiry_date) - julianday('now')) AS INTEGER) as days_to_expiry
    FROM centre_batch_stock cbs
    WHERE cbs.phc_id = ? 
      AND cbs.medicine_id = ?
      AND cbs.status = 'active'
      AND date(cbs.expiry_date) > date('now')
    ORDER BY cbs.expiry_date ASC
  `).all(phcId, medicineId);

  const totalUsableBatchQuantity = batches.reduce((sum, b) => sum + (b.quantity || 0), 0);

  // 2. Sum of active stock reservations
  const reservedRow = db.prepare(`
    SELECT COALESCE(SUM(reserved_quantity), 0) as reserved_total
    FROM stock_reservations
    WHERE phc_id = ? AND medicine_id = ? AND status = 'RESERVED'
  `).get(phcId, medicineId);

  const reservedQuantity = reservedRow ? Number(reservedRow.reserved_total) : 0;
  const unreservedUsableQuantity = Math.max(0, totalUsableBatchQuantity - reservedQuantity);

  return {
    batches,
    totalUsableBatchQuantity,
    reservedQuantity,
    unreservedUsableQuantity
  };
}

// ============================================================================
// STEP 1 & 2: AUTOMATIC STOCK MONITORING & SHORTAGE DETECTION
// ============================================================================

/**
 * Evaluates all health centres and medicines continuously.
 * Detects critical shortages (< 3 days or stockout), low stock (< 14 days),
 * near-expiry batches (< 30 days), and stale data (> 48h).
 * Generates plain-language alerts automatically and auto-resolves recovered alerts.
 */
function evaluateStockHealth() {
  const evaluatedItems = [];
  const detectedShortages = [];

  // Exclude test fixtures and warehouses from deficit evaluation
  const centres = db.prepare(`
    SELECT * FROM phcs 
    WHERE (is_warehouse = 0 OR is_warehouse IS NULL)
      AND id NOT LIKE 'phc-test%' AND id NOT LIKE 'phc-offline%'
    ORDER BY name ASC
  `).all();

  const medicines = db.prepare('SELECT * FROM medicines ORDER BY name ASC').all();

  const safetyReserveDays = Number(getSetting('safety_reserve_days', '14'));

  for (const centre of centres) {
    for (const med of medicines) {
      // Current metrics
      const metrics = calculateMedicineStockMetrics(centre.id, med.id);
      const stockInfo = getUsableBatchStock(centre.id, med.id);

      const usableQty = stockInfo.unreservedUsableQuantity;
      const effectiveAdc = metrics && metrics.effective_adc > 0 ? metrics.effective_adc : 5;
      const daysOfCover = Math.round((usableQty / effectiveAdc) * 10) / 10;
      const safetyReserve = Math.round(effectiveAdc * safetyReserveDays);

      // Evaluate condition
      const isCritical = daysOfCover < 3 || usableQty === 0;
      const isLowStock = !isCritical && daysOfCover < safetyReserveDays;
      const isHealthy = !isCritical && !isLowStock;

      // Check near-expiry batches (within 30 days)
      const nearExpiryBatch = stockInfo.batches.find(b => b.days_to_expiry > 0 && b.days_to_expiry <= 30);
      const expiredBatch = db.prepare(`
        SELECT * FROM centre_batch_stock 
        WHERE phc_id = ? AND medicine_id = ? AND date(expiry_date) <= date('now') AND quantity > 0
        LIMIT 1
      `).get(centre.id, med.id);

      // Check stale data (updated > 48 hours ago)
      const stockRow = db.prepare('SELECT last_updated FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(centre.id, med.id);
      let isStale = false;
      if (stockRow && stockRow.last_updated) {
        const lastUp = new Date(stockRow.last_updated);
        const ageHours = (new Date() - lastUp) / (1000 * 60 * 60);
        if (ageHours > 48) isStale = true;
      }

      // 1. Critical Shortage Alert
      if (isCritical) {
        const plainMsg = getPlainLanguageExplanation({
          type: 'stockout_imminent',
          status: 'red',
          severity: 'critical',
          daysOfCover,
          currentQuantity: usableQty,
          dailyUsage: effectiveAdc,
          unit: med.unit,
          medicineName: med.name
        });

        upsertAlert({
          phc_id: centre.id,
          medicine_id: med.id,
          alert_type: 'stockout_imminent',
          severity: 'critical',
          days_left: daysOfCover,
          message: plainMsg
        });

        detectedShortages.push({
          centre,
          medicine: med,
          daysOfCover,
          usableQty,
          effectiveAdc,
          safetyReserve
        });
      }
      // 2. Low Stock Alert
      else if (isLowStock) {
        const plainMsg = getPlainLanguageExplanation({
          type: 'below_threshold',
          status: 'amber',
          severity: 'warning',
          daysOfCover,
          currentQuantity: usableQty,
          minSafetyStock: safetyReserve,
          dailyUsage: effectiveAdc,
          unit: med.unit,
          medicineName: med.name
        });

        // Since stock is no longer critical (< 3 days), resolve any open stockout_imminent alerts
        db.prepare(`
          UPDATE alerts 
          SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP
          WHERE phc_id = ? AND medicine_id = ? 
            AND alert_type = 'stockout_imminent' 
            AND status != 'resolved'
        `).run(centre.id, med.id);

        upsertAlert({
          phc_id: centre.id,
          medicine_id: med.id,
          alert_type: 'below_threshold',
          severity: 'warning',
          days_left: daysOfCover,
          message: plainMsg
        });
      }
      // 3. Healthy: Auto-resolve any existing open shortage alerts
      else if (isHealthy) {
        autoResolveShortageAlerts(centre.id, med.id);
      }

      // 4. Near-Expiry Batch Alert
      if (nearExpiryBatch) {
        const expMsg = getPlainLanguageExplanation({
          type: 'near_expiry',
          status: 'amber',
          severity: 'warning',
          daysToExpiry: nearExpiryBatch.days_to_expiry,
          batchNumber: nearExpiryBatch.batch_number,
          currentQuantity: nearExpiryBatch.quantity,
          unit: med.unit
        });

        upsertAlert({
          phc_id: centre.id,
          medicine_id: med.id,
          alert_type: 'near_expiry',
          severity: 'warning',
          days_left: nearExpiryBatch.days_to_expiry,
          message: expMsg
        });
      }

      evaluatedItems.push({
        phcId: centre.id,
        medicineId: med.id,
        usableQty,
        daysOfCover,
        status: isCritical ? 'red' : isLowStock ? 'amber' : 'green'
      });
    }
  }

  return {
    evaluatedCount: evaluatedItems.length,
    detectedShortages
  };
}

/**
 * Upsert an alert into the SQLite alerts table and log persistent notification
 */
function upsertAlert({ phc_id, medicine_id, alert_type, severity, days_left, message }) {
  const existing = db.prepare(`
    SELECT id, message FROM alerts 
    WHERE phc_id = ? AND medicine_id = ? AND alert_type = ? AND status != 'resolved'
    ORDER BY created_at DESC LIMIT 1
  `).get(phc_id, medicine_id, alert_type);

  if (existing) {
    db.prepare(`
      UPDATE alerts 
      SET days_left = ?, message = ?, severity = ?
      WHERE id = ?
    `).run(days_left, message, severity, existing.id);
  } else {
    const alertId = `ALT-AUTO-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    db.prepare(`
      INSERT INTO alerts (id, phc_id, medicine_id, alert_type, severity, days_left, message, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'new')
    `).run(alertId, phc_id, medicine_id, alert_type, severity, days_left, message);

    // Create persistent in-app notification
    createNotification({
      phc_id,
      title: severity === 'critical' ? '🔴 Critical Shortage Detected' : '🟡 Stock Warning',
      message,
      severity,
      category: alert_type === 'near_expiry' ? 'near_expiry' : 'shortage'
    });
  }
}

/**
 * Automatically resolve alerts when stock level recovers to healthy
 */
function autoResolveShortageAlerts(phc_id, medicine_id) {
  const openAlerts = db.prepare(`
    SELECT id FROM alerts 
    WHERE phc_id = ? AND medicine_id = ? 
      AND alert_type IN ('stockout_imminent', 'below_threshold') 
      AND status != 'resolved'
  `).all(phc_id, medicine_id);

  if (openAlerts.length > 0) {
    db.prepare(`
      UPDATE alerts 
      SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP
      WHERE phc_id = ? AND medicine_id = ? 
        AND alert_type IN ('stockout_imminent', 'below_threshold') 
        AND status != 'resolved'
    `).run(phc_id, medicine_id);

    const centre = db.prepare('SELECT name FROM phcs WHERE id = ?').get(phc_id);
    const med = db.prepare('SELECT name FROM medicines WHERE id = ?').get(medicine_id);
    createNotification({
      phc_id,
      title: '🟢 Stock Buffer Recovered',
      message: `${med ? med.name : 'Medicine'} at ${centre ? centre.name : 'Centre'} has recovered to healthy stock levels. Shortage alert automatically resolved.`,
      severity: 'success',
      category: 'system'
    });
  }
}

// ============================================================================
// STEP 3: AUTOMATIC DONOR DISCOVERY
// ============================================================================

/**
 * Automatically discovers and ranks eligible donors for a deficit centre.
 * Priority ranking rules:
 * 1. Same district first
 * 2. Medicine and formulation compatibility
 * 3. Safe available surplus (protecting 14-day safety reserve + unreserved)
 * 4. FEFO batch priority (earliest-expiring active batch, strictly non-expired)
 * 5. Expiry suitability for receiver (receiver can consume before batch expiry)
 * 6. Distance / estimated travel time
 * 7. Data freshness and transfer feasibility
 * 
 * If no safe donor exists: discovers District Drug Warehouse node for escalation.
 */
function discoverSafeDonors({ destPhcId, medicineId, neededQuantity = 40, allowCrossDistrict = false }) {
  const destPhc = db.prepare('SELECT * FROM phcs WHERE id = ?').get(destPhcId);
  const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(medicineId);
  if (!destPhc || !med) {
    throw new Error('Destination centre or medicine not found');
  }

  const destMetrics = calculateMedicineStockMetrics(destPhcId, medicineId);
  const destAdc = destMetrics && destMetrics.effective_adc > 0 ? destMetrics.effective_adc : 5;
  const safetyReserveDays = Number(getSetting('safety_reserve_days', '14'));

  // Get candidate peer centres
  const candidates = db.prepare(`
    SELECT * FROM phcs 
    WHERE id != ? 
      AND (is_warehouse = 0 OR is_warehouse IS NULL)
      AND id NOT LIKE 'phc-test%' AND id NOT LIKE 'phc-offline%'
    ORDER BY name ASC
  `).all(destPhcId);

  const eligibleDonors = [];

  for (const candidate of candidates) {
    const isSameDistrict = candidate.district === destPhc.district;
    if (!allowCrossDistrict && !isSameDistrict) {
      continue;
    }

    const stockInfo = getUsableBatchStock(candidate.id, medicineId);
    const stockRow = db.prepare('SELECT avg_daily_usage FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(candidate.id, medicineId);
    let donorAdc = (stockRow && stockRow.avg_daily_usage && stockRow.avg_daily_usage !== 5) ? Number(stockRow.avg_daily_usage) : 0;
    if (!donorAdc) {
      const donorMetrics = calculateMedicineStockMetrics(candidate.id, medicineId);
      donorAdc = donorMetrics && donorMetrics.effective_adc > 0 ? donorMetrics.effective_adc : (stockRow ? Number(stockRow.avg_daily_usage || 5) : 5);
    }

    // Strict 14-day safety reserve check
    const donorSafetyReserve = Math.round(donorAdc * safetyReserveDays);
    const donorSafeSurplus = Math.max(0, stockInfo.unreservedUsableQuantity - donorSafetyReserve);

    // Rule: Never recommend donor solely because total stock is high. Must retain 14 days safety reserve.
    if (donorSafeSurplus < 10) {
      continue; // Ineligible donor: surplus too low to share safely
    }

    // Check FEFO batches: find earliest active batch that receiver can use before expiry
    let chosenBatch = null;
    for (const batch of stockInfo.batches) {
      const daysUntilExpiry = batch.days_to_expiry;
      if (daysUntilExpiry <= 0) continue; // Exclude expired batches

      // Receiver consumption test: receiver must be able to consume transfer quantity before expiry
      const proposedQty = Math.min(neededQuantity, donorSafeSurplus, batch.quantity);
      const daysToConsume = Math.ceil(proposedQty / destAdc);

      if (daysToConsume <= daysUntilExpiry) {
        chosenBatch = batch;
        break; // Pick earliest valid FEFO batch
      }
    }

    if (!chosenBatch) {
      continue; // Batches either expired or expiring too quickly for receiver
    }

    // Calculate distance and road travel time
    const crowDist = calculateHaversineDistance(
      candidate.latitude, candidate.longitude,
      destPhc.latitude, destPhc.longitude
    );
    const roadTravel = estimateRoadTravel(crowDist);

    const transferableUnits = Math.min(neededQuantity, donorSafeSurplus, chosenBatch.quantity);

    eligibleDonors.push({
      donor_phc_id: candidate.id,
      donor_name: candidate.name,
      donor_code: candidate.code,
      district: candidate.district,
      is_same_district: isSameDistrict,
      current_stock: stockInfo.totalUsableBatchQuantity,
      reserved_stock: stockInfo.reservedQuantity,
      usable_unreserved_stock: stockInfo.unreservedUsableQuantity,
      daily_usage: donorAdc,
      safety_reserve: donorSafetyReserve,
      safe_surplus: donorSafeSurplus,
      transferable_units: transferableUnits,
      fefo_batch_number: chosenBatch.batch_number,
      fefo_expiry_date: chosenBatch.expiry_date,
      days_to_expiry: chosenBatch.days_to_expiry,
      distance_km: roadTravel.roadDistanceKm,
      travel_time_mins: roadTravel.estimatedMinutes,
      unit: med.unit
    });
  }

  // Multi-tier ranking:
  // 1. Same district first (0 vs 1)
  // 2. Safe transferable surplus DESC
  // 3. Expiry date ASC (FEFO)
  // 4. Distance / travel time ASC
  eligibleDonors.sort((a, b) => {
    if (a.is_same_district !== b.is_same_district) {
      return a.is_same_district ? -1 : 1;
    }
    if (b.safe_surplus !== a.safe_surplus) {
      return b.safe_surplus - a.safe_surplus;
    }
    if (a.fefo_expiry_date !== b.fefo_expiry_date) {
      return a.fefo_expiry_date.localeCompare(b.fefo_expiry_date);
    }
    return a.distance_km - b.distance_km;
  });

  // Find district drug warehouse escalation fallback
  const warehouse = db.prepare(`
    SELECT * FROM phcs 
    WHERE district = ? AND is_warehouse = 1 
    LIMIT 1
  `).get(destPhc.district) || null;

  return {
    destination: {
      id: destPhc.id,
      name: destPhc.name,
      district: destPhc.district,
      daily_usage: destAdc,
      needed_quantity: neededQuantity
    },
    medicine: {
      id: med.id,
      name: med.name,
      unit: med.unit
    },
    eligible_donors: eligibleDonors,
    top_donor: eligibleDonors.length > 0 ? eligibleDonors[0] : null,
    has_safe_donor: eligibleDonors.length > 0,
    warehouse_escalation_target: warehouse
  };
}

// ============================================================================
// STEP 4 & 5: AUTOMATIC REQUISITION CREATION & APPROVAL POLICY
// ============================================================================

/**
 * Evaluates shortages and automatically creates requisitions.
 * Avoids duplicate active requests for the same centre and medicine.
 * Implements Policy A (Auto-Approval) vs Policy B (Human Approval).
 */
function autoCreateRequisitions() {
  const { detectedShortages } = evaluateStockHealth();
  const createdRequisitions = [];

  const targetBufferDays = Number(getSetting('target_buffer_days', '30'));
  const maxAutoApproveQty = Number(getSetting('max_auto_approve_qty', '200'));
  const approvalPolicy = getSetting('approval_policy', 'AUTO'); // 'AUTO' (Policy A) or 'MANUAL' (Policy B)

  for (const item of detectedShortages) {
    const { centre, medicine, daysOfCover, usableQty, effectiveAdc } = item;

    // Check if there is already an active ongoing requisition for this centre & medicine
    const existingReq = db.prepare(`
      SELECT * FROM transfer_requests 
      WHERE dest_phc_id = ? AND medicine_id = ?
        AND status IN ('requested', 'approved', 'in_transit')
      LIMIT 1
    `).get(centre.id, medicine.id);

    if (existingReq) {
      // Requisition already active; do not create duplicate
      continue;
    }

    // Calculate needed quantity: target 30 days buffer minus usable stock
    const targetStock = Math.round(effectiveAdc * targetBufferDays);
    const deficitUnits = Math.max(20, targetStock - usableQty);

    // Discover eligible donors
    const discovery = discoverSafeDonors({
      destPhcId: centre.id,
      medicineId: medicine.id,
      neededQuantity: deficitUnits
    });

    const reqNumber = `REQ-AUTO-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const reason = `Automated Replenishment: ${centre.name} has only ${daysOfCover} days of ${medicine.name} remaining at ${effectiveAdc} units/day.`;

    // CASE 1: Eligible Safe Peer Donor Found
    if (discovery.has_safe_donor && discovery.top_donor) {
      const donor = discovery.top_donor;
      const transferQuantity = (approvalPolicy === 'AUTO' && maxAutoApproveQty > 0)
        ? Math.min(donor.transferable_units, maxAutoApproveQty)
        : donor.transferable_units;

      // Policy A Check: Auto-approve only if Policy is AUTO, donor is in same district, and quantity is within auto threshold
      const shouldAutoApprove = (approvalPolicy === 'AUTO') && donor.is_same_district && (transferQuantity <= maxAutoApproveQty);

      const status = shouldAutoApprove ? 'approved' : 'requested';
      const lifecycleStage = shouldAutoApprove ? 'RESERVED' : 'REQUESTED';
      const isAutoApproved = shouldAutoApprove ? 1 : 0;
      const policyApplied = shouldAutoApprove ? 'AUTO' : 'MANUAL';

      // Insert requisition
      db.prepare(`
        INSERT INTO transfer_requests (
          id, req_number, source_phc_id, dest_phc_id, medicine_id, quantity, approved_quantity,
          reason, status, lifecycle_stage, policy_applied, is_auto_approved, auto_generated,
          fefo_batch_number, fefo_expiry_date, requested_by, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, 1,
          ?, ?, 'usr-system-automation', CURRENT_TIMESTAMP
        )
      `).run(
        reqNumber, reqNumber, donor.donor_phc_id, centre.id, medicine.id, transferQuantity, shouldAutoApprove ? transferQuantity : null,
        reason, status, lifecycleStage, policyApplied, isAutoApproved,
        donor.fefo_batch_number, donor.fefo_expiry_date
      );

      // If Auto-Approved under Policy A: Immediately create stock reservation to prevent double-allocation
      if (shouldAutoApprove) {
        const resId = `RES-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
        db.prepare(`
          INSERT INTO stock_reservations (
            id, requisition_id, phc_id, medicine_id, batch_number, reserved_quantity, status
          ) VALUES (?, ?, ?, ?, ?, ?, 'RESERVED')
        `).run(resId, reqNumber, donor.donor_phc_id, medicine.id, donor.fefo_batch_number, transferQuantity);

        createNotification({
          phc_id: donor.donor_phc_id,
          title: '⚡ Requisition Auto-Approved (Policy A)',
          message: `Requisition ${reqNumber} for ${transferQuantity} units of ${medicine.name} to ${centre.name} was automatically approved and reserved.`,
          severity: 'info',
          category: 'reservation',
          link: `/app?nav=Approvals`
        });
      } else {
        // Policy B: Human approval task created
        createNotification({
          phc_id: donor.donor_phc_id,
          title: '⏳ Transfer Approval Required (Policy B)',
          message: `New transfer request ${reqNumber} from ${centre.name} for ${transferQuantity} units of ${medicine.name} requires your review and approval.`,
          severity: 'warning',
          category: 'approval',
          link: `/app?nav=Approvals`
        });
      }

      createdRequisitions.push({
        reqNumber,
        status,
        policyApplied,
        donor: donor.donor_name,
        receiver: centre.name,
        medicine: medicine.name,
        quantity: transferQuantity,
        isWarehouseEscalated: false
      });
    }
    // CASE 2: No Safe Peer Donor Found -> Auto-Escalate to District Drug Warehouse
    else if (discovery.warehouse_escalation_target) {
      const warehouse = discovery.warehouse_escalation_target;

      db.prepare(`
        INSERT INTO transfer_requests (
          id, req_number, source_phc_id, dest_phc_id, medicine_id, quantity,
          reason, status, lifecycle_stage, policy_applied, is_auto_approved, auto_generated,
          warehouse_escalated, requested_by, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, 'requested', 'ESCALATED', 'MANUAL', 0, 1,
          1, 'usr-system-automation', CURRENT_TIMESTAMP
        )
      `).run(
        reqNumber, reqNumber, warehouse.id, centre.id, medicine.id, deficitUnits,
        `Warehouse Escalation: No peer centre in ${centre.district} has safe surplus. Direct replenishment requested from ${warehouse.name}.`
      );

      createNotification({
        phc_id: centre.id,
        title: '🏬 Escalated to District Drug Warehouse',
        message: `No local peer centre has safe surplus of ${medicine.name}. Requisition ${reqNumber} automatically escalated to ${warehouse.name}.`,
        severity: 'warning',
        category: 'escalation',
        link: `/app?nav=Health Centres`
      });

      createdRequisitions.push({
        reqNumber,
        status: 'requested',
        policyApplied: 'MANUAL',
        donor: warehouse.name,
        receiver: centre.name,
        medicine: medicine.name,
        quantity: deficitUnits,
        isWarehouseEscalated: true
      });
    }
  }

  return createdRequisitions;
}

// ============================================================================
// STEP 6: AUDITABLE TRANSFER LIFECYCLE STATE MACHINE
// ============================================================================

/**
 * Executes state machine transitions:
 * DETECTED -> RECOMMENDED -> REQUESTED -> APPROVED -> RESERVED -> DISPATCHED -> RECEIVED -> COMPLETED
 * Supports: REJECTED, CANCELLED, PARTIALLY_FULFILLED, FAILED, ESCALATED.
 */
function transitionTransferLifecycle({
  requisitionId,
  action, // 'APPROVE' | 'DISPATCH' | 'RECEIVE' | 'REJECT' | 'CANCEL'
  actorUserId = 'system_operator',
  actorName = 'Authorised Staff',
  quantity = null,
  rejectionReason = null,
  receivedQuantity = null,
  discrepancyReason = null,
  handoverDetails = null
}) {
  const req = db.prepare('SELECT * FROM transfer_requests WHERE id = ? OR req_number = ?').get(requisitionId, requisitionId);
  if (!req) {
    throw new Error(`Requisition ${requisitionId} not found`);
  }

  const donorPhc = db.prepare('SELECT * FROM phcs WHERE id = ?').get(req.source_phc_id);
  const destPhc = db.prepare('SELECT * FROM phcs WHERE id = ?').get(req.dest_phc_id);
  const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(req.medicine_id);

  // 1. APPROVAL
  if (action === 'APPROVE') {
    if (!['requested', 'REQUESTED'].includes(req.status)) {
      throw new Error(`Cannot approve requisition in status ${req.status}`);
    }

    const approvedQty = quantity ? Number(quantity) : req.quantity;

    // Check donor available surplus
    const stockInfo = getUsableBatchStock(req.source_phc_id, req.medicine_id);
    if (stockInfo.unreservedUsableQuantity < approvedQty) {
      throw new Error(`Insufficient unreserved surplus at donor. Available: ${stockInfo.unreservedUsableQuantity}, Requested: ${approvedQty}`);
    }

    // Select batch for reservation
    const chosenBatch = req.fefo_batch_number || (stockInfo.batches.length > 0 ? stockInfo.batches[0].batch_number : 'TN-BATCH-STD');
    const chosenBatchObj = stockInfo.batches.find(b => b.batch_number === chosenBatch) || stockInfo.batches[0];
    const chosenExpiry = chosenBatchObj ? chosenBatchObj.expiry_date : (req.fefo_expiry_date || '2027-10-31');

    // Create reservation
    const resId = `RES-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    db.prepare(`
      INSERT INTO stock_reservations (
        id, requisition_id, phc_id, medicine_id, batch_number, reserved_quantity, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'RESERVED')
    `).run(resId, req.id, req.source_phc_id, req.medicine_id, chosenBatch, approvedQty);

    db.prepare(`
      UPDATE transfer_requests
      SET status = 'approved',
          lifecycle_stage = 'RESERVED',
          approved_quantity = ?,
          fefo_batch_number = COALESCE(fefo_batch_number, ?),
          fefo_expiry_date = COALESCE(fefo_expiry_date, ?),
          approved_by = ?,
          source_approved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(approvedQty, chosenBatch, chosenExpiry, actorName, req.id);

    logAudit({
      userId: actorUserId,
      action: 'APPROVE_TRANSFER',
      entityType: 'transfer_requests',
      entityId: req.id,
      details: { approvedQty, chosenBatch, donor: donorPhc ? donorPhc.name : req.source_phc_id }
    });

    createNotification({
      phc_id: req.dest_phc_id,
      title: '✅ Transfer Approved & Reserved',
      message: `${donorPhc ? donorPhc.name : 'Donor'} approved transfer of ${approvedQty} units of ${med ? med.name : 'Medicine'}. Shipment being prepared.`,
      severity: 'info',
      category: 'approval'
    });

    return { status: 'approved', lifecycle_stage: 'RESERVED', approved_quantity: approvedQty };
  }

  // 2. DISPATCH (Deduct donor stock once)
  if (action === 'DISPATCH') {
    if (!['approved', 'RESERVED'].includes(req.status) && req.lifecycle_stage !== 'RESERVED') {
      throw new Error(`Cannot dispatch transfer in stage ${req.lifecycle_stage}`);
    }

    const dispatchQty = req.approved_quantity || req.quantity;
    let batchNum = req.fefo_batch_number;
    if (!batchNum) {
      const resRow = db.prepare(`
        SELECT batch_number FROM stock_reservations 
        WHERE requisition_id = ? AND status = 'RESERVED' 
        LIMIT 1
      `).get(req.id);
      if (resRow && resRow.batch_number) {
        batchNum = resRow.batch_number;
      }
    }

    // Verify batch stock
    let batchRow = null;
    if (batchNum) {
      batchRow = db.prepare(`
        SELECT * FROM centre_batch_stock 
        WHERE phc_id = ? AND medicine_id = ? AND batch_number = ?
      `).get(req.source_phc_id, req.medicine_id, batchNum);
    }

    // Fallback: if batchRow has insufficient stock, find earliest expiring active batch with enough stock
    if (!batchRow || batchRow.quantity < dispatchQty) {
      batchRow = db.prepare(`
        SELECT * FROM centre_batch_stock 
        WHERE phc_id = ? AND medicine_id = ? AND quantity >= ? AND status = 'active'
        ORDER BY expiry_date ASC LIMIT 1
      `).get(req.source_phc_id, req.medicine_id, dispatchQty);
      if (batchRow) {
        batchNum = batchRow.batch_number;
      }
    }

    if (!batchRow || batchRow.quantity < dispatchQty) {
      throw new Error(`Cannot dispatch: Batch ${batchNum || 'unknown'} has only ${batchRow ? batchRow.quantity : 0} units, need ${dispatchQty}`);
    }

    // Deduct stock from donor batch
    const donorBalBefore = batchRow.quantity;
    const donorBalAfter = donorBalBefore - dispatchQty;

    db.prepare(`
      UPDATE centre_batch_stock 
      SET quantity = ?, last_updated = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(donorBalAfter, batchRow.id);

    syncCurrentStock(req.source_phc_id, req.medicine_id);

    // Record auditable stock movement (OUT)
    const movId = `SM-DISP-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    db.prepare(`
      INSERT INTO stock_movements (
        id, phc_id, medicine_id, batch_number, movement_type, quantity, direction,
        balance_before, balance_after, reference_id, recorded_by, reason
      ) VALUES (
        ?, ?, ?, ?, 'TRANSFER_DISPATCH', ?, 'OUT',
        ?, ?, ?, ?, 'Redistribution shipment dispatch'
      )
    `).run(movId, req.source_phc_id, req.medicine_id, batchNum, dispatchQty, donorBalBefore, donorBalAfter, req.req_number, actorName);

    // Update reservation status to COMMITTED
    db.prepare(`
      UPDATE stock_reservations 
      SET status = 'COMMITTED', updated_at = CURRENT_TIMESTAMP 
      WHERE requisition_id = ? AND status = 'RESERVED'
    `).run(req.id);

    db.prepare(`
      UPDATE transfer_requests 
      SET status = 'in_transit',
          lifecycle_stage = 'DISPATCHED',
          dispatch_date = CURRENT_TIMESTAMP,
          handover_by = ?
      WHERE id = ?
    `).run(actorName, req.id);

    createNotification({
      phc_id: req.dest_phc_id,
      title: '🚚 Stock Dispatched in Transit',
      message: `${dispatchQty} units of ${med ? med.name : 'Medicine'} dispatched from ${donorPhc ? donorPhc.name : 'Donor'}. Road transit initiated.`,
      severity: 'info',
      category: 'dispatch'
    });

    return { status: 'in_transit', lifecycle_stage: 'DISPATCHED', dispatched_quantity: dispatchQty };
  }

  // 3. RECEIPT (Add receiver stock once, reconcile discrepancies)
  if (action === 'RECEIVE') {
    if (!['in_transit', 'DISPATCHED'].includes(req.status) && req.lifecycle_stage !== 'DISPATCHED') {
      throw new Error(`Cannot receive transfer in stage ${req.lifecycle_stage}`);
    }

    const dispatchedQty = req.approved_quantity || req.quantity;
    const actualReceivedQty = receivedQuantity !== null ? Number(receivedQuantity) : dispatchedQty;
    const batchNum = req.fefo_batch_number || 'TN-BATCH-STD';
    const expDate = req.fefo_expiry_date || '2027-10-31';

    const discrepancy = dispatchedQty - actualReceivedQty;

    // Increment receiver batch
    let receiverBatch = db.prepare(`
      SELECT * FROM centre_batch_stock 
      WHERE phc_id = ? AND medicine_id = ? AND batch_number = ?
    `).get(req.dest_phc_id, req.medicine_id, batchNum);

    let recBalBefore = 0;
    if (receiverBatch) {
      recBalBefore = receiverBatch.quantity;
      const recBalAfter = recBalBefore + actualReceivedQty;
      db.prepare(`
        UPDATE centre_batch_stock 
        SET quantity = ?, last_updated = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(recBalAfter, receiverBatch.id);
    } else {
      const newBatchId = `cbs-${req.dest_phc_id}-${req.medicine_id}-${batchNum}`;
      db.prepare(`
        INSERT INTO centre_batch_stock (
          id, phc_id, medicine_id, batch_number, expiry_date, quantity, unit, status, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
      `).run(newBatchId, req.dest_phc_id, req.medicine_id, batchNum, expDate, actualReceivedQty, med ? med.unit : 'units');
    }

    syncCurrentStock(req.dest_phc_id, req.medicine_id);

    // Record auditable stock movement (IN)
    const movId = `SM-REC-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    db.prepare(`
      INSERT INTO stock_movements (
        id, phc_id, medicine_id, batch_number, movement_type, quantity, direction,
        balance_before, balance_after, reference_id, recorded_by, reason, notes
      ) VALUES (
        ?, ?, ?, ?, 'TRANSFER_RECEIPT', ?, 'IN',
        ?, ?, ?, ?, 'Confirmed transfer receipt', ?
      )
    `).run(
      movId, req.dest_phc_id, req.medicine_id, batchNum, actualReceivedQty,
      recBalBefore, recBalBefore + actualReceivedQty, req.req_number, actorName,
      discrepancy > 0 ? `Discrepancy: ${discrepancy} units missing. Reason: ${discrepancyReason || 'Transit variance'}` : 'Receipt verified fully'
    );

    // Release stock reservation
    db.prepare(`
      UPDATE stock_reservations 
      SET status = 'RELEASED', updated_at = CURRENT_TIMESTAMP 
      WHERE requisition_id = ?
    `).run(req.id);

    const finalStatus = 'completed';
    const finalStage = discrepancy > 0 ? 'PARTIALLY_FULFILLED' : 'COMPLETED';

    db.prepare(`
      UPDATE transfer_requests 
      SET status = ?,
          lifecycle_stage = ?,
          received_quantity = ?,
          discrepancy_quantity = ?,
          discrepancy_reason = ?,
          receipt_date = CURRENT_TIMESTAMP,
          receipt_confirmed_by = ?
      WHERE id = ?
    `).run(finalStatus, finalStage, actualReceivedQty, discrepancy, discrepancyReason, actorName, req.id);

    createNotification({
      phc_id: req.dest_phc_id,
      title: discrepancy > 0 ? '⚠️ Partial Receipt Confirmed' : '🎉 Transfer Successfully Received',
      message: `${actualReceivedQty} units of ${med ? med.name : 'Medicine'} verified and added to inventory. Days of cover restored.`,
      severity: discrepancy > 0 ? 'warning' : 'success',
      category: 'receipt'
    });

    // Run full automation cycle immediately so days of cover, map markers and alerts reflect updated stock
    evaluateStockHealth();

    return {
      status: finalStatus,
      lifecycle_stage: finalStage,
      received_quantity: actualReceivedQty,
      discrepancy_quantity: discrepancy
    };
  }

  // 4. REJECT / CANCEL
  if (['REJECT', 'CANCEL'].includes(action)) {
    // Release reservation if one existed
    db.prepare(`
      UPDATE stock_reservations 
      SET status = 'RELEASED', updated_at = CURRENT_TIMESTAMP 
      WHERE requisition_id = ?
    `).run(req.id);

    const newStatus = action === 'REJECT' ? 'rejected' : 'cancelled';
    db.prepare(`
      UPDATE transfer_requests 
      SET status = ?, lifecycle_stage = ?, escalation_notes = ?
      WHERE id = ?
    `).run(newStatus, newStatus.toUpperCase(), rejectionReason || 'Operational cancellation', req.id);

    createNotification({
      phc_id: req.dest_phc_id,
      title: `❌ Transfer ${newStatus.toUpperCase()}`,
      message: `Requisition ${req.req_number} was ${newStatus}. Reason: ${rejectionReason || 'Staff decision'}`,
      severity: 'warning',
      category: 'approval'
    });

    return { status: newStatus, lifecycle_stage: newStatus.toUpperCase() };
  }

  throw new Error(`Unsupported action ${action}`);
}

// ============================================================================
// STEP 7: OVERDUE WORKFLOW ESCALATIONS
// ============================================================================

/**
 * Checks for overdue pending approvals (> 24h) and overdue in-transit shipments (> 48h).
 */
function checkOverdueEscalations() {
  const overdueApprovalHours = Number(getSetting('overdue_approval_hours', '24'));
  const overdueTransitHours = Number(getSetting('overdue_transit_hours', '48'));

  let escalatedCount = 0;

  // 1. Overdue approvals
  const overdueApprovals = db.prepare(`
    SELECT tr.*, p1.name as donor_name, p2.name as receiver_name, m.name as med_name
    FROM transfer_requests tr
    JOIN phcs p1 ON tr.source_phc_id = p1.id
    JOIN phcs p2 ON tr.dest_phc_id = p2.id
    JOIN medicines m ON tr.medicine_id = m.id
    WHERE tr.status = 'requested' 
      AND tr.is_overdue_approval = 0
      AND (julianday('now') - julianday(tr.created_at)) * 24 > ?
  `).all(overdueApprovalHours);

  for (const item of overdueApprovals) {
    db.prepare('UPDATE transfer_requests SET is_overdue_approval = 1 WHERE id = ?').run(item.id);
    createNotification({
      phc_id: item.source_phc_id,
      title: '🚨 Overdue Transfer Approval',
      message: `Requisition ${item.req_number} from ${item.receiver_name} has been awaiting approval for over ${overdueApprovalHours} hours. Immediate officer action required.`,
      severity: 'critical',
      category: 'escalation',
      link: '/app?nav=Approvals'
    });
    escalatedCount++;
  }

  // 2. Overdue transit shipments
  const overdueTransits = db.prepare(`
    SELECT tr.*, p1.name as donor_name, p2.name as receiver_name, m.name as med_name
    FROM transfer_requests tr
    JOIN phcs p1 ON tr.source_phc_id = p1.id
    JOIN phcs p2 ON tr.dest_phc_id = p2.id
    JOIN medicines m ON tr.medicine_id = m.id
    WHERE tr.status = 'in_transit' 
      AND tr.is_overdue_transit = 0
      AND tr.dispatch_date IS NOT NULL
      AND (julianday('now') - julianday(tr.dispatch_date)) * 24 > ?
  `).all(overdueTransitHours);

  for (const item of overdueTransits) {
    db.prepare('UPDATE transfer_requests SET is_overdue_transit = 1 WHERE id = ?').run(item.id);
    createNotification({
      phc_id: item.dest_phc_id,
      title: '⚠️ Delayed Shipment In Transit',
      message: `Shipment ${item.req_number} from ${item.donor_name} has been in transit for over ${overdueTransitHours} hours. Confirm receipt or verify carrier status.`,
      severity: 'warning',
      category: 'dispatch',
      link: '/app?nav=Dispatch & Receipts'
    });
    escalatedCount++;
  }

  return escalatedCount;
}

// ============================================================================
// STEP 8: IN-APP NOTIFICATIONS HELPER
// ============================================================================

function createNotification({ phc_id, title, message, severity = 'info', category = 'system', link = null }) {
  try {
    const id = `NOTIF-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    db.prepare(`
      INSERT INTO notifications (id, phc_id, title, message, severity, category, link)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, phc_id, title, message, severity, category, link);
    return id;
  } catch (e) {
    console.error('Error creating in-app notification:', e);
    return null;
  }
}

// ============================================================================
// STEP 9: FULL AUTOMATION CYCLE EXECUTION & JOB LOGGING
// ============================================================================

/**
 * Runs the complete automated cycle:
 * 1. Evaluate stock health & update alerts
 * 2. Auto-create requisitions for shortages
 * 3. Check overdue deadlines and escalations
 * 4. Record execution stats in background_jobs
 */
function runFullAutomationCycle() {
  const startTime = Date.now();
  const jobId = `JOB-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

  try {
    // 1. Stock health & alerts
    const stockResult = evaluateStockHealth();

    // 2. Auto-requisitions
    const newRequisitions = autoCreateRequisitions();

    // 3. Overdue escalations
    const overdueCount = checkOverdueEscalations();

    const durationMs = Date.now() - startTime;
    const itemsProcessed = stockResult.evaluatedCount + newRequisitions.length + overdueCount;
    const msg = `Cycle complete: ${stockResult.detectedShortages.length} shortages evaluated, ${newRequisitions.length} requisitions created, ${overdueCount} overdue escalated.`;

    db.prepare(`
      INSERT INTO background_jobs (id, job_name, status, items_processed, message, duration_ms)
      VALUES (?, 'AUTOMATION_CYCLE', 'SUCCESS', ?, ?, ?)
    `).run(jobId, itemsProcessed, msg, durationMs);

    return {
      success: true,
      jobId,
      durationMs,
      itemsProcessed,
      shortagesDetected: stockResult.detectedShortages.length,
      requisitionsCreated: newRequisitions.length,
      overdueEscalations: overdueCount
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.error('Error in automation cycle:', err);

    db.prepare(`
      INSERT INTO background_jobs (id, job_name, status, items_processed, message, duration_ms)
      VALUES (?, 'AUTOMATION_CYCLE', 'FAILED', 0, ?, ?)
    `).run(jobId, err.message, durationMs);

    return {
      success: false,
      jobId,
      error: err.message
    };
  }
}

// ============================================================================
// STEP 10: SCHEDULER LIFECYCLE
// ============================================================================

function startAutomationEngine(intervalMs = 30000) {
  if (backgroundTimer) {
    clearInterval(backgroundTimer);
  }

  // Run initial cycle immediately
  runFullAutomationCycle();

  backgroundTimer = setInterval(() => {
    runFullAutomationCycle();
  }, intervalMs);

  console.log(`🤖 MediAlert AI Automation Engine started (Interval: ${intervalMs / 1000}s).`);
}

function stopAutomationEngine() {
  if (backgroundTimer) {
    clearInterval(backgroundTimer);
    backgroundTimer = null;
    console.log('🛑 MediAlert AI Automation Engine stopped.');
  }
}

module.exports = {
  getSetting,
  setSetting,
  getUsableBatchStock,
  evaluateStockHealth,
  discoverSafeDonors,
  autoCreateRequisitions,
  transitionTransferLifecycle,
  checkOverdueEscalations,
  createNotification,
  runFullAutomationCycle,
  startAutomationEngine,
  stopAutomationEngine
};
