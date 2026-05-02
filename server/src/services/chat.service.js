// server/src/services/chat.service.js
//
// Real-time chat backed by Redis Streams.
//
// Polyglot persistence: the stream is the live truth (XADD on send,
// XRANGE on read), capped at ~500 entries with MAXLEN trimming so it
// can't grow unbounded. Every message is also mirrored to a Mongo
// `messages` collection — fire-and-forget, never blocks the user.
// Streams give ordered + cheap recent-history reads; Mongo gives
// durable archive + cross-channel queries.
//
// Two channel types:
//   - team chat: chat:team:{teamId}, requires Neo4j membership check
//   - 1:1 DMs:   chat:dm:{sortedA}:{sortedB}, sorted IDs collapse the
//                two participants into one canonical channel name

const { client } = require('../db/redis');
const { session } = require('../db/neo4j');
const { db } = require('../db/mongo');

const MAX_LEN = 500;

// ---------- Channel-key builders ----------

function teamKey(teamId) {
  return `chat:team:${teamId}`;
}

/**
 * DM channel key. The two user IDs are sorted lexicographically so
 * `chat:dm:A:B` and `chat:dm:B:A` collapse to the same Redis key
 * regardless of which user opens the conversation. This is the entire
 * design trick that makes 1:1 chat work without a separate "channel"
 * record in any database.
 */
function dmKey(userA, userB) {
  const [a, b] = [userA, userB].sort();
  return `chat:dm:${a}:${b}`;
}

// ---------- Internal helpers ----------

/**
 * Verifies the user is on the team. Graph is the source of truth for
 * memberships, so we MATCH on the existing MEMBER_OF edge in Neo4j.
 */
async function isTeamMember(userId, teamId) {
  const s = session();
  try {
    const r = await s.run(
      'MATCH (u:User {id: $userId})-[:MEMBER_OF]->(t:Team {id: $teamId}) RETURN count(*) AS n',
      { userId, teamId }
    );
    return r.records[0].get('n').toNumber() > 0;
  } finally {
    await s.close();
  }
}

/**
 * XADD with MAXLEN trim. The '~' modifier is "approximate trim" —
 * Redis trims in batches when convenient, which keeps the operation
 * fast at the cost of letting the stream briefly hold slightly more
 * than MAX_LEN entries. For a hackathon chat that's perfect: we never
 * grow past ~600 messages per channel, never need to grow more.
 */
async function xaddCapped(channelKey, fields) {
  return client.xAdd(channelKey, '*', fields, {
    TRIM: {
      strategy: 'MAXLEN',
      strategyModifier: '~',
      threshold: MAX_LEN,
    },
  });
}

/**
 * Fire-and-forget Mongo mirror. We log on failure but don't propagate —
 * the message is already durable in the stream, so a Mongo blip
 * shouldn't make the user see "send failed" on a message that was
 * actually delivered.
 */
async function mirrorToMongo(meta) {
  try {
    await db().collection('messages').insertOne(meta);
  } catch (err) {
    console.error('Mongo mirror failed (message still saved to stream):', err.message);
  }
}

/**
 * Reads from a stream from sinceId (exclusive) to the latest entry.
 * Returns parsed { id, from, to, body, ts } objects. Errors return
 * an empty array so a malformed sinceId doesn't crash a chat tab.
 */
async function readStream(channelKey, sinceId) {
  try {
    const start = !sinceId || sinceId === '0' ? '0' : `(${sinceId}`;
    const res = await client.xRange(channelKey, start, '+');
    return res.map(m => ({
      id: m.id,
      from: m.message.from,
      to: m.message.to || null,
      body: m.message.body,
      ts: Number(m.id.split('-')[0]),
    }));
  } catch (err) {
    console.error('xRange failed:', err.message);
    return [];
  }
}

// ---------- Public API: team chat ----------

async function sendTeamMessage(teamId, fromUserId, body) {
  if (!body || !body.trim()) throw new Error('Empty message');

  const allowed = await isTeamMember(fromUserId, teamId);
  if (!allowed) {
    const e = new Error('Not a team member');
    e.code = 'FORBIDDEN';
    throw e;
  }

  const channel = teamKey(teamId);
  const trimmed = body.trim();

  const streamId = await xaddCapped(channel, {
    from: fromUserId,
    body: trimmed,
  });

  mirrorToMongo({
    streamId,
    channelType: 'team',
    channel,
    fromUserId,
    toUserId: null,
    body: trimmed,
    ts: new Date(),
  });

  return streamId;
}

async function getTeamMessages(teamId, sinceId) {
  return readStream(teamKey(teamId), sinceId);
}

// ---------- Public API: DMs ----------

async function sendDM(fromUserId, toUserId, body) {
  if (!body || !body.trim()) throw new Error('Empty message');
  if (fromUserId === toUserId) throw new Error('Cannot DM yourself');

  const channel = dmKey(fromUserId, toUserId);
  const trimmed = body.trim();

  const streamId = await xaddCapped(channel, {
    from: fromUserId,
    to: toUserId,
    body: trimmed,
  });

  mirrorToMongo({
    streamId,
    channelType: 'dm',
    channel,
    fromUserId,
    toUserId,
    body: trimmed,
    ts: new Date(),
  });

  return streamId;
}

async function getDMs(userA, userB, sinceId) {
  return readStream(dmKey(userA, userB), sinceId);
}

module.exports = {
  sendTeamMessage,
  getTeamMessages,
  sendDM,
  getDMs,
};
