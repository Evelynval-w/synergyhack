// server/src/routes/teams.routes.js
//
// Team listing + search + detail.
//   GET /teams             — list teams, optional ?q= text search
//   GET /teams/:id         — single team's full info: description,
//                            hackathon details, members, combined skills
//
// The list and detail are Mongo-backed (description and hackathon
// metadata live there) with Neo4j called only for member skill
// aggregation on the detail page — that's where graph traversal
// gives us aggregate-skills-of-the-team for free.

const express = require('express');
const { db } = require('../db/mongo');
const { session } = require('../db/neo4j');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

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
