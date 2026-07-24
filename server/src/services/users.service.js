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

const DEFAULT_VISIBILITY = {
  show_current_teams: true,
  show_past_projects: true,
};

const PUBLIC_PROJECTION = {
  _id: 1,
  username: 1,
  role: 1,
  bio: 1,
  skills: 1,
  skill_names: 1,
  github_url: 1,
  profile_visibility: 1,
  account_type: 1,
  org_name: 1,
  org_slug: 1,
  website: 1,
};

const SELF_PROJECTION = {
  ...PUBLIC_PROJECTION,
  email: 1,
};

const EDITABLE_FIELDS = new Set([
  'bio',
  'role',
  'email',
  'github_url',
  'skills',
  'profile_visibility',
  'org_name',
  'website',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeVisibility(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    show_current_teams: src.show_current_teams !== false,
    show_past_projects: src.show_past_projects !== false,
  };
}

async function fetchCurrentTeams(userId) {
  return db().collection('teams')
    .find(
      { members: userId },
      { projection: { _id: 1, name: 1, hackathonId: 1 } }
    )
    .sort({ name: 1 })
    .toArray();
}

function pastProjectsLookupStages() {
  return [
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
}

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
 * and current teams. Respects profile_visibility for public viewers.
 */
async function getUserProfile(userId, { viewerId = null } = {}) {
  const pipeline = [
    { $match: { _id: userId } },
    { $project: { ...PUBLIC_PROJECTION } },
    ...pastProjectsLookupStages(),
  ];

  const [user] = await db().collection('users').aggregate(pipeline).toArray();
  if (!user) return null;

  const visibility = normalizeVisibility(user.profile_visibility);
  const isSelf = viewerId && viewerId === userId;
  const currentTeams = await fetchCurrentTeams(userId);

  const result = {
    ...user,
    profile_visibility: visibility,
    currentTeams: (isSelf || visibility.show_current_teams) ? currentTeams : [],
    pastProjects: (isSelf || visibility.show_past_projects) ? (user.pastProjects || []) : [],
  };

  // Public viewers don't need to see another user's visibility prefs
  if (!isSelf) {
    delete result.profile_visibility;
  }

  return result;
}

/**
 * "My" profile — same shape as getUserProfile but includes email
 * and always shows full teams/projects plus visibility flags.
 */
async function getOwnProfile(userId) {
  const pipeline = [
    { $match: { _id: userId } },
    { $project: { ...SELF_PROJECTION } },
    ...pastProjectsLookupStages(),
  ];

  const [user] = await db().collection('users').aggregate(pipeline).toArray();
  if (!user) return null;

  const visibility = normalizeVisibility(user.profile_visibility);
  const currentTeams = await fetchCurrentTeams(userId);

  return {
    ...user,
    profile_visibility: visibility,
    currentTeams,
    pastProjects: user.pastProjects || [],
  };
}

/**
 * Updates the authed user's own profile.
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

  if ('profile_visibility' in patch) {
    if (!patch.profile_visibility || typeof patch.profile_visibility !== 'object') {
      errors.profile_visibility = 'profile_visibility must be an object.';
    } else {
      patch.profile_visibility = normalizeVisibility(patch.profile_visibility);
    }
  }

  if ('org_name' in patch) {
    if (typeof patch.org_name !== 'string' || !patch.org_name.trim()) {
      errors.org_name = 'Organization name is required.';
    } else {
      patch.org_name = patch.org_name.trim();
    }
  }

  if ('website' in patch) {
    const url = String(patch.website || '').trim();
    if (url && !/^https?:\/\/.+/i.test(url)) {
      errors.website = 'Must be a valid URL starting with http(s)://';
    }
    patch.website = url;
  }

  if (Object.keys(errors).length > 0) {
    const e = new Error('Validation failed');
    e.code = 'VALIDATION';
    e.fields = errors;
    throw e;
  }

  if (Object.keys(patch).length === 0) {
    return getOwnProfile(userId);
  }

  await db().collection('users').updateOne(
    { _id: userId },
    { $set: patch }
  );

  if ('skills' in patch) {
    try {
      await graphSync.syncUserSkills(userId, patch.skills);
    } catch (err) {
      console.error('graph-sync.syncUserSkills failed:', err.message);
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
  DEFAULT_VISIBILITY,
};
