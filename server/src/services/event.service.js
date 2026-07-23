// server/src/services/event.service.js
//
// Hackathon event CRUD + visibility helpers. Collection name remains
// `hackathons` for backwards compatibility with teams.hackathonId.

const crypto = require('crypto');
const { db } = require('../db/mongo');

function generateEventId() {
  const random = Math.floor(Math.random() * 1e15)
    .toString()
    .padStart(22, '0');
  return '66' + random;
}

function normalizeEventFields(raw = {}) {
  const visibility = raw.visibility === 'private' ? 'private' : 'public';
  const status = ['draft', 'open', 'closed'].includes(raw.status) ? raw.status : 'open';
  const registrationMode = ['individual', 'team', 'both'].includes(raw.registrationMode)
    ? raw.registrationMode
    : 'both';
  return {
    visibility,
    status,
    registrationMode,
    leaderboardEnabled: raw.leaderboardEnabled !== false,
  };
}

async function listEventsForUser(userId) {
  const regs = await db().collection('event_registrations')
    .find({
      userId,
      status: { $in: ['accepted', 'pending', 'invited'] },
    })
    .project({ eventId: 1 })
    .toArray();
  const regEventIds = regs.map(r => r.eventId);

  const filter = {
    $or: [
      { visibility: { $ne: 'private' } },
      { visibility: { $exists: false } },
      { createdByOrgId: userId },
      { _id: { $in: regEventIds } },
    ],
  };

  return db().collection('hackathons')
    .find(filter)
    .sort({ startDate: -1 })
    .toArray();
}

async function getEvent(eventId) {
  return db().collection('hackathons').findOne({ _id: eventId });
}

async function canViewEvent(event, userId) {
  if (!event) return false;
  if (event.visibility !== 'private') return true;
  if (event.createdByOrgId === userId) return true;
  const reg = await db().collection('event_registrations').findOne({
    eventId: event._id,
    userId,
    status: { $in: ['accepted', 'pending', 'invited'] },
  });
  return !!reg;
}

async function createEvent(orgId, body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    const e = new Error('Event name is required');
    e.code = 'VALIDATION';
    throw e;
  }

  const fields = normalizeEventFields(body);
  const _id = generateEventId();
  const doc = {
    _id,
    name,
    description: typeof body.description === 'string' ? body.description.trim() : '',
    location: typeof body.location === 'string' ? body.location.trim() : '',
    startDate: body.startDate || null,
    endDate: body.endDate || null,
    tracks: Array.isArray(body.tracks) ? body.tracks.filter(t => typeof t === 'string') : [],
    createdByOrgId: orgId,
    ...fields,
  };

  await db().collection('hackathons').insertOne(doc);

  try {
    const { session } = require('../db/neo4j');
    const s = session();
    try {
      await s.run(
        `MERGE (h:Hackathon {id: $id}) SET h.name = $name`,
        { id: _id, name: doc.name }
      );
    } finally {
      await s.close();
    }
  } catch (err) {
    console.error('[graph-drift] hackathon sync on create:', err.message);
  }

  return doc;
}

async function updateEvent(eventId, orgId, body) {
  const event = await getEvent(eventId);
  if (!event) {
    const e = new Error('Event not found');
    e.code = 'NOT_FOUND';
    throw e;
  }
  if (event.createdByOrgId !== orgId) {
    const e = new Error('Only the hosting organization can edit this event');
    e.code = 'FORBIDDEN';
    throw e;
  }

  const patch = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) {
      const e = new Error('Event name cannot be empty');
      e.code = 'VALIDATION';
      throw e;
    }
    patch.name = name;
  }
  if (body.description !== undefined) patch.description = String(body.description).trim();
  if (body.location !== undefined) patch.location = String(body.location).trim();
  if (body.startDate !== undefined) patch.startDate = body.startDate;
  if (body.endDate !== undefined) patch.endDate = body.endDate;
  if (body.tracks !== undefined) {
    patch.tracks = Array.isArray(body.tracks) ? body.tracks.filter(t => typeof t === 'string') : [];
  }
  if (body.visibility !== undefined || body.status !== undefined
    || body.registrationMode !== undefined || body.leaderboardEnabled !== undefined) {
    Object.assign(patch, normalizeEventFields({ ...event, ...body }));
  }

  if (Object.keys(patch).length === 0) return event;

  await db().collection('hackathons').updateOne({ _id: eventId }, { $set: patch });
  return getEvent(eventId);
}

async function listEventTeams(eventId) {
  return db().collection('teams')
    .find({ hackathonId: eventId })
    .project({ _id: 1, name: 1, description: 1, capacity: 1, members: 1, createdBy: 1 })
    .sort({ name: 1 })
    .toArray();
}

function newInviteToken() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = {
  generateEventId,
  normalizeEventFields,
  listEventsForUser,
  getEvent,
  canViewEvent,
  createEvent,
  updateEvent,
  listEventTeams,
  newInviteToken,
};
