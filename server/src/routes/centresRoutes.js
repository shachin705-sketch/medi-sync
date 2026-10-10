const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { calculateMedicineStockMetrics } = require('../services/stockService');

/**
 * GET /api/centres
 * Returns 10 sample centres in Chengalpattu Block with full metadata and data freshness indicators
 */
router.get('/', (req, res) => {
  try {
    const centres = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM current_stock cs WHERE cs.phc_id = p.id) as inventory_items_count,
        (SELECT MAX(last_updated) FROM current_stock cs WHERE cs.phc_id = p.id) as last_inventory_update
      FROM phcs p
      ORDER BY p.name ASC
    `).all();

    // Map each centre with calculated stock status and data freshness indicator
    const enriched = centres.map((centre, idx) => {
      const isCHC = centre.name.toLowerCase().includes('upgraded') || centre.name.toLowerCase().includes('community') || idx === 1;
      const type = isCHC ? 'CHC' : 'PHC';

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

      // Data freshness check: Centre D or F marked as Stale Inventory (> 24h) for demonstration
      const isStale = centre.id.includes('kovalam') || centre.id.includes('alathur-stale');
      const overallStatus = isStale ? 'grey' : redCount > 0 ? 'red' : yellowCount > 0 ? 'yellow' : 'green';

      return {
        id: centre.id,
        name: centre.name,
        code: centre.code,
        type,
        block: centre.block,
        district: centre.district,
        latitude: centre.latitude,
        longitude: centre.longitude,
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

    res.json({
      ...centre,
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
 * Add a new health centre
 */
router.post('/', (req, res) => {
  const { name, code, block, district, latitude, longitude, population_served, phone, contact_person, address, cold_chain_equipped = 1 } = req.body;
  if (!name || !code || !latitude || !longitude) {
    return res.status(400).json({ error: 'Name, code, latitude, and longitude are required' });
  }

  const id = `phc-${code.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  try {
    db.prepare(`
      INSERT INTO phcs (id, name, code, block, district, latitude, longitude, population_served, phone, cold_chain_equipped, contact_person, address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, code, block || 'Chengalpattu Block', district || 'Chengalpattu', latitude, longitude, population_served || 35000, phone || '+91 94431 00000', cold_chain_equipped ? 1 : 0, contact_person || 'Medical Officer', address || 'Block HQ');

    res.status(201).json({ id, message: 'Centre created successfully' });
  } catch (err) {
    res.status(400).json({ error: 'Failed to create centre', details: err.message });
  }
});

/**
 * PATCH /api/centres/:id
 * Update centre details
 */
router.patch('/:id', (req, res) => {
  const { name, phone, contact_person, address, cold_chain_equipped } = req.body;
  try {
    db.prepare(`
      UPDATE phcs SET 
        name = COALESCE(?, name),
        phone = COALESCE(?, phone),
        contact_person = COALESCE(?, contact_person),
        address = COALESCE(?, address),
        cold_chain_equipped = COALESCE(?, cold_chain_equipped)
      WHERE id = ?
    `).run(name, phone, contact_person, address, cold_chain_equipped !== undefined ? (cold_chain_equipped ? 1 : 0) : null, req.params.id);

    res.json({ message: 'Centre updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update centre', details: err.message });
  }
});

/**
 * DELETE /api/centres/:id
 * Delete centre
 */
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM phcs WHERE id = ?').run(req.params.id);
    res.json({ message: 'Centre deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete centre', details: err.message });
  }
});

module.exports = router;
