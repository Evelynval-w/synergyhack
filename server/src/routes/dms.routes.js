// server/src/routes/dms.routes.js
//
// 1:1 DM routes. Mounted at /dms in index.js.
//   GET  /dms                    — inbox (list of my conversations)
//   POST /dms/:peerId/messages   — send a DM
//   GET  /dms/:peerId/messages   — read the conversation with peerId
//
// The "from" user is always the authenticated user (req.user.sub).
// chat.service builds a sorted-key Redis channel internally so the
// same conversation is reachable from either participant's perspective.

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const chat = require('../services/chat.service');
const dmsService = require('../services/dms.service');

const router = express.Router({ mergeParams: true });

/**
 * GET /dms
 * Inbox — one entry per distinct DM channel I'm part of, with the
 * peer's user info and the last message. Sorted by recency.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const threads = await dmsService.listUserThreads(req.user.sub);
    res.json(threads);
  } catch (err) {
    console.error('list DMs failed:', err);
    res.status(500).json({ error: 'Inbox failed' });
  }
});

/**
 * POST /dms/:peerId/messages
 * Body: { body: string }
 */
router.post('/:peerId/messages', requireAuth, async (req, res) => {
  try {
    const id = await chat.sendDM(req.user.sub, req.params.peerId, req.body.body);
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
 * Returns the conversation between the authenticated user and peerId.
 * Both participants see the same stream because the channel uses a
 * sorted-key (chat:dm:{sortedA}:{sortedB}).
 */
router.get('/:peerId/messages', requireAuth, async (req, res) => {
  const since = req.query.since || '0';
  const msgs = await chat.getDMs(req.user.sub, req.params.peerId, since);
  res.json(msgs);
});

module.exports = router;
