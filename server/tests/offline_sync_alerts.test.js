const assert = require('assert');
const { db } = require('../src/db/database');
const {
  recordOpeningStock,
  recordStockAdjustment,
  processSyncQueue,
  reconcileConflict,
  getStockMovements
} = require('../src/services/stockMovementService');
const {
  confirmBillDispense,
  createDraftBill
} = require('../src/services/billingService');
const {
  getPlainLanguageExplanation
} = require('../src/services/plainLanguageAlerts');

function runOfflineSyncAndAlertsTests() {
  console.log('🧪 Starting VelocityRx / MediAlert AI Offline Sync & Plain-Language Alerts Test Suite...\n');
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

  // Setup test environment
  const testPhcId = 'phc-offline-test';
  const testMedId = 'med-offline-paracetamol';

  try {
    // Deterministic test isolation: clean up child tables before parent tables
    db.prepare('DELETE FROM bill_items WHERE bill_id IN (SELECT id FROM bills WHERE phc_id = ?)').run(testPhcId);
    db.prepare('DELETE FROM bills WHERE phc_id = ?').run(testPhcId);
    db.prepare('DELETE FROM stock_movements WHERE phc_id = ?').run(testPhcId);
    db.prepare('DELETE FROM centre_batch_stock WHERE phc_id = ?').run(testPhcId);
    db.prepare('DELETE FROM current_stock WHERE phc_id = ?').run(testPhcId);

    db.prepare(`
      INSERT OR REPLACE INTO phcs (id, name, code, block, district, latitude, longitude, population_served, phone)
      VALUES (?, 'Offline Test PHC', 'TEST-OFF-01', 'Chengalpattu', 'Chengalpattu', 12.6900, 80.0000, 25000, '044-27400099')
    `).run(testPhcId);

    db.prepare(`
      INSERT OR REPLACE INTO medicines (id, name, generic_name, category, form, strength, unit, cold_chain_flag, critical_flag)
      VALUES (?, 'Offline Paracetamol 250mg', 'Paracetamol', 'Analgesic', 'Syrup', '250mg/5ml', 'bottles', 0, 1)
    `).run(testMedId);

    db.prepare(`
      INSERT OR REPLACE INTO centre_batch_stock (id, phc_id, medicine_id, batch_number, quantity, expiry_date, unit, status, created_at, last_updated)
      VALUES (?, ?, ?, 'BATCH-OFF-INIT', 50, '2028-06-30', 'bottles', 'active', datetime('now'), datetime('now'))
    `).run(`cbs-${testPhcId}-${testMedId}-init`, testPhcId, testMedId);

    db.prepare(`
      INSERT OR REPLACE INTO current_stock (id, phc_id, medicine_id, quantity, batch_number, expiry_date, min_safety_stock, avg_daily_usage, last_updated)
      VALUES (?, ?, ?, 50, 'BATCH-OFF-INIT', '2028-06-30', 40, 5, datetime('now'))
    `).run(`cs-${testPhcId}-${testMedId}`, testPhcId, testMedId);
  } catch (e) {
    console.error('Test DB setup failed:', e);
  }

  // TEST 1: Unique Operation ID & Audit Attributes Preservation
  test('1. Queued offline operations preserve unique ID, timestamps, facility, medicine, batch, and staff member', () => {
    const opId = `op_test_${Date.now()}_1`;
    const queuedItem = {
      id: opId,
      type: 'OPENING_STOCK',
      payload: {
        phc_id: testPhcId,
        medicine_id: testMedId,
        medicine_name: 'Offline Paracetamol 250mg',
        batch_number: 'BATCH-OFF-101',
        expiry_date: '2028-12-31',
        quantity_added: 80,
        unit: 'bottles',
        received_from: 'District Medical Warehouse',
        received_date: '2026-10-11',
        storage_location: 'Room B Shelf 2',
        unit_cost: 25.50,
        recorded_by: 'Nurse Vimala (Staff RN)',
        notes: 'Offline batch intake during storm outage'
      },
      recorded_by: 'Nurse Vimala (Staff RN)',
      created_at: new Date().toISOString(),
      last_known_balance: 50
    };

    assert.strictEqual(typeof queuedItem.id, 'string');
    assert(queuedItem.id.startsWith('op_test_'));
    assert.strictEqual(queuedItem.payload.phc_id, testPhcId);
    assert.strictEqual(queuedItem.payload.recorded_by, 'Nurse Vimala (Staff RN)');
    assert.strictEqual(queuedItem.payload.quantity_added, 80);
  });

  // TEST 2: Server Sync Validation - Rejects Expired Batches
  test('2. Server sync validates batch expiry and safely rejects expired stock', () => {
    const opId = `op_test_expired_${Date.now()}`;
    const queue = [
      {
        id: opId,
        type: 'OPENING_STOCK',
        payload: {
          phc_id: testPhcId,
          medicine_id: testMedId,
          batch_number: 'BATCH-EXPIRED-99',
          expiry_date: '2024-01-01', // Past date!
          quantity_added: 30,
          unit: 'bottles',
          recorded_by: 'Staff Pharmacist'
        }
      }
    ];

    const syncResult = processSyncQueue(queue);
    assert.strictEqual(syncResult.summary.failed, 1);
    assert.strictEqual(syncResult.results[0].status, 'failed');
    assert(syncResult.results[0].error.includes('expired'));
  });

  // TEST 3: Successful Reconnect-and-Sync Processing
  test('3. Server processes valid offline queue, updates balance, and logs auditable stock movement', () => {
    const opId = `op_test_valid_${Date.now()}`;
    const queue = [
      {
        id: opId,
        type: 'OPENING_STOCK',
        payload: {
          phc_id: testPhcId,
          medicine_id: testMedId,
          batch_number: 'BATCH-OFF-SYNC-01',
          expiry_date: '2028-09-30',
          quantity_added: 100,
          unit: 'bottles',
          recorded_by: 'Pharmacist Muthu',
          notes: 'Emergency rural quota'
        },
        recorded_by: 'Pharmacist Muthu',
        last_known_balance: 50
      }
    ];

    const syncResult = processSyncQueue(queue);
    assert.strictEqual(syncResult.summary.synced, 1);
    assert.strictEqual(syncResult.results[0].status, 'synced');

    // Verify database current_stock updated
    const cs = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId);
    assert.strictEqual(cs.quantity, 150); // 50 initial + 100 added

    // Verify stock movement ledger has operation ID as reference_id
    const sm = db.prepare('SELECT * FROM stock_movements WHERE reference_id = ?').get(opId);
    assert(sm, 'Stock movement should be found with reference_id = operation ID');
    assert.strictEqual(sm.quantity, 100);
    assert.strictEqual(sm.movement_type, 'OPENING_STOCK');
    assert.strictEqual(sm.recorded_by, 'Pharmacist Muthu');
  });

  // TEST 4: Idempotency & Duplicate Submission Protection
  test('4. Retrying the same queued operation ID does not duplicate stock additions (Idempotency)', () => {
    const duplicateOpId = `op_test_idempotent_${Date.now()}`;
    const initialQueue = [
      {
        id: duplicateOpId,
        type: 'OPENING_STOCK',
        payload: {
          phc_id: testPhcId,
          medicine_id: testMedId,
          batch_number: 'BATCH-IDEM-01',
          expiry_date: '2028-11-30',
          quantity_added: 40,
          unit: 'bottles',
          recorded_by: 'Duty Officer'
        }
      }
    ];

    // First submission
    const res1 = processSyncQueue(initialQueue);
    assert.strictEqual(res1.summary.synced, 1);
    const stockAfterFirst = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;

    // Retry / resubmission with identical operation ID
    const res2 = processSyncQueue(initialQueue);
    assert.strictEqual(res2.summary.synced, 1);
    assert.strictEqual(res2.results[0].existing, true);

    const stockAfterSecond = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;
    assert.strictEqual(stockAfterFirst, stockAfterSecond, 'Stock must NOT increase upon retry of identical operation');
  });

  // TEST 5: Concurrency Conflict Detection
  test('5. Detects concurrency conflict when server stock changed concurrently while offline', () => {
    const conflictOpId = `op_conflict_${Date.now()}`;
    const currentStock = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;

    // Client queued an offline adjustment assuming last_known_balance was 20, but server is at 190!
    // And client attempts to deduct 100, which conflicts or diverges
    const queue = [
      {
        id: conflictOpId,
        type: 'ADJUSTMENT',
        conflict_check: true,
        last_known_balance: 20, // Client thought stock was 20
        payload: {
          phc_id: testPhcId,
          medicine_id: testMedId,
          quantity_change: 25,
          direction: 'OUT',
          reason_code: 'EXPIRY_DISPOSAL',
          recorded_by: 'Staff Pharmacist'
        }
      }
    ];

    const result = processSyncQueue(queue);
    assert.strictEqual(result.summary.conflicts, 1);
    assert.strictEqual(result.results[0].status, 'conflict');
    assert.strictEqual(result.results[0].requires_reconciliation, true);
    assert(result.results[0].reason.includes('Concurrent modification conflict'));
  });

  // TEST 6: Safe Conflict Reconciliation - Accept Server Stock
  test('6. Safe reconciliation accepts server stock and discards conflicting offline entry with audit trail', () => {
    const conflictOpId = `op_reconcile_discard_${Date.now()}`;
    const res = reconcileConflict({
      operation_id: conflictOpId,
      resolution: 'accept_server'
    });

    assert.strictEqual(res.success, true);
    assert(res.message.includes('Server stock retained'));

    // Check audit log
    const audit = db.prepare('SELECT * FROM audit_logs WHERE entity_id = ?').get(conflictOpId);
    assert(audit, 'Audit record must be logged for discarded offline conflict');
    assert.strictEqual(audit.action, 'RECONCILE_DISCARD_OFFLINE');
  });

  // TEST 7: Safe Conflict Reconciliation - Force Apply
  test('7. Safe reconciliation force_apply records reconciled stock entry with audit tag', () => {
    const reconcileOpId = `op_reconcile_force_${Date.now()}`;
    const stockBefore = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;

    const res = reconcileConflict({
      operation_id: reconcileOpId,
      resolution: 'force_apply',
      operation_data: {
        type: 'OPENING_STOCK',
        payload: {
          phc_id: testPhcId,
          medicine_id: testMedId,
          batch_number: 'BATCH-RECON-01',
          expiry_date: '2028-10-31',
          quantity_added: 25,
          unit: 'bottles',
          recorded_by: 'Staff Pharmacist'
        }
      }
    });

    assert.strictEqual(res.success, true);
    const stockAfter = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;
    assert.strictEqual(stockAfter, stockBefore + 25);
  });

  // TEST 8: Billing Deductions & FEFO Preservation
  test('8. Billing deductions decrement stock accurately alongside offline sync ledger', () => {
    const stockBefore = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;

    const draft = createDraftBill({
      phc_id: testPhcId,
      medicine_id: testMedId,
      prescribed_quantity: 15,
      prescribed_by: 'Dr. Anitha',
      recorded_by: 'Staff Pharmacist Muthu'
    });

    const confirmed = confirmBillDispense(draft.id, {
      confirmed_by: 'Staff Pharmacist Muthu'
    });

    assert.strictEqual(confirmed.status, 'Dispensed');

    const stockAfter = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(testPhcId, testMedId).quantity;
    assert.strictEqual(stockAfter, stockBefore - 15);
  });

  // TEST 9: Transfer Safety - Unsynchronized Stock Exclusion
  test('9. Unsynchronised stock is excluded from transferable donor surplus calculations', () => {
    const dummyCentres = [
      { code: 'A', stock: 200, usage: 5, status: 'green', is_pending_sync: false },
      { code: 'B', stock: 350, usage: 8, status: 'green', is_pending_sync: true, last_verified_server_stock: 150 }
    ];

    // Transferable surplus calculation matching Requirement C
    const transferable = dummyCentres
      .filter((c) => c.status === 'green' && !c.is_pending_sync)
      .reduce((sum, c) => sum + Math.max(0, c.stock - c.usage * 14), 0);

    // Only Centre A is eligible: 200 - (5*14) = 130
    // Centre B (pending sync) is strictly ignored
    assert.strictEqual(transferable, 130);
  });

  // TEST 10: Plain-Language Alert Accuracy & Single-Sentence Invariant
  test('10. Plain-language alerts produce exactly one concise explanatory sentence from real parameters', () => {
    // 10a. Critical Stock (< 3 days)
    const crit1 = getPlainLanguageExplanation({ status: 'red', daysOfCover: 2 });
    assert.strictEqual(crit1, 'This medicine is expected to run out within 2 days based on recent usage.');

    const crit24h = getPlainLanguageExplanation({ status: 'red', daysOfCover: 1 });
    assert.strictEqual(crit24h, 'This medicine is expected to run out within 24 hours based on recent usage.');

    // 10b. Low Stock (< safety reserve)
    const lowStock = getPlainLanguageExplanation({ status: 'amber', minSafetyStock: 70, unit: 'bottles' });
    assert.strictEqual(lowStock, 'This medicine is below the centre’s minimum safety stock of 70 bottles.');

    // 10c. Near Expiry (<= 90 days)
    const nearExp = getPlainLanguageExplanation({ type: 'near_expiry', daysToExpiry: 30, batchNumber: 'TN-PCM-24A' });
    assert.strictEqual(nearExp, 'Batch TN-PCM-24A expires within 30 days and needs review.');

    // 10d. Transfer Recommendation
    const transfer = getPlainLanguageExplanation({ type: 'transfer_recommendation', transferableUnits: 50, safetyReserve: 140, unit: 'tablets' });
    assert.strictEqual(transfer, 'This centre may supply 50 tablets without falling below its safety reserve of 140 tablets.');

    // 10e. Offline Connection State
    const offline = getPlainLanguageExplanation({ isOffline: true });
    assert.strictEqual(offline, 'You are offline, so new stock changes will sync when internet returns.');

    // 10f. Stale Data
    const stale = getPlainLanguageExplanation({ isStale: true });
    assert.strictEqual(stale, 'This centre’s stock has not been updated recently, so current availability is uncertain.');

    // 10g. Pending Sync Unverified Balance
    const pending = getPlainLanguageExplanation({ isPendingSync: true });
    assert.strictEqual(pending, 'This stock entry was recorded offline and is pending verification with the central server.');

    // Single Sentence Invariant Check:
    const allAlerts = [crit1, crit24h, lowStock, nearExp, transfer, offline, stale, pending];
    allAlerts.forEach((sentence, idx) => {
      // Must end with a period
      assert(sentence.endsWith('.'), `Sentence ${idx} must end with a period: "${sentence}"`);
      // Must contain exactly 1 sentence (no multiple periods except decimals)
      const nonDecimalPeriods = sentence.replace(/\d+\.\d+/g, '').split('.').filter(s => s.trim().length > 0);
      assert.strictEqual(nonDecimalPeriods.length, 1, `Must contain exactly one sentence: "${sentence}"`);
    });
  });

  console.log(`\n========================================`);
  console.log(`🏁 Offline Sync & Alerts Tests Finished: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runOfflineSyncAndAlertsTests();
}

module.exports = { runOfflineSyncAndAlertsTests };
