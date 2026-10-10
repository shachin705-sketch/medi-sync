const express = require('express');
const router = express.Router();
const { login, requireAuth } = require('../services/authService');
const { logAudit } = require('../services/auditService');

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const result = login(email, password);
  if (result.error) {
    return res.status(401).json({ error: result.error });
  }

  logAudit({
    userId: result.user.id,
    action: 'USER_LOGIN',
    entityType: 'users',
    entityId: result.user.id,
    details: `User logged in with role ${result.user.role}`
  });

  return res.json(result);
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
