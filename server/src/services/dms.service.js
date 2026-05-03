// server/src/services/dms.service.js
//
// DM inbox lookups. Streams hold the live data; Mongo's `messages`
// collection (the mirror, populated by chat.service) is the only
// source that can answer "give me all distinct conversations that
// include this user" — Streams are per-channel and don't support
// cross-channel queries.

const { db } = require('../db/mongo');

/**
 * Returns one entry per distinct DM channel involving the given user,
 * with the peer user info and the last message exchanged.
 *
 * Pipeline:
 *   1. $match channel type DM AND user is sender or recipient
 *   2. $sort by ts desc so $first gives us the latest message
 *   3. $group by channel — collect last message + peer userId
 *   4. $lookup peer's user doc for username/role (needed for inbox
 *      list rendering)
 *   5. $sort threads by last activity desc
 */
async function listUserThreads(userId) {
  const pipeline = [
    {
      $match: {
        channelType: 'dm',
        $or: [
          { fromUserId: userId },
          { toUserId: userId },
        ],
      },
    },
    { $sort: { ts: -1 } },
    {
      $group: {
        _id: '$channel',
        lastMessage: { $first: '$body' },
        lastMessageTs: { $first: '$ts' },
        lastMessageFrom: { $first: '$fromUserId' },
        // The "peer" is whichever side isn't us. Both messages from
        // me and to me appear in this channel; we resolve the peer
        // by picking whichever id ISN'T the current user.
        peerUserId: {
          $first: {
            $cond: [
              { $eq: ['$fromUserId', userId] },
              '$toUserId',
              '$fromUserId',
            ],
          },
        },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'peerUserId',
        foreignField: '_id',
        as: 'peer',
        pipeline: [
          { $project: { _id: 1, username: 1, role: 1 } },
        ],
      },
    },
    {
      $addFields: {
        peer: { $first: '$peer' },
      },
    },
    { $sort: { lastMessageTs: -1 } },
    {
      $project: {
        _id: 0,
        channel: '$_id',
        peer: 1,
        peerUserId: 1,
        lastMessage: 1,
        lastMessageTs: 1,
        lastMessageFrom: 1,
      },
    },
  ];

  return db().collection('messages').aggregate(pipeline).toArray();
}

module.exports = { listUserThreads };
