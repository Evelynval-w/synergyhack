// server/src/index.js
//
// Express server entry point.

const cors = require('cors');
const express = require('express');
require('dotenv').config({ path: '../.env' });

const redis = require('./db/redis');

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

app.use('/auth', authRoutes);
app.use('/heartbeat', heartbeatRoutes);
app.use('/teams', messageRoutes);     // mounts /teams/:id/messages
app.use('/teams', matchRoutes);       // mounts /teams/:id/matches
app.use('/teams', teamRoutes);

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
async function start() {
  try {
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
