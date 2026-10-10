const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { requireAuth } = require('../services/authService');
const { logAudit } = require('../services/auditService');

// GET emergency indents
router.get('/', (req, res) => {
  const { phc, status } = req.query;
  let sql = `
    SELECT i.*, 
           m.name as medicine_name, m.generic_name, m.unit, m.cold_chain_flag, m.critical_flag,
           p.name as phc_name, p.block, p.phone,
           u.name as creator_name
    FROM emergency_indents i
    JOIN medicines m ON i.medicine_id = m.id
    JOIN phcs p ON i.phc_id = p.id
    JOIN users u ON i.created_by = u.id
    WHERE 1=1
  `;
  const params = [];

  if (phc) {
    sql += ` AND i.phc_id = ?`;
    params.push(phc);
  }
  if (status) {
    sql += ` AND i.status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY i.created_at DESC`;
  const indents = db.prepare(sql).all(...params);
  res.json(indents);
});

// POST submit new emergency indent
router.post('/', requireAuth, (req, res) => {
  const {
    phc_id,
    medicine_id,
    requested_quantity,
    reason,
    consumption_rate = null,
    notes = ''
  } = req.body;

  if (!phc_id || !medicine_id || !requested_quantity || !reason) {
    return res.status(400).json({ error: 'Missing required emergency indent parameters' });
  }

  const id = `ind-${Date.now()}`;
  const indentNumber = `IND-CGP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const stmt = db.prepare(`
    INSERT INTO emergency_indents (id, indent_number, phc_id, medicine_id, requested_quantity, reason, consumption_rate, status, created_by, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, datetime('now'))
  `);

  stmt.run(id, indentNumber, phc_id, medicine_id, Number(requested_quantity), reason, consumption_rate ? Number(consumption_rate) : null, req.user.id, notes);

  logAudit({
    userId: req.user.id,
    action: 'CREATE_EMERGENCY_INDENT',
    entityType: 'emergency_indents',
    entityId: id,
    details: `Created emergency indent ${indentNumber} for ${requested_quantity} units`
  });

  res.status(201).json({
    id,
    indent_number: indentNumber,
    status: 'submitted',
    message: 'Emergency Indent submitted to District Drug Warehouse.'
  });
});

// PATCH update indent status
router.patch('/:id/status', requireAuth, (req, res) => {
  const { status, delivery_expected, notes } = req.body;

  let updateSql = `UPDATE emergency_indents SET status = ?`;
  const params = [status];

  if (status === 'approved') {
    updateSql += `, approved_by = ?`;
    params.push(req.user.id);
  }
  if (delivery_expected) {
    updateSql += `, delivery_expected = ?`;
    params.push(delivery_expected);
  }
  if (notes) {
    updateSql += `, notes = COALESCE(notes, '') || ' | ' || ?`;
    params.push(notes);
  }

  updateSql += ` WHERE id = ?`;
  params.push(req.params.id);

  db.prepare(updateSql).run(...params);

  logAudit({
    userId: req.user.id,
    action: 'UPDATE_INDENT_STATUS',
    entityType: 'emergency_indents',
    entityId: req.params.id,
    details: `Updated emergency indent to ${status}`
  });

  res.json({ success: true, status });
});

module.exports = router;
