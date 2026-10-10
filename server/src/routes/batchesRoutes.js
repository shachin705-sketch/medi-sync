const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

/**
 * GET /api/batches
 * List all batches ordered by expiry date (FEFO) with remaining days and status
 */
router.get('/', (req, res) => {
  const { medicine_id, status } = req.query;
  try {
    let sql = `
      SELECT b.*, m.name as medicine_name, m.generic_name, m.unit,
             CAST((julianday(b.expiry_date) - julianday('now')) AS INTEGER) as days_to_expiry,
             COALESCE((SELECT SUM(cs.quantity) FROM current_stock cs WHERE cs.medicine_id = b.medicine_id AND cs.batch_number = b.batch_number), 0) as current_quantity
      FROM batches b
      JOIN medicines m ON b.medicine_id = m.id
      WHERE 1=1
    `;
    const params = [];

    if (medicine_id) {
      sql += ' AND b.medicine_id = ?';
      params.push(medicine_id);
    }

    sql += ' ORDER BY b.expiry_date ASC';
    const rows = db.prepare(sql).all(...params);

    const enriched = rows.map((b) => {
      let fefoStatus = 'healthy';
      if (b.days_to_expiry <= 0) fefoStatus = 'expired';
      else if (b.days_to_expiry <= 90) fefoStatus = 'near_expiry';

      return {
        ...b,
        is_expired: b.days_to_expiry <= 0,
        is_near_expiry: b.days_to_expiry > 0 && b.days_to_expiry <= 90,
        fefo_status: fefoStatus
      };
    });

    if (status && status !== 'all') {
      return res.json(enriched.filter((b) => b.fefo_status === status));
    }

    res.json(enriched);
  } catch (err) {
    console.error('Error fetching batches:', err);
    res.status(500).json({ error: 'Failed to fetch batches', details: err.message });
  }
});

/**
 * POST /api/batches
 * Register batch
 */
router.post('/', (req, res) => {
  const { medicine_id, batch_number, expiry_date, manufacturer } = req.body;
  if (!medicine_id || !batch_number || !expiry_date) {
    return res.status(400).json({ error: 'Medicine ID, batch number, and expiry date are required' });
  }

  const id = `bch-${Date.now()}`;
  try {
    db.prepare(`
      INSERT INTO batches (id, medicine_id, batch_number, expiry_date, manufacturer)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, medicine_id, batch_number, expiry_date, manufacturer || 'TN Medical Services Corp (TNMSC)');

    res.status(201).json({ id, message: 'Batch registered successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create batch', details: err.message });
  }
});

/**
 * PATCH /api/batches/:id
 * Update batch details
 */
router.patch('/:id', (req, res) => {
  const { expiry_date, manufacturer } = req.body;
  try {
    db.prepare(`
      UPDATE batches SET
        expiry_date = COALESCE(?, expiry_date),
        manufacturer = COALESCE(?, manufacturer)
      WHERE id = ?
    `).run(expiry_date, manufacturer, req.params.id);

    res.json({ message: 'Batch updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update batch', details: err.message });
  }
});

module.exports = router;
