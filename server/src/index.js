// server/src/index.js
//
// Express server entry point.

const cors = require('cors');
const express = require('express');
require('dotenv').config({ path: '../.env' });

const redis = require('./db/redis');
const mongo = require('./db/mongo');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// === Rate limiter (applies to all routes) ===
const rateLimit = require('./middleware/rateLimit');
app.use(rateLimit);

// === Routes ===
const authRoutes = require('./routes/auth.routes');
const heartbeatRoutes = require('./routes/heartbeat.routes');
const messageRoutes = require('./routes/messages.routes');
const matchRoutes = require('./routes/matches.routes');
const teamRoutes = require('./routes/teams.routes');
const analyticsRoutes = require('./routes/analytics.routes');

app.use('/auth', authRoutes);
app.use('/heartbeat', heartbeatRoutes);
app.use('/teams', messageRoutes);     // mounts /teams/:id/messages
app.use('/teams', matchRoutes);       // mounts /teams/:id/matches
app.use('/teams', teamRoutes);
app.use('/analytics', analyticsRoutes);

// === Health check ===
// Pings each datastore so a single endpoint tells us if the stack is healthy.
app.get('/health', async (req, res) => {
  try {
    const [redisOk, mongoOk] = await Promise.all([
      redis.verifyConnection(),
      mongo.verifyConnection(),
    ]);
    const allOk = redisOk && mongoOk;
    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ok' : 'degraded',
      redis: redisOk ? 'ok' : 'failed',
      mongo: mongoOk ? 'ok' : 'failed',
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/', (req, res) => {
  res.json({ name: 'SynergyHack API', version: '0.4.0' });
});

// === Graceful shutdown ===
// Closes connections cleanly on SIGTERM/SIGINT so containers and
// `Ctrl+C` don't leave dangling sockets on the database side.
async function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down...`);
  try {
    await mongo.close();
  } catch (e) {
    console.error('Error closing Mongo:', e.message);
  }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// === Start ===
async function start() {
  try {
    await mongo.connect();
    console.log('Connected to MongoDB');

    await redis.connect();
    console.log('Connected to Redis');

    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
