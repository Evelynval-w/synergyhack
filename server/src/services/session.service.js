const { client } = require('../db/redis');

const TTL = 60 * 60 * 24; // 24 hours

function key(token) {
  return `session:${token}`;
}

async function createSession(token, userId) {
  await client.set(key(token), userId, { EX: TTL });
}

async function validateSession(token) {
  return await client.get(key(token));
}

async function destroySession(token) {
  await client.del(key(token));
}

module.exports = {
  createSession,
  validateSession,
  destroySession
};
