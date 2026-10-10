const { db } = require('../db/database');
const { logAudit } = require('./auditService');

/**
 * Calculate First Expiry, First Out (FEFO) batch allocation for a medicine at a centre
 * Excludes expired batches (expiry_date <= today) and inactive/recalled batches.
 * Flags near-expiry batches (<= 90 days).
 * Supports multi-batch allocation when a single batch has insufficient stock.
 */
function calculateFefoAllocations(phcId, medicineId, requestedQuantity) {
  const reqQty = Number(requestedQuantity);
  if (!reqQty || reqQty <= 0) {
    throw new Error('Requested quantity must be a positive integer');
  }

  // Fetch all active, non-expired batches sorted by expiry_date ASC (strict FEFO)
  const batches = db.prepare(`
    SELECT cbs.*, m.name as medicine_name, m.generic_name, m.unit,
           CAST((julianday(cbs.expiry_date) - julianday('now')) AS INTEGER) as days_to_expiry
    FROM centre_batch_stock cbs
    JOIN medicines m ON cbs.medicine_id = m.id
    WHERE cbs.phc_id = ? 
      AND cbs.medicine_id = ?
      AND cbs.quantity > 0
      AND cbs.status = 'active'
      AND date(cbs.expiry_date) > date('now')
    ORDER BY cbs.expiry_date ASC, cbs.created_at ASC
  `).all(phcId, medicineId);

  const totalAvailableStock = batches.reduce((sum, b) => sum + b.quantity, 0);

  let remainingNeeded = reqQty;
  const allocations = [];
  let nearExpiryWarning = false;

  for (const batch of batches) {
    if (remainingNeeded <= 0) break;

    const allocQty = Math.min(batch.quantity, remainingNeeded);
    const isNearExpiry = batch.days_to_expiry <= 90;
    if (isNearExpiry) {
      nearExpiryWarning = true;
    }

    allocations.push({
      batch_number: batch.batch_number,
      expiry_date: batch.expiry_date,
      days_to_expiry: batch.days_to_expiry,
      is_near_expiry: isNearExpiry,
      available_in_batch: batch.quantity,
      allocated_quantity: allocQty,
      unit: batch.unit || 'units'
    });

    remainingNeeded -= allocQty;
  }

  const totalAllocated = reqQty - remainingNeeded;

  return {
    requested_quantity: reqQty,
    total_available_stock: totalAvailableStock,
    allocated_total: totalAllocated,
    remaining_unfulfilled: Math.max(0, remainingNeeded),
    is_fully_fulfillable: remainingNeeded === 0,
    is_partial: totalAllocated > 0 && remainingNeeded > 0,
    is_unavailable: totalAllocated === 0,
    allocations,
    near_expiry_warning: nearExpiryWarning
  };
}

/**
 * Synchronize current_stock cache for a centre and medicine
 */
