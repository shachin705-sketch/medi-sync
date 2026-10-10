const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { calculateMedicineStockMetrics, recordStockEntry } = require('../services/stockService');
const { logAudit } = require('../services/auditService');

/**
 * GET /api/inventory
 * Comprehensive inventory list with days of cover, filters, and batch status
 */
router.get('/', (req, res) => {
  const { centre_id, medicine_id, status, search } = req.query;
  try {
    let sql = `
      SELECT cs.*, 
             m.name as medicine_name, m.generic_name, m.category, m.form, m.strength, m.unit, m.cold_chain_flag, m.critical_flag,
             p.name as centre_name, p.code as centre_code
      FROM current_stock cs
      JOIN medicines m ON cs.medicine_id = m.id
      JOIN phcs p ON cs.phc_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (centre_id) {
      sql += ' AND cs.phc_id = ?';
      params.push(centre_id);
    }
    if (medicine_id) {
      sql += ' AND cs.medicine_id = ?';
      params.push(medicine_id);
    }
    if (search) {
      sql += ' AND (LOWER(m.name) LIKE ? OR LOWER(m.generic_name) LIKE ? OR LOWER(cs.batch_number) LIKE ?)';
      const s = `%${search.toLowerCase()}%`;
      params.push(s, s, s);
    }

    sql += ' ORDER BY p.name ASC, m.name ASC';
    const rows = db.prepare(sql).all(...params);

    const enriched = rows.map((r) => {
      const metrics = calculateMedicineStockMetrics(r.phc_id, r.medicine_id);
      const usage = metrics ? metrics.effective_adc : 5;
      const daysOfCover = usage > 0 ? Math.round(r.quantity / usage) : 999;
      const safetyReserve = Math.round(usage * 14);

      let itemStatus = 'healthy';
      if (daysOfCover <= 3) itemStatus = 'critical';
      else if (daysOfCover <= 8) itemStatus = 'warning';

      return {
        id: r.id,
        phc_id: r.phc_id,
        centre_name: r.centre_name,
        centre_code: r.centre_code,
        medicine_id: r.medicine_id,
        medicine_name: r.medicine_name,
        generic_name: r.generic_name,
        category: r.category,
        form: r.form,
        strength: r.strength,
        unit: r.unit,
        cold_chain_flag: Boolean(r.cold_chain_flag),
        critical_flag: Boolean(r.critical_flag),
        usable_quantity: r.quantity,
        average_daily_usage: usage,
        days_of_cover: daysOfCover,
        safety_reserve: safetyReserve,
        batch_number: r.batch_number || 'TN-BATCH-STD',
        expiry_date: r.expiry_date || '2027-12-31',
        last_updated: r.last_updated,
        status: itemStatus
      };
    });

    if (status && status !== 'all') {
      return res.json(enriched.filter((item) => item.status === status));
    }

    res.json(enriched);
  } catch (err) {
    console.error('Error fetching inventory:', err);
    res.status(500).json({ error: 'Failed to fetch inventory records', details: err.message });
  }
});

const {
  recordOpeningStock,
  recordStockAdjustment,
  getStockMovements,
  processSyncQueue,
  reconcileConflict
} = require('../services/stockMovementService');

/**
 * POST /api/inventory/sync-queue
 * Synchronize batch of offline operations with idempotency and conflict detection
 */
router.post('/sync-queue', (req, res) => {
  try {
    const { queue } = req.body;
    const result = processSyncQueue(queue);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to process sync queue', details: err.message });
  }
});

/**
 * POST /api/inventory/reconcile-conflict
 * Safely reconcile detected concurrency conflict
 */
router.post('/reconcile-conflict', (req, res) => {
  try {
    const result = reconcileConflict(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/inventory/opening-stock
 * Add initial / opening stock with all 15 required fields, FEFO validation, and movement logging
 */
router.post('/opening-stock', (req, res) => {
  try {
    const result = recordOpeningStock(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/inventory/adjust
 * Audited stock correction or write-off
 */
router.post('/adjust', (req, res) => {
  try {
    const result = recordStockAdjustment(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/inventory/movements
 * Full auditable stock movements ledger
 */
router.get('/movements', (req, res) => {
  try {
    const { phc_id, medicine_id, batch_number, movement_type, search, limit } = req.query;
    const movements = getStockMovements({ phc_id, medicine_id, batch_number, movement_type, search, limit });
    res.json(movements);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stock movements', details: err.message });
  }
});

/**
 * GET /api/inventory/batches
 * Batch breakdown with FEFO expiry days
 */
router.get('/batches', (req, res) => {
  try {
    const { phc_id, medicine_id } = req.query;
    let sql = `
      SELECT cbs.*, m.name as medicine_name, m.generic_name, m.unit,
             p.name as centre_name, p.code as centre_code,
             CAST((julianday(cbs.expiry_date) - julianday('now')) AS INTEGER) as days_to_expiry
      FROM centre_batch_stock cbs
      JOIN medicines m ON cbs.medicine_id = m.id
      JOIN phcs p ON cbs.phc_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (phc_id) {
      sql += ' AND cbs.phc_id = ?';
      params.push(phc_id);
    }
    if (medicine_id) {
      sql += ' AND cbs.medicine_id = ?';
      params.push(medicine_id);
    }
    sql += ' ORDER BY cbs.expiry_date ASC, cbs.quantity DESC';
    const rows = db.prepare(sql).all(...params);

    const enriched = rows.map(b => ({
      ...b,
      is_expired: b.days_to_expiry <= 0,
      is_near_expiry: b.days_to_expiry > 0 && b.days_to_expiry <= 90
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch batches', details: err.message });
  }
});

/**
 * GET /api/inventory/:id
 * Single inventory item details with movement history
 */
router.get('/:id', (req, res) => {
  try {
    const item = db.prepare(`
      SELECT cs.*, 
             m.name as medicine_name, m.generic_name, m.category, m.unit, m.form, m.strength,
             p.name as centre_name, p.code as centre_code
      FROM current_stock cs
      JOIN medicines m ON cs.medicine_id = m.id
      JOIN phcs p ON cs.phc_id = p.id
      WHERE cs.id = ?
    `).get(req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }

    const movements = db.prepare(`
      SELECT * FROM stock_entries
      WHERE phc_id = ? AND medicine_id = ?
      ORDER BY entry_date DESC
      LIMIT 20
    `).all(item.phc_id, item.medicine_id);

    res.json({
      ...item,
      movements
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch inventory record', details: err.message });
  }
});

/**
 * POST /api/inventory
 * Create inventory item
 */
router.post('/', (req, res) => {
  const { phc_id, medicine_id, quantity, batch_number, expiry_date } = req.body;
  if (!phc_id || !medicine_id || quantity === undefined) {
    return res.status(400).json({ error: 'Centre ID, medicine ID, and quantity are required' });
  }

  const id = `cs-${phc_id}-${medicine_id}`;
  try {
    db.prepare(`
      INSERT INTO current_stock (id, phc_id, medicine_id, quantity, batch_number, expiry_date, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(phc_id, medicine_id) DO UPDATE SET
        quantity = excluded.quantity,
        batch_number = COALESCE(excluded.batch_number, current_stock.batch_number),
        expiry_date = COALESCE(excluded.expiry_date, current_stock.expiry_date),
        last_updated = datetime('now')
    `).run(id, phc_id, medicine_id, Number(quantity), batch_number, expiry_date);

    res.status(201).json({ id, message: 'Inventory item recorded successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record inventory', details: err.message });
  }
});

/**
 * PATCH /api/inventory/:id
 * Update quantity and batch
 */
router.patch('/:id', (req, res) => {
  const { quantity, batch_number, expiry_date } = req.body;
  try {
    db.prepare(`
      UPDATE current_stock SET
        quantity = COALESCE(?, quantity),
        batch_number = COALESCE(?, batch_number),
        expiry_date = COALESCE(?, expiry_date),
        last_updated = datetime('now')
      WHERE id = ?
    `).run(quantity !== undefined ? Number(quantity) : null, batch_number, expiry_date, req.params.id);

    res.json({ message: 'Inventory record updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update inventory', details: err.message });
  }
});

/**
 * POST /api/inventory/:id/receipts
 * Record stock receipts (atomically increments quantity)
 */
router.post('/:id/receipts', (req, res) => {
  const { received_quantity, batch_number, expiry_date, notes = 'Stock receipt recorded' } = req.body;
  const qty = Number(received_quantity);
  if (!qty || qty <= 0) {
    return res.status(400).json({ error: 'Valid received quantity greater than 0 is required' });
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    const item = db.prepare('SELECT * FROM current_stock WHERE id = ?').get(req.params.id);
    if (!item) {
      throw new Error('Inventory record not found');
    }

    const opening = item.quantity;
    const closing = opening + qty;
    const dateStr = new Date().toISOString().split('T')[0];

    db.prepare(`
      UPDATE current_stock SET 
        quantity = ?, 
        batch_number = COALESCE(?, batch_number),
        expiry_date = COALESCE(?, expiry_date),
        last_updated = datetime('now')
      WHERE id = ?
    `).run(closing, batch_number, expiry_date, req.params.id);

    db.prepare(`
      INSERT INTO stock_entries (id, phc_id, medicine_id, entry_date, opening_stock, received_quantity, dispensed_quantity, closing_stock, batch_number, expiry_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `).run(`se-rcpt-${Date.now()}`, item.phc_id, item.medicine_id, dateStr, opening, qty, closing, batch_number || item.batch_number, expiry_date || item.expiry_date, notes);

    db.exec('COMMIT;');
    res.json({ message: 'Stock receipt verified and added', new_balance: closing });
  } catch (err) {
    db.exec('ROLLBACK;');
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/inventory/:id/issues
 * Record stock dispensation/consumption (atomically decrements quantity with negative stock prevention)
 */
router.post('/:id/issues', (req, res) => {
  const { dispensed_quantity, notes = 'Daily patient dispensation' } = req.body;
  const qty = Number(dispensed_quantity);
  if (!qty || qty <= 0) {
    return res.status(400).json({ error: 'Valid dispensed quantity greater than 0 is required' });
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    const item = db.prepare('SELECT * FROM current_stock WHERE id = ?').get(req.params.id);
    if (!item) {
      throw new Error('Inventory record not found');
    }

    if (item.quantity < qty) {
      throw new Error(`Cannot issue ${qty} units. Current stock is only ${item.quantity} units (negative stock prevented).`);
    }

    const opening = item.quantity;
    const closing = opening - qty;
    const dateStr = new Date().toISOString().split('T')[0];

    db.prepare(`
      UPDATE current_stock SET quantity = ?, last_updated = datetime('now')
      WHERE id = ?
    `).run(closing, req.params.id);

    db.prepare(`
      INSERT INTO stock_entries (id, phc_id, medicine_id, entry_date, opening_stock, received_quantity, dispensed_quantity, closing_stock, batch_number, expiry_date, notes)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `).run(`se-issue-${Date.now()}`, item.phc_id, item.medicine_id, dateStr, opening, qty, closing, item.batch_number, item.expiry_date, notes);

    db.exec('COMMIT;');
    res.json({ message: 'Stock issue recorded', new_balance: closing });
  } catch (err) {
    db.exec('ROLLBACK;');
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/inventory/:id/movements
 * Get audit movement log for inventory item
 */
router.get('/:id/movements', (req, res) => {
  try {
    const item = db.prepare('SELECT phc_id, medicine_id FROM current_stock WHERE id = ?').get(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }

    const movements = db.prepare(`
      SELECT * FROM stock_entries
      WHERE phc_id = ? AND medicine_id = ?
      ORDER BY entry_date DESC, created_at DESC
      LIMIT 30
    `).all(item.phc_id, item.medicine_id);

    res.json(movements);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch movements', details: err.message });
  }
});

module.exports = router;
