const express = require('express');
const { requireAuth } = require('../middleware/auth');
const chat = require('../services/chat.service');

const router = express.Router({ mergeParams: true });

// POST /teams/:id/messages
router.post('/:id/messages', requireAuth, async (req, res) => {
  try {
    const id = await chat.sendMessage(
      req.params.id,
      req.user.sub,
      req.body.body
    );
    res.status(201).json({ id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /teams/:id/messages?since=<id>
router.get('/:id/messages', requireAuth, async (req, res) => {
  const since = req.query.since || '0';
  const msgs = await chat.getMessages(req.params.id, since);
  res.json(msgs);
});

module.exports = router;