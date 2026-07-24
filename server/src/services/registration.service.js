// server/src/services/registration.service.js
//
// Event registration for individuals and teams, plus invite flow.

const { db } = require('../db/mongo');
const eventService = require('./event.service');
const notifications = require('./notifications.service');

function generateRegId() {
  const random = Math.floor(Math.random() * 1e15)
    .toString()
    .padStart(22, '0');
  return '61' + random;
}

class RegError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function registerUser(eventId, userId) {
  const event = await eventService.getEvent(eventId);
  if (!event) throw new RegError('NOT_FOUND', 'Event not found', 404);
  if (event.status === 'closed') throw new RegError('CLOSED', 'Event registration is closed');
  if (event.status === 'draft' && event.createdByOrgId !== userId) {
    throw new RegError('DRAFT', 'Event is not open for registration');
  }

  const mode = event.registrationMode || 'both';
  if (mode === 'team') {
    throw new RegError('MODE', 'This event only accepts team registrations');
  }

  const existing = await db().collection('event_registrations').findOne({
    eventId,
    userId,
    status: { $in: ['pending', 'accepted', 'invited'] },
  });
  if (existing) throw new RegError('EXISTS', 'Already registered for this event', 409);

  const status = event.visibility === 'private' ? 'pending' : 'accepted';
  const doc = {
    _id: generateRegId(),
    eventId,
    registrantType: 'user',
    userId,
    teamId: null,
    status,
    invitedBy: null,
    inviteToken: null,
    createdAt: new Date(),
  };
  await db().collection('event_registrations').insertOne(doc);

  if (event.createdByOrgId && status === 'pending') {
    await notifications.createNotification({
      userId: event.createdByOrgId,
      type: 'event_registration',
      payload: { eventId, eventName: event.name, userId, registrationId: doc._id, status },
    });
  }

  return doc;
}

async function registerTeam(eventId, userId, teamId) {
  const event = await eventService.getEvent(eventId);
  if (!event) throw new RegError('NOT_FOUND', 'Event not found', 404);
  if (event.status === 'closed') throw new RegError('CLOSED', 'Event registration is closed');

  const mode = event.registrationMode || 'both';
  if (mode === 'individual') {
    throw new RegError('MODE', 'This event only accepts individual registrations');
  }

  const team = await db().collection('teams').findOne({ _id: teamId });
  if (!team) throw new RegError('NOT_FOUND', 'Team not found', 404);
  if (team.hackathonId !== eventId) {
    throw new RegError('MISMATCH', 'Team does not belong to this event');
  }
  if (!(team.members || []).includes(userId)) {
    throw new RegError('FORBIDDEN', 'Only team members can register the team', 403);
  }

  const existing = await db().collection('event_registrations').findOne({
    eventId,
    teamId,
    status: { $in: ['pending', 'accepted', 'invited'] },
  });
  if (existing) throw new RegError('EXISTS', 'Team already registered for this event', 409);

  const status = event.visibility === 'private' ? 'pending' : 'accepted';
  const doc = {
    _id: generateRegId(),
    eventId,
    registrantType: 'team',
    userId: null,
    teamId,
    status,
    invitedBy: userId,
    inviteToken: null,
    createdAt: new Date(),
  };
  await db().collection('event_registrations').insertOne(doc);

  if (event.createdByOrgId && status === 'pending') {
    await notifications.createNotification({
      userId: event.createdByOrgId,
      type: 'event_registration',
      payload: { eventId, eventName: event.name, teamId, registrationId: doc._id, status },
    });
  }

  return doc;
}

async function inviteUserToEvent(eventId, inviterId, { email, username, userId } = {}) {
  const event = await eventService.getEvent(eventId);
  if (!event) throw new RegError('NOT_FOUND', 'Event not found', 404);

  const isOrg = event.createdByOrgId === inviterId;
  const inviterReg = await db().collection('event_registrations').findOne({
    eventId,
    userId: inviterId,
    status: { $in: ['accepted', 'pending'] },
  });
  if (!isOrg && !inviterReg) {
    throw new RegError('FORBIDDEN', 'Register for the event before inviting others', 403);
  }

  let target = null;
  if (userId) {
    target = await db().collection('users').findOne({ _id: userId });
  } else if (username) {
    target = await db().collection('users').findOne({ username: username.trim().toLowerCase() });
  } else if (email) {
    target = await db().collection('users').findOne({ email: email.trim().toLowerCase() });
  }
  if (!target) throw new RegError('NOT_FOUND', 'Invitee user not found', 404);
  if (target.account_type === 'organization') {
    throw new RegError('INVALID', 'Cannot invite an organization account');
  }

  const existing = await db().collection('event_registrations').findOne({
    eventId,
    userId: target._id,
    status: { $in: ['pending', 'accepted', 'invited'] },
  });
  if (existing) throw new RegError('EXISTS', 'User already has a registration', 409);

  const inviteToken = eventService.newInviteToken();
  const doc = {
    _id: generateRegId(),
    eventId,
    registrantType: 'user',
    userId: target._id,
    teamId: null,
    status: 'invited',
    invitedBy: inviterId,
    inviteToken,
    createdAt: new Date(),
  };
  await db().collection('event_registrations').insertOne(doc);

  await notifications.createNotification({
    userId: target._id,
    type: 'event_invite',
    payload: {
      eventId,
      eventName: event.name,
      registrationId: doc._id,
      inviteToken,
      invitedBy: inviterId,
    },
  });

  return doc;
}

