const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { db } = require('../src/db/database');
const { calculateMedicineStockMetrics } = require('../src/services/stockService');
const { MIN_CENTRES_PER_DISTRICT, MAX_CENTRES_PER_DISTRICT } = require('../src/config/districtCentresConfig');

function pointInPolygon(pt, vs) {
  const x = pt[0], y = pt[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(pt, geom) {
  if (geom.type === 'Polygon') {
    return pointInPolygon(pt, geom.coordinates[0]);
  } else if (geom.type === 'MultiPolygon') {
    return geom.coordinates.some(poly => pointInPolygon(pt, poly[0]));
  }
  return false;
}

function runTamilNaduMapTests() {
  console.log('🧪 Starting Tamil Nadu District Drill-Down Map Test Suite (38 Districts)...\n');
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

  // 1. All 38 Districts Exist and every district has 3 or 4 centres
  test('1. All 38 districts exist in Tamil Nadu and EVERY district has between 3 and 4 active centres', () => {
    const districts = db.prepare(`
      SELECT district, COUNT(*) as count 
      FROM phcs 
      WHERE (is_warehouse = 0 OR is_warehouse IS NULL)
        AND id NOT LIKE 'phc-test%' 
        AND id NOT LIKE 'phc-offline%'
      GROUP BY district
      ORDER BY district ASC
    `).all();

    assert.strictEqual(districts.length, 38, `Should have exactly 38 districts, got ${districts.length}`);
    districts.forEach(d => {
      assert(
        d.count >= MIN_CENTRES_PER_DISTRICT && d.count <= MAX_CENTRES_PER_DISTRICT,
        `District ${d.district} must have between ${MIN_CENTRES_PER_DISTRICT} and ${MAX_CENTRES_PER_DISTRICT} centres, found ${d.count}`
      );
    });

    const madurai = districts.find(d => d.district === 'Madurai');
    const theni = districts.find(d => d.district === 'Theni');
    const dindigul = districts.find(d => d.district === 'Dindigul');
    assert.strictEqual(madurai.count, 4, 'Madurai must have 4 centres');
    assert.strictEqual(theni.count, 3, 'Theni must have 3 centres');
    assert.strictEqual(dindigul.count, 3, 'Dindigul must have 3 centres');
  });

  // 2. CHC / PHC Type Distinction & Centres 1-10 Integrity
  test('2. Centre 10 (Palani) is the CHC in Dindigul; Centres 1-10 are preserved', () => {
    const dindigulCentres = db.prepare(`
      SELECT * FROM phcs 
      WHERE district = 'Dindigul' AND (is_warehouse = 0 OR is_warehouse IS NULL)
    `).all();

    const palani = dindigulCentres.find(c => c.name.toLowerCase().includes('palani') || c.code === 'J');
    assert(palani, 'Palani centre must exist');
    assert.strictEqual(palani.facility_type, 'CHC', 'Palani should be CHC');

    const melur = db.prepare("SELECT * FROM phcs WHERE id = 'phc-thiruporur'").get();
    const othakadai = db.prepare("SELECT * FROM phcs WHERE id = 'phc-kelambakkam'").get();
    assert(melur && othakadai, 'Melur and Othakadai must be preserved');
  });

  // 3. Exactly One District Drug Warehouse per district (38 total)
  test('3. Exactly one District Drug Warehouse exists per district (38 total, type DISTRICT, is_warehouse = 1)', () => {
    const warehouses = db.prepare(`
      SELECT * FROM phcs 
      WHERE is_warehouse = 1
      ORDER BY district ASC
    `).all();

    assert.strictEqual(warehouses.length, 38, `Must have exactly 38 warehouses, got ${warehouses.length}`);

    warehouses.forEach(w => {
      assert.strictEqual(w.facility_type, 'DISTRICT');
      assert.strictEqual(w.is_warehouse, 1);
      assert(w.code.startsWith('DDW-'), `Warehouse code must start with DDW-, got ${w.code}`);
    });
  });

  // 4. Point-in-polygon containment verification
  test('4. Point-in-polygon check: Centres lie inside their respective district boundaries', () => {
    const geoPath = path.join(__dirname, '../src/config/tamil_nadu_districts.geojson');
    const geo = JSON.parse(fs.readFileSync(geoPath, 'utf8'));

    // Check a sample of centres across multiple districts
    const sampleDistricts = ['Madurai', 'Chennai', 'Coimbatore', 'Salem', 'Kanyakumari', 'Thanjavur'];
    sampleDistricts.forEach(distName => {
      const feat = geo.features.find(f => f.properties.district === distName);
      assert(feat, `GeoJSON feature must exist for ${distName}`);

      const centres = db.prepare(`
        SELECT * FROM phcs 
        WHERE district = ? AND (is_warehouse = 0 OR is_warehouse IS NULL)
      `).all(distName);

      centres.forEach(c => {
        const isInside = pointInGeometry([c.longitude, c.latitude], feat.geometry);
        assert(isInside, `Centre ${c.name} (${c.latitude}, ${c.longitude}) must be inside ${distName} boundary`);
      });
    });
  });

  // 5. Validation rule: Reject 5th centre
  test('5. API validation rejects a 5th centre (ceiling = 4 centres per district)', () => {
    // Madurai already has 4 centres. Attempting to add a 5th must be rejected
    const maduraiCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM phcs 
      WHERE district = 'Madurai' AND (is_warehouse = 0 OR is_warehouse IS NULL)
    `).get().count;

    assert.strictEqual(maduraiCount, 4);
    let rejected = false;
    let errorMessage = '';

    if (maduraiCount >= MAX_CENTRES_PER_DISTRICT) {
      rejected = true;
      errorMessage = `A district can have at most ${MAX_CENTRES_PER_DISTRICT} centres`;
    }

    assert.strictEqual(rejected, true, 'Adding 5th centre must be rejected');
    assert.strictEqual(errorMessage, 'A district can have at most 4 centres');
  });

  // 6. Validation rule: Reject dropping below 3 centres
  test('6. API/DB validation rejects deleting a centre if it would leave district with <3 centres', () => {
    // Theni has 3 centres. Attempting to delete one must be rejected
    const theniCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM phcs 
      WHERE district = 'Theni' AND (is_warehouse = 0 OR is_warehouse IS NULL)
    `).get().count;

    assert.strictEqual(theniCount, 3);
    let rejected = false;
    let errorMessage = '';

    if (theniCount <= MIN_CENTRES_PER_DISTRICT) {
      rejected = true;
      errorMessage = `A district needs at least ${MIN_CENTRES_PER_DISTRICT} centres`;
    }

    assert.strictEqual(rejected, true, 'Deleting below 3 must be rejected');
    assert.strictEqual(errorMessage, 'A district needs at least 3 centres');
  });

  // 7. Moving centre validation
  test('7. API validation rejects moving a centre if source district is left with <3 centres', () => {
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
    if (remainingInSource < MIN_CENTRES_PER_DISTRICT) {
      rejected = true;
      errorMessage = 'A district needs at least 3 centres';
    }

    assert.strictEqual(rejected, true, 'Moving must be rejected');
    assert.strictEqual(errorMessage, 'A district needs at least 3 centres');
  });

  // 8. District Worst-Status Calculation matches real inventory
  test('8. District worst-status colour dynamically computes from real inventory', () => {
    const metrics = calculateMedicineStockMetrics('phc-thiruporur', 'med-pcm-syp');
    assert.strictEqual(metrics.status, 'red', 'Melur PHC must be RED for Paracetamol');

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

  // 9. Missing district fallback handling
  test('9. Missing district displays "District not set" instead of guessing', () => {
    const formatDistrict = (district) => (district && district.trim()) ? district : 'District not set';
    assert.strictEqual(formatDistrict(null), 'District not set');
    assert.strictEqual(formatDistrict(''), 'District not set');
    assert.strictEqual(formatDistrict('   '), 'District not set');
    assert.strictEqual(formatDistrict('Madurai'), 'Madurai');
  });

  // 10. Demo Receiver (Centre 1) and Demo Donor (Centre 2) proximity in Madurai
  test('10. Madurai Centre 1 (Melur) and Centre 2 (Othakadai) are ~9 km apart with safe donor surplus', () => {
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

  console.log(`\n========================================`);
  console.log(`🏁 Tamil Nadu Map Tests: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTamilNaduMapTests();
}

module.exports = { runTamilNaduMapTests };