function syncCurrentStock(phcId, medicineId) {
  const sumRow = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as total_qty
    FROM centre_batch_stock
    WHERE phc_id = ? AND medicine_id = ? AND status = 'active' AND date(expiry_date) > date('now')
  `).get(phcId, medicineId);

  const earliestBatch = db.prepare(`
    SELECT batch_number, expiry_date
    FROM centre_batch_stock
    WHERE phc_id = ? AND medicine_id = ? AND quantity > 0 AND status = 'active' AND date(expiry_date) > date('now')
    ORDER BY expiry_date ASC
    LIMIT 1
  `).get(phcId, medicineId);

  const totalQty = sumRow ? sumRow.total_qty : 0;
  const batchNum = earliestBatch ? earliestBatch.batch_number : 'TN-BATCH-STD';
  const expDate = earliestBatch ? earliestBatch.expiry_date : '2027-12-31';

  db.prepare(`
    INSERT INTO current_stock (id, phc_id, medicine_id, quantity, batch_number, expiry_date, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(phc_id, medicine_id) DO UPDATE SET
      quantity = excluded.quantity,
      batch_number = excluded.batch_number,
      expiry_date = excluded.expiry_date,
      last_updated = datetime('now')
  `).run(`cs-${phcId}-${medicineId}`, phcId, medicineId, totalQty, batchNum, expDate);

  return totalQty;
}

/**
 * Create a Draft Bill / Dispensing Record
 * CRITICAL RULE: Creating a draft bill does NOT reduce stock.
 */
function createDraftBill({
  phc_id,
  medicine_id,
  prescribed_quantity,
  patient_demo_id = `OPD-2026-${Math.floor(1000 + Math.random() * 9000)}`,
  prescribed_by = 'Medical Officer',
  recorded_by = 'Staff Pharmacist',
  notes = ''
}) {
  const reqQty = Number(prescribed_quantity);
  if (!phc_id || !medicine_id || !reqQty || reqQty <= 0) {
    throw new Error('Valid centre ID, medicine ID, and positive prescribed quantity are required');
  }

  const centre = db.prepare('SELECT * FROM phcs WHERE id = ?').get(phc_id);
  if (!centre) throw new Error(`Healthcare centre ${phc_id} not found`);

  const medicine = db.prepare('SELECT * FROM medicines WHERE id = ?').get(medicine_id);
  if (!medicine) throw new Error(`Medicine ${medicine_id} not found`);

  // Run FEFO batch allocation preview
  const fefo = calculateFefoAllocations(phc_id, medicine_id, reqQty);
  if (fefo.total_available_stock === 0) {
    throw new Error(`Zero eligible stock available for ${medicine.name} at ${centre.name}. All batches expired, exhausted, or unavailable.`);
  }

  const billId = `bil-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const billNumber = `BIL-VRX-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  db.prepare(`
    INSERT INTO bills (
      id, bill_number, phc_id, patient_demo_id, status, prescribed_by, recorded_by,
      total_prescribed, total_dispensed, notes, created_at
    ) VALUES (?, ?, ?, ?, 'Draft', ?, ?, ?, 0, ?, datetime('now'))
  `).run(billId, billNumber, phc_id, patient_demo_id, prescribed_by, recorded_by, reqQty, notes);

  const itemId = `bitem-${Date.now()}`;
  db.prepare(`
    INSERT INTO bill_items (
      id, bill_id, medicine_id, prescribed_quantity, dispensed_quantity, remaining_quantity,
      unit, batch_allocations, status, created_at
    ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'pending', datetime('now'))
  `).run(itemId, billId, medicine_id, reqQty, fefo.remaining_unfulfilled, medicine.unit, JSON.stringify(fefo.allocations));

  // Current stock before issue
  const currentStockRow = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(phc_id, medicine_id);
  const stockBefore = currentStockRow ? currentStockRow.quantity : fefo.total_available_stock;

  return {
    id: billId,
    bill_number: billNumber,
    phc_id,
    centre_name: centre.name,
    patient_demo_id,
    medicine_id,
    medicine_name: medicine.name,
    formulation: `${medicine.strength} (${medicine.form})`,
    unit: medicine.unit,
    prescribed_quantity: reqQty,
    can_dispense_quantity: fefo.allocated_total,
    remaining_unfulfilled: fefo.remaining_unfulfilled,
    stock_before: stockBefore,
    stock_after_projected: Math.max(0, stockBefore - fefo.allocated_total),
    batch_allocations: fefo.allocations,
    near_expiry_warning: fefo.near_expiry_warning,
    status: 'Draft',
    recorded_by,
    created_at: new Date().toISOString()
  };
}

/**
 * Confirm Dispensing and Deduct Stock Atomically
 * Rules:
 * - Draft bills do not reduce stock until confirmed here.
 * - Double confirmation is idempotent (returns existing status without deducting again).
 * - Multi-batch FEFO deduction applied.
 * - Negative stock strictly prevented.
 * - Auditable stock movements recorded for every batch movement.
 */
function confirmBillDispense(billId, { confirmed_by = 'Staff Pharmacist', idempotency_key = null } = {}) {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
  if (!bill) {
    throw new Error('Billing record not found');
  }

  // Idempotency check: if already dispensed, return safely without double deduction
  if (bill.status === 'Dispensed' || bill.status === 'Partially Dispensed') {
    return getBillById(billId);
  }

  if (bill.status === 'Cancelled' || bill.status === 'Reversed') {
    throw new Error(`Cannot confirm dispensing for a bill with status '${bill.status}'`);
  }

  const items = db.prepare('SELECT * FROM bill_items WHERE bill_id = ?').all(billId);
  if (!items || items.length === 0) {
    throw new Error('Bill contains no items to dispense');
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    let totalConfirmedDispensed = 0;
    const movementRecords = [];

    for (const item of items) {
      const medicine = db.prepare('SELECT * FROM medicines WHERE id = ?').get(item.medicine_id);
      let allocations = [];
      try {
        allocations = JSON.parse(item.batch_allocations || '[]');
      } catch (e) {
        allocations = [];
      }

      // If allocations empty, recalculate live
      if (allocations.length === 0) {
        const liveFefo = calculateFefoAllocations(bill.phc_id, item.medicine_id, item.prescribed_quantity);
        allocations = liveFefo.allocations;
      }

      let itemDispensed = 0;

      for (const alloc of allocations) {
        const batchRow = db.prepare(`
          SELECT * FROM centre_batch_stock 
          WHERE phc_id = ? AND medicine_id = ? AND batch_number = ? AND status = 'active'
        `).get(bill.phc_id, item.medicine_id, alloc.batch_number);

        if (!batchRow || batchRow.quantity <= 0) {
          continue; // Batch was exhausted by another transaction
        }

        // Check if expired
        const todayStr = new Date().toISOString().split('T')[0];
        if (batchRow.expiry_date <= todayStr) {
          continue; // Exclude expired batch strictly
        }

        const qtyToDeduct = Math.min(batchRow.quantity, alloc.allocated_quantity);
        if (qtyToDeduct <= 0) continue;

        // Current centre total stock before this deduction
        const csRow = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(bill.phc_id, item.medicine_id);
        const centreStockBefore = csRow ? csRow.quantity : batchRow.quantity;
        const centreStockAfter = Math.max(0, centreStockBefore - qtyToDeduct);

        const batchStockBefore = batchRow.quantity;
        const batchStockAfter = batchStockBefore - qtyToDeduct;

        // Update batch stock
        db.prepare(`
          UPDATE centre_batch_stock 
          SET quantity = ?, last_updated = datetime('now')
          WHERE id = ?
        `).run(batchStockAfter, batchRow.id);

        // Record auditable movement ledger entry
        const movementId = `sm-disp-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
        db.prepare(`
          INSERT INTO stock_movements (
            id, phc_id, medicine_id, batch_number, movement_type, quantity, direction,
            balance_before, balance_after, batch_balance_before, batch_balance_after,
            reference_id, recorded_by, reason, notes, created_at
          ) VALUES (?, ?, ?, ?, 'DISPENSED', ?, 'OUT', ?, ?, ?, ?, ?, ?, 'Prescription dispensing', ?, datetime('now'))
        `).run(
          movementId,
          bill.phc_id,
          item.medicine_id,
          alloc.batch_number,
          qtyToDeduct,
          centreStockBefore,
          centreStockAfter,
          batchStockBefore,
          batchStockAfter,
          bill.id,
          confirmed_by,
          `Dispensed under bill ${bill.bill_number} (${alloc.batch_number})`
        );

        // Record in stock_entries for legacy views
        const entryDate = new Date().toISOString().split('T')[0];
        let validUserId = null;
        try {
          const u = db.prepare('SELECT id FROM users WHERE id = ? OR name = ?').get(confirmed_by, confirmed_by);
          if (u) validUserId = u.id;
        } catch (e) {}

        db.prepare(`
          INSERT INTO stock_entries (
            id, phc_id, medicine_id, entry_date, opening_stock, received_quantity, dispensed_quantity,
            closing_stock, batch_number, expiry_date, created_by, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          `se-disp-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
          bill.phc_id,
          item.medicine_id,
          entryDate,
          centreStockBefore,
          qtyToDeduct,
          centreStockAfter,
          alloc.batch_number,
          batchRow.expiry_date,
          validUserId,
          `Dispensed under bill ${bill.bill_number}`
        );

        itemDispensed += qtyToDeduct;
        movementRecords.push({
          movement_id: movementId,
          batch_number: alloc.batch_number,
          quantity: qtyToDeduct,
          before: centreStockBefore,
          after: centreStockAfter
        });
      }

      // Sync current_stock table
      syncCurrentStock(bill.phc_id, item.medicine_id);

      const remainingQty = Math.max(0, item.prescribed_quantity - itemDispensed);
      const itemStatus = itemDispensed >= item.prescribed_quantity ? 'dispensed' : (itemDispensed > 0 ? 'partially_dispensed' : 'pending');

      db.prepare(`
        UPDATE bill_items SET
          dispensed_quantity = ?,
          remaining_quantity = ?,
          status = ?
        WHERE id = ?
      `).run(itemDispensed, remainingQty, itemStatus, item.id);

      totalConfirmedDispensed += itemDispensed;
    }

    const finalBillStatus = totalConfirmedDispensed >= bill.total_prescribed ? 'Dispensed' : (totalConfirmedDispensed > 0 ? 'Partially Dispensed' : 'Draft');

    db.prepare(`
      UPDATE bills SET
        status = ?,
        total_dispensed = ?,
        confirmed_by = ?,
        idempotency_key = ?,
        confirmed_at = datetime('now')
      WHERE id = ?
    `).run(finalBillStatus, totalConfirmedDispensed, confirmed_by, idempotency_key, billId);

    logAudit({
      userId: confirmed_by,
      action: 'CONFIRM_MEDICINE_DISPENSE',
      entityType: 'bills',
      entityId: bill.id,
      details: `Confirmed dispensing for ${bill.bill_number}: ${totalConfirmedDispensed}/${bill.total_prescribed} units issued.`
    });

    db.exec('COMMIT;');

    return getBillById(billId);
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Cancel a Draft Bill
 * CRITICAL RULE: A cancelled bill must NOT reduce stock.
 */
