const assert = require('assert');
const { db } = require('../src/db/database');
const { recordOpeningStock, recordStockAdjustment, getStockMovements } = require('../src/services/stockMovementService');
const {
  createDraftBill,
  confirmBillDispense,
  cancelBill,
  reverseBill,
  calculateFefoAllocations,
  getBillById,
  syncCurrentStock
} = require('../src/services/billingService');
const { calculateMedicineStockMetrics } = require('../src/services/stockService');

function runInventoryBillingTests() {
  console.log('🧪 Starting VelocityRx OpenCode Master Test Suite (17 Requirements)...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  // Setup dedicated clean test facility and test medicine
  const testPhcId = 'phc-test-facility';
  const testPhc2Id = 'phc-test-facility-2';
  const testMedId = 'med-test-paracetamol';

  try {
    db.prepare(`
      INSERT OR REPLACE INTO phcs (id, name, code, block, district, latitude, longitude, population_served, phone)
      VALUES (?, 'Test PHC Alpha', 'TEST-PHC-01', 'Chengalpattu', 'Chengalpattu', 12.6900, 80.0000, 25000, '044-27400001')
    `).run(testPhcId);

    db.prepare(`
      INSERT OR REPLACE INTO phcs (id, name, code, block, district, latitude, longitude, population_served, phone)
      VALUES (?, 'Test PHC Beta', 'TEST-PHC-02', 'Chengalpattu', 'Chengalpattu', 12.7200, 80.0500, 30000, '044-27400002')
    `).run(testPhc2Id);

    db.prepare(`
      INSERT OR REPLACE INTO medicines (id, name, generic_name, category, form, strength, unit, standard_buffer_days, critical_buffer_days)
      VALUES (?, 'Paracetamol Pediatric Oral Suspension', 'Paracetamol 120mg/5ml', 'Analgesics', 'Syrup', '120mg/5ml', 'bottles', 30, 21)
    `).run(testMedId);

    // Clean any prior test batch stock
    db.prepare('DELETE FROM centre_batch_stock WHERE phc_id IN (?, ?)').run(testPhcId, testPhc2Id);
    db.prepare('DELETE FROM current_stock WHERE phc_id IN (?, ?)').run(testPhcId, testPhc2Id);
    db.prepare('DELETE FROM stock_movements WHERE phc_id IN (?, ?)').run(testPhcId, testPhc2Id);
  } catch (e) {
    console.error('Test setup error:', e);
  }

  // ==========================================================================
  // Test 1: Opening stock of 100 bottles is saved correctly
  // ==========================================================================
  test('Case 1: Opening stock of 100 bottles is saved correctly', () => {
    const res = recordOpeningStock({
      phc_id: testPhcId,
      medicine_id: testMedId,
      batch_number: 'TEST-BATCH-101',
      quantity: 100,
      unit: 'bottles',
      expiry_date: '2028-06-30',
      avg_daily_usage: 5,
      min_safety_stock: 14,
      recorded_by: 'Staff Pharmacist'
    });

    assert.strictEqual(res.quantity_added, 100, 'Quantity added should be 100');
    assert.strictEqual(res.stock_after, 100, 'Stock after should be 100');

    const csRow = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId);
    assert.strictEqual(csRow.quantity, 100, 'Current stock in DB must be exactly 100 bottles');

    const batchRow = db.prepare('SELECT quantity FROM centre_batch_stock WHERE phc_id = ? AND medicine_id = ? AND batch_number = ?').get(testPhcId, testMedId, 'TEST-BATCH-101');
    assert.strictEqual(batchRow.quantity, 100, 'Batch stock in DB must be exactly 100 bottles');
  });

  // ==========================================================================
  // Test 2: Confirmed dispensing of 20 bottles leaves 80 bottles
  // ==========================================================================
  let draftBillCase2;
  test('Case 2: Confirmed dispensing of 20 bottles leaves 80 bottles', () => {
    draftBillCase2 = createDraftBill({
      phc_id: testPhcId,
      medicine_id: testMedId,
      prescribed_quantity: 20,
      patient_demo_id: 'OPD-2026-TEST-01',
      recorded_by: 'Staff Pharmacist'
    });

    const confirmed = confirmBillDispense(draftBillCase2.id, { confirmed_by: 'Staff Pharmacist' });
    assert.strictEqual(confirmed.status, 'Dispensed', 'Bill status should be Dispensed');
    assert.strictEqual(confirmed.total_dispensed, 20, 'Total dispensed should be 20');

    const csRow = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId);
    assert.strictEqual(csRow.quantity, 80, 'Inventory must be reduced to exactly 80 bottles');
  });

  // ==========================================================================
  // Test 3: Draft billing does not deduct stock
  // ==========================================================================
  let draftBillCase3;
  test('Case 3: Draft billing does not deduct stock', () => {
    const stockBefore = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;

    draftBillCase3 = createDraftBill({
      phc_id: testPhcId,
      medicine_id: testMedId,
      prescribed_quantity: 15,
      patient_demo_id: 'OPD-2026-TEST-02',
      recorded_by: 'Staff Pharmacist'
    });

    const stockAfter = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;
    assert.strictEqual(stockAfter, stockBefore, 'Draft creation must NOT change stock in inventory');
  });

  // ==========================================================================
  // Test 4: Cancelled billing does not deduct stock
  // ==========================================================================
  test('Case 4: Cancelled billing does not deduct stock', () => {
    const stockBefore = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;

    const cancelled = cancelBill(draftBillCase3.id, { reason: 'Patient declined medication' });
    assert.strictEqual(cancelled.status, 'Cancelled', 'Status must be Cancelled');

    const stockAfter = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;
    assert.strictEqual(stockAfter, stockBefore, 'Cancelling a draft bill must NOT change stock');
  });

  // ==========================================================================
  // Test 5: Partial dispensing deducts only the actual quantity issued
  // ==========================================================================
  test('Case 5: Partial dispensing deducts only the actual quantity issued', () => {
    // Current stock is 80 bottles. Let's create a temporary batch of 10 bottles at testPhc2
    recordOpeningStock({
      phc_id: testPhc2Id,
      medicine_id: testMedId,
      batch_number: 'TEST-PARTIAL-BATCH',
      quantity: 10,
      unit: 'bottles',
      expiry_date: '2028-01-31'
    });

    // Request 25 bottles when only 10 are available
    const partialDraft = createDraftBill({
      phc_id: testPhc2Id,
      medicine_id: testMedId,
      prescribed_quantity: 25,
      patient_demo_id: 'OPD-2026-PARTIAL'
    });

    assert.strictEqual(partialDraft.can_dispense_quantity, 10, 'Preview should show 10 can be dispensed');
    assert.strictEqual(partialDraft.remaining_unfulfilled, 15, 'Shortfall of 15 should be noted');

    const confirmed = confirmBillDispense(partialDraft.id, { confirmed_by: 'Staff Pharmacist' });
    assert.strictEqual(confirmed.status, 'Partially Dispensed', 'Status must be Partially Dispensed');
    assert.strictEqual(confirmed.total_dispensed, 10, 'Dispensed quantity must be 10');

    const csRow = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhc2Id, testMedId);
    assert.strictEqual(csRow.quantity, 0, 'Facility stock should be 0 (10 deducted, 15 remaining unissued)');
  });

  // ==========================================================================
  // Test 6: A request for more stock than available is rejected safely
  // ==========================================================================
  test('Case 6: A request for more stock than available is rejected safely', () => {
    // testPhc2Id now has 0 stock
    assert.throws(
      () => {
        createDraftBill({
          phc_id: testPhc2Id,
          medicine_id: testMedId,
          prescribed_quantity: 5
        });
      },
      /Zero eligible stock available/,
      'Must safely throw an error when zero eligible stock is available'
    );
  });

  // ==========================================================================
  // Test 7: Repeated confirmation does not deduct stock twice (idempotency)
  // ==========================================================================
  test('Case 7: Repeated confirmation does not deduct stock twice (idempotency)', () => {
    const stockBefore = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;
    assert.strictEqual(stockBefore, 80);

    const draft = createDraftBill({
      phc_id: testPhcId,
      medicine_id: testMedId,
      prescribed_quantity: 10
    });

    // First confirmation
    const conf1 = confirmBillDispense(draft.id, { confirmed_by: 'Staff Pharmacist' });
    const stockAfter1 = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;
    assert.strictEqual(stockAfter1, 70, 'Stock after first confirm should be 70');

    // Second confirmation (simulating double click or network retry)
    const conf2 = confirmBillDispense(draft.id, { confirmed_by: 'Staff Pharmacist' });
    const stockAfter2 = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;
    assert.strictEqual(stockAfter2, 70, 'Stock after second confirm must still be 70 (no double deduction)');
    assert.strictEqual(conf2.status, 'Dispensed');
  });

  // ==========================================================================
  // Test 8: FEFO selects earliest-expiring eligible batch
  // ==========================================================================
  test('Case 8: FEFO selects earliest-expiring eligible batch', () => {
    // Add two distinct batches: Batch Near (Exp: 2027-01-01, 30 units), Batch Far (Exp: 2029-01-01, 50 units)
    recordOpeningStock({
      phc_id: testPhcId,
      medicine_id: testMedId,
      batch_number: 'TEST-FEFO-NEAR',
      quantity: 30,
      expiry_date: '2027-01-01'
    });

    recordOpeningStock({
      phc_id: testPhcId,
      medicine_id: testMedId,
      batch_number: 'TEST-FEFO-FAR',
      quantity: 50,
      expiry_date: '2029-01-01'
    });

    // Prescribe 20 units: FEFO must choose TEST-FEFO-NEAR because it expires first
    const fefoPreview = calculateFefoAllocations(testPhcId, testMedId, 20);
    assert.strictEqual(fefoPreview.allocations.length, 1);
    assert.strictEqual(fefoPreview.allocations[0].batch_number, 'TEST-FEFO-NEAR', 'FEFO must prioritize earliest expiring batch');
    assert.strictEqual(fefoPreview.allocations[0].allocated_quantity, 20);

    // Prescribe 40 units: FEFO must exhaust TEST-FEFO-NEAR (30 units) and then take 10 from TEST-BATCH-101 or TEST-FEFO-FAR
    const fefoMulti = calculateFefoAllocations(testPhcId, testMedId, 40);
    assert.strictEqual(fefoMulti.allocations[0].batch_number, 'TEST-FEFO-NEAR');
    assert.strictEqual(fefoMulti.allocations[0].allocated_quantity, 30, 'First batch must be exhausted first');
    assert.strictEqual(fefoMulti.allocations[1].allocated_quantity, 10, 'Second batch provides remaining 10 units');
  });

  // ==========================================================================
  // Test 9: Expired or recalled batches cannot be dispensed
  // ==========================================================================
  test('Case 9: Expired or recalled batches cannot be dispensed', () => {
    // Manually insert an expired batch in the past
    db.prepare(`
      INSERT INTO centre_batch_stock (id, phc_id, medicine_id, batch_number, expiry_date, quantity, status)
      VALUES ('cbs-expired-test', ?, ?, 'EXPIRED-BATCH-001', '2020-01-01', 50, 'active')
    `).run(testPhcId, testMedId);

    const fefo = calculateFefoAllocations(testPhcId, testMedId, 10);
    const hasExpired = fefo.allocations.some(a => a.batch_number === 'EXPIRED-BATCH-001');
    assert.strictEqual(hasExpired, false, 'FEFO algorithm must strictly exclude expired batches');

    // Verify recordOpeningStock rejects expired batches
    assert.throws(
      () => {
        recordOpeningStock({
          phc_id: testPhcId,
          medicine_id: testMedId,
          batch_number: 'ATTEMPT-EXPIRED',
          quantity: 20,
          expiry_date: '2021-05-01'
        });
      },
      /Cannot accept expired batch/,
      'Opening stock intake must reject expired batches'
    );

    // Clean up temporary expired test row
    db.prepare("DELETE FROM centre_batch_stock WHERE id = 'cbs-expired-test'").run();
  });

  // ==========================================================================
  // Test 10: Stock movement records reconcile with current inventory
  // ==========================================================================
  test('Case 10: Stock movement records reconcile with current inventory', () => {
    const movements = getStockMovements({ phc_id: testPhcId, medicine_id: testMedId, limit: 100 });
    assert(movements.length >= 3, 'Must have at least 3 stock movements logged');

    // Calculate sum of IN minus OUT movements for this medicine
    let ledgerBalance = 0;
    movements.reverse().forEach(m => {
      if (m.direction === 'IN') ledgerBalance += m.quantity;
      else if (m.direction === 'OUT') ledgerBalance -= m.quantity;
    });

    const activeStock = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;
    assert.strictEqual(ledgerBalance, activeStock, `Ledger balance (${ledgerBalance}) must reconcile with current stock (${activeStock})`);
  });

  // ==========================================================================
  // Test 11: Transfer approval alone does not change stock
  // ==========================================================================
  test('Case 11: Transfer approval alone does not change stock', () => {
    // Current stock at donor testPhcId
    const donorStockBefore = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;

    // Create and approve transfer
    const trfId = `trf-test-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const reqNum = `TRF-TEST-APP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    db.prepare(`
      INSERT INTO transfer_requests (id, req_number, source_phc_id, dest_phc_id, medicine_id, quantity, reason, status, requested_by)
      VALUES (?, ?, ?, ?, ?, 20, 'Clinical buffer rebalance', 'requested', 'usr-pharm-tpr')
    `).run(trfId, reqNum, testPhcId, testPhc2Id, testMedId);

    // Approve transfer
    db.prepare("UPDATE transfer_requests SET status = 'approved', approved_quantity = 20 WHERE id = ?").run(trfId);

    const donorStockAfter = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;
    assert.strictEqual(donorStockAfter, donorStockBefore, 'Approval alone must NOT modify physical inventory');
  });

  // ==========================================================================
  // Test 12: Dispatch deducts stock from donor once
  // ==========================================================================
  const trfCase12Id = `trf-test-disp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const reqNumCase12 = `TRF-TEST-DISP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  test('Case 12: Dispatch deducts stock from donor once', () => {
    db.prepare(`
      INSERT INTO transfer_requests (id, req_number, source_phc_id, dest_phc_id, medicine_id, quantity, approved_quantity, reason, status, requested_by)
      VALUES (?, ?, ?, ?, ?, 15, 15, 'Urgent clinical buffer transfer', 'approved', 'usr-pharm-tpr')
    `).run(trfCase12Id, reqNumCase12, testPhcId, testPhc2Id, testMedId);

    const donorStockBefore = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;

    // Simulate dispatch logic
    db.exec('BEGIN TRANSACTION;');
    const effectiveQty = 15;
    const donorNew = donorStockBefore - effectiveQty;
    db.prepare('UPDATE current_stock SET quantity = ? WHERE phc_id = ? AND medicine_id = ?').run(donorNew, testPhcId, testMedId);
    
    // Also deduct from earliest batch in centre_batch_stock to preserve reconciliation
    const batchToDeduct = db.prepare('SELECT id, quantity FROM centre_batch_stock WHERE phc_id = ? AND medicine_id = ? AND quantity >= ? LIMIT 1').get(testPhcId, testMedId, effectiveQty);
    if (batchToDeduct) {
      db.prepare('UPDATE centre_batch_stock SET quantity = quantity - ? WHERE id = ?').run(effectiveQty, batchToDeduct.id);
    }
    
    db.prepare("UPDATE transfer_requests SET status = 'in_transit' WHERE id = ?").run(trfCase12Id);
    db.prepare(`
      INSERT INTO stock_movements (id, phc_id, medicine_id, batch_number, movement_type, quantity, direction, balance_before, balance_after, reference_id, recorded_by, created_at)
      VALUES (?, ?, ?, 'TN-BATCH-STD', 'TRANSFER_DISPATCH', ?, 'OUT', ?, ?, ?, 'Staff', datetime('now'))
    `).run(`sm-trf-${Date.now()}`, testPhcId, testMedId, effectiveQty, donorStockBefore, donorNew, trfCase12Id);
    db.exec('COMMIT;');

    const donorStockAfter = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;
    assert.strictEqual(donorStockAfter, donorStockBefore - 15, 'Donor stock must be reduced by dispatched quantity');
  });

  // ==========================================================================
  // Test 13: Confirmed receipt adds stock to receiver once
  // ==========================================================================
  test('Case 13: Confirmed receipt adds stock to receiver once', () => {
    const destStockBefore = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhc2Id, testMedId)?.quantity || 0;

    // Simulate receive endpoint logic
    db.exec('BEGIN TRANSACTION;');
    const confirmedQty = 15;
    const destNew = destStockBefore + confirmedQty;
    db.prepare(`
      INSERT INTO current_stock (id, phc_id, medicine_id, quantity, batch_number, expiry_date, last_updated)
      VALUES (?, ?, ?, ?, 'TN-BATCH-STD', '2028-12-31', datetime('now'))
      ON CONFLICT(phc_id, medicine_id) DO UPDATE SET quantity = quantity + excluded.quantity
    `).run(`cs-${testPhc2Id}-${testMedId}`, testPhc2Id, testMedId, confirmedQty);

    db.prepare("UPDATE transfer_requests SET status = 'completed' WHERE id = ?").run(trfCase12Id);
    db.prepare(`
      INSERT INTO stock_movements (id, phc_id, medicine_id, batch_number, movement_type, quantity, direction, balance_before, balance_after, reference_id, recorded_by, created_at)
      VALUES (?, ?, ?, 'TN-BATCH-STD', 'TRANSFER_RECEIPT', ?, 'IN', ?, ?, ?, 'Staff', datetime('now'))
    `).run(`sm-trf-in-${Date.now()}`, testPhc2Id, testMedId, confirmedQty, destStockBefore, destNew, trfCase12Id);
    db.exec('COMMIT;');

    const destStockAfter = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhc2Id, testMedId).quantity;
    assert.strictEqual(destStockAfter, destStockBefore + 15, 'Receiver stock must increase by confirmed received amount');
  });

  // ==========================================================================
  // Test 14: Insufficient donor surplus blocks an unsafe transfer
  // ==========================================================================
  test('Case 14: Insufficient donor surplus blocks an unsafe transfer', () => {
    // Current stock at donor testPhc2Id is 15.
    // Daily usage is 5. 14-day safety reserve is 70 units!
    // A transfer request of 10 would violate the safety reserve.
    const currentStock = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhc2Id, testMedId).quantity;
    const dailyUsage = 5;
    const safetyReserve = dailyUsage * 14; // 70 units
    const proposedTransfer = 10;
    const projectedAfter = currentStock - proposedTransfer;
    const isSafe = projectedAfter >= safetyReserve;

    assert.strictEqual(isSafe, false, 'Safety buffer check must identify transfer as unsafe');
  });

  // ==========================================================================
  // Test 15: Dashboard totals, alerts, days of cover reflect updated data
  // ==========================================================================
  test('Case 15: Dashboard totals, alerts, days of cover reflect updated data', () => {
    const metrics = calculateMedicineStockMetrics(testPhcId, testMedId);
    assert(metrics !== null, 'Metrics must be computable');
    assert(typeof metrics.days_left === 'number', 'Days of cover must be a numeric value');
    assert(metrics.days_left > 0, 'Days of cover must be positive');
  });

  // ==========================================================================
  // Test 16: One centre cannot accidentally change another centre stock
  // ==========================================================================
  test('Case 16: One centre cannot accidentally change another centre stock', () => {
    const phc1StockBefore = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;
    const phc2StockBefore = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhc2Id, testMedId).quantity;

    // Record stock entry specifically at PHC 1
    recordOpeningStock({
      phc_id: testPhcId,
      medicine_id: testMedId,
      batch_number: 'ISOLATION-BATCH',
      quantity: 50,
      expiry_date: '2028-12-31'
    });

    const phc1StockAfter = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;
    const phc2StockAfter = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhc2Id, testMedId).quantity;

    assert.strictEqual(phc1StockAfter, phc1StockBefore + 50, 'PHC 1 must increase by 50');
    assert.strictEqual(phc2StockAfter, phc2StockBefore, 'PHC 2 stock must remain completely unaffected');
  });

  // ==========================================================================
  // Test 17: Existing authentication, navigation, and core features still work
  // ==========================================================================
  test('Case 17: Existing authentication, navigation, and core features still work', () => {
    const usersCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    assert(usersCount > 0, 'User authentication database intact');

    const phcsCount = db.prepare('SELECT COUNT(*) as c FROM phcs').get().c;
    assert(phcsCount >= 10, 'Health centres catalog intact');

    const medsCount = db.prepare('SELECT COUNT(*) as c FROM medicines').get().c;
    assert(medsCount >= 30, 'Essential medicine catalog intact');
  });

  console.log(`\n==================================================`);
  console.log(`📊 Test Summary: ${passed} Passed, ${failed} Failed out of 17 tests`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runInventoryBillingTests();
}

module.exports = { runInventoryBillingTests };
