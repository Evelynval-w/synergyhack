// server/src/routes/messages.routes.js
//
// Team chat routes. Mounted at /teams in index.js, so the full paths
// become /teams/:id/messages.

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const chat = require('../services/chat.service');

const router = express.Router({ mergeParams: true });

/**
 * POST /teams/:id/messages
 * Body: { body: string }
 * 201 → { id: streamId }
 * 400 → empty body
 * 403 → not a team member (Neo4j check)
 * 500 → unexpected error
 */
router.post('/:id/messages', requireAuth, async (req, res) => {
  try {
    const id = await chat.sendTeamMessage(
      req.params.id,
      req.user.sub,
      req.body.body
    );
    res.status(201).json({ id });
  } catch (e) {
    if (e.message === 'Empty message') {
      return res.status(400).json({ error: e.message });
    }
    if (e.code === 'FORBIDDEN') {
      return res.status(403).json({ error: e.message });
    }
    console.error('sendTeamMessage failed:', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /teams/:id/messages?since=<streamId>
 * 200 → [{ id, from, body, ts }, ...]
 *
 * `since` is exclusive — pass the last seen stream id to get only
 * new messages. Default '0' returns all messages from the start of
 * the stream (capped at MAX_LEN by the stream itself).
 */
router.get('/:id/messages', requireAuth, async (req, res) => {
  const since = req.query.since || '0';
  const msgs = await chat.getTeamMessages(req.params.id, since);
  res.json(msgs);
});

module.exports = router;
