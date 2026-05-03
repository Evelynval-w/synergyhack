// server/src/routes/users.routes.js
//
// User read endpoints.
//   GET /users/search?q=...  — full-text search via Mongo text index
//   GET /users?skip=&limit=  — paginated browse list
//   GET /users/:id           — single user profile + past projects

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const users = require('../services/users.service');

const router = express.Router();

/**
 * GET /users/search?q=...&limit=20
 * Full-text search across user bios, roles, and skill names.
 * NOTE: must be defined BEFORE /:id, otherwise Express matches /:id first.
 */
router.get('/search', requireAuth, async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Missing or empty query parameter `q`' });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const results = await users.searchUsers(q, { limit });
    res.json({ query: q, count: results.length, results });
  } catch (err) {
    console.error('user search failed:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /users?skip=0&limit=20
 * Paginated list of users for the browse view. Sorted alphabetically.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const data = await users.listUsers({
      skip: req.query.skip,
      limit: req.query.limit,
    });
    res.json(data);
  } catch (err) {
    console.error('user list failed:', err);
    res.status(500).json({ error: 'List failed' });
  }
});

/**
 * GET /users/:id
 * Returns a single user's public profile + the past projects they
 * worked on (via a Mongo $lookup), ready for the UserProfile page.
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const user = await users.getUserProfile(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('user profile failed:', err);
    res.status(500).json({ error: 'Profile failed' });
  }
});

module.exports = router;
