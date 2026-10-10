const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { getPhcDaysOfStock, recordStockEntry, calculateMedicineStockMetrics } = require('../services/stockService');
const { requireAuth } = require('../services/authService');

// GET Days of Stock for a PHC (Supports filtering, search, status)
router.get('/days-left', (req, res) => {
  const { phc, status, category, criticalOnly, coldChainOnly, search } = req.query;
  const phcId = phc || 'phc-thiruporur';

  const results = getPhcDaysOfStock(phcId, {
    status,
    category,
    criticalOnly: criticalOnly === 'true',
    coldChainOnly: coldChainOnly === 'true',
    search
  });

  res.json(results);
});

// GET stock for specific PHC
router.get('/phc/:id', (req, res) => {
  const { id } = req.params;
  const stock = db.prepare(`
    SELECT cs.*, m.name, m.generic_name, m.category, m.form, m.strength, m.unit, m.cold_chain_flag, m.critical_flag
    FROM current_stock cs
    JOIN medicines m ON cs.medicine_id = m.id
    WHERE cs.phc_id = ?
    ORDER BY m.name ASC
  `).all(id);

  res.json(stock);
});

// GET 90-day stock history for charts
router.get('/history/:phcId/:medicineId', (req, res) => {
  const { phcId, medicineId } = req.params;
  const history = db.prepare(`
    SELECT entry_date, opening_stock, received_quantity, dispensed_quantity, closing_stock, batch_number, expiry_date, notes
    FROM stock_entries
    WHERE phc_id = ? AND medicine_id = ?
    ORDER BY entry_date ASC
  `).all(phcId, medicineId);

  const metrics = calculateMedicineStockMetrics(phcId, medicineId);

  res.json({
    metrics,
    history
  });
});

// POST record daily stock entry (Pharmacist or Medical Officer)
router.post('/entry', requireAuth, (req, res) => {
  const {
    phc_id,
    medicine_id,
    entry_date,
    opening_stock,
    received_quantity = 0,
    dispensed_quantity = 0,
    batch_number,
    expiry_date,
    notes = ''
  } = req.body;

  if (!phc_id || !medicine_id || opening_stock === undefined) {
    return res.status(400).json({ error: 'Missing required stock entry parameters' });
  }

  try {
    const result = recordStockEntry({
      phcId: phc_id,
      medicineId: medicine_id,
      entryDate: entry_date,
      openingStock: Number(opening_stock),
      receivedQuantity: Number(received_quantity),
      dispensedQuantity: Number(dispensed_quantity),
      batchNumber: batch_number,
      expiryDate: expiry_date,
      userId: req.user.id,
      notes
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('Stock entry record error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
