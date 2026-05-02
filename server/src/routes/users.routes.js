// server/src/routes/users.routes.js
//
// User read endpoints. /users/search is backed by the compound text
// index defined in scripts/seed-mongo.js.

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const users = require('../services/users.service');

const router = express.Router();

/**
 * GET /users/search?q=...&limit=20
 *
 * Full-text search across user bios, roles, and skill names. Returns
 * results ranked by Mongo's textScore (higher = better match), with the
 * score exposed in the response so the UI can render relevance.
 */
router.get('/search', requireAuth, async (req, res) => {
  try {
    const q = req.query.q;

    if (!q || !q.trim()) {
      return res.status(400).json({
        error: 'Missing or empty query parameter `q`',
      });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    const results = await users.searchUsers(q, { limit });

    res.json({
      query: q,
      count: results.length,
      results,
    });
  } catch (err) {
    console.error('user search failed:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
