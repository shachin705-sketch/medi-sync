const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { MIN_CENTRES_PER_DISTRICT, MAX_CENTRES_PER_DISTRICT } = require('../config/districtCentresConfig');
const { calculateMedicineStockMetrics } = require('../services/stockService');

// GET district centre limits and availability
router.get('/district-limits', (req, res) => {
  try {
    const districts = db.prepare(`
      SELECT DISTINCT district 
      FROM phcs 
      WHERE district IS NOT NULL AND district != ''
      ORDER BY district ASC
    `).all().map(d => d.district);

    const limits = districts.map(district => {
      const activeCount = db.prepare(`
        SELECT COUNT(*) as count 
        FROM phcs 
        WHERE district = ? AND (is_warehouse = 0 OR is_warehouse IS NULL)
          AND id NOT LIKE 'phc-test%' AND id NOT LIKE 'phc-offline%'
      `).get(district).count;

      return {
        district,
        current_count: activeCount,
        min_allowed: MIN_CENTRES_PER_DISTRICT,
        max_allowed: MAX_CENTRES_PER_DISTRICT,
        is_full: activeCount >= MAX_CENTRES_PER_DISTRICT,
        can_remove: activeCount > MIN_CENTRES_PER_DISTRICT,
        label: `${district}: ${activeCount} of ${MAX_CENTRES_PER_DISTRICT} centres`
      };
    });

    res.json(limits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all PHCs
router.get('/', (req, res) => {
  const { block, district } = req.query;
  let sql = 'SELECT * FROM phcs WHERE 1=1';
  const params = [];

  if (block) {
    sql += ' AND LOWER(block) = LOWER(?)';
    params.push(block);
  }
  if (district) {
    sql += ' AND LOWER(district) = LOWER(?)';
    params.push(district);
  }

  sql += ' ORDER BY block ASC, name ASC';
  const phcs = db.prepare(sql).all(...params);

  // Augment with stock summary stats
  const enriched = phcs.map(phc => {
    const counts = db.prepare(`
      SELECT 
        COUNT(id) as total_medicines,
        SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) as stockouts_count
      FROM current_stock
      WHERE phc_id = ?
    `).get(phc.id);

    const alertsCount = db.prepare(`
      SELECT COUNT(id) as active_alerts
      FROM alerts
      WHERE phc_id = ? AND status IN ('new', 'acknowledged')
    `).get(phc.id);

    return {
      ...phc,
      total_medicines: counts ? counts.total_medicines || 0 : 0,
      stockouts_count: counts ? counts.stockouts_count || 0 : 0,
      active_alerts: alertsCount ? alertsCount.active_alerts || 0 : 0
    };
  });

  res.json(enriched);
});

// POST create new health centre with strict 4-centre ceiling
router.post('/', (req, res) => {
  try {
    const { id, name, code, block, district, latitude, longitude, population_served, phone, facility_type } = req.body;

    if (!district || !district.trim()) {
      return res.status(400).json({ error: 'District is required (District not set)' });
    }

    const currentCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM phcs 
      WHERE district = ? AND (is_warehouse = 0 OR is_warehouse IS NULL)
        AND id NOT LIKE 'phc-test%' AND id NOT LIKE 'phc-offline%'
    `).get(district).count;

    if (currentCount >= MAX_CENTRES_PER_DISTRICT) {
      return res.status(400).json({
        error: `A district can have at most ${MAX_CENTRES_PER_DISTRICT} centres`,
        message: `${district} already has ${currentCount} centres.`
      });
    }

    const newId = id || `phc-${district.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString().slice(-4)}`;
    const newCode = code || `C${Date.now().toString().slice(-4)}`;

    db.prepare(`
      INSERT INTO phcs (id, name, code, block, district, latitude, longitude, population_served, phone, facility_type, is_warehouse)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      newId, name, newCode, block || `${district} Block`, district,
      latitude || 10.5, longitude || 78.5, population_served || 35000,
      phone || '+91 94431 22000', facility_type || 'PHC'
    );

    res.status(201).json({ success: true, id: newId, message: 'Centre created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update health centre with move validation
router.put('/:id', (req, res) => {
  try {
    const centreId = req.params.id;
    const existing = db.prepare('SELECT * FROM phcs WHERE id = ?').get(centreId);
    if (!existing) {
      return res.status(404).json({ error: 'PHC not found' });
    }

    const { name, block, district, latitude, longitude, phone, facility_type } = req.body;

    // If moving to a different district
    if (district && district !== existing.district) {
      const sourceCount = db.prepare(`
        SELECT COUNT(*) as count 
        FROM phcs 
        WHERE district = ? AND id != ? AND (is_warehouse = 0 OR is_warehouse IS NULL)
          AND id NOT LIKE 'phc-test%' AND id NOT LIKE 'phc-offline%'
      `).get(existing.district, centreId).count;

      if (sourceCount < MIN_CENTRES_PER_DISTRICT) {
        return res.status(400).json({
          error: `A district needs at least ${MIN_CENTRES_PER_DISTRICT} centres`,
          message: `Moving this centre would leave ${existing.district} with ${sourceCount} centres.`
        });
      }

      const targetCount = db.prepare(`
        SELECT COUNT(*) as count 
        FROM phcs 
        WHERE district = ? AND (is_warehouse = 0 OR is_warehouse IS NULL)
          AND id NOT LIKE 'phc-test%' AND id NOT LIKE 'phc-offline%'
      `).get(district).count;

      if (targetCount >= MAX_CENTRES_PER_DISTRICT) {
        return res.status(400).json({
          error: `A district can have at most ${MAX_CENTRES_PER_DISTRICT} centres`,
          message: `${district} already has ${targetCount} centres.`
        });
      }
    }

    db.prepare(`
      UPDATE phcs 
      SET name = COALESCE(?, name),
          block = COALESCE(?, block),
          district = COALESCE(?, district),
          latitude = COALESCE(?, latitude),
          longitude = COALESCE(?, longitude),
          phone = COALESCE(?, phone),
          facility_type = COALESCE(?, facility_type)
      WHERE id = ?
    `).run(name, block, district, latitude, longitude, phone, facility_type, centreId);

    res.json({ success: true, message: 'Centre updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE delete health centre with minimum-3 floor validation
router.delete('/:id', (req, res) => {
  try {
    const centreId = req.params.id;
    const existing = db.prepare('SELECT * FROM phcs WHERE id = ?').get(centreId);
    if (!existing) {
      return res.status(404).json({ error: 'PHC not found' });
    }

    const remainingCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM phcs 
      WHERE district = ? AND id != ? AND (is_warehouse = 0 OR is_warehouse IS NULL)
        AND id NOT LIKE 'phc-test%' AND id NOT LIKE 'phc-offline%'
    `).get(existing.district, centreId).count;

    if (remainingCount < MIN_CENTRES_PER_DISTRICT) {
      return res.status(400).json({
        error: `A district needs at least ${MIN_CENTRES_PER_DISTRICT} centres`,
        message: `Cannot delete centre. District ${existing.district} must have at least ${MIN_CENTRES_PER_DISTRICT} active centres (currently has ${remainingCount + 1}).`
      });
    }

    db.prepare('DELETE FROM phcs WHERE id = ?').run(centreId);
    res.json({ success: true, message: 'Centre deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single PHC by id
router.get('/:id', (req, res) => {
  const phc = db.prepare('SELECT * FROM phcs WHERE id = ?').get(req.params.id);
  if (!phc) {
    return res.status(404).json({ error: 'PHC not found' });
  }

  const staff = db.prepare('SELECT id, name, email, role, phone FROM users WHERE phc_id = ?').all(phc.id);

  res.json({ ...phc, staff });
});

module.exports = router;
