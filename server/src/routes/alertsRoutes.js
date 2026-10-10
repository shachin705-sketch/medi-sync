const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { requireAuth } = require('../services/authService');
const { logAudit } = require('../services/auditService');

// GET alerts
router.get('/', (req, res) => {
  const { phc, status, severity, alert_type } = req.query;
  let sql = `
    SELECT a.*, 
           m.name as medicine_name, m.generic_name, m.unit, m.critical_flag, m.cold_chain_flag,
           p.name as phc_name, p.block, p.phone
    FROM alerts a
    JOIN medicines m ON a.medicine_id = m.id
    JOIN phcs p ON a.phc_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (phc) {
    sql += ` AND a.phc_id = ?`;
    params.push(phc);
  }
  if (status) {
    sql += ` AND a.status = ?`;
    params.push(status);
  }
  if (severity) {
    sql += ` AND a.severity = ?`;
    params.push(severity);
  }
  if (alert_type) {
    sql += ` AND a.alert_type = ?`;
    params.push(alert_type);
  }

  sql += ` ORDER BY CASE a.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, a.created_at DESC`;
  const alerts = db.prepare(sql).all(...params);
  res.json(alerts);
});

// PATCH update alert status (acknowledged or resolved)
router.patch('/:id', requireAuth, (req, res) => {
  const { status } = req.body;
  if (!['acknowledged', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'Status must be acknowledged or resolved' });
  }

  let sql = `UPDATE alerts SET status = ?`;
  const params = [status];

  if (status === 'acknowledged') {
    sql += `, acknowledged_by = ?, acknowledged_at = datetime('now')`;
    params.push(req.user.id);
  } else if (status === 'resolved') {
    sql += `, resolved_at = datetime('now')`;
  }

  sql += ` WHERE id = ?`;
  params.push(req.params.id);

  db.prepare(sql).run(...params);

  logAudit({
    userId: req.user.id,
    action: 'UPDATE_ALERT_STATUS',
    entityType: 'alerts',
    entityId: req.params.id,
    details: `Updated alert status to ${status}`
  });

  res.json({ success: true, id: req.params.id, status });
});

module.exports = router;
