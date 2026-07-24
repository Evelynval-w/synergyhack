// server/src/services/notifications.service.js
//
// Unread chat summary (Redis stream cursors) + join-request event
// notifications (Mongo).

const { db } = require('../db/mongo');
const chat = require('./chat.service');
const dms = require('./dms.service');

function generateNotificationId() {
  const random = Math.floor(Math.random() * 1e15)
    .toString()
    .padStart(22, '0');
  return '68' + random;
}

async function createNotification({ userId, type, payload }) {
  const doc = {
    _id: generateNotificationId(),
    userId,
    type,
    payload: payload || {},
    read: false,
    createdAt: new Date(),
  };
  await db().collection('notifications').insertOne(doc);
  return doc;
}

async function listUnreadJoinEvents(userId, { limit = 20 } = {}) {
  return db().collection('notifications')
    .find({ userId, read: false })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

async function markNotificationsRead(userId, ids = null) {
  const filter = { userId, read: false };
  if (Array.isArray(ids) && ids.length > 0) {
    filter._id = { $in: ids };
  }
  const result = await db().collection('notifications').updateMany(
    filter,
    { $set: { read: true, readAt: new Date() } }
  );
  return { matched: result.matchedCount, modified: result.modifiedCount };
}

async function getSummary(userId) {
  const threads = await dms.listUserThreads(userId);
  let dmUnread = 0;
  for (const thread of threads) {
    const channel = thread.channel || chat.dmKey(userId, thread.peerUserId);
    dmUnread += await chat.countUnreadOnChannel(userId, channel);
  }

  const teams = await db().collection('teams')
    .find({ members: userId }, { projection: { _id: 1, name: 1 } })
    .toArray();
  let teamUnread = 0;
  const teamUnreadChannels = [];
  for (const team of teams) {
    const channel = chat.teamKey(team._id);
    const unread = await chat.countUnreadOnChannel(userId, channel);
    if (unread > 0) {
      teamUnread += unread;
      teamUnreadChannels.push({
        teamId: team._id,
        teamName: team.name,
        unread,
      });
    }
  }

  const joinEvents = await listUnreadJoinEvents(userId);
  const joinRequestEvents = joinEvents.length;
  const total = dmUnread + teamUnread + joinRequestEvents;

  return {
    dmUnread,
    teamUnread,
    teamUnreadChannels,
    joinRequestEvents,
    joinEvents,
    total,
  };
}

async function markChatRead(userId, { channelType, teamId, peerId, streamId }) {
  let channel = null;
  if (channelType === 'team' && teamId) {
    const allowed = await chat.isTeamMember(userId, teamId);
    if (!allowed) {
      const e = new Error('Not a team member');
      e.code = 'FORBIDDEN';
      throw e;
    }
    channel = chat.teamKey(teamId);
  } else if (channelType === 'dm' && peerId) {
    channel = chat.dmKey(userId, peerId);
  } else {
    const e = new Error('channelType and teamId/peerId required');
    e.code = 'VALIDATION';
    throw e;
  }

  let id = streamId;
  if (!id) {
    id = await chat.getLatestStreamId(channel);
  }
  if (id) {
    await chat.markChannelRead(userId, channel, id);
  }
  return { ok: true, channel, streamId: id };
}

module.exports = {
  createNotification,
  listUnreadJoinEvents,
  markNotificationsRead,
  getSummary,
  markChatRead,
};
