// server/src/routes/teams.routes.js
//
// Endpoints for team listing and team detail.
// GET /teams           → list all teams
// GET /teams/:id       → single team's info + members

const express = require('express');
const { session } = require('../db/neo4j');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /teams — return all teams
router.get('/', requireAuth, async (req, res) => {
  const s = session();
  try {
    const result = await s.run(`
      MATCH (t:Team)
      OPTIONAL MATCH (t)<-[:MEMBER_OF]-(u:User)
      WITH t, count(u) AS memberCount
      RETURN t.id AS id, t.name AS name, memberCount
      ORDER BY t.name
    `);

    const teams = result.records.map(r => ({
      id: r.get('id'),
      name: r.get('name'),
      memberCount: r.get('memberCount').toNumber
        ? r.get('memberCount').toNumber()
        : r.get('memberCount'),
    }));

    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await s.close();
  }
});

// GET /teams/:id — return one team with its members and skills
router.get('/:id', requireAuth, async (req, res) => {
  const s = session();
  try {
    const result = await s.run(
      `
      MATCH (t:Team {id: $teamId})
      OPTIONAL MATCH (t)<-[:MEMBER_OF]-(m:User)
      OPTIONAL MATCH (m)-[:HAS_SKILL]->(s:Skill)
      WITH t,
           collect(DISTINCT { id: m.id, username: m.username }) AS members,
           collect(DISTINCT s.name) AS skills
      RETURN t.id AS id,
             t.name AS name,
             [m IN members WHERE m.id IS NOT NULL] AS members,
             [s IN skills WHERE s IS NOT NULL] AS skills
      `,
      { teamId: req.params.id }
    );

    if (result.records.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const r = result.records[0];
    res.json({
      id: r.get('id'),
      name: r.get('name'),
      members: r.get('members'),
      skills: r.get('skills'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await s.close();
  }
});

module.exports = router;
