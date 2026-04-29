const express = require('express');
const redis = require('./db/redis');

const app = express();
app.use(express.json());

const authRoutes = require('./routes/auth.routes');
app.use('/auth', authRoutes);

const heartbeatRoutes = require('./routes/heartbeat.routes');
app.use('/heartbeat', heartbeatRoutes);

const rateLimit = require('./middleware/rateLimit');
app.use(rateLimit);

const slotService = require('./services/slot.service');

// init test team
app.get('/init-team', async (req, res) => {
  await slotService.initSlots('team1', 2);
  res.json({ ok: true });
});

// join team
app.post('/join-team', async (req, res) => {
  const success = await slotService.claimSlot('team1');

  if (!success) {
    return res.status(400).json({ error: 'Team full' });
  }

  res.json({ ok: true });
});

const messageRoutes = require('./routes/messages.routes');
app.use('/teams', messageRoutes);

const { requireAuth } = require('./middleware/auth');

app.get('/protected', requireAuth, (req, res) => {
  res.json({
    message: 'You are authenticated',
    user: req.user
  });
});

const PORT = process.env.PORT || 3000;

async function start() {
  await redis.connect();

  app.get('/health', async (req, res) => {
    try {
      const ok = await redis.verifyConnection();
      res.json({ redis: ok ? 'ok' : 'failed' });
    } catch (err) {
      res.status(500).json({ redis: 'error' });
    }
  });

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

start();

