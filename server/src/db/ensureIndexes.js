// server/src/db/ensureIndexes.js
//
// Ensures critical indexes exist at boot so register/login and event
// flows don't rely solely on the seed script having been run.

const { db } = require('./mongo');

async function ensureIndexes() {
  const users = db().collection('users');
  await users.createIndex({ username: 1 }, { unique: true });
  await users.createIndex({ email: 1 }, { unique: true });
  await users.createIndex(
    { org_slug: 1 },
    { unique: true, sparse: true, name: 'org_slug_unique' }
  );
  await users.createIndex(
    { 'auth_providers.provider': 1, 'auth_providers.provider_id': 1 },
    { name: 'auth_provider_lookup' }
  );

  // Drop legacy text index if present, then recreate with username.
  try {
    await users.dropIndex('user_search_idx');
  } catch {
    // Index may not exist yet
  }
  await users.createIndex(
    { username: 'text', skill_names: 'text', role: 'text', bio: 'text' },
    {
      weights: { username: 10, skill_names: 10, role: 5, bio: 3 },
      name: 'user_search_idx',
    }
  );

  await db().collection('notifications').createIndex({ userId: 1, read: 1, createdAt: -1 });
  await db().collection('notifications').createIndex({ createdAt: -1 });

  await db().collection('hackathons').createIndex({ startDate: 1 });
  await db().collection('hackathons').createIndex({ createdByOrgId: 1 });
  await db().collection('hackathons').createIndex({ status: 1 });
  await db().collection('hackathons').createIndex({ visibility: 1 });

  await db().collection('event_registrations').createIndex(
    { eventId: 1, userId: 1 },
    {
      unique: true,
      partialFilterExpression: {
        registrantType: 'user',
        userId: { $type: 'string' },
        status: { $in: ['pending', 'accepted', 'invited'] },
      },
      name: 'event_reg_user_active_unique',
    }
  );
  await db().collection('event_registrations').createIndex(
    { eventId: 1, teamId: 1 },
    {
      unique: true,
      partialFilterExpression: {
        registrantType: 'team',
        teamId: { $type: 'string' },
        status: { $in: ['pending', 'accepted', 'invited'] },
      },
      name: 'event_reg_team_active_unique',
    }
  );
  await db().collection('event_registrations').createIndex({ eventId: 1, status: 1 });
  await db().collection('event_registrations').createIndex({ inviteToken: 1 }, { sparse: true });

  await db().collection('leaderboard_entries').createIndex(
    { eventId: 1, teamId: 1 },
    { unique: true, name: 'leaderboard_event_team_unique' }
  );
  await db().collection('leaderboard_entries').createIndex({ eventId: 1, rank: 1 });

  await db().collection('team_requests').createIndex(
    { teamId: 1, userId: 1 },
    {
      unique: true,
      partialFilterExpression: { status: 'pending' },
      name: 'team_requests_pending_unique',
    }
  );
}

module.exports = { ensureIndexes };
