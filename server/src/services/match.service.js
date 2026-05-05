// The gap-coverage match algorithm — the heart of SynergyHack.
//
// Given a team, returns the top 20 candidates ranked by how much
// they'd expand the team's skill coverage via COMPLEMENTS edges.
//
// After Neo4j returns candidate IDs with scores, we hydrate with
// Mongo (name, bio, avatar) in one $in query — typical polyglot
// persistence pattern.


// server/src/services/match.service.js
//
// The gap-coverage match algorithm — the heart of SynergyHack.
//
// Given a team, returns the top 20 candidates ranked by how much
// they'd expand the team's skill coverage via COMPLEMENTS edges.
//
// After Neo4j returns candidate IDs with scores, we hydrate with
// Mongo (name, bio, avatar) in one $in query — typical polyglot
// persistence pattern.

const { session } = require('../db/neo4j');

// commented out in other to stub the mangodb connection
// const { db } = require('../db/mongo');
//
// const { ObjectId } = require('mongodb');

//
/**
 * Finds candidates who complement a team's existing skills.
 *
 * Walking the query:
 *   1. Find the team and all its current members' skills.
 *   2. Find all users NOT already on the team (candidates).
 *   3. For each candidate, find their skills.
 *   4. For each candidate skill, follow COMPLEMENTS edges to team skills.
 *   5. Sum the COMPLEMENTS strengths per candidate.
 *   6. Return top 20 by that sum.
 */
async function findMatches(teamId, { limit = 20 } = {}) {
  const s = session();
  try {
    const result = await s.run(
      `
      // 1. Get the team and collect its current skill coverage
      MATCH (t:Team {id: $teamId})<-[:MEMBER_OF]-(m:User)-[:HAS_SKILL]->(ts:Skill)
      WITH t, collect(DISTINCT ts) AS teamSkills

      // 2. Find candidates — users NOT on the team
      MATCH (c:User)-[:HAS_SKILL]->(cs:Skill)
      WHERE NOT (c)-[:MEMBER_OF]->(t)

      // 3. Follow COMPLEMENTS edges (both directions) to team skills
      OPTIONAL MATCH (cs)-[r:COMPLEMENTS]-(x:Skill)
      WHERE x IN teamSkills

      // 4. Sum the strengths per candidate
      WITH c,
           sum(coalesce(r.strength, 0)) AS gapCoverage,
           count(DISTINCT cs) AS candidateSkillCount

      // 5. Only keep candidates with non-zero score
      WHERE gapCoverage > 0

      // 6. Top N
      RETURN c.id AS userId,
             c.username AS username,
             gapCoverage,
             candidateSkillCount
      ORDER BY gapCoverage DESC
      LIMIT toInteger($limit)
      `,
      { teamId, limit }
    );

    return result.records.map(r => ({
      userId: r.get('userId'),
      username: r.get('username'),
      gapCoverage: r.get('gapCoverage'),
      skillCount: r.get('candidateSkillCount').toNumber
        ? r.get('candidateSkillCount').toNumber()
        : r.get('candidateSkillCount'),
    }));
  } finally {
    await s.close();
  }
}

/**
 * Enriches Neo4j match results with Mongo profile data.
 * One $in query — fast, no N+1.
 */
async function hydrateMatches(matches) {
  if (matches.length === 0) return [];
  // Lazy-load — match.service can be used without mongo (e.g. for tests)
  const { db } = require('../db/mongo');
  const { ObjectId } = require('mongodb');

  const ids = matches.map(m => {
    try { return new ObjectId(m.userId); } catch { return null; }
  }).filter(Boolean);

  const profiles = await db().collection('users').find(
    { _id: { $in: ids } },
    { projection: { passwordHash: 0 } }
  ).toArray();

  const profileMap = new Map(profiles.map(p => [p._id.toString(), p]));

  return matches.map(m => ({
    ...m,
    profile: profileMap.get(m.userId) || null,
  }));
}

/**
 * Returns, for a given candidate and team, the specific skills that
 * drove their gap-coverage score. Used by the frontend to explain
 * why a candidate is a good fit.
 */
async function matchExplanation(candidateId, teamId) {
  const s = session();
  try {
    const result = await s.run(
      `
      MATCH (t:Team {id: $teamId})<-[:MEMBER_OF]-(:User)-[:HAS_SKILL]->(ts:Skill)
      WITH t, collect(DISTINCT ts) AS teamSkills
      MATCH (c:User {id: $candidateId})-[:HAS_SKILL]->(cs:Skill)-[r:COMPLEMENTS]-(x:Skill)
      WHERE x IN teamSkills
      RETURN cs.name AS candidateSkill,
             x.name AS teamSkill,
             r.strength AS strength
      ORDER BY r.strength DESC
      LIMIT 10
      `,
      { teamId, candidateId }
    );

    return result.records.map(r => ({
      candidateSkill: r.get('candidateSkill'),
      teamSkill: r.get('teamSkill'),
      strength: r.get('strength'),
    }));
  } finally {
    await s.close();
  }
}

module.exports = { findMatches, hydrateMatches, matchExplanation };
