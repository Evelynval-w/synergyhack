// server/src/routes/myRequests.routes.js
//
// User-facing endpoint for "my own request history".
// Mounted at /me in index.js so URL is GET /me/requests.
//
// Separated from teamRequests.routes because the resource hierarchy
// is different: requests-by-me is a user-scoped query, not a
// team-scoped query.

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const requestService = require('../services/teamRequest.service');

const router = express.Router();

router.get('/requests', requireAuth, async (req, res) => {
  try {
    const requests = await requestService.listForUser(req.user.sub);
    res.json(requests);
  } catch (err) {
    console.error('GET /me/requests failed:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
