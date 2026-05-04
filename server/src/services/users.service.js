// server/src/services/users.service.js
//
// User-facing read + write APIs.
//
// PII handling: there are two projections.
//   PUBLIC_PROJECTION  — what other users can see (no email, no password_hash)
//   SELF_PROJECTION    — what the user can see about themselves (adds email)
//
// The password_hash field NEVER leaves this layer in any response.

const { db } = require('../db/mongo');
const graphSync = require('./graph-sync.service');

const PUBLIC_PROJECTION = {
  _id: 1,
  username: 1,
  role: 1,
  bio: 1,
  skills: 1,
  skill_names: 1,
  github_url: 1,
};

const SELF_PROJECTION = {
  ...PUBLIC_PROJECTION,
  email: 1,
};

// Email regex — same shape as register validation
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Whitelist of fields the user can edit on their own profile.
// Anything else in the patch payload is ignored — defense in depth so
// a malicious client can't sneak in `password_hash` or `_id`.
const EDITABLE_FIELDS = new Set([
  'bio',
  'role',
  'email',
  'github_url',
  'skills',
]);

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
 * Single user profile (public view) — joins user with past_projects
 * via $lookup and labels each project with the role this user played.
 * Email is NOT included; that's only for getOwnProfile().
 */
async function getUserProfile(userId) {
  const pipeline = [
    { $match: { _id: userId } },
    { $project: { ...PUBLIC_PROJECTION } },
    {
      $lookup: {
        from: 'past_projects',
        let: { uid: '$_id' },
        pipeline: [
          { $match: { $expr: { $in: ['$$uid', '$members.userId'] } } },
          {
            $project: {
              _id: 1, title: 1, hackathonId: 1, rating: 1,
              skills_used: 1, members: 1,
            },
          },
          { $sort: { rating: -1 } },
        ],
        as: 'pastProjects',
      },
    },
    {
      $addFields: {
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

/**
 * "My" profile — same shape as getUserProfile but includes email.
 * Used by GET /users/me so the editor can pre-fill the email field.
 */
async function getOwnProfile(userId) {
  const pipeline = [
    { $match: { _id: userId } },
    { $project: { ...SELF_PROJECTION } },
    {
      $lookup: {
        from: 'past_projects',
        let: { uid: '$_id' },
        pipeline: [
          { $match: { $expr: { $in: ['$$uid', '$members.userId'] } } },
          {
            $project: {
              _id: 1, title: 1, hackathonId: 1, rating: 1,
              skills_used: 1, members: 1,
            },
          },
          { $sort: { rating: -1 } },
        ],
        as: 'pastProjects',
      },
    },
    {
      $addFields: {
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

/**
 * Updates the authed user's own profile.
 * - Whitelists editable fields (silently drops anything else)
 * - Validates email format and uniqueness if email is changing
 * - Validates skills array shape
 * - Rebuilds skill_names whenever skills changes
 * - Triggers graph-sync for skills (Mongo + Neo4j stay in sync)
 */
async function updateOwnProfile(userId, rawPatch) {
  const patch = {};
  for (const key of Object.keys(rawPatch || {})) {
    if (EDITABLE_FIELDS.has(key)) patch[key] = rawPatch[key];
  }

  // === Validation ===
  const errors = {};

  if ('email' in patch) {
    const email = String(patch.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      errors.email = 'Email must look like name@example.com.';
    } else {
      const conflict = await db().collection('users').findOne(
        { email, _id: { $ne: userId } },
        { projection: { _id: 1 } }
      );
      if (conflict) {
        errors.email = 'That email is already in use.';
      }
      patch.email = email;
    }
  }

  if ('role' in patch) {
    if (typeof patch.role !== 'string') {
      errors.role = 'Role must be a string.';
    } else {
      patch.role = patch.role.trim();
    }
  }

  if ('bio' in patch) {
    if (typeof patch.bio !== 'string') {
      errors.bio = 'Bio must be a string.';
    } else if (patch.bio.length > 500) {
      errors.bio = 'Bio must be 500 characters or fewer.';
    } else {
      patch.bio = patch.bio.trim();
    }
  }

  if ('github_url' in patch) {
    const url = String(patch.github_url || '').trim();
    if (url && !/^https?:\/\/.+/i.test(url)) {
      errors.github_url = 'Must be a valid URL starting with http(s)://';
    }
    patch.github_url = url; // empty string allowed = clear it
  }

  if ('skills' in patch) {
    if (!Array.isArray(patch.skills)) {
      errors.skills = 'Skills must be an array.';
    } else {
      const cleaned = [];
      for (const s of patch.skills) {
        if (!s || typeof s.name !== 'string' || !s.name.trim()) continue;
        const level = Number(s.level);
        const years = Number(s.years);
        cleaned.push({
          name: s.name.trim(),
          level: Number.isFinite(level) ? Math.max(1, Math.min(5, Math.round(level))) : 3,
          years: Number.isFinite(years) ? Math.max(0, Math.round(years)) : 0,
        });
      }
      patch.skills = cleaned;
      patch.skill_names = cleaned.map(s => s.name);
    }
  }

  if (Object.keys(errors).length > 0) {
    const e = new Error('Validation failed');
    e.code = 'VALIDATION';
    e.fields = errors;
    throw e;
  }

  if (Object.keys(patch).length === 0) {
    // Nothing to update; return current profile
    return getOwnProfile(userId);
  }

  // === Apply ===
  await db().collection('users').updateOne(
    { _id: userId },
    { $set: patch }
  );

  // Sync skills to Neo4j if they changed.
  if ('skills' in patch) {
    try {
      await graphSync.syncUserSkills(userId, patch.skills);
    } catch (err) {
      console.error('graph-sync.syncUserSkills failed:', err.message);
      // Don't roll back the Mongo write — graph sync is recoverable
      // by re-running the seed or a manual sync; data integrity in
      // Mongo is more important than transient Neo4j drift.
    }
  }

  return getOwnProfile(userId);
}

module.exports = {
  searchUsers,
  listUsers,
  getUserProfile,
  getOwnProfile,
  updateOwnProfile,
};
