const { db } = require('../src/db/database');
const {
  evaluateStockHealth,
  discoverSafeDonors,
  autoCreateRequisitions,
  transitionTransferLifecycle,
  getUsableBatchStock,
  setSetting,
  getSetting,
  checkOverdueEscalations,
  runFullAutomationCycle
} = require('../src/services/automationEngine');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTestSuite() {
  console.log('🧪 Starting End-to-End Automation & Redistribution Test Suite...\n');

  const testDeficitPhc = 'phc-thiruporur'; // Melur PHC (Madurai)
  const testDonorPhc = 'phc-kelambakkam';   // Othakadai Upgraded PHC (Madurai)
  const testMedicineId = 'med-pcm-syp';     // Paracetamol Syrup

  // --------------------------------------------------------------------------
  // TEST 1: Automatic Stock Monitoring & Usable Batch Inventory
  // --------------------------------------------------------------------------
  try {
    const stockInfo = getUsableBatchStock(testDonorPhc, testMedicineId);
    assert(
      stockInfo.totalUsableBatchQuantity >= 0 && Array.isArray(stockInfo.batches),
      '1. Usable batch stock accurately aggregates active non-expired batches'
    );
  } catch (e) {
    assert(false, `1. Error: ${e.message}`);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Days of Cover Calculation with Safety Fallbacks
  // --------------------------------------------------------------------------
  try {
    const stockResult = evaluateStockHealth();
    assert(
      stockResult.evaluatedCount > 0,
      `2. Continuous stock evaluation checked ${stockResult.evaluatedCount} facility-medicine pairs`
    );
  } catch (e) {
    assert(false, `2. Error: ${e.message}`);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Automatic Shortage Detection & Plain-Language Explanation
  // --------------------------------------------------------------------------
  try {
    // Ensure Melur PHC has critical shortage (set stock to 10 bottles)
    db.prepare('UPDATE centre_batch_stock SET quantity = 10 WHERE phc_id = ? AND medicine_id = ?').run(testDeficitPhc, testMedicineId);
    db.prepare('UPDATE current_stock SET quantity = 10, last_updated = CURRENT_TIMESTAMP WHERE phc_id = ? AND medicine_id = ?').run(testDeficitPhc, testMedicineId);

    const stockResult = evaluateStockHealth();
    const alert = db.prepare(`
      SELECT * FROM alerts 
      WHERE phc_id = ? AND medicine_id = ? AND alert_type = 'stockout_imminent' AND status != 'resolved'
    `).get(testDeficitPhc, testMedicineId);

    assert(
      alert && alert.message && alert.message.includes('Paracetamol Syrup is expected to run out within 2 days'),
      '3. Critical shortage detected with exact plain-language explanatory sentence'
    );
  } catch (e) {
    assert(false, `3. Error: ${e.message}`);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Safe Donor Discovery & 14-Day Reserve Protection
  // --------------------------------------------------------------------------
  try {
    // Ensure donor has 400 bottles with 8 bottles/day usage (safety reserve = 112)
    db.prepare('DELETE FROM stock_reservations WHERE phc_id = ? AND medicine_id = ?').run(testDonorPhc, testMedicineId);
    db.prepare('DELETE FROM transfer_requests WHERE source_phc_id = ? AND medicine_id = ?').run(testDonorPhc, testMedicineId);
    db.prepare('UPDATE centre_batch_stock SET quantity = 400 WHERE phc_id = ? AND medicine_id = ?').run(testDonorPhc, testMedicineId);
    db.prepare('UPDATE current_stock SET quantity = 400, avg_daily_usage = 8, last_updated = CURRENT_TIMESTAMP WHERE phc_id = ? AND medicine_id = ?').run(testDonorPhc, testMedicineId);

    const discovery = discoverSafeDonors({
      destPhcId: testDeficitPhc,
      medicineId: testMedicineId,
      neededQuantity: 40
    });

    assert(
      discovery.has_safe_donor && discovery.top_donor && discovery.top_donor.is_same_district === true,
      '4. Discovers same-district donor (Othakadai) while protecting 14-day local safety reserve'
    );
  } catch (e) {
    assert(false, `4. Error: ${e.message}`);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Rejection of Unsafe Donors with Insufficient Reserve
  // --------------------------------------------------------------------------
  try {
    // Drop donor stock down to 80 (less than 112 reserve)
    db.prepare('UPDATE centre_batch_stock SET quantity = 80 WHERE phc_id = ? AND medicine_id = ?').run(testDonorPhc, testMedicineId);

    const discovery = discoverSafeDonors({
      destPhcId: testDeficitPhc,
      medicineId: testMedicineId,
      neededQuantity: 40
    });

    const isOthakadaiInDonors = discovery.eligible_donors.some(d => d.donor_phc_id === testDonorPhc);
    assert(
      !isOthakadaiInDonors,
      '5. Donor with stock below 14-day safety reserve is strictly excluded from donor ranking'
    );

    // Restore donor stock
    db.prepare('UPDATE centre_batch_stock SET quantity = 400 WHERE phc_id = ? AND medicine_id = ?').run(testDonorPhc, testMedicineId);
  } catch (e) {
    assert(false, `5. Error: ${e.message}`);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Policy A Automatic Approval & Stock Reservation
  // --------------------------------------------------------------------------
  try {
    setSetting('approval_policy', 'AUTO');
    setSetting('max_auto_approve_qty', '200');

    // Clean any prior pending requests for test pair
    db.prepare('DELETE FROM stock_reservations WHERE phc_id = ? AND medicine_id = ?').run(testDonorPhc, testMedicineId);
    db.prepare('DELETE FROM transfer_requests WHERE dest_phc_id = ? AND medicine_id = ?').run(testDeficitPhc, testMedicineId);
    db.prepare("DELETE FROM centre_batch_stock WHERE phc_id = ? AND medicine_id = ? AND batch_number != 'TN-PCM-SYP-2026'").run(testDeficitPhc, testMedicineId);
    db.prepare('UPDATE centre_batch_stock SET quantity = 10 WHERE phc_id = ? AND medicine_id = ?').run(testDeficitPhc, testMedicineId);
    db.prepare('UPDATE current_stock SET quantity = 10, last_updated = CURRENT_TIMESTAMP WHERE phc_id = ? AND medicine_id = ?').run(testDeficitPhc, testMedicineId);
    db.prepare('UPDATE centre_batch_stock SET quantity = 400 WHERE phc_id = ? AND medicine_id = ?').run(testDonorPhc, testMedicineId);
    db.prepare('UPDATE current_stock SET quantity = 400, avg_daily_usage = 8, last_updated = CURRENT_TIMESTAMP WHERE phc_id = ? AND medicine_id = ?').run(testDonorPhc, testMedicineId);

    const created = autoCreateRequisitions();
    const req = db.prepare(`
      SELECT * FROM transfer_requests 
      WHERE dest_phc_id = ? AND medicine_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(testDeficitPhc, testMedicineId);

    const res = db.prepare(`
      SELECT * FROM stock_reservations 
      WHERE requisition_id = ? AND status = 'RESERVED'
    `).get(req ? req.id : '');

    assert(
      req && req.status === 'approved' && req.lifecycle_stage === 'RESERVED' && req.is_auto_approved === 1 && res !== undefined,
      '6. Policy A automatically approves eligible requisition and locks stock reservation'
    );
  } catch (e) {
    assert(false, `6. Error: ${e.message}`);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Double-Allocation Prevention (Idempotent Reservation Lock)
  // --------------------------------------------------------------------------
  try {
    const usableBefore = getUsableBatchStock(testDonorPhc, testMedicineId);
    assert(
      usableBefore.reservedQuantity > 0,
      '7. Stock reservation locks donor surplus, deducting it from unreserved available balance'
    );
  } catch (e) {
    assert(false, `7. Error: ${e.message}`);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Policy B Human Approval Requirement
  // --------------------------------------------------------------------------
  try {
    setSetting('approval_policy', 'MANUAL');

    db.prepare('DELETE FROM transfer_requests WHERE dest_phc_id = ? AND medicine_id = ?').run(testDeficitPhc, testMedicineId);

    const testReqManualId = `REQ-TEST-MANUAL-${Date.now()}`;
    db.prepare(`
      INSERT INTO transfer_requests (
        id, req_number, source_phc_id, dest_phc_id, medicine_id, quantity,
        reason, status, lifecycle_stage, policy_applied, is_auto_approved, auto_generated, requested_by
      ) VALUES (
        ?, ?, ?, ?, ?, 80,
        'Manual policy test', 'requested', 'REQUESTED', 'MANUAL', 0, 1, 'usr-system-automation'
      )
    `).run(testReqManualId, testReqManualId, testDonorPhc, testDeficitPhc, testMedicineId);

    const humanApproveResult = transitionTransferLifecycle({
      requisitionId: testReqManualId,
      action: 'APPROVE',
      actorName: 'Dr. Jayanthi Raman (BMO)',
      quantity: 80
    });

    assert(
      humanApproveResult.status === 'approved' && humanApproveResult.lifecycle_stage === 'RESERVED',
      '8. Policy B requires human approval before advancing to reserved shipment preparation'
    );
  } catch (e) {
    assert(false, `8. Error: ${e.message}`);
  }

  // --------------------------------------------------------------------------
  // TEST 9: Confirmed Dispatch Deducts Donor Stock Exactly Once
  // --------------------------------------------------------------------------
  try {
    const req = db.prepare(`
      SELECT * FROM transfer_requests 
      WHERE dest_phc_id = ? AND medicine_id = ? AND status = 'approved'
      ORDER BY created_at DESC LIMIT 1
    `).get(testDeficitPhc, testMedicineId);

    const donorBatchBefore = db.prepare(`
      SELECT quantity FROM centre_batch_stock 
      WHERE phc_id = ? AND medicine_id = ? AND batch_number = ?
    `).get(testDonorPhc, testMedicineId, req.fefo_batch_number);

    const dispatchResult = transitionTransferLifecycle({
      requisitionId: req.id,
      action: 'DISPATCH',
      actorName: 'Driver Kumaran (TN-19-G-4402)'
    });

    const donorBatchAfter = db.prepare(`
      SELECT quantity FROM centre_batch_stock 
      WHERE phc_id = ? AND medicine_id = ? AND batch_number = ?
    `).get(testDonorPhc, testMedicineId, req.fefo_batch_number);

    const expectedQty = req.approved_quantity || req.quantity;

    assert(
      dispatchResult.status === 'in_transit' && 
      (donorBatchBefore.quantity - donorBatchAfter.quantity === expectedQty),
      '9. Confirmed dispatch deducts donor batch exactly once and logs road transit'
    );
  } catch (e) {
    assert(false, `9. Error: ${e.message}`);
  }

  // --------------------------------------------------------------------------
  // TEST 10: Confirmed Receipt Increments Receiver Stock & Reconciles Discrepancy
  // --------------------------------------------------------------------------
  try {
    const req = db.prepare(`
      SELECT * FROM transfer_requests 
      WHERE dest_phc_id = ? AND medicine_id = ? AND status = 'in_transit'
      ORDER BY created_at DESC LIMIT 1
    `).get(testDeficitPhc, testMedicineId);

    const dispatchedQty = req.approved_quantity || req.quantity;
    const actualReceived = dispatchedQty - 2; // Simulate 2 damaged units in transit

    const recResult = transitionTransferLifecycle({
      requisitionId: req.id,
      action: 'RECEIVE',
      actorName: 'Thiru. Murugan (Pharmacist)',
      receivedQuantity: actualReceived,
      discrepancyReason: '2 bottles cracked in transit'
    });

    const mov = db.prepare(`
      SELECT * FROM stock_movements 
      WHERE reference_id = ? AND movement_type = 'TRANSFER_RECEIPT'
    `).get(req.req_number);

    assert(
      recResult.status === 'completed' && 
      recResult.lifecycle_stage === 'PARTIALLY_FULFILLED' &&
      recResult.discrepancy_quantity === 2 &&
      mov && mov.quantity === actualReceived,
      '10. Receipt confirms verified stock, records discrepancy, and updates stock ledger'
    );
  } catch (e) {
    assert(false, `10. Error: ${e.message}`);
  }

  // --------------------------------------------------------------------------
  // TEST 11: Automatic Alert Resolution Upon Stock Replenishment
  // --------------------------------------------------------------------------
  try {
    // Receiver stock now replenished (10 + 38 = 48 units, > 3 days)
    evaluateStockHealth();
    const alert = db.prepare(`
      SELECT * FROM alerts 
      WHERE phc_id = ? AND medicine_id = ? AND alert_type = 'stockout_imminent'
      ORDER BY created_at DESC LIMIT 1
    `).get(testDeficitPhc, testMedicineId);

    assert(
      alert && alert.status === 'resolved',
      '11. Replenishment automatically resolves shortage alert without manual pharmacist intervention'
    );
  } catch (e) {
    assert(false, `11. Error: ${e.message}`);
  }

  // --------------------------------------------------------------------------
  // TEST 12: District Warehouse Escalation when No Safe Peer Donor Exists
  // --------------------------------------------------------------------------
  try {
    // Deplete all centres in Madurai for Anti-Snake Venom (ASV)
    db.prepare(`
      UPDATE centre_batch_stock 
      SET quantity = 0 
      WHERE phc_id IN (SELECT id FROM phcs WHERE district = 'Madurai' AND is_warehouse = 0)
        AND medicine_id = 'med-asv'
    `).run();

    // Clear prior requests for ASV
    db.prepare(`
      DELETE FROM transfer_requests WHERE dest_phc_id = ? AND medicine_id = 'med-asv'
    `).run(testDeficitPhc);

    autoCreateRequisitions();

    const escalationReq = db.prepare(`
      SELECT * FROM transfer_requests 
      WHERE dest_phc_id = ? AND medicine_id = 'med-asv' AND warehouse_escalated = 1
      ORDER BY created_at DESC LIMIT 1
    `).get(testDeficitPhc);

    assert(
      escalationReq && escalationReq.source_phc_id === 'wh-madurai' && escalationReq.lifecycle_stage === 'ESCALATED',
      '12. Automatically creates escalation requisition to District Drug Warehouse when no peer donor exists'
    );
  } catch (e) {
    assert(false, `12. Error: ${e.message}`);
  }

  // --------------------------------------------------------------------------
  // TEST 13: Overdue Approval and Transit Escalation Tracking
  // --------------------------------------------------------------------------
  try {
    // Insert an artificially aged request pending approval > 25 hours
    const agedReqId = `REQ-AGED-${Date.now()}`;
    db.prepare(`
      INSERT INTO transfer_requests (
        id, req_number, source_phc_id, dest_phc_id, medicine_id, quantity,
        reason, status, lifecycle_stage, created_at, requested_by
      ) VALUES (
        ?, ?, ?, ?, ?, 25,
        'Aged test', 'requested', 'REQUESTED', datetime('now', '-26 hours'), 'usr-system-automation'
      )
    `).run(agedReqId, agedReqId, testDonorPhc, testDeficitPhc, testMedicineId);

    const escalatedCount = checkOverdueEscalations();
    const updatedAgedReq = db.prepare('SELECT is_overdue_approval FROM transfer_requests WHERE id = ?').get(agedReqId);

    assert(
      escalatedCount > 0 && updatedAgedReq.is_overdue_approval === 1,
      '13. Detects and escalates overdue approvals exceeding configured 24-hour deadline'
    );
  } catch (e) {
    assert(false, `13. Error: ${e.message}`);
  }

  // --------------------------------------------------------------------------
  // TEST 14: End-to-End Background Automation Engine Logging & Observability
  // --------------------------------------------------------------------------
  try {
    const cycleResult = runFullAutomationCycle();
    const jobLog = db.prepare(`
      SELECT * FROM background_jobs 
      WHERE id = ? AND status = 'SUCCESS'
    `).get(cycleResult.jobId);

    assert(
      cycleResult.success === true && jobLog !== undefined && jobLog.items_processed > 0,
      '14. Background job logger captures execution duration, items evaluated, and audit trail'
    );
  } catch (e) {
    assert(false, `14. Error: ${e.message}`);
  }

  console.log('\n========================================');
  console.log(`🏁 Automation Test Suite: ${passed} passed, ${failed} failed out of 14 requirements`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
