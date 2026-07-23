// server/src/routes/teams.routes.js
//
// Team listing + search + detail + create/update/leave.
//   GET    /teams             — list teams, optional ?q= text search
//   POST   /teams             — create a team (auth)
//   GET    /teams/:id         — full team detail
//   PATCH  /teams/:id         — owner edits name/description/capacity
//   POST   /teams/:id/leave   — member leaves (owner cannot leave)
//
// The list and detail are Mongo-backed (description and hackathon
// metadata live there) with Neo4j called only for member skill
// aggregation on the detail page — that's where graph traversal
// gives us aggregate-skills-of-the-team for free.

const express = require('express');
const { db } = require('../db/mongo');
const { session } = require('../db/neo4j');
const { requireAuth } = require('../middleware/auth');
const graphSync = require('../services/graph-sync.service');

const router = express.Router();

function generateTeamId() {
  const random = Math.floor(Math.random() * 1e15)
    .toString()
    .padStart(22, '0');
  return '67' + random;
}

/**
 * GET /teams
 * Lists all teams with description + hackathon name + member count.
 * Optional ?q= triggers full-text search via team_search_idx.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();

    const matchStage = q
      ? { $match: { $text: { $search: q } } }
      : { $match: {} };

    const pipeline = [
      matchStage,
      // Surface text score when searching so we can order by relevance
      ...(q ? [{
        $addFields: { score: { $meta: 'textScore' } },
      }] : []),
      {
        $lookup: {
          from: 'hackathons',
          localField: 'hackathonId',
          foreignField: '_id',
          as: 'hackathon',
          pipeline: [
            { $project: { _id: 1, name: 1, startDate: 1, endDate: 1, location: 1 } },
          ],
        },
      },
      { $addFields: { hackathon: { $first: '$hackathon' } } },
      {
        $project: {
          _id: 1,
          name: 1,
          description: 1,
          capacity: 1,
          hackathon: 1,
          memberCount: { $size: { $ifNull: ['$members', []] } },
          ...(q ? { score: 1 } : {}),
        },
      },
      // Sort: searches by relevance, plain list alphabetically
      { $sort: q ? { score: -1 } : { name: 1 } },
      { $limit: 50 },
    ];

    const teams = await db().collection('teams').aggregate(pipeline).toArray();
    res.json({ query: q || null, count: teams.length, results: teams });
  } catch (err) {
    console.error('GET /teams failed:', err);
    res.status(500).json({ error: 'List failed' });
  }
});

/**
 * POST /teams
 * Creates a team for an existing hackathon. Creator becomes the
 * sole initial member and Neo4j Team + MEMBER_OF are synced.
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { name, description, hackathonId, capacity } = req.body || {};

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) {
      return res.status(400).json({ error: 'Team name is required' });
    }
    if (!hackathonId || typeof hackathonId !== 'string') {
      return res.status(400).json({ error: 'hackathonId is required' });
    }

    const cap = Number(capacity);
    if (!Number.isFinite(cap) || cap < 1 || cap > 20) {
      return res.status(400).json({ error: 'capacity must be between 1 and 20' });
    }

    const hackathon = await db().collection('hackathons').findOne(
      { _id: hackathonId },
      { projection: { _id: 1 } }
    );
    if (!hackathon) {
      return res.status(400).json({ error: 'Hackathon not found' });
    }

    const _id = generateTeamId();
    const teamDoc = {
      _id,
      name: trimmedName,
      description: typeof description === 'string' ? description.trim() : '',
      hackathonId,
      capacity: Math.round(cap),
      createdBy: userId,
      members: [userId],
      createdAt: new Date().toISOString(),
    };

    await db().collection('teams').insertOne(teamDoc);

    try {
      await graphSync.syncTeam(teamDoc);
      await graphSync.joinTeam(userId, _id);
    } catch (err) {
      console.error('[graph-drift] syncTeam/joinTeam on create:', err.message);
    }

    res.status(201).json({
      id: _id,
      name: teamDoc.name,
      description: teamDoc.description,
      capacity: teamDoc.capacity,
      createdBy: teamDoc.createdBy,
      createdAt: teamDoc.createdAt,
      hackathonId: teamDoc.hackathonId,
      members: [userId],
    });
  } catch (err) {
    console.error('POST /teams failed:', err);
    res.status(500).json({ error: 'Create failed' });
  }
});

/**
 * PATCH /teams/:id
 * Owner-only update of name, description, and/or capacity.
 */
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const teamId = req.params.id;
    const userId = req.user.sub;
    const team = await db().collection('teams').findOne({ _id: teamId });
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (team.createdBy !== userId) {
      return res.status(403).json({ error: 'Only the team creator can edit this team.' });
    }

    const patch = {};
    const { name, description, capacity } = req.body || {};

    if (name !== undefined) {
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (!trimmed) return res.status(400).json({ error: 'Team name cannot be empty' });
      patch.name = trimmed;
    }
    if (description !== undefined) {
      if (typeof description !== 'string') {
        return res.status(400).json({ error: 'description must be a string' });
      }
      patch.description = description.trim();
    }
    if (capacity !== undefined) {
      const cap = Number(capacity);
      if (!Number.isFinite(cap) || cap < 1 || cap > 20) {
        return res.status(400).json({ error: 'capacity must be between 1 and 20' });
      }
      const memberCount = (team.members || []).length;
      if (Math.round(cap) < memberCount) {
        return res.status(400).json({
          error: `capacity cannot be less than current member count (${memberCount})`,
        });
      }
      patch.capacity = Math.round(cap);
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No editable fields provided' });
    }

    await db().collection('teams').updateOne({ _id: teamId }, { $set: patch });

    if (patch.name) {
      try {
        await graphSync.syncTeam({ _id: teamId, name: patch.name, hackathonId: team.hackathonId });
      } catch (err) {
        console.error('[graph-drift] syncTeam on patch:', err.message);
      }
    }

    const updated = await db().collection('teams').findOne({ _id: teamId });
    res.json({
      id: updated._id,
      name: updated.name,
      description: updated.description || '',
      capacity: updated.capacity,
      createdBy: updated.createdBy,
      createdAt: updated.createdAt,
      hackathonId: updated.hackathonId,
    });
  } catch (err) {
    console.error('PATCH /teams/:id failed:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

/**
 * POST /teams/:id/leave
 * Non-owner members can leave. Owners cannot leave in v1.
 */
router.post('/:id/leave', requireAuth, async (req, res) => {
  try {
    const teamId = req.params.id;
    const userId = req.user.sub;
    const team = await db().collection('teams').findOne({ _id: teamId });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    if (team.createdBy === userId) {
      return res.status(400).json({
        error: 'Team creators cannot leave their team.',
      });
    }

    if (!(team.members || []).includes(userId)) {
      return res.status(400).json({ error: 'You are not a member of this team.' });
    }

    await db().collection('teams').updateOne(
      { _id: teamId },
      { $pull: { members: userId } }
    );

    try {
      await graphSync.leaveTeam(userId, teamId);
    } catch (err) {
      console.error('[graph-drift] leaveTeam:', err.message);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /teams/:id/leave failed:', err);
    res.status(500).json({ error: 'Leave failed' });
  }
});

/**
 * GET /teams/:id
 * Full detail: team metadata + hackathon + members + combined skills.
 *
 * - Description, capacity, hackathon details: Mongo (one $lookup pipeline)
 * - Members + their union of skills: Neo4j (cheap graph traversal)
 *
 * Both are needed in one response, so we run them in parallel.
 */
router.get('/:id', requireAuth, async (req, res) => {
  const teamId = req.params.id;

  try {
    const [mongoSide, graphSide] = await Promise.all([
      db().collection('teams').aggregate([
        { $match: { _id: teamId } },
        {
          $lookup: {
            from: 'hackathons',
            localField: 'hackathonId',
            foreignField: '_id',
            as: 'hackathon',
            pipeline: [{ $project: { _id: 1, name: 1, startDate: 1, endDate: 1, location: 1, tracks: 1 } }],
          },
        },
        { $addFields: { hackathon: { $first: '$hackathon' } } },
        {
          $project: {
            _id: 1, name: 1, description: 1, capacity: 1,
            createdBy: 1, createdAt: 1, hackathon: 1,
          },
        },
      ]).next(),
      runMembersAndSkills(teamId),
    ]);

    if (!mongoSide) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Enrich Neo4j member list with role from Mongo. Members come back
    // from the graph as { id, username }; we need role for display on
    // TeamDetail. Single batch lookup, no N+1.
    let enrichedMembers = graphSide.members;
    if (graphSide.members.length > 0) {
      const memberIds = graphSide.members.map(m => m.id);
      const userDocs = await db().collection('users').find(
        { _id: { $in: memberIds } },
        { projection: { _id: 1, role: 1 } }
      ).toArray();
      const roleById = Object.fromEntries(userDocs.map(u => [u._id, u.role]));
      enrichedMembers = graphSide.members.map(m => ({
        ...m,
        role: roleById[m.id] || '',
      }));
    }

    res.json({
      id: mongoSide._id,
      name: mongoSide.name,
      description: mongoSide.description || '',
      capacity: mongoSide.capacity,
      createdBy: mongoSide.createdBy,
      createdAt: mongoSide.createdAt,
      hackathon: mongoSide.hackathon || null,
      members: enrichedMembers,
      skills: graphSide.skills,
    });
  } catch (err) {
    console.error('GET /teams/:id failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Helper: pull members + union-of-their-skills for a team via one
 * Neo4j round-trip.
 */
async function runMembersAndSkills(teamId) {
  const s = session();
  try {
    const result = await s.run(
      `
      MATCH (t:Team {id: $teamId})
      OPTIONAL MATCH (t)<-[:MEMBER_OF]-(m:User)
      OPTIONAL MATCH (m)-[:HAS_SKILL]->(sk:Skill)
      WITH t,
           collect(DISTINCT { id: m.id, username: m.username }) AS members,
           collect(DISTINCT sk.name) AS skills
      RETURN
        [m IN members WHERE m.id IS NOT NULL] AS members,
        [s IN skills WHERE s IS NOT NULL] AS skills
      `,
      { teamId }
    );

    if (result.records.length === 0) {
      return { members: [], skills: [] };
    }
    const r = result.records[0];
    return {
      members: r.get('members'),
      skills: r.get('skills'),
    };
  } finally {
    await s.close();
  }
}

module.exports = router;
