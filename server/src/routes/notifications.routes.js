// server/src/routes/notifications.routes.js
//
//   GET  /notifications/summary     — unread counts + join events
//   POST /notifications/read        — mark join-request notifications read
//   POST /notifications/chat-read   — advance Redis chat read cursor

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const notifications = require('../services/notifications.service');

const router = express.Router();

router.get('/summary', requireAuth, async (req, res) => {
  try {
    const summary = await notifications.getSummary(req.user.sub);
    res.json(summary);
  } catch (err) {
    console.error('GET /notifications/summary failed:', err);
    res.status(500).json({ error: 'Summary failed' });
  }
});

router.post('/read', requireAuth, async (req, res) => {
  try {
    const ids = req.body?.ids || null;
    const result = await notifications.markNotificationsRead(req.user.sub, ids);
    res.json(result);
  } catch (err) {
    console.error('POST /notifications/read failed:', err);
    res.status(500).json({ error: 'Mark read failed' });
  }
});

router.post('/chat-read', requireAuth, async (req, res) => {
  try {
    const result = await notifications.markChatRead(req.user.sub, req.body || {});
    res.json(result);
  } catch (err) {
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({ error: err.message });
    }
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ error: err.message });
    }
    console.error('POST /notifications/chat-read failed:', err);
    res.status(500).json({ error: 'Chat read failed' });
  }
});

module.exports = router;
