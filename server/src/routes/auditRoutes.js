const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../services/authService');
const { getAuditLogs } = require('../services/auditService');
const { getRecentNotifications } = require('../services/notificationService');

// GET audit logs (Admin and Officers)
router.get('/logs', requireAuth, requireRole(['district_admin', 'block_officer', 'medical_officer']), (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const logs = getAuditLogs(limit);
  res.json(logs);
});

// GET recent mock SMS/WhatsApp notification dispatches
router.get('/notifications', requireAuth, (req, res) => {
  const limit = Number(req.query.limit) || 20;
  const dispatches = getRecentNotifications(limit);
  res.json(dispatches);
});

module.exports = router;
