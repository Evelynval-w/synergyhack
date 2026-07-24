// server/src/services/teamRequest.service.js
//
// Logic for join requests. Stored in a new `team_requests` Mongo
// collection. Each doc has status pending|accepted|rejected so the
// audit history is preserved (you can see who joined which team
// when, and who got rejected).
//
// Cross-DB sync on accept: Mongo (status + members) + Neo4j (MEMBER_OF
// edge) via the existing graph-sync.joinTeam helper. If Neo4j fails
// we log and don't roll back — Mongo is the source of truth and a
// later seed/sync can reconcile.

const { db } = require('../db/mongo');
const graphSync = require('./graph-sync.service');

const COLLECTION = 'team_requests';

class RequestError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Generate a stable string _id following the existing pattern.
function generateRequestId() {
  const random = Math.floor(Math.random() * 1e15)
    .toString()
    .padStart(22, '0');
  return '69' + random;
}

/**
 * Validates eligibility, then inserts a pending request.
 * Throws RequestError on any of the 4 eligibility violations.
 */
async function createRequest({ teamId, userId, message = '' }) {
  // Load the team — needed for createdBy + capacity + members
  const team = await db().collection('teams').findOne(
    { _id: teamId },
    { projection: { _id: 1, members: 1, capacity: 1, createdBy: 1 } }
  );
  if (!team) {
    throw new RequestError('NOT_FOUND', 'Team not found', 404);
  }

  // Check 1: not the creator
  if (team.createdBy === userId) {
    throw new RequestError('IS_OWNER', 'You created this team — you are already a member.', 400);
  }

  // Check 2: not already a member
  const members = team.members || [];
  if (members.includes(userId)) {
    throw new RequestError('ALREADY_MEMBER', 'You are already a member of this team.', 400);
  }

  // Check 3: team has capacity
  if (team.capacity && members.length >= team.capacity) {
    throw new RequestError('TEAM_FULL', 'This team is at capacity.', 409);
  }

  // Check 4: no pending request already (the partial unique index
  // would catch this too, but checking up front gives a friendlier
  // error than a Mongo E11000 duplicate-key error).
  const existing = await db().collection(COLLECTION).findOne({
    teamId, userId, status: 'pending',
  });
  if (existing) {
    throw new RequestError('ALREADY_PENDING', 'You already have a pending request for this team.', 409);
  }

  const trimmedMessage = String(message || '').trim();
  if (trimmedMessage.length > 500) {
    throw new RequestError('MESSAGE_TOO_LONG', 'Message must be 500 characters or fewer.', 400);
  }

  const doc = {
    _id: generateRequestId(),
    teamId,
    userId,
    message: trimmedMessage,
    status: 'pending',
    direction: 'inbound_request',
    invitedBy: null,
    createdAt: new Date(),
    decidedAt: null,
    decidedBy: null,
  };

  await db().collection(COLLECTION).insertOne(doc);
  return doc;
}

/**
 * Outbound invite: a team member invites a user to join.
 */
async function createInvite({ teamId, invitedBy, userId, message = '' }) {
  const team = await db().collection('teams').findOne(
    { _id: teamId },
    { projection: { _id: 1, name: 1, members: 1, capacity: 1, createdBy: 1 } }
  );
  if (!team) throw new RequestError('NOT_FOUND', 'Team not found', 404);

  const members = team.members || [];
  if (!members.includes(invitedBy)) {
    throw new RequestError('FORBIDDEN', 'Only team members can invite others.', 403);
  }
  if (members.includes(userId)) {
    throw new RequestError('ALREADY_MEMBER', 'User is already a member of this team.', 400);
  }
  if (team.capacity && members.length >= team.capacity) {
    throw new RequestError('TEAM_FULL', 'This team is at capacity.', 409);
  }

  const target = await db().collection('users').findOne(
    { _id: userId },
    { projection: { _id: 1, account_type: 1 } }
  );
  if (!target) throw new RequestError('NOT_FOUND', 'User not found', 404);
  if (target.account_type === 'organization') {
    throw new RequestError('INVALID', 'Cannot invite an organization account.', 400);
  }

  const existing = await db().collection(COLLECTION).findOne({
    teamId, userId, status: 'pending',
  });
  if (existing) {
    throw new RequestError('ALREADY_PENDING', 'A pending request already exists for this user.', 409);
  }

  const trimmedMessage = String(message || '').trim();
  if (trimmedMessage.length > 500) {
    throw new RequestError('MESSAGE_TOO_LONG', 'Message must be 500 characters or fewer.', 400);
  }

  const doc = {
    _id: generateRequestId(),
    teamId,
    userId,
    message: trimmedMessage,
    status: 'pending',
    direction: 'outbound_invite',
    invitedBy,
    createdAt: new Date(),
    decidedAt: null,
    decidedBy: null,
  };
  await db().collection(COLLECTION).insertOne(doc);

  try {
    const notifications = require('./notifications.service');
    await notifications.createNotification({
      userId,
      type: 'team_invite',
      payload: {
        teamId,
        teamName: team.name,
        requestId: doc._id,
        invitedBy,
      },
    });
  } catch (err) {
    console.error('Failed to create team_invite notification:', err.message);
  }

  return doc;
}

