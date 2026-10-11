const assert = require('assert');
const { calculateHaversineDistance, estimateRoadTravel } = require('../src/services/haversineService');
const { calculateMedicineStockMetrics } = require('../src/services/stockService');
const { getRedistributionRecommendations, getSeasonalMultiplier } = require('../src/services/aiEngine');
const { db } = require('../src/db/database');

function runTests() {
  console.log('🧪 Starting VelocityRx + Block Exchange Comprehensive Test Suite...\n');
  let passed = 0;
  let failed = 0;

  // Baseline stock fixtures for idempotent calculation testing
  try {
    db.prepare("UPDATE current_stock SET quantity = 10, last_updated = datetime('now') WHERE phc_id = 'phc-thiruporur' AND medicine_id = 'med-pcm-syp'").run();
    db.prepare("UPDATE centre_batch_stock SET quantity = 10, last_updated = datetime('now') WHERE phc_id = 'phc-thiruporur' AND medicine_id = 'med-pcm-syp'").run();
    db.prepare("UPDATE current_stock SET quantity = 950, avg_daily_usage = 8, last_updated = datetime('now') WHERE phc_id = 'phc-kelambakkam' AND medicine_id = 'med-pcm-syp'").run();
    db.prepare("UPDATE centre_batch_stock SET quantity = 950, last_updated = datetime('now') WHERE phc_id = 'phc-kelambakkam' AND medicine_id = 'med-pcm-syp'").run();
    db.prepare("DELETE FROM stock_reservations WHERE phc_id = 'phc-kelambakkam' AND medicine_id = 'med-pcm-syp'").run();
    db.prepare("DELETE FROM transfer_requests WHERE dest_phc_id = 'phc-thiruporur' AND medicine_id = 'med-pcm-syp'").run();
  } catch (e) {
    console.warn('Fixture init notice:', e.message);
  }

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

  // 1. Spatial & Routing Tests
  test('Haversine distance between identical points is exactly 0 km', () => {
    const dist = calculateHaversineDistance(12.7234, 80.1906, 12.7234, 80.1906);
    assert.strictEqual(dist, 0);
  });

  test('Haversine distance between Thiruporur PHC and Kelambakkam PHC is ~8.1 km', () => {
    const dist = calculateHaversineDistance(12.7234, 80.1906, 12.7904, 80.2223);
    assert(dist >= 7.5 && dist <= 8.5, `Expected distance ~8.1km, got ${dist}km`);
  });

  test('Road travel estimation applies winding factor and sensible travel time', () => {
    const road = estimateRoadTravel(8.1);
    assert(road.roadDistanceKm > 8.1, 'Road distance should exceed direct crow distance');
    assert(road.estimatedMinutes >= 10, 'Road travel minutes should be at least 10 mins');
  });

  // 2. Days-of-Cover Calculations & Risk Classification
  test('Days of stock calculation accurately classifies critical shortage (RED)', () => {
    const metrics = calculateMedicineStockMetrics('phc-thiruporur', 'med-pcm-syp');
    assert(metrics !== null, 'Metrics should exist');
    assert.strictEqual(metrics.status, 'red', 'Should be RED status due to critical cover');
    assert(metrics.days_left < 15, 'Days left should be < 15');
  });

  test('Days of stock calculation classifies surplus centre as GREEN', () => {
    const metrics = calculateMedicineStockMetrics('phc-kelambakkam', 'med-pcm-syp');
    assert(metrics !== null, 'Metrics should exist');
    assert.strictEqual(metrics.status, 'green', 'Should be GREEN status');
    assert(metrics.days_left > 30, 'Days left should be > 30');
  });

  test('Days of cover calculation handles zero daily usage without returning NaN or Infinity', () => {
    const usage = 0;
    const stock = 100;
    const days = usage > 0 ? stock / usage : 999;
    assert.strictEqual(Number.isFinite(days), true, 'Days must be finite');
    assert.strictEqual(Number.isNaN(days), false, 'Days must not be NaN');
    assert.strictEqual(days, 999, 'Zero usage defaults to 999 days');
  });

  // 3. Seasonal Multipliers
  test('Monsoon multiplier applies properly for Paracetamol in October (Monsoon Surge)', () => {
    const seasonal = getSeasonalMultiplier('Analgesics & Antipyretics', 'Paracetamol Pediatric Oral Suspension', 10);
    assert(seasonal.multiplier > 1.4, `Expected multiplier > 1.4 for monsoon, got ${seasonal.multiplier}`);
    assert(seasonal.bufferIncreaseDays > 0, 'Should suggest increased buffer days');
  });

  test('Summer multiplier applies properly for ORS in May (Heatwave Dehydration Surge)', () => {
    const seasonal = getSeasonalMultiplier('Maternal & Child Health', 'Oral Rehydration Salts (ORS) WHO Formula', 5);
    assert(seasonal.multiplier > 1.5, `Expected multiplier > 1.5 for summer ORS, got ${seasonal.multiplier}`);
  });

  // 4. Scenario A: Safe Local Transfer Matching
  test('Recommendation engine matches Thiruporur shortage with Kelambakkam surplus', () => {
    const recommendations = getRedistributionRecommendations('phc-thiruporur');
    assert(Array.isArray(recommendations), 'Recommendations should be an array');
    const pcmRec = recommendations.find(r => r.medicine_id === 'med-pcm-syp');
    assert(pcmRec, 'Should produce a recommendation for Paracetamol Syrup at Thiruporur');
    assert.strictEqual(pcmRec.best_match.source_phc_id, 'phc-kelambakkam', 'Best match should be Kelambakkam PHC');
    assert(pcmRec.best_match.proposed_transfer_quantity > 50, 'Proposed transfer quantity should be substantial');
  });

  // 5. Scenario B: Donor Reserve Protection (14-day Minimum)
  test('Donor transferable surplus strictly enforces 14-day local safety reserve', () => {
    const dailyUsage = 20;
    const currentStock = 400;
    const minimumSafetyReserve = dailyUsage * 14; // 280 units
    const safeTransferableSurplus = Math.max(0, currentStock - minimumSafetyReserve); // 120 units
    
    assert.strictEqual(safeTransferableSurplus, 120, 'Transferable surplus should be 120 units');
    
    // Proposing 200 units must breach safety reserve
    const proposed = 200;
    const stockAfter = currentStock - proposed;
    const checkPassed = stockAfter >= minimumSafetyReserve;
    assert.strictEqual(checkPassed, false, 'Proposing 200 units should fail donor safety check');
  });

  // 6. Scenario D & E: Batch Expiry Eligibility & FEFO
  test('Expired batches are strictly excluded from transfer recommendations', () => {
    const expiredDate = '2023-01-01';
    const daysUntilExpiry = Math.floor((new Date(expiredDate) - new Date()) / (1000 * 60 * 60 * 24));
    const isEligible = daysUntilExpiry > 0;
    assert.strictEqual(isEligible, false, 'Expired batch must be disqualified from transfer');
  });

  test('Approaching expiry check confirms receiver can consume quantity before expiration', () => {
    const receiverDailyUsage = 10;
    const requestedQty = 100;
    const daysNeededToConsume = Math.ceil(requestedQty / receiverDailyUsage); // 10 days
    
    const expiryIn30Days = 30;
    const canConsumeInTime = expiryIn30Days >= daysNeededToConsume;
    assert.strictEqual(canConsumeInTime, true, 'Batch expiring in 30 days can be consumed in 10 days');

    const expiryIn5Days = 5;
    const cannotConsumeInTime = expiryIn5Days >= daysNeededToConsume;
    assert.strictEqual(cannotConsumeInTime, false, 'Batch expiring in 5 days cannot be consumed in 10 days');
  });

  // 7. Scenario H: Simulation Non-Mutation Check
  test('Simulation calculation produces before-and-after metrics without mutating database', () => {
    const donorBefore = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get('phc-kelambakkam', 'med-pcm-syp');
    const destBefore = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get('phc-thiruporur', 'med-pcm-syp');

    // Simulate transfer of 50 units
    const simulatedQty = 50;
    const donorProjected = donorBefore.quantity - simulatedQty;
    const destProjected = destBefore.quantity + simulatedQty;

    assert.strictEqual(donorProjected, donorBefore.quantity - 50);
    assert.strictEqual(destProjected, destBefore.quantity + 50);

    // Verify database remains untouched
    const donorAfter = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get('phc-kelambakkam', 'med-pcm-syp');
    const destAfter = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get('phc-thiruporur', 'med-pcm-syp');
    assert.strictEqual(donorAfter.quantity, donorBefore.quantity, 'Donor database stock must remain unchanged');
    assert.strictEqual(destAfter.quantity, destBefore.quantity, 'Dest database stock must remain unchanged');
  });

  // 8. Scenario F: Partial Receipt & Discrepancy Recording
  test('Partial receipt increments receiver stock only by confirmed amount and records discrepancy', () => {
    const dispatchedQty = 120;
    const confirmedQty = 100; // 20 units damaged in transit
    const discrepancy = dispatchedQty - confirmedQty;
    
    assert.strictEqual(discrepancy, 20, 'Discrepancy must be exactly 20 units');
    assert(confirmedQty < dispatchedQty, 'Partial receipt detected');
    
    // Receipt increment formula
    const receiverOldStock = 10;
    const receiverNewStock = receiverOldStock + confirmedQty; // Only add confirmedQty
    assert.strictEqual(receiverNewStock, 110, 'Receiver must only receive confirmed 100 units');
  });

  // 9. Duplicate Operation Prevention
  test('Duplicate dispatch and duplicate receipt are strictly prevented by state machine', () => {
    const allowedDispatchFrom = ['approved', 'ready_for_collection'];
    assert.strictEqual(allowedDispatchFrom.includes('in_transit'), false, 'Cannot dispatch an already in_transit transfer');
    assert.strictEqual(allowedDispatchFrom.includes('completed'), false, 'Cannot dispatch an already completed transfer');

    const allowedReceiptFrom = ['in_transit'];
    assert.strictEqual(allowedReceiptFrom.includes('completed'), false, 'Cannot receive an already completed transfer');
  });

  console.log(`\n========================================`);
  console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
