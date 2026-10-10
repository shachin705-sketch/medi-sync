const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { requireAuth, requireRole } = require('../services/authService');
const { logAudit } = require('../services/auditService');

// GET all medicines
router.get('/', (req, res) => {
  const { category, search, criticalOnly, coldChainOnly } = req.query;
  let sql = 'SELECT * FROM medicines WHERE 1=1';
  const params = [];

  if (category) {
    sql += ' AND LOWER(category) = LOWER(?)';
    params.push(category);
  }
  if (criticalOnly === 'true') {
    sql += ' AND critical_flag = 1';
  }
  if (coldChainOnly === 'true') {
    sql += ' AND cold_chain_flag = 1';
  }
  if (search) {
    sql += ' AND (LOWER(name) LIKE ? OR LOWER(generic_name) LIKE ?)';
    params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
  }

  sql += ' ORDER BY name ASC';
  const medicines = db.prepare(sql).all(...params);
  res.json(medicines);
});

// GET single medicine
router.get('/:id', (req, res) => {
  const medicine = db.prepare('SELECT * FROM medicines WHERE id = ?').get(req.params.id);
  if (!medicine) {
    return res.status(404).json({ error: 'Medicine not found' });
  }
  res.json(medicine);
});

// POST new medicine (District Admin only)
router.post('/', requireAuth, requireRole(['district_admin']), (req, res) => {
  const {
    name,
    generic_name,
    category,
    form,
    strength,
    unit,
    cold_chain_flag = 0,
    critical_flag = 0,
    standard_buffer_days = 30,
    critical_buffer_days = 21,
    seasonal_disease = '',
    description = ''
  } = req.body;

  if (!name || !generic_name || !category || !form || !unit) {
    return res.status(400).json({ error: 'Missing required medicine fields' });
  }

  const id = `med-${Date.now()}`;
  const stmt = db.prepare(`
    INSERT INTO medicines (id, name, generic_name, category, form, strength, unit, cold_chain_flag, critical_flag, standard_buffer_days, critical_buffer_days, seasonal_disease, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, name, generic_name, category, form, strength || '', unit, cold_chain_flag ? 1 : 0, critical_flag ? 1 : 0, standard_buffer_days, critical_buffer_days, seasonal_disease, description);

  logAudit({
    userId: req.user.id,
    action: 'CREATE_MEDICINE',
    entityType: 'medicines',
    entityId: id,
    details: `Added new medicine ${name}`
  });

  res.status(201).json({ id, name, generic_name, category, form, strength, unit });
});

module.exports = router;
