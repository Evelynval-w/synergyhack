// server/src/routes/users.routes.js
//
// User read + write endpoints.
//   GET   /users/search?q=...  — full-text search via Mongo text index
//   GET   /users               — paginated browse list
//   GET   /users/me            — own profile (includes email)
//   PATCH /users/me            — update own profile
//   GET   /users/:id           — public profile (no email)
//
// IMPORTANT: route order matters. /search and /me must come BEFORE
// /:id, otherwise Express matches /:id first and the literal paths
// never get hit.

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const users = require('../services/users.service');

const router = express.Router();

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
 * GET /users/me
 * Own profile, including email — for pre-filling the editor.
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await users.getOwnProfile(req.user.sub);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('GET /users/me failed:', err);
    res.status(500).json({ error: 'Profile failed' });
  }
});

/**
 * PATCH /users/me
 * Updates the authed user's own profile. Only EDITABLE_FIELDS in
 * users.service are honored; everything else is silently dropped
 * so a malicious client can't sneak in password_hash, _id, etc.
 */
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const updated = await users.updateOwnProfile(req.user.sub, req.body || {});
    res.json(updated);
  } catch (err) {
    if (err.code === 'VALIDATION') {
      return res.status(400).json({
        error: 'Validation failed',
        fields: err.fields,
      });
    }
    console.error('PATCH /users/me failed:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

/**
 * GET /users/:id
 * Public profile — does NOT include email.
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const user = await users.getUserProfile(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('user profile failed:', err);
    res.status(500).json({ error: 'Profile failed' });
  }
});

module.exports = router;
