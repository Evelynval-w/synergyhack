const express = require('express');
const { signToken } = require('../services/auth.service');
const sessionService = require('../services/session.service');

const router = express.Router();

// TEMP fake login (no DB yet)
router.post('/login', async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'username required' });
  }

  const user = { id: username, username };

  const token = signToken(user);

  await sessionService.createSession(token, user.id);

  res.json({ token });
});

// logout
router.post('/logout', async (req, res) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'no token' });

  const token = header.split(' ')[1];
  await sessionService.destroySession(token);

  res.json({ ok: true });
});

module.exports = router;