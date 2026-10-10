const express = require('express');
const router = express.Router();
const {
  getMedicineForecast,
  detectAnomalies,
  getRedistributionRecommendations,
  getConsolidatedDeliveryRoutes,
  autoDraftEmergencyIndent,
  queryStaffChatbot,
  getSeasonalMultiplier
} = require('../services/aiEngine');

// GET time-series consumption forecast and run-out prediction
router.get('/forecast/:phc/:medicine', (req, res) => {
  const { phc, medicine } = req.params;
  const forecast = getMedicineForecast(phc, medicine);
  if (!forecast) {
    return res.status(404).json({ error: 'Medicine stock forecast not found' });
  }
  res.json(forecast);
});

// GET Z-score anomalies
router.get('/anomalies', (req, res) => {
  const { phc, medicine } = req.query;
  const anomalies = detectAnomalies(phc, medicine);
  res.json(anomalies);
});

// GET redistribution recommendations
router.get('/recommendations/redistribution', (req, res) => {
  const { phc } = req.query;
  const recommendations = getRedistributionRecommendations(phc);
  res.json(recommendations);
});

// GET consolidated multi-medicine delivery routes
router.get('/recommendations/consolidated-routes', (req, res) => {
  const { phc } = req.query;
  const routes = getConsolidatedDeliveryRoutes(phc);
  res.json(routes);
});

// GET auto-drafted emergency indent
router.get('/recommendations/auto-indent/:phc/:medicine', (req, res) => {
  const { phc, medicine } = req.params;
  const draft = autoDraftEmergencyIndent(phc, medicine);
  if (!draft) {
    return res.status(404).json({ error: 'Cannot generate draft indent' });
  }
  res.json(draft);
});

// GET seasonal disease impact table
router.get('/seasonal-context', (req, res) => {
  const currentMonth = new Date().getMonth() + 1;
  const categories = [
    { cat: 'Analgesics & Antipyretics', name: 'Paracetamol Pediatric Oral Suspension' },
    { cat: 'Antibiotics', name: 'Amoxicillin Oral Suspension' },
    { cat: 'Emergency & Antidotes', name: 'Anti-Snake Venom (ASV) Serum Polyvalent' },
    { cat: 'Maternal & Child Health', name: 'Oral Rehydration Salts (ORS) WHO Formula' },
    { cat: 'Respiratory', name: 'Salbutamol Metered Dose Inhaler' }
  ];

  const analysis = categories.map(c => ({
    category: c.cat,
    sample_medicine: c.name,
    ...getSeasonalMultiplier(c.cat, c.name, currentMonth)
  }));

  res.json({
    current_month: currentMonth,
    epidemiological_season: currentMonth >= 10 && currentMonth <= 12 ? 'Northeast Monsoon Peak Fever Season' : (currentMonth >= 4 && currentMonth <= 6 ? 'Summer Gastroenteritis Season' : 'Routine Baseline'),
    insights: analysis
  });
});

// POST staff chatbot assistant
router.post('/chatbot', (req, res) => {
  const { message, phc_id } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message query is required' });
  }

  const response = queryStaffChatbot(message, { phc_id });
  res.json(response);
});

module.exports = router;
