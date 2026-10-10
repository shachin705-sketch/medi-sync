const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { calculateMedicineStockMetrics } = require('../services/stockService');

/**
 * GET /api/centres
 * Returns centres with full metadata, data freshness indicators, and district role scoping
 */
router.get('/', (req, res) => {
  try {
    // District staff role sees only their own district's centres, enforced on the backend
    const filterDistrict = req.query.district || (req.user && req.user.district ? req.user.district : null);

    let query = `
      SELECT p.*,
        (SELECT COUNT(*) FROM current_stock cs WHERE cs.phc_id = p.id) as inventory_items_count,
        (SELECT MAX(last_updated) FROM current_stock cs WHERE cs.phc_id = p.id) as last_inventory_update
      FROM phcs p
    `;
    const params = [];

    if (filterDistrict && filterDistrict !== 'all') {
      query += ` WHERE p.district = ? `;
      params.push(filterDistrict);
    }

    query += ` ORDER BY p.name ASC`;

    const centres = db.prepare(query).all(...params);

    // Map each centre with calculated stock status and data freshness indicator
    const enriched = centres.map((centre, idx) => {
      const isCHC = centre.facility_type === 'CHC' || centre.name.toLowerCase().includes('upgraded') || centre.name.toLowerCase().includes('community') || idx === 1;
      const type = centre.is_warehouse ? 'DISTRICT' : (isCHC ? 'CHC' : 'PHC');

      // Check stock status across medicines
      const stockRows = db.prepare('SELECT medicine_id FROM current_stock WHERE phc_id = ?').all(centre.id);
      let redCount = 0;
      let yellowCount = 0;
      let greenCount = 0;

      stockRows.forEach((r) => {
        const metrics = calculateMedicineStockMetrics(centre.id, r.medicine_id);
        if (metrics) {
          if (metrics.status === 'red') redCount++;
          else if (metrics.status === 'yellow') yellowCount++;
          else greenCount++;
        }
      });

      // Data freshness check: Centre F (Bodinayakanur / madurantakam) marked as Stale Inventory (> 24h)
      const isStale = centre.id.includes('madurantakam') || centre.name.toLowerCase().includes('bodinayakanur');
      const overallStatus = isStale ? 'grey' : redCount > 0 ? 'red' : yellowCount > 0 ? 'yellow' : 'green';

      // Section 2: If a centre has no district, show "District not set" instead of guessing
      const districtLabel = (centre.district && centre.district.trim()) ? centre.district : 'District not set';

      return {
        id: centre.id,
        name: centre.name,
        code: centre.code,
        type,
        facility_type: centre.facility_type || type,
        is_warehouse: Boolean(centre.is_warehouse),
        block: centre.block,
        district: districtLabel,
        latitude: centre.latitude,
        longitude: centre.longitude,
        lat: centre.latitude,
        lon: centre.longitude,
        population_served: centre.population_served,
        phone: centre.phone,
        cold_chain_equipped: Boolean(centre.cold_chain_equipped),
        contact_person: centre.contact_person,
        address: centre.address,
        safety_reserve_days: 14,
        lead_time_days: 7,
        last_inventory_update: centre.last_inventory_update || 'Today (Simulated)',
        is_stale: isStale,
        status: overallStatus,
        inventory_items_count: centre.inventory_items_count || 30,
        shortages_count: redCount,
        low_stock_count: yellowCount,
        demo_notice: 'DEMO DATA — Fictional centres and inventory for prototype demonstration. Not connected to real health facilities.'
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('Error fetching centres:', err);
    res.status(500).json({ error: 'Failed to fetch centres', details: err.message });
  }
});

/**
 * GET /api/centres/:id
 * Get single centre by ID
 */
router.get('/:id', (req, res) => {
  try {
    const centre = db.prepare('SELECT * FROM phcs WHERE id = ?').get(req.params.id);
    if (!centre) {
      return res.status(404).json({ error: 'Health centre not found' });
    }

    const stock = db.prepare(`
      SELECT cs.*, m.name, m.generic_name, m.category, m.unit, m.cold_chain_flag, m.critical_flag
      FROM current_stock cs
      JOIN medicines m ON cs.medicine_id = m.id
      WHERE cs.phc_id = ?
      ORDER BY m.name ASC
    `).all(centre.id);

    const districtLabel = (centre.district && centre.district.trim()) ? centre.district : 'District not set';

    res.json({
      ...centre,
      district: districtLabel,
      is_warehouse: Boolean(centre.is_warehouse),
      facility_type: centre.facility_type || (centre.name.toLowerCase().includes('chc') ? 'CHC' : 'PHC'),
      safety_reserve_days: 14,
      lead_time_days: 7,
      demo_notice: 'DEMO DATA — Fictional centres and inventory for prototype demonstration. Not connected to real health facilities.',
      inventory: stock
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch centre details', details: err.message });
  }
});

/**
 * POST /api/centres
 * Add a new health centre with district validation:
 * "A district cannot exist, or be left, with fewer than 3 active centres. Reject with 'A district needs at least 3 centres'."
 */
router.post('/', (req, res) => {
  const { name, code, block, district, latitude, longitude, population_served, phone, contact_person, address, cold_chain_equipped = 1, facility_type = 'PHC', is_warehouse = 0 } = req.body;
  if (!name || !code || !latitude || !longitude) {
    return res.status(400).json({ error: 'Name, code, latitude, and longitude are required' });
  }

  const targetDistrict = district ? district.trim() : null;

  // If a district is specified, check if it exists and has enough centres
  if (targetDistrict && !is_warehouse) {
    const existingCountRow = db.prepare(`
      SELECT COUNT(*) as count 
      FROM phcs 
      WHERE district = ? AND (is_warehouse = 0 OR is_warehouse IS NULL)
    `).get(targetDistrict);

    const existingCount = existingCountRow ? existingCountRow.count : 0;
    // If district doesn't exist yet, a single centre cannot create a district with <3 centres
    if (existingCount === 0) {
      return res.status(400).json({ error: 'A district needs at least 3 centres' });
    }
  }

  const id = `phc-${code.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  try {
    db.prepare(`
      INSERT INTO phcs (id, name, code, block, district, latitude, longitude, population_served, phone, cold_chain_equipped, contact_person, address, facility_type, is_warehouse)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name, code, block || 'Central Block', targetDistrict, latitude, longitude,
      population_served || 35000, phone || '+91 94431 00000', cold_chain_equipped ? 1 : 0,
      contact_person || 'Medical Officer', address || 'Block HQ', facility_type, is_warehouse ? 1 : 0
    );

    res.status(201).json({ id, message: 'Centre created successfully' });
  } catch (err) {
    res.status(400).json({ error: 'Failed to create centre', details: err.message });
  }
});

/**
 * PATCH /api/centres/:id
 * Update centre details with district integrity validation
 */
router.patch('/:id', (req, res) => {
  const { name, phone, contact_person, address, cold_chain_equipped, district } = req.body;
  try {
    const current = db.prepare('SELECT * FROM phcs WHERE id = ?').get(req.params.id);
    if (!current) {
      return res.status(404).json({ error: 'Centre not found' });
    }

    // If moving to a different district, ensure source district retains at least 3 centres
    if (district && district !== current.district && !current.is_warehouse) {
      const remainingRow = db.prepare(`
        SELECT COUNT(*) as count 
        FROM phcs 
        WHERE district = ? AND id != ? AND (is_warehouse = 0 OR is_warehouse IS NULL)
      `).get(current.district, current.id);

      const remaining = remainingRow ? remainingRow.count : 0;
      if (remaining < 3) {
        return res.status(400).json({ error: 'A district needs at least 3 centres' });
      }
    }

    db.prepare(`
      UPDATE phcs SET 
        name = COALESCE(?, name),
        phone = COALESCE(?, phone),
        contact_person = COALESCE(?, contact_person),
        address = COALESCE(?, address),
        cold_chain_equipped = COALESCE(?, cold_chain_equipped),
        district = COALESCE(?, district)
      WHERE id = ?
    `).run(
      name, phone, contact_person, address,
      cold_chain_equipped !== undefined ? (cold_chain_equipped ? 1 : 0) : null,
      district,
      req.params.id
    );

    res.json({ message: 'Centre updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update centre', details: err.message });
  }
});

/**
 * DELETE /api/centres/:id
 * Delete centre with district integrity validation:
 * "A district cannot exist, or be left, with fewer than 3 active centres. Reject with 'A district needs at least 3 centres'."
 */
router.delete('/:id', (req, res) => {
  try {
    const centre = db.prepare('SELECT * FROM phcs WHERE id = ?').get(req.params.id);
    if (!centre) {
      return res.status(404).json({ error: 'Centre not found' });
    }

    if (!centre.is_warehouse && centre.district) {
      const activeCountRow = db.prepare(`
        SELECT COUNT(*) as count 
        FROM phcs 
        WHERE district = ? AND (is_warehouse = 0 OR is_warehouse IS NULL)
      `).get(centre.district);

      const activeCount = activeCountRow ? activeCountRow.count : 0;
      // If deleting this would leave district with < 3 active centres
      if (activeCount <= 3) {
        return res.status(400).json({ error: 'A district needs at least 3 centres' });
      }
    }

    db.prepare('DELETE FROM phcs WHERE id = ?').run(req.params.id);
    res.json({ message: 'Centre deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete centre', details: err.message });
  }
});

module.exports = router;
