// server/src/routes/analytics.routes.js

const express = require('express');
const analyticsService = require('../services/analytics.service');

const router = express.Router();

router.get('/skill-demand', async (req, res) => {
  try {
    const result = await analyticsService.skillDemandByRole();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/team-patterns', async (req, res) => {
  try {
    const result = await analyticsService.successfulTeamPatterns();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;