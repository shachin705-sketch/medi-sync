require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Import Database and ensure initialization
require('./src/db/database');

// Import Routes
const authRoutes = require('./src/routes/authRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const centresRoutes = require('./src/routes/centresRoutes');
const inventoryRoutes = require('./src/routes/inventoryRoutes');
const batchesRoutes = require('./src/routes/batchesRoutes');
const medicinesRoutes = require('./src/routes/medicinesRoutes');
const phcsRoutes = require('./src/routes/phcsRoutes');
const stockRoutes = require('./src/routes/stockRoutes');
const nearbyRoutes = require('./src/routes/nearbyRoutes');
const transfersRoutes = require('./src/routes/transfersRoutes');
const analyticsRoutes = require('./src/routes/analyticsRoutes');
const settingsRoutes = require('./src/routes/settingsRoutes');
const indentsRoutes = require('./src/routes/indentsRoutes');
const alertsRoutes = require('./src/routes/alertsRoutes');
const aiRoutes = require('./src/routes/aiRoutes');
const reportsRoutes = require('./src/routes/reportsRoutes');
const publicRoutes = require('./src/routes/publicRoutes');
const auditRoutes = require('./src/routes/auditRoutes');
const billingRoutes = require('./src/routes/billingRoutes');
const districtsRoutes = require('./src/routes/districtsRoutes');
const automationRoutes = require('./src/routes/automationRoutes');
const { startAutomationEngine } = require('./src/services/automationEngine');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'VelocityRx + Block Exchange Backend API',
    tagline: 'Predict Shortages. Share Safely. Deliver Faster.',
    district: 'Tamil Nadu Health System',
    timestamp: new Date().toISOString()
  });
});

// REST API Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/centres', centresRoutes);
app.use('/api/districts', districtsRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/batches', batchesRoutes);
app.use('/api/transfers', transfersRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/medicines', medicinesRoutes);
app.use('/api/phcs', phcsRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/nearby-stock', nearbyRoutes);
app.use('/api/indents', indentsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/system', auditRoutes);

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 MediSync PHC Backend running at http://localhost:${PORT}`);
    console.log(`🏥 Tamil Nadu PHC Medicine Stock Monitoring & Redistribution Service online.`);
    // Start background automation engine
    startAutomationEngine(30000);
  });
}

module.exports = app;
