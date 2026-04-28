const express = require('express');
const matchService = require('../services/match.service');
const { requireAuth } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// GET /teams/:id/matches
router.get('/:id/matches', requireAuth, async (req, res) => {
  try {
    const matches = await matchService.findMatches(req.params.id);
    const hydrated = await matchService.hydrateMatches(matches);
    res.json(hydrated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /teams/:teamId/matches/:candidateId/explain
router.get('/:teamId/matches/:candidateId/explain', requireAuth, async (req, res) => {
  const explanation = await matchService.matchExplanation(
    req.params.candidateId,
    req.params.teamId
  );
  res.json(explanation);
});

module.exports = router;
