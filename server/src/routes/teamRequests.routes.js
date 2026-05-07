// server/src/routes/teamRequests.routes.js
//
// Join-request endpoints. Mounted at /teams in index.js so URLs are:
//   POST   /teams/:id/requests                  — create a request
//   GET    /teams/:id/requests                  — list pending (owner only)
//   POST   /teams/:id/requests/:reqId/accept    — accept (owner only)
//   POST   /teams/:id/requests/:reqId/reject    — reject (owner only)
//
// Plus user-facing:
//   GET    /me/requests                         — my own request history
// (mounted separately in index.js as /me)

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { db } = require('../db/mongo');
const requestService = require('../services/teamRequest.service');

const router = express.Router({ mergeParams: true });

/**
 * Helper: error responder that uses the structured RequestError
 * thrown by the service layer.
 */
function sendError(res, err) {
  if (err instanceof requestService.RequestError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error('teamRequests route error:', err);
  return res.status(500).json({ error: 'Internal error' });
}

/**
 * POST /teams/:id/requests
 * Body: { message?: string }
 * Creates a pending request from req.user.sub to team :id.
 */
router.post('/:id/requests', requireAuth, async (req, res) => {
  try {
    const doc = await requestService.createRequest({
      teamId: req.params.id,
      userId: req.user.sub,
      message: req.body?.message || '',
    });
    res.status(201).json(doc);
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * GET /teams/:id/requests
 * Returns pending requests for the team. Restricted to the team
 * creator.
 */
router.get('/:id/requests', requireAuth, async (req, res) => {
  try {
    const team = await db().collection('teams').findOne(
      { _id: req.params.id },
      { projection: { createdBy: 1 } }
    );
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (team.createdBy !== req.user.sub) {
      return res.status(403).json({ error: 'Only the team creator can view pending requests.' });
    }
    const requests = await requestService.listPendingForTeam(req.params.id);
    res.json(requests);
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * POST /teams/:id/requests/:reqId/accept
 * Owner only. Adds user to team and creates Neo4j edge.
 */
router.post('/:id/requests/:reqId/accept', requireAuth, async (req, res) => {
  try {
    const updated = await requestService.acceptRequest(req.params.reqId, req.user.sub);
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * POST /teams/:id/requests/:reqId/reject
 * Owner only. Marks request rejected, no Neo4j change.
 */
router.post('/:id/requests/:reqId/reject', requireAuth, async (req, res) => {
  try {
    const updated = await requestService.rejectRequest(req.params.reqId, req.user.sub);
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
