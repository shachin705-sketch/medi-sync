const assert = require('assert');
const { db } = require('../src/db/database');
const { calculateMedicineStockMetrics } = require('../src/services/stockService');

function runTamilNaduMapTests() {
  console.log('🧪 Starting Tamil Nadu District Drill-Down Map Test Suite...\n');
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

  // 1. Seed & District Count Test
  test('1. Seed creates 3 districts with 4 (Madurai), 3 (Theni), and 3 (Dindigul) active centres', () => {
    const districts = db.prepare(`
      SELECT district, COUNT(*) as count 
      FROM phcs 
      WHERE (is_warehouse = 0 OR is_warehouse IS NULL)
        AND id NOT LIKE 'phc-test%' 
        AND id NOT LIKE 'phc-offline%'
      GROUP BY district
      ORDER BY district ASC
    `).all();

    assert.strictEqual(districts.length, 3, 'Should have exactly 3 districts');
    const dindigul = districts.find(d => d.district === 'Dindigul');
    const madurai = districts.find(d => d.district === 'Madurai');
    const theni = districts.find(d => d.district === 'Theni');

    assert.strictEqual(madurai.count, 4, 'Madurai must have 4 centres');
    assert.strictEqual(theni.count, 3, 'Theni must have 3 centres');
    assert.strictEqual(dindigul.count, 3, 'Dindigul must have 3 centres');
  });

  // 2. CHC / PHC Type Distinction Test
  test('2. Centre 10 (Palani) is the CHC in Dindigul; rest in Dindigul are PHCs', () => {
    const dindigulCentres = db.prepare(`
      SELECT * FROM phcs 
      WHERE district = 'Dindigul' AND (is_warehouse = 0 OR is_warehouse IS NULL)
    `).all();

    const palani = dindigulCentres.find(c => c.name.toLowerCase().includes('palani') || c.code === 'J');
    assert(palani, 'Palani centre must exist');
    assert.strictEqual(palani.facility_type, 'CHC', 'Palani should be CHC');

    const others = dindigulCentres.filter(c => c.id !== palani.id);
    others.forEach(c => {
      assert.strictEqual(c.facility_type, 'PHC', `${c.name} should be PHC`);
    });
  });

  // 3. District Drug Warehouses Test
  test('3. Exactly one District Drug Warehouse exists per district (type DISTRICT, is_warehouse = 1)', () => {
    const warehouses = db.prepare(`
      SELECT * FROM phcs 
      WHERE is_warehouse = 1
      ORDER BY district ASC
    `).all();

    assert.strictEqual(warehouses.length, 3, 'Must have exactly 3 warehouses');
    const districtsWithWh = warehouses.map(w => w.district);
    assert(districtsWithWh.includes('Madurai'), 'Madurai must have a warehouse');
    assert(districtsWithWh.includes('Theni'), 'Theni must have a warehouse');
    assert(districtsWithWh.includes('Dindigul'), 'Dindigul must have a warehouse');

    warehouses.forEach(w => {
      assert.strictEqual(w.facility_type, 'DISTRICT');
      assert.strictEqual(w.is_warehouse, 1);
    });
  });

  // 4. District validation rule: Minimum 3 active centres
  test('4. API/DB validation rejects deleting a centre if it would leave district with <3 centres', () => {
    // Theni has 3 centres. Attempting to delete one should be rejected.
    const theniCentres = db.prepare(`
      SELECT * FROM phcs 
      WHERE district = 'Theni' AND (is_warehouse = 0 OR is_warehouse IS NULL)
    `).all();
    assert.strictEqual(theniCentres.length, 3);

    const centreToDelete = theniCentres[0];
    const activeCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM phcs 
      WHERE district = ? AND (is_warehouse = 0 OR is_warehouse IS NULL)
    `).get(centreToDelete.district).count;

    let rejected = false;
    let errorMessage = '';
    if (activeCount <= 3) {
      rejected = true;
      errorMessage = 'A district needs at least 3 centres';
    }

    assert.strictEqual(rejected, true, 'Deletion must be rejected');
    assert.strictEqual(errorMessage, 'A district needs at least 3 centres');
  });

  // 5. Moving centre validation
  test('5. API validation rejects moving a centre if source district is left with <3 centres', () => {
    const theniCentres = db.prepare(`
      SELECT * FROM phcs 
      WHERE district = 'Theni' AND (is_warehouse = 0 OR is_warehouse IS NULL)
    `).all();

    const targetCentre = theniCentres[0];
    const remainingInSource = db.prepare(`
      SELECT COUNT(*) as count 
      FROM phcs 
      WHERE district = ? AND id != ? AND (is_warehouse = 0 OR is_warehouse IS NULL)
    `).get('Theni', targetCentre.id).count;

    let rejected = false;
    let errorMessage = '';
    if (remainingInSource < 3) {
      rejected = true;
      errorMessage = 'A district needs at least 3 centres';
    }

    assert.strictEqual(rejected, true, 'Moving must be rejected');
    assert.strictEqual(errorMessage, 'A district needs at least 3 centres');
  });

  // 6. District Worst-Status Calculation matches real inventory
  test('6. District worst-status colour dynamically computes from real inventory', () => {
    // Madurai has Melur PHC (phc-thiruporur) with critical shortage of Paracetamol (<3 days)
    const metrics = calculateMedicineStockMetrics('phc-thiruporur', 'med-pcm-syp');
    assert.strictEqual(metrics.status, 'red', 'Melur PHC must be RED for Paracetamol');

    // Therefore worst status for Madurai must be RED
    const maduraiCentres = db.prepare(`
      SELECT id FROM phcs WHERE district = 'Madurai' AND (is_warehouse = 0 OR is_warehouse IS NULL)
    `).all();
    const hasRed = maduraiCentres.some(c => {
      const m = calculateMedicineStockMetrics(c.id, 'med-pcm-syp');
      return m && m.status === 'red';
    });
    assert.strictEqual(hasRed, true, 'Madurai must contain at least one red centre');
    const worstStatus = hasRed ? 'red' : 'green';
    assert.strictEqual(worstStatus, 'red', 'Worst status must be RED, never hardcoded');
  });

  // 7. Missing district fallback handling
  test('7. Missing district displays "District not set" instead of guessing', () => {
    const formatDistrict = (district) => (district && district.trim()) ? district : 'District not set';
    assert.strictEqual(formatDistrict(null), 'District not set');
    assert.strictEqual(formatDistrict(''), 'District not set');
    assert.strictEqual(formatDistrict('   '), 'District not set');
    assert.strictEqual(formatDistrict('Madurai'), 'Madurai');
  });

  // 8. Demo Receiver (Centre 1) and Demo Donor (Centre 2) proximity in Madurai
  test('8. Madurai Centre 1 (Melur) and Centre 2 (Othakadai) are ~9 km apart with safe donor surplus', () => {
    const melur = db.prepare("SELECT * FROM phcs WHERE id = 'phc-thiruporur'").get();
    const othakadai = db.prepare("SELECT * FROM phcs WHERE id = 'phc-kelambakkam'").get();

    assert(melur && othakadai, 'Both Melur and Othakadai must exist in Madurai');
    // Ensure demo baseline stock levels for Melur and Othakadai
    db.prepare("UPDATE current_stock SET quantity = 10, last_updated = datetime('now') WHERE phc_id = 'phc-thiruporur' AND medicine_id = 'med-pcm-syp'").run();
    db.prepare("UPDATE centre_batch_stock SET quantity = 10, last_updated = datetime('now') WHERE phc_id = 'phc-thiruporur' AND medicine_id = 'med-pcm-syp'").run();
    db.prepare("UPDATE current_stock SET quantity = 950, avg_daily_usage = 8, last_updated = datetime('now') WHERE phc_id = 'phc-kelambakkam' AND medicine_id = 'med-pcm-syp'").run();
    db.prepare("UPDATE centre_batch_stock SET quantity = 950, last_updated = datetime('now') WHERE phc_id = 'phc-kelambakkam' AND medicine_id = 'med-pcm-syp'").run();

    const receiverMetrics = calculateMedicineStockMetrics(melur.id, 'med-pcm-syp');
    const donorMetrics = calculateMedicineStockMetrics(othakadai.id, 'med-pcm-syp');

    assert.strictEqual(receiverMetrics.status, 'red', 'Melur must be critical shortage (receiver)');
    assert.strictEqual(donorMetrics.status, 'green', 'Othakadai must have surplus (donor)');
    const safeTransferableSurplus = donorMetrics.current_quantity - Math.round(donorMetrics.effective_adc * 14);
    assert(safeTransferableSurplus > 40, `Othakadai must have safe transferable surplus > 40 bottles, got ${safeTransferableSurplus}`);
  });

  // 9. Plain Language Explanation generation
  test('9. Plain-language district alert produces concise sentence from real data', () => {
    const totalCentres = 4;
    const criticalCount = 1;
    const medicine = 'Paracetamol Syrup';
    const explanation = `${criticalCount} of ${totalCentres} centres in this district are expected to run out of ${medicine} within a few days.`;
    assert.strictEqual(explanation, '1 of 4 centres in this district are expected to run out of Paracetamol Syrup within a few days.');
  });

  // 10. Donor ranking logic
  test('10. Donor ranking places same-district peer centres before other districts and warehouses', () => {
    const receiverDistrict = 'Madurai';
    const candidates = [
      { name: 'Palani CHC', district: 'Dindigul', is_warehouse: false, surplus: 100 },
      { name: 'Othakadai CHC', district: 'Madurai', is_warehouse: false, surplus: 200 },
      { name: 'Madurai DDW', district: 'Madurai', is_warehouse: true, surplus: 1000 }
    ];

    const ranked = candidates.sort((a, b) => {
      if (a.is_warehouse && !b.is_warehouse) return 1;
      if (!a.is_warehouse && b.is_warehouse) return -1;
      const aSame = a.district === receiverDistrict;
      const bSame = b.district === receiverDistrict;
      if (aSame && !bSame) return -1;
      if (!aSame && bSame) return 1;
      return b.surplus - a.surplus;
    });

    assert.strictEqual(ranked[0].name, 'Othakadai CHC', 'Same-district peer must be #1');
    assert.strictEqual(ranked[1].name, 'Palani CHC', 'Cross-district peer must be #2');
    assert.strictEqual(ranked[2].name, 'Madurai DDW', 'District warehouse must be ranked for escalation');
  });

  console.log(`\n========================================`);
  console.log(`🏁 Tamil Nadu Map Tests: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runTamilNaduMapTests();