async function acceptOutboundInvite(requestId, inviteeId) {
  const request = await db().collection(COLLECTION).findOne({ _id: requestId });
  if (!request) throw new RequestError('NOT_FOUND', 'Request not found', 404);
  if (request.direction !== 'outbound_invite') {
    throw new RequestError('WRONG_TYPE', 'Not an outbound invite.', 400);
  }
  if (request.userId !== inviteeId) {
    throw new RequestError('FORBIDDEN', 'Only the invitee can accept this invite.', 403);
  }
  if (request.status !== 'pending') {
    throw new RequestError('NOT_PENDING', `Request is already ${request.status}.`, 400);
  }

  const team = await db().collection('teams').findOne(
    { _id: request.teamId },
    { projection: { _id: 1, members: 1, capacity: 1 } }
  );
  if (!team) throw new RequestError('NOT_FOUND', 'Team not found', 404);

  const members = team.members || [];
  if (team.capacity && members.length >= team.capacity) {
    throw new RequestError('TEAM_FULL', 'This team filled up before you decided.', 409);
  }

  await db().collection('teams').updateOne(
    { _id: team._id },
    { $addToSet: { members: inviteeId } }
  );

  const now = new Date();
  await db().collection(COLLECTION).updateOne(
    { _id: requestId },
    { $set: { status: 'accepted', decidedAt: now, decidedBy: inviteeId } }
  );

  try {
    await graphSync.joinTeam(inviteeId, team._id);
  } catch (err) {
    console.error(`[graph-drift] joinTeam invite user=${inviteeId} team=${team._id}: ${err.message}`);
  }

  return { ...request, status: 'accepted', decidedAt: now, decidedBy: inviteeId };
}

async function rejectOutboundInvite(requestId, inviteeId) {
  const request = await db().collection(COLLECTION).findOne({ _id: requestId });
  if (!request) throw new RequestError('NOT_FOUND', 'Request not found', 404);
  if (request.direction !== 'outbound_invite') {
    throw new RequestError('WRONG_TYPE', 'Not an outbound invite.', 400);
  }
  if (request.userId !== inviteeId) {
    throw new RequestError('FORBIDDEN', 'Only the invitee can reject this invite.', 403);
  }
  if (request.status !== 'pending') {
    throw new RequestError('NOT_PENDING', `Request is already ${request.status}.`, 400);
  }

  const now = new Date();
  await db().collection(COLLECTION).updateOne(
    { _id: requestId },
    { $set: { status: 'rejected', decidedAt: now, decidedBy: inviteeId } }
  );
  return { ...request, status: 'rejected', decidedAt: now, decidedBy: inviteeId };
}

/**
 * Lists pending requests for a team. Joins each request with the
 * requester's public profile so the owner gets enough context to
 * decide without an extra round-trip per request.
 *
 * Caller must have already checked that the request is from the
 * team's creator (the route handler enforces this).
 */
async function listPendingForTeam(teamId) {
  const pipeline = [
    { $match: { teamId, status: 'pending' } },
    { $sort: { createdAt: 1 } },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'requester',
        pipeline: [
          {
            $project: {
              _id: 1, username: 1, role: 1, bio: 1,
              skills: 1, skill_names: 1, github_url: 1,
            },
          },
        ],
      },
    },
    { $addFields: { requester: { $first: '$requester' } } },
  ];

  return db().collection(COLLECTION).aggregate(pipeline).toArray();
}

/**
 * Lists all requests (pending/accepted/rejected) made by a user.
 * Useful for the requester to see their own request status.
 */
async function listForUser(userId) {
  const pipeline = [
    { $match: { userId } },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: 'teams',
        localField: 'teamId',
        foreignField: '_id',
        as: 'team',
        pipeline: [{ $project: { _id: 1, name: 1, description: 1 } }],
      },
    },
    { $addFields: { team: { $first: '$team' } } },
  ];

  return db().collection(COLLECTION).aggregate(pipeline).toArray();
}

/**
 * Accepts a pending request. Adds user to team.members in Mongo and
 * creates the MEMBER_OF edge in Neo4j. Marks the request as accepted.
 *
 * Re-checks capacity at decision time — between request creation
 * and acceptance, other members may have been added.
 *
 * @param {string} requestId
 * @param {string} ownerId — must equal team.createdBy
 */
