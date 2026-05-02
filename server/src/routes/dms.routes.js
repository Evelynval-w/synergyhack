// server/src/routes/dms.routes.js
//
// 1:1 DM routes. Mounted at /dms in index.js, so the full paths become
// /dms/:peerId/messages. The "from" user is always the authenticated
// user (req.user.sub); the "to" user is the URL param. The chat service
// internally builds a sorted-key Redis channel so the same conversation
// is reachable by both participants.

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const chat = require('../services/chat.service');

const router = express.Router({ mergeParams: true });

/**
 * POST /dms/:peerId/messages
 * Body: { body: string }
 * 201 → { id: streamId }
 * 400 → empty body, or DM-to-self
 * 500 → unexpected error
 */
router.post('/:peerId/messages', requireAuth, async (req, res) => {
  try {
    const id = await chat.sendDM(
      req.user.sub,
      req.params.peerId,
      req.body.body
    );
    res.status(201).json({ id });
  } catch (e) {
    if (e.message === 'Empty message' || e.message === 'Cannot DM yourself') {
      return res.status(400).json({ error: e.message });
    }
    console.error('sendDM failed:', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /dms/:peerId/messages?since=<streamId>
 * 200 → [{ id, from, to, body, ts }, ...]
 *
 * Returns the conversation between the authenticated user and peerId,
 * regardless of which user sent which message. The sorted-key channel
 * design means both participants see the same stream.
 */
router.get('/:peerId/messages', requireAuth, async (req, res) => {
  const since = req.query.since || '0';
  const msgs = await chat.getDMs(req.user.sub, req.params.peerId, since);
  res.json(msgs);
});

module.exports = router;
