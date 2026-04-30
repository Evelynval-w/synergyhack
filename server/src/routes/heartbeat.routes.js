const express = require('express');
const { client } = require('../db/redis');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /heartbeat
router.post('/', requireAuth, async (req, res) => {
  const userId = req.user.sub;

  await client.sAdd('online:users', userId);
  await client.set(`presence:${userId}`, '1', { EX: 60 });

  res.json({ ok: true });
});

module.exports = router;

router.get('/online', async (req, res) => {
  const users = await client.sMembers('online:users');
  res.json(users);
});