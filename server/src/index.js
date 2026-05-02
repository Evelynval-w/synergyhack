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
const userRoutes = require('./routes/users.routes');
const hackathonRoutes = require('./routes/hackathons.routes');
const analyticsRoutes = require('./routes/analytics.routes');
app.use('/auth', authRoutes);
app.use('/heartbeat', heartbeatRoutes);
app.use('/teams', messageRoutes);
app.use('/teams', matchRoutes);
app.use('/teams', teamRoutes);
app.use('/users', userRoutes);
app.use('/hackathons', hackathonRoutes);
app.use('/analytics', analyticsRoutes);
// === Health check ===
app.get('/health', async (req, res) => {
  try {
    const redisOk = await redis.verifyConnection();
    await mongo.verifyConnection();
    res.json({ status: 'ok', redis: redisOk ? 'ok' : 'failed', mongo: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'degraded', error: err.message });
  }
});
app.get('/', (req, res) => {
  res.json({ name: 'SynergyHack API', version: '0.3.0' });
});
// === Global error handler ===
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});
// === Start ===
async function start() {
  try {
    await redis.connect();
    console.log('Connected to Redis');
    await mongo.connect();
    await mongo.ensureIndexes();
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