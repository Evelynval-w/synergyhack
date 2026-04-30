const { createClient } = require('redis');
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
 
const URL = process.env.REDIS_URL || 'redis://localhost:6379';
 
const client = createClient({ url: URL });
 
client.on('error', err => {
  console.error('Redis client error:', err.message);
});
 
let _connected = false;
 
async function connect() {
  if (!_connected) {
    await client.connect();
    _connected = true;
  }
  return client;
}
 
async function verifyConnection() {
  const c = await connect();
  const pong = await c.ping();
  return pong === 'PONG';
}
 
async function close() {
  if (_connected) {
    await client.quit();
    _connected = false;
  }
}
 
module.exports = { client, connect, verifyConnection, close };
