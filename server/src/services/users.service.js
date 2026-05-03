// server/src/services/users.service.js
//
// User-facing read APIs.
//
// PII handling: email is in the user document but is never returned
// in any response. The PUBLIC_PROJECTION constant is the single
// place we control what fields a logged-in user can see about other
// users. If we ever add /me, /me would project a wider set.

const { db } = require('../db/mongo');

// What every public-facing endpoint returns about a user.
// Email is intentionally absent — all responses below run through
// this projection.
const PUBLIC_PROJECTION = {
  _id: 1,
  username: 1,
  role: 1,
  bio: 1,
  skills: 1,
  skill_names: 1,
};

/**
 * Full-text search across users via the user_search_idx compound text
 * index (skill_names:10, role:5, bio:3). Stemmed and tokenized.
 */
async function searchUsers(query, { limit = 20 } = {}) {
  if (!query || !query.trim()) return [];
  const trimmed = query.trim();

  return db().collection('users')
    .find(
      { $text: { $search: trimmed } },
      {
        projection: {
          ...PUBLIC_PROJECTION,
          score: { $meta: 'textScore' },
        },
      }
    )
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .toArray();
}

/**
 * Paginated list of all users. Used by the People browse view.
 * Sorted by username for stable, A-Z ordering.
 */
async function listUsers({ skip = 0, limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
  const safeSkip = Math.max(parseInt(skip, 10) || 0, 0);

  const [results, total] = await Promise.all([
    db().collection('users')
      .find({}, { projection: PUBLIC_PROJECTION })
      .sort({ username: 1 })
      .skip(safeSkip)
      .limit(safeLimit)
      .toArray(),
    db().collection('users').countDocuments(),
  ]);

  return { results, total, skip: safeSkip, limit: safeLimit };
}

/**
 * Single user profile. Joins the user doc with their past_projects
 * via a $lookup aggregation, returning a single response shape ready
 * for the UserProfile page.
 *
 * Pipeline:
 *   1. $match the requested user
 *   2. $project public fields only (drops email)
 *   3. $lookup past_projects where members.userId == this user._id
 *   4. $addFields: extract just the relevant project fields and
 *      sort by rating desc so highest-rated work shows first
 */
async function getUserProfile(userId) {
  const pipeline = [
    { $match: { _id: userId } },
    {
      $project: {
        ...PUBLIC_PROJECTION,
      },
    },
    {
      $lookup: {
        from: 'past_projects',
        let: { uid: '$_id' },
        pipeline: [
          { $match: { $expr: { $in: ['$$uid', '$members.userId'] } } },
          {
            $project: {
              _id: 1,
              title: 1,
              hackathonId: 1,
              rating: 1,
              skills_used: 1,
              members: 1,
            },
          },
          { $sort: { rating: -1 } },
        ],
        as: 'pastProjects',
      },
    },
    {
      $addFields: {
        // For each past project, find the role THIS user played.
        pastProjects: {
          $map: {
            input: '$pastProjects',
            as: 'p',
            in: {
              _id: '$$p._id',
              title: '$$p.title',
              hackathonId: '$$p.hackathonId',
              rating: '$$p.rating',
              skills_used: '$$p.skills_used',
              roleOnTeam: {
                $let: {
                  vars: {
                    me: {
                      $first: {
                        $filter: {
                          input: '$$p.members',
                          as: 'm',
                          cond: { $eq: ['$$m.userId', '$_id'] },
                        },
                      },
                    },
                  },
                  in: '$$me.role',
                },
              },
            },
          },
        },
      },
    },
  ];

  const [user] = await db().collection('users').aggregate(pipeline).toArray();
  return user || null;
}

module.exports = {
  searchUsers,
  listUsers,
  getUserProfile,
};
