const express = require('express');
const cors = require('cors');

const redis = require('./db/redis');
const authRoutes = require('./routes/auth.routes');
const messageRoutes = require('./routes/messages.routes');
const heartbeatRoutes = require('./routes/heartbeat.routes');

const { requireAuth } = require('./middleware/auth');
const rateLimit = require('./middleware/rateLimit');

const app = express();

// ✅ CORS FIX (VERY IMPORTANT)
app.use(cors());

// middlewares
app.use(express.json());
app.use(rateLimit);

// routes
app.use('/auth', authRoutes);
app.use('/teams', messageRoutes);
app.use('/heartbeat', heartbeatRoutes);

// basic route
app.get('/', (req, res) => {
  res.send('API is running 🚀');
});

// health check
app.get('/health', async (req, res) => {
  try {
    const ok = await redis.verifyConnection();
    res.json({ redis: ok ? 'ok' : 'failed' });
  } catch {
    res.status(500).json({ redis: 'error' });
  }
});

// protected test route
app.get('/protected', requireAuth, (req, res) => {
  res.json({
    message: 'You are authenticated',
    user: req.user
  });
});

// start server
const PORT = process.env.PORT || 3000;

async function start() {
  await redis.connect();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

start();