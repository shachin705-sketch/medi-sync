const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { calculateMedicineStockMetrics } = require('../services/stockService');

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

    // Get active alert count
    const alertsCount = db.prepare(`
      SELECT COUNT(id) as active_alerts
      FROM alerts
      WHERE phc_id = ? AND status IN ('new', 'acknowledged')
    `).get(phc.id);

    return {
      ...phc,
      total_medicines: counts.total_medicines || 0,
      stockouts_count: counts.stockouts_count || 0,
      active_alerts: alertsCount.active_alerts || 0
    };
  });

  res.json(enriched);
});

// GET single PHC by id
router.get('/:id', (req, res) => {
  const phc = db.prepare('SELECT * FROM phcs WHERE id = ?').get(req.params.id);
  if (!phc) {
    return res.status(404).json({ error: 'PHC not found' });
  }

  // Get staff users at this PHC
  const staff = db.prepare('SELECT id, name, email, role, phone FROM users WHERE phc_id = ?').all(phc.id);

  res.json({ ...phc, staff });
});

module.exports = router;
