const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db } = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'medisync-phc-chengalpattu-secret-key-2026';

function login(email, password) {
  const user = db.prepare(`
    SELECT u.*, p.name as phc_name, p.block as phc_block, p.district as phc_district
    FROM users u
    LEFT JOIN phcs p ON u.phc_id = p.id
    WHERE LOWER(u.email) = LOWER(?)
  `).get(email);

  if (!user) {
    return { error: 'Invalid email or password' };
  }

  const isValid = bcrypt.compareSync(password, user.password_hash);
  if (!isValid) {
    return { error: 'Invalid email or password' };
  }

  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phc_id: user.phc_id,
    phc_name: user.phc_name,
    phc_block: user.phc_block,
    phc_district: user.phc_district,
    phone: user.phone
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

  return {
    user: payload,
    token
  };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Express Middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
}

module.exports = {
  login,
  verifyToken,
  requireAuth,
  requireRole,
  JWT_SECRET
};