async function acceptRequest(requestId, ownerId) {
  const request = await db().collection(COLLECTION).findOne({ _id: requestId });
  if (!request) {
    throw new RequestError('NOT_FOUND', 'Request not found', 404);
  }
  if (request.status !== 'pending') {
    throw new RequestError('NOT_PENDING', `Request is already ${request.status}.`, 400);
  }

  const team = await db().collection('teams').findOne(
    { _id: request.teamId },
    { projection: { _id: 1, members: 1, capacity: 1, createdBy: 1 } }
  );
  if (!team) {
    throw new RequestError('NOT_FOUND', 'Team not found', 404);
  }
  if (team.createdBy !== ownerId) {
    throw new RequestError('NOT_OWNER', 'Only the team creator can accept requests.', 403);
  }

  const members = team.members || [];
  if (members.includes(request.userId)) {
    // Defensive: already a member somehow. Mark accepted, skip writes.
    await db().collection(COLLECTION).updateOne(
      { _id: requestId },
      { $set: { status: 'accepted', decidedAt: new Date(), decidedBy: ownerId } }
    );
    return { ...request, status: 'accepted' };
  }
  if (team.capacity && members.length >= team.capacity) {
    throw new RequestError('TEAM_FULL', 'This team filled up before you decided.', 409);
  }

  // 1. Add the user to team.members in Mongo
  await db().collection('teams').updateOne(
    { _id: team._id },
    { $addToSet: { members: request.userId } }
  );

  // 2. Mark the request as accepted
  const now = new Date();
  await db().collection(COLLECTION).updateOne(
    { _id: requestId },
    { $set: { status: 'accepted', decidedAt: now, decidedBy: ownerId } }
  );

  // 3. Create the Neo4j MEMBER_OF edge. If this fails, Mongo is still
  // the source of truth — a later sync can reconcile. Log loudly so
  // ops sees the drift.
  try {
    await graphSync.joinTeam(request.userId, team._id);
  } catch (err) {
    console.error(
      `[graph-drift] joinTeam failed for user=${request.userId} team=${team._id}: ${err.message}`
    );
  }

  // Notify the requester that they were accepted.
  try {
    const notifications = require('./notifications.service');
    const teamName = (await db().collection('teams').findOne(
      { _id: team._id },
      { projection: { name: 1 } }
    ))?.name || 'a team';
    await notifications.createNotification({
      userId: request.userId,
      type: 'join_request_accepted',
      payload: { teamId: team._id, teamName, requestId },
    });
  } catch (err) {
    console.error('Failed to create accept notification:', err.message);
  }

  return {
    ...request,
    status: 'accepted',
    decidedAt: now,
    decidedBy: ownerId,
  };
}

/**
 * Rejects a pending request. Mongo-only (no Neo4j side effect).
 * The request stays in the collection with status='rejected' so the
 * requester can see they were rejected and the partial unique index
 * lets them re-request later.
 */
async function rejectRequest(requestId, ownerId) {
  const request = await db().collection(COLLECTION).findOne({ _id: requestId });
  if (!request) {
    throw new RequestError('NOT_FOUND', 'Request not found', 404);
  }
  if (request.status !== 'pending') {
    throw new RequestError('NOT_PENDING', `Request is already ${request.status}.`, 400);
  }

  const team = await db().collection('teams').findOne(
    { _id: request.teamId },
    { projection: { _id: 1, createdBy: 1 } }
  );
  if (!team || team.createdBy !== ownerId) {
    throw new RequestError('NOT_OWNER', 'Only the team creator can reject requests.', 403);
  }

  const now = new Date();
  await db().collection(COLLECTION).updateOne(
    { _id: requestId },
    { $set: { status: 'rejected', decidedAt: now, decidedBy: ownerId } }
  );

  try {
    const notifications = require('./notifications.service');
    const teamDoc = await db().collection('teams').findOne(
      { _id: request.teamId },
      { projection: { name: 1 } }
    );
    await notifications.createNotification({
      userId: request.userId,
      type: 'join_request_rejected',
      payload: { teamId: request.teamId, teamName: teamDoc?.name || 'a team', requestId },
    });
  } catch (err) {
    console.error('Failed to create reject notification:', err.message);
  }

  return {
    ...request,
    status: 'rejected',
    decidedAt: now,
    decidedBy: ownerId,
  };
}

module.exports = {
  RequestError,
  createRequest,
  createInvite,
  acceptOutboundInvite,
  rejectOutboundInvite,
  listPendingForTeam,
  listForUser,
  acceptRequest,
  rejectRequest,
};