async function acceptRegistration(eventId, regId, actorId, { inviteToken } = {}) {
  const event = await eventService.getEvent(eventId);
  if (!event) throw new RegError('NOT_FOUND', 'Event not found', 404);

  const reg = await db().collection('event_registrations').findOne({ _id: regId, eventId });
  if (!reg) throw new RegError('NOT_FOUND', 'Registration not found', 404);

  if (reg.status === 'invited') {
    if (reg.userId !== actorId && inviteToken !== reg.inviteToken) {
      throw new RegError('FORBIDDEN', 'Not allowed to accept this invite', 403);
    }
    await db().collection('event_registrations').updateOne(
      { _id: regId },
      { $set: { status: 'accepted', inviteToken: null } }
    );
    return { ...reg, status: 'accepted' };
  }

  if (reg.status === 'pending') {
    if (event.createdByOrgId !== actorId) {
      throw new RegError('FORBIDDEN', 'Only the hosting org can approve registrations', 403);
    }
    await db().collection('event_registrations').updateOne(
      { _id: regId },
      { $set: { status: 'accepted' } }
    );
    if (reg.userId) {
      await notifications.createNotification({
        userId: reg.userId,
        type: 'event_registration',
        payload: { eventId, eventName: event.name, status: 'accepted', registrationId: regId },
      });
    }
    return { ...reg, status: 'accepted' };
  }

  throw new RegError('STATE', `Cannot accept registration in status ${reg.status}`);
}

async function rejectRegistration(eventId, regId, actorId) {
  const event = await eventService.getEvent(eventId);
  if (!event) throw new RegError('NOT_FOUND', 'Event not found', 404);
  if (event.createdByOrgId !== actorId) {
    throw new RegError('FORBIDDEN', 'Only the hosting org can reject registrations', 403);
  }

  const reg = await db().collection('event_registrations').findOne({ _id: regId, eventId });
  if (!reg) throw new RegError('NOT_FOUND', 'Registration not found', 404);

  await db().collection('event_registrations').updateOne(
    { _id: regId },
    { $set: { status: 'rejected' } }
  );
  if (reg.userId) {
    await notifications.createNotification({
      userId: reg.userId,
      type: 'event_registration',
      payload: { eventId, eventName: event.name, status: 'rejected', registrationId: regId },
    });
  }
  return { ...reg, status: 'rejected' };
}

async function listRegistrations(eventId, orgId) {
  const event = await eventService.getEvent(eventId);
  if (!event) throw new RegError('NOT_FOUND', 'Event not found', 404);
  if (event.createdByOrgId !== orgId) {
    throw new RegError('FORBIDDEN', 'Only the hosting org can list registrations', 403);
  }
  const results = await db().collection('event_registrations')
    .find({ eventId })
    .sort({ createdAt: -1 })
    .toArray();
  const userIds = [...new Set(results.map(r => r.userId).filter(Boolean))];
  const teamIds = [...new Set(results.map(r => r.teamId).filter(Boolean))];
  const [users, teams] = await Promise.all([
    userIds.length
      ? db().collection('users').find({ _id: { $in: userIds } }, { projection: { username: 1 } }).toArray()
      : [],
    teamIds.length
      ? db().collection('teams').find({ _id: { $in: teamIds } }, { projection: { name: 1 } }).toArray()
      : [],
  ]);
  const userNames = Object.fromEntries(users.map(u => [u._id, u.username]));
  const teamNames = Object.fromEntries(teams.map(t => [t._id, t.name]));
  return results.map(r => ({
    ...r,
    username: r.userId ? userNames[r.userId] : null,
    teamName: r.teamId ? teamNames[r.teamId] : null,
  }));
}

async function getLeaderboard(eventId) {
  const entries = await db().collection('leaderboard_entries')
    .find({ eventId })
    .sort({ rank: 1, score: -1 })
    .toArray();
  if (entries.length === 0) return entries;
  const teamIds = [...new Set(entries.map(e => e.teamId).filter(Boolean))];
  const teams = await db().collection('teams')
    .find({ _id: { $in: teamIds } }, { projection: { _id: 1, name: 1 } })
    .toArray();
  const nameById = Object.fromEntries(teams.map(t => [t._id, t.name]));
  return entries.map(e => ({
    ...e,
    teamName: nameById[e.teamId] || e.teamId,
  }));
}

async function putLeaderboard(eventId, orgId, entries) {
  const event = await eventService.getEvent(eventId);
  if (!event) throw new RegError('NOT_FOUND', 'Event not found', 404);
  if (event.createdByOrgId !== orgId) {
    throw new RegError('FORBIDDEN', 'Only the hosting org can update the leaderboard', 403);
  }
  if (!event.leaderboardEnabled) {
    throw new RegError('DISABLED', 'Leaderboard is disabled for this event');
  }
  if (!Array.isArray(entries)) {
    throw new RegError('VALIDATION', 'entries must be an array');
  }

  const now = new Date();
  const ops = entries.map((row, i) => {
    const teamId = row.teamId;
    const score = Number(row.score) || 0;
    const rank = Number(row.rank) || i + 1;
    return {
      updateOne: {
        filter: { eventId, teamId },
        update: {
          $set: { score, rank, updatedAt: now, updatedBy: orgId },
          $setOnInsert: { _id: generateRegId().replace(/^61/, '62'), eventId, teamId },
        },
        upsert: true,
      },
    };
  });

  if (ops.length > 0) {
    await db().collection('leaderboard_entries').bulkWrite(ops);
  }
  return getLeaderboard(eventId);
}

module.exports = {
  RegError,
  registerUser,
  registerTeam,
  inviteUserToEvent,
  acceptRegistration,
  rejectRegistration,
  listRegistrations,
  getLeaderboard,
  putLeaderboard,
};