function cancelBill(billId, { reason = 'Cancelled by staff', cancelled_by = 'Staff Pharmacist' } = {}) {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
  if (!bill) throw new Error('Bill not found');

  if (bill.status !== 'Draft') {
    throw new Error(`Cannot cancel bill with status '${bill.status}'. Dispensed bills must use Reversal.`);
  }

  db.prepare(`
    UPDATE bills SET
      status = 'Cancelled',
      cancellation_reason = ?,
      notes = COALESCE(notes, '') || ' | Cancelled: ' || ?
    WHERE id = ?
  `).run(reason, reason, billId);

  db.prepare(`
    UPDATE bill_items SET status = 'cancelled' WHERE bill_id = ?
  `).run(billId);

  logAudit({
    userId: cancelled_by,
    action: 'CANCEL_BILL',
    entityType: 'bills',
    entityId: bill.id,
    details: `Draft bill ${bill.bill_number} cancelled: ${reason}`
  });

  return getBillById(billId);
}

/**
 * Reverse a Dispensed Bill (Auditable Return / Reversal)
 * Rules:
 * - Creates auditable reversal movement in stock_movements rather than silently deleting.
 * - Restores medicine stock to batch inventory and current_stock atomically.
 */
function reverseBill(billId, { reason = 'Prescription error / Patient return', recorded_by = 'Staff Pharmacist' } = {}) {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
  if (!bill) throw new Error('Bill not found');

  if (bill.status !== 'Dispensed' && bill.status !== 'Partially Dispensed') {
    throw new Error(`Only Dispensed or Partially Dispensed bills can be reversed (Current: ${bill.status})`);
  }

  const items = db.prepare('SELECT * FROM bill_items WHERE bill_id = ?').all(billId);

  db.exec('BEGIN TRANSACTION;');
  try {
    for (const item of items) {
      let allocations = [];
      try {
        allocations = JSON.parse(item.batch_allocations || '[]');
      } catch (e) {
        allocations = [];
      }

      for (const alloc of allocations) {
        if (!alloc.allocated_quantity || alloc.allocated_quantity <= 0) continue;

        // Current batch stock
        const batchRow = db.prepare(`
          SELECT * FROM centre_batch_stock 
          WHERE phc_id = ? AND medicine_id = ? AND batch_number = ?
        `).get(bill.phc_id, item.medicine_id, alloc.batch_number);

        const batchStockBefore = batchRow ? batchRow.quantity : 0;
        const batchStockAfter = batchStockBefore + alloc.allocated_quantity;

        // Current centre stock
        const csRow = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(bill.phc_id, item.medicine_id);
        const centreStockBefore = csRow ? csRow.quantity : 0;
        const centreStockAfter = centreStockBefore + alloc.allocated_quantity;

        // Restore batch stock
        db.prepare(`
          INSERT INTO centre_batch_stock (id, phc_id, medicine_id, batch_number, expiry_date, quantity, status, last_updated)
          VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'))
          ON CONFLICT(phc_id, medicine_id, batch_number) DO UPDATE SET
            quantity = quantity + excluded.quantity,
            last_updated = datetime('now')
        `).run(`cbs-${bill.phc_id}-${item.medicine_id}-${alloc.batch_number}`, bill.phc_id, item.medicine_id, alloc.batch_number, alloc.expiry_date, alloc.allocated_quantity);

        // Record reversal movement
        const movementId = `sm-rev-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
        db.prepare(`
          INSERT INTO stock_movements (
            id, phc_id, medicine_id, batch_number, movement_type, quantity, direction,
            balance_before, balance_after, batch_balance_before, batch_balance_after,
            reference_id, recorded_by, reason, notes, created_at
          ) VALUES (?, ?, ?, ?, 'REVERSAL', ?, 'IN', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          movementId,
          bill.phc_id,
          item.medicine_id,
          alloc.batch_number,
          alloc.allocated_quantity,
          centreStockBefore,
          centreStockAfter,
          batchStockBefore,
          batchStockAfter,
          bill.id,
          recorded_by,
          reason,
          `Reversal for bill ${bill.bill_number}: ${reason}`
        );

        // Record in stock_entries
        const entryDate = new Date().toISOString().split('T')[0];
        let validUserId = null;
        try {
          const u = db.prepare('SELECT id FROM users WHERE id = ? OR name = ?').get(recorded_by, recorded_by);
          if (u) validUserId = u.id;
        } catch (e) {}

        db.prepare(`
          INSERT INTO stock_entries (
            id, phc_id, medicine_id, entry_date, opening_stock, received_quantity, dispensed_quantity,
            closing_stock, batch_number, expiry_date, created_by, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          `se-rev-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
          bill.phc_id,
          item.medicine_id,
          entryDate,
          centreStockBefore,
          alloc.allocated_quantity,
          centreStockAfter,
          alloc.batch_number,
          alloc.expiry_date,
          validUserId,
          `Stock return: reversal for bill ${bill.bill_number}`
        );
      }

      // Sync current_stock
      syncCurrentStock(bill.phc_id, item.medicine_id);

      db.prepare(`
        UPDATE bill_items SET status = 'reversed' WHERE id = ?
      `).run(item.id);
    }

    db.prepare(`
      UPDATE bills SET
        status = 'Reversed',
        reversal_reason = ?,
        reversed_at = datetime('now')
      WHERE id = ?
    `).run(reason, billId);

    logAudit({
      userId: recorded_by,
      action: 'REVERSE_BILL_DISPENSE',
      entityType: 'bills',
      entityId: bill.id,
      details: `Reversed dispensing for ${bill.bill_number}. Stock returned: ${reason}`
    });

    db.exec('COMMIT;');
    return getBillById(billId);
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Get Bill details with item allocations, facility name, and timestamps
 */
function getBillById(billId) {
  const bill = db.prepare(`
    SELECT b.*, p.name as centre_name, p.code as centre_code
    FROM bills b
    JOIN phcs p ON b.phc_id = p.id
    WHERE b.id = ?
  `).get(billId);

  if (!bill) return null;

  const items = db.prepare(`
    SELECT bi.*, m.name as medicine_name, m.generic_name, m.strength, m.form, m.category
    FROM bill_items bi
    JOIN medicines m ON bi.medicine_id = m.id
    WHERE bi.bill_id = ?
  `).all(billId);

  const enrichedItems = items.map(it => {
    let allocations = [];
    try {
      allocations = JSON.parse(it.batch_allocations || '[]');
    } catch (e) {
      allocations = [];
    }
    return {
      ...it,
      batch_allocations: allocations
    };
  });

  return {
    ...bill,
    items: enrichedItems
  };
}

/**
 * List bills with filters
 */
function listBills({ phc_id, status, search, limit = 50 }) {
  let sql = `
    SELECT b.*, p.name as centre_name, p.code as centre_code,
           (SELECT m.name FROM bill_items bi JOIN medicines m ON bi.medicine_id = m.id WHERE bi.bill_id = b.id LIMIT 1) as primary_medicine_name,
           (SELECT bi.unit FROM bill_items bi WHERE bi.bill_id = b.id LIMIT 1) as unit
    FROM bills b
    JOIN phcs p ON b.phc_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (phc_id) {
    sql += ' AND b.phc_id = ?';
    params.push(phc_id);
  }
  if (status && status !== 'all') {
    sql += ' AND b.status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (b.bill_number LIKE ? OR b.patient_demo_id LIKE ? OR p.name LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  sql += ' ORDER BY b.created_at DESC LIMIT ?';
  params.push(Number(limit) || 50);

  return db.prepare(sql).all(...params);
}

module.exports = {
  calculateFefoAllocations,
  syncCurrentStock,
  createDraftBill,
  confirmBillDispense,
  cancelBill,
  reverseBill,
  getBillById,
  listBills
};
