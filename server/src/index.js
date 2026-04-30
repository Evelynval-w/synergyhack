// server/src/index.js
//
// Express server entry point.

const express = require('express');
require('dotenv').config({ path: '../.env' });

const redis = require('./db/redis');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// === Rate limiter (applies to all routes) ===
const rateLimit = require('./middleware/rateLimit');
app.use(rateLimit);

// === Routes ===
const authRoutes = require('./routes/auth.routes');
const heartbeatRoutes = require('./routes/heartbeat.routes');
const messageRoutes = require('./routes/messages.routes');
const matchRoutes = require('./routes/matches.routes');

app.use('/auth', authRoutes);
app.use('/heartbeat', heartbeatRoutes);
app.use('/teams', messageRoutes);     // mounts /teams/:id/messages
app.use('/teams', matchRoutes);       // mounts /teams/:id/matches

// === Health check ===
app.get('/health', async (req, res) => {
  try {
    const redisOk = await redis.verifyConnection();
    res.json({ status: 'ok', redis: redisOk ? 'ok' : 'failed' });
  } catch (err) {
    res.status(500).json({ status: 'degraded', error: err.message });
  }
});

app.get('/', (req, res) => {
  res.json({ name: 'SynergyHack API', version: '0.3.0' });
});

// === Start ===
const mongo = require('./db/mongo');

async function start() {
  try {
    await redis.connect();
    console.log('Connected to Redis');
    await mongo.connect();
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}


start();
