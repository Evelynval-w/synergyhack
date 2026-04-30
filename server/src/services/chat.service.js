const { client } = require('../db/redis');

function key(teamId) {
  return `chat:team:${teamId}`;
}

// send a message → XADD
async function sendMessage(teamId, userId, body) {
  if (!body || !body.trim()) throw new Error('Empty message');

  const id = await client.xAdd(key(teamId), '*', {
    from: userId,
    body: body.trim()
  });

  return id; // e.g. "1714...-0"
}

// get messages since last id → XRANGE
async function getMessages(teamId, sinceId = '0') {
  try {
    const start = sinceId === '0' ? '0' : `(${sinceId}`;
    const res = await client.xRange(key(teamId), start, '+');

    return res.map(m => ({
      id: m.id,
      from: m.message.from,
      body: m.message.body,
      ts: Number(m.id.split('-')[0])
    }));

  } catch (err) {
    console.error('Invalid stream ID:', sinceId);
    return []; // prevent crash
  }
}

module.exports = { sendMessage, getMessages };