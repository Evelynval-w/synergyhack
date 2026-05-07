// server/src/routes/analytics.routes.js
//
// Public-facing endpoints for the two MongoDB aggregation pipelines.
// Both require authentication — anyone running these is presumably a
// logged-in user looking at the analytics page.

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const analytics = require('../services/analytics.service');

const router = express.Router();

/**
 * GET /analytics/skill-demand?topN=5
 *
 * Returns top-N skills demanded per role across all past projects.
 * Optional `topN` query param (default 5, capped at 20).
 */
router.get('/skill-demand', requireAuth, async (req, res) => {
  try {
    const topN = Math.min(parseInt(req.query.topN, 10) || 5, 20);
    const data = await analytics.skillDemandByRole({ topN });
    res.json(data);
  } catch (err) {
    console.error('skill-demand failed:', err);
    res.status(500).json({ error: 'Aggregation failed' });
  }
});

/**
 * GET /analytics/team-patterns
 *
 * Returns the role-combination patterns most often seen on highly-rated
 * past projects. No query params — the analysis is fixed: rating > 4,
 * top 10 patterns.
 */
router.get('/team-patterns', requireAuth, async (req, res) => {
  try {
    const data = await analytics.successfulTeamPatterns();
    res.json(data);
  } catch (err) {
    console.error('team-patterns failed:', err);
    res.status(500).json({ error: 'Aggregation failed' });
  }
});

module.exports = router;
