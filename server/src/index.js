const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: '../.env' });

const mongo = require('./db/mongo');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/users.routes');
const hackathonRoutes = require('./routes/hackathons.routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// === Health check ===
app.get('/health', async (req, res) => {
  try {
    await mongo.verifyConnection();
    res.json({ status: 'ok', mongo: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'degraded', error: err.message });
  }
});

app.get('/', (req, res) => {
  res.json({ name: 'SynergyHack API', version: '0.2.0' });
});

// Mount routes
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/hackathons', hackathonRoutes);

// === Start server ===
async function start() {
  try {
    await mongo.connect();
    console.log('Connected to MongoDB');
    app.listen(PORT, () => console.log(`Listening on :${PORT}`));
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();