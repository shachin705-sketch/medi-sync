const { db } = require('../db/database');
const { syncCurrentStock } = require('./billingService');
const { logAudit } = require('./auditService');

/**
 * Record Opening / Initial Stock or Stock Receipt
 * Implements all 15 required fields with strict validation:
 * - Healthcare centre
 * - Medicine name
 * - Generic name
 * - Medicine strength and formulation
 * - Batch number
 * - Available quantity (strictly > 0)
 * - Unit of measurement
 * - Manufacturing date
 * - Expiry date (strictly in future)
 * - Received date
 * - Supplier or source
 * - Minimum safety stock
 * - Average daily usage
 * - Recorded by
 * - Notes
 */
function recordOpeningStock({
  phc_id,
  medicine_id,
  medicine_name,
  generic_name = '',
  strength = 'Standard',
  form = 'Oral',
  category = 'Essential Medicines',
  batch_number,
  quantity,
  quantity_added,
  available_quantity,
  unit = 'tablets',
  mfg_date = null,
  expiry_date,
  received_date = null,
  supplier = 'TN Medical Services Corp (TNMSC)',
  min_safety_stock = 14,
  avg_daily_usage = 5,
  recorded_by = 'Staff Pharmacist',
  notes = 'Initial opening stock intake'
}) {
  // 1. Validations
  if (!phc_id) throw new Error('Healthcare centre is required');
  const centre = db.prepare('SELECT * FROM phcs WHERE id = ?').get(phc_id);
  if (!centre) throw new Error(`Healthcare centre ${phc_id} does not exist`);

  const rawQty = quantity !== undefined ? quantity : (quantity_added !== undefined ? quantity_added : available_quantity);
  const qty = Number(rawQty);
  if (!qty || qty <= 0 || !Number.isInteger(qty)) {
    throw new Error('Available quantity must be a positive whole number greater than 0');
  }

  const cleanBatch = String(batch_number || '').trim().toUpperCase();
  if (!cleanBatch) {
    throw new Error('Batch number is mandatory');
  }

  if (!expiry_date) {
    throw new Error('Expiry date is mandatory');
  }

  const expDateObj = new Date(expiry_date);
  if (isNaN(expDateObj.getTime())) {
    throw new Error('Invalid expiry date format');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (expDateObj <= today) {
    throw new Error(`Cannot accept expired batch: Expiry date ${expiry_date} is in the past or today`);
  }

  const safetyStock = Math.max(1, Number(min_safety_stock) || 14);
  const dailyUsage = Math.max(0.1, Number(avg_daily_usage) || 5);
  const rcptDate = received_date || new Date().toISOString().split('T')[0];

  // 2. Resolve or Register Medicine
  let targetMedId = medicine_id;
  if (!targetMedId) {
    // Lookup by name
    const existingMed = db.prepare('SELECT id FROM medicines WHERE LOWER(name) = ?').get(String(medicine_name || '').toLowerCase());
    if (existingMed) {
      targetMedId = existingMed.id;
    } else {
      // Create medicine
      const name = medicine_name || 'Generic Medicine';
      targetMedId = `med-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)}-${Date.now()}`;
      db.prepare(`
        INSERT INTO medicines (id, name, generic_name, category, form, strength, unit, standard_buffer_days, critical_buffer_days)
        VALUES (?, ?, ?, ?, ?, ?, ?, 30, 21)
      `).run(targetMedId, name, generic_name || name, category, form, strength, unit);
    }
  }

  const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(targetMedId);
  if (!med) throw new Error('Medicine could not be resolved');

  // 3. Register batch in batches catalog if not exists
  db.prepare(`
    INSERT OR IGNORE INTO batches (id, medicine_id, batch_number, expiry_date, manufacturer)
    VALUES (?, ?, ?, ?, ?)
  `).run(`b-${targetMedId}-${cleanBatch}`, targetMedId, cleanBatch, expiry_date, supplier);

  db.exec('BEGIN TRANSACTION;');
  try {
    // Current centre stock before
    const csBefore = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(phc_id, targetMedId);
    const centreStockBefore = csBefore ? csBefore.quantity : 0;
    const centreStockAfter = centreStockBefore + qty;

    // Check existing batch stock (do not silently overwrite!)
    const batchRow = db.prepare(`
      SELECT * FROM centre_batch_stock 
      WHERE phc_id = ? AND medicine_id = ? AND batch_number = ?
    `).get(phc_id, targetMedId, cleanBatch);

    const batchStockBefore = batchRow ? batchRow.quantity : 0;
    const batchStockAfter = batchStockBefore + qty;

    const batchStockId = `cbs-${phc_id}-${targetMedId}-${cleanBatch}`;
    if (batchRow) {
      // Increment existing batch stock
      db.prepare(`
        UPDATE centre_batch_stock SET
          quantity = quantity + ?,
          expiry_date = ?,
          supplier = COALESCE(?, supplier),
          unit = ?,
          min_safety_stock = ?,
          avg_daily_usage = ?,
          status = 'active',
          last_updated = datetime('now')
        WHERE id = ?
      `).run(qty, expiry_date, supplier, unit, safetyStock, dailyUsage, batchRow.id);
    } else {
      // Insert new batch record
      db.prepare(`
        INSERT INTO centre_batch_stock (
          id, phc_id, medicine_id, batch_number, expiry_date, quantity, mfg_date, received_date,
          supplier, unit, min_safety_stock, avg_daily_usage, status, created_at, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
      `).run(batchStockId, phc_id, targetMedId, cleanBatch, expiry_date, qty, mfg_date, rcptDate, supplier, unit, safetyStock, dailyUsage);
    }

    // Synchronize current_stock with updated usage and safety reserve
    syncCurrentStock(phc_id, targetMedId);
    db.prepare(`
      UPDATE current_stock SET
        min_safety_stock = ?,
        avg_daily_usage = ?,
        last_updated = datetime('now')
      WHERE phc_id = ? AND medicine_id = ?
    `).run(safetyStock, dailyUsage, phc_id, targetMedId);

    // Record auditable movement ledger entry
    const movementId = `sm-open-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    db.prepare(`
      INSERT INTO stock_movements (
        id, phc_id, medicine_id, batch_number, movement_type, quantity, direction,
        balance_before, balance_after, batch_balance_before, batch_balance_after,
        reference_id, recorded_by, reason, notes, created_at
      ) VALUES (?, ?, ?, ?, 'OPENING_STOCK', ?, 'IN', ?, ?, ?, ?, ?, ?, 'Initial / Opening Stock intake', ?, datetime('now'))
    `).run(
      movementId,
      phc_id,
      targetMedId,
      cleanBatch,
      qty,
      centreStockBefore,
      centreStockAfter,
      batchStockBefore,
      batchStockAfter,
      `init-${Date.now()}`,
      recorded_by,
      notes || `Opening stock recorded: ${qty} ${unit}`
    );

    // Resolve valid user ID for stock_entries if present, else null
    let validUserId = null;
    try {
      const u = db.prepare('SELECT id FROM users WHERE id = ? OR name = ?').get(recorded_by, recorded_by);
      if (u) validUserId = u.id;
    } catch (e) {}

    // Record in stock_entries
    db.prepare(`
      INSERT INTO stock_entries (
        id, phc_id, medicine_id, entry_date, opening_stock, received_quantity, dispensed_quantity,
        closing_stock, batch_number, expiry_date, created_by, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      `se-open-${Date.now()}`,
      phc_id,
      targetMedId,
      rcptDate,
      centreStockBefore,
      qty,
      centreStockAfter,
      cleanBatch,
      expiry_date,
      validUserId,
      notes
    );

    logAudit({
      userId: recorded_by,
      action: 'ADD_OPENING_STOCK',
      entityType: 'centre_batch_stock',
      entityId: batchStockId,
      details: `Added ${qty} ${unit} of ${med.name} (Batch ${cleanBatch}) at ${centre.name}. Total balance: ${centreStockAfter}.`
    });

    db.exec('COMMIT;');

    const daysOfCover = dailyUsage > 0 ? Math.round((centreStockAfter / dailyUsage) * 10) / 10 : 999;

    return {
      success: true,
      movement_id: movementId,
      phc_id,
      centre_name: centre.name,
      medicine_id: targetMedId,
      medicine_name: med.name,
      batch_number: cleanBatch,
      expiry_date,
      quantity_added: qty,
      stock_before: centreStockBefore,
      stock_after: centreStockAfter,
      batch_stock_after: batchStockAfter,
      unit,
      days_of_cover: daysOfCover,
      recorded_by,
      message: `Successfully recorded opening stock for ${med.name}: ${qty} ${unit} added.`
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Audited Stock Adjustment / Write-Off
 */
function recordStockAdjustment({
  phc_id,
  medicine_id,
  batch_number,
  adjustment_type = 'ADJUSTMENT', // 'ADJUSTMENT', 'WRITE_OFF'
  quantity_change, // positive number
  direction = 'OUT', // 'IN' (correction add) or 'OUT' (correction subtract, damage, write-off)
  recorded_by = 'Staff Pharmacist',
  reason = 'Audit physical count reconciliation',
  notes = ''
}) {
  const qty = Number(quantity_change);
  if (!phc_id || !medicine_id || !batch_number || !qty || qty <= 0) {
    throw new Error('Centre, medicine, batch number, and positive quantity change are required');
  }

  if (!reason || reason.trim().length === 0) {
    throw new Error('Audited reason is strictly required for stock adjustment');
  }

  const batchRow = db.prepare(`
    SELECT * FROM centre_batch_stock 
    WHERE phc_id = ? AND medicine_id = ? AND batch_number = ?
  `).get(phc_id, medicine_id, batch_number);

  if (!batchRow) {
    throw new Error(`Batch ${batch_number} does not exist at this facility`);
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    const csRow = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(phc_id, medicine_id);
    const centreStockBefore = csRow ? csRow.quantity : 0;
    const batchStockBefore = batchRow.quantity;

    let centreStockAfter;
    let batchStockAfter;

    if (direction === 'OUT') {
      if (batchStockBefore < qty) {
        throw new Error(`Cannot deduct ${qty} units: Batch only has ${batchStockBefore} units`);
      }
      batchStockAfter = batchStockBefore - qty;
      centreStockAfter = Math.max(0, centreStockBefore - qty);
    } else {
      batchStockAfter = batchStockBefore + qty;
      centreStockAfter = centreStockBefore + qty;
    }

    // Update batch
    db.prepare(`
      UPDATE centre_batch_stock 
      SET quantity = ?, last_updated = datetime('now')
      WHERE id = ?
    `).run(batchStockAfter, batchRow.id);

    // Sync current_stock
    syncCurrentStock(phc_id, medicine_id);

    const movementType = adjustment_type === 'WRITE_OFF' ? 'WRITE_OFF' : 'ADJUSTMENT';
    const movementId = `sm-adj-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    db.prepare(`
      INSERT INTO stock_movements (
        id, phc_id, medicine_id, batch_number, movement_type, quantity, direction,
        balance_before, balance_after, batch_balance_before, batch_balance_after,
        reference_id, recorded_by, reason, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      movementId,
      phc_id,
      medicine_id,
      batch_number,
      movementType,
      qty,
      direction,
      centreStockBefore,
      centreStockAfter,
      batchStockBefore,
      batchStockAfter,
      `adj-${Date.now()}`,
      recorded_by,
      reason,
      notes || `Stock adjustment (${direction}): ${reason}`
    );

    logAudit({
      userId: recorded_by,
      action: 'STOCK_ADJUSTMENT',
      entityType: 'centre_batch_stock',
      entityId: batchRow.id,
      details: `${movementType} (${direction} ${qty}) for Batch ${batch_number}: ${reason}`
    });

    db.exec('COMMIT;');

    return {
      success: true,
      movement_id: movementId,
      phc_id,
      medicine_id,
      batch_number,
      stock_before: centreStockBefore,
      stock_after: centreStockAfter,
      batch_stock_after: batchStockAfter,
      movement_type: movementType,
      direction
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Fetch Stock Movement Ledger with filters
 */
function getStockMovements({ phc_id, medicine_id, batch_number, movement_type, search, limit = 50 }) {
  let sql = `
    SELECT sm.*, 
           p.name as centre_name, p.code as centre_code,
           m.name as medicine_name, m.generic_name, m.unit, m.form, m.strength
    FROM stock_movements sm
    JOIN phcs p ON sm.phc_id = p.id
    JOIN medicines m ON sm.medicine_id = m.id
    WHERE 1=1
  `;
  const params = [];

  if (phc_id) {
    sql += ' AND sm.phc_id = ?';
    params.push(phc_id);
  }
  if (medicine_id) {
    sql += ' AND sm.medicine_id = ?';
    params.push(medicine_id);
  }
  if (batch_number) {
    sql += ' AND sm.batch_number = ?';
    params.push(batch_number);
  }
  if (movement_type && movement_type !== 'all') {
    sql += ' AND sm.movement_type = ?';
    params.push(movement_type);
  }
  if (search) {
    sql += ' AND (LOWER(m.name) LIKE ? OR LOWER(sm.batch_number) LIKE ? OR LOWER(sm.recorded_by) LIKE ? OR LOWER(sm.reason) LIKE ?)';
    const s = `%${search.toLowerCase()}%`;
    params.push(s, s, s, s);
  }

  sql += ' ORDER BY sm.created_at DESC LIMIT ?';
  params.push(Number(limit) || 50);

  return db.prepare(sql).all(...params);
}

/**
 * Process Batch of Queued Offline Operations
 * Implements:
 * 1. Idempotency protection via operation ID / reference_id
 * 2. Strict server-side validation (expiry dates, positive quantities, valid facilities)
 * 3. Concurrency conflict detection between server state and client snapshot
 * 4. Safe auditable execution into stock_movements ledger
 */
function processSyncQueue(queue = []) {
  if (!Array.isArray(queue) || queue.length === 0) {
    return { results: [], summary: { total: 0, synced: 0, conflicts: 0, failed: 0 } };
  }

  const results = [];
  let syncedCount = 0;
  let conflictCount = 0;
  let failedCount = 0;

  for (const item of queue) {
    const operationId = item.id;
    if (!operationId) {
      results.push({ id: null, status: 'failed', error: 'Missing unique operation ID' });
      failedCount++;
      continue;
    }

    // 1. Idempotency Check: Was this operation ID already committed to stock_movements?
    const existingMovement = db.prepare('SELECT * FROM stock_movements WHERE reference_id = ?').get(operationId);
    if (existingMovement) {
      results.push({
        id: operationId,
        status: 'synced',
        existing: true,
        movement_id: existingMovement.id,
        message: 'Operation already processed previously (Idempotent)'
      });
      syncedCount++;
      continue;
    }

    try {
      const type = item.type || 'OPENING_STOCK';
      const payload = item.payload || {};

      if (type === 'OPENING_STOCK') {
        // Validate expiry date strictly
        if (payload.expiry_date) {
          const exp = new Date(payload.expiry_date);
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          if (exp <= now) {
            results.push({
              id: operationId,
              status: 'failed',
              error: `Server validation rejected: Batch ${payload.batch_number} has expired (${payload.expiry_date}). Expired stock cannot be accepted.`
            });
            failedCount++;
            continue;
          }
        }

        // Concurrency conflict check if client provided last_known_balance or requested check
        if (item.conflict_check && item.last_known_balance !== undefined && item.last_known_balance !== null) {
          const phcId = payload.phc_id;
          const currentCs = db.prepare(
            'SELECT quantity FROM current_stock WHERE phc_id = ? AND (medicine_id = ? OR medicine_id IN (SELECT id FROM medicines WHERE LOWER(name) = LOWER(?)))'
          ).get(phcId, payload.medicine_id || '', payload.medicine_name || '');
          const currentServerQty = currentCs ? currentCs.quantity : 0;
          if (currentServerQty !== item.last_known_balance) {
            results.push({
              id: operationId,
              status: 'conflict',
              reason: `Concurrent modification conflict: Server verified stock is ${currentServerQty} units, but offline entry assumed ${item.last_known_balance} units. Safe reconciliation required.`,
              server_stock: currentServerQty,
              client_expected_balance: item.last_known_balance,
              operation_data: item,
              requires_reconciliation: true
            });
            conflictCount++;
            continue;
          }
        }

        // Apply opening stock
        const res = recordOpeningStock({
          ...payload,
          recorded_by: item.recorded_by || payload.recorded_by || 'Staff Pharmacist',
          notes: `[OFFLINE SYNC: ${operationId}] ${payload.notes || 'Intake recorded while offline'}`.trim()
        });

        // Set reference_id to the unique operation ID for idempotency tracking
        db.prepare('UPDATE stock_movements SET reference_id = ? WHERE id = ?').run(operationId, res.movement_id);

        results.push({
          id: operationId,
          status: 'synced',
          movement_id: res.movement_id,
          medicine_id: res.medicine_id,
          phc_id: res.phc_id,
          stock_after: res.stock_after,
          message: 'Successfully synchronized opening stock'
        });
        syncedCount++;

      } else if (type === 'ADJUSTMENT') {
        const phcId = payload.phc_id;
        const medId = payload.medicine_id;

        // Conflict check: Check current server stock vs client last known balance
        const currentCs = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(phcId, medId);
        const currentServerQty = currentCs ? currentCs.quantity : 0;

        if (item.last_known_balance !== undefined && item.last_known_balance !== null && item.last_known_balance !== currentServerQty) {
          // Concurrency conflict detected!
          if (item.conflict_check || (payload.direction === 'OUT' && currentServerQty < payload.quantity_change)) {
            results.push({
              id: operationId,
              status: 'conflict',
              reason: `Concurrent modification conflict: Server stock is ${currentServerQty} units, but offline adjustment assumed ${item.last_known_balance} units. Insufficient stock or divergent state.`,
              server_stock: currentServerQty,
              client_expected_balance: item.last_known_balance,
              operation_data: item,
              requires_reconciliation: true
            });
            conflictCount++;
            continue;
          }
        }

        const res = recordStockAdjustment({
          ...payload,
          recorded_by: item.recorded_by || payload.recorded_by || 'Staff Pharmacist',
          notes: `[OFFLINE SYNC: ${operationId}] ${payload.notes || 'Adjustment recorded while offline'}`.trim()
        });

        db.prepare('UPDATE stock_movements SET reference_id = ? WHERE id = ?').run(operationId, res.movement_id);

        results.push({
          id: operationId,
          status: 'synced',
          movement_id: res.movement_id,
          message: 'Successfully synchronized stock adjustment'
        });
        syncedCount++;

      } else {
        results.push({
          id: operationId,
          status: 'failed',
          error: `Unsupported offline operation type: ${type}`
        });
        failedCount++;
      }

    } catch (err) {
      results.push({
        id: operationId,
        status: 'failed',
        error: err.message
      });
      failedCount++;
    }
  }

  return {
    results,
    summary: {
      total: queue.length,
      synced: syncedCount,
      conflicts: conflictCount,
      failed: failedCount
    }
  };
}

/**
 * Safe Reconciliation of Concurrency Conflicts
 */
function reconcileConflict({ operation_id, resolution, operation_data }) {
  if (!operation_id) throw new Error('Operation ID is required');

  if (resolution === 'accept_server') {
    logAudit({
      userId: 'Staff Pharmacist',
      action: 'RECONCILE_DISCARD_OFFLINE',
      entityType: 'stock_movements',
      entityId: operation_id,
      details: `Discarded conflicting offline operation ${operation_id} in favor of server verified stock`
    });
    return { success: true, message: 'Server stock retained; offline change safely discarded.' };
  }

  if (resolution === 'force_apply') {
    if (!operation_data || !operation_data.payload) {
      throw new Error('Operation payload required for force apply');
    }
    const type = operation_data.type || 'OPENING_STOCK';
    let res;
    if (type === 'ADJUSTMENT') {
      res = recordStockAdjustment({
        ...operation_data.payload,
        recorded_by: operation_data.recorded_by || operation_data.payload.recorded_by || 'Staff Pharmacist',
        notes: `[RECONCILED FORCE-APPLY: ${operation_id}] ${operation_data.payload.notes || ''}`.trim()
      });
    } else {
      res = recordOpeningStock({
        ...operation_data.payload,
        recorded_by: operation_data.recorded_by || operation_data.payload.recorded_by || 'Staff Pharmacist',
        notes: `[RECONCILED FORCE-APPLY: ${operation_id}] ${operation_data.payload.notes || ''}`.trim()
      });
    }
    db.prepare('UPDATE stock_movements SET reference_id = ? WHERE id = ?').run(operation_id, res.movement_id);
    return { success: true, movement_id: res.movement_id, message: 'Applied reconciled offline stock.' };
  }

  throw new Error(`Unknown reconciliation resolution: ${resolution}`);
}

module.exports = {
  recordOpeningStock,
  recordStockAdjustment,
  getStockMovements,
  processSyncQueue,
  reconcileConflict
};
