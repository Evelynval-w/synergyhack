// server/src/services/match.service.js
//
// The gap-coverage match algorithm — the heart of SynergyHack.
//
// Per professor's spec:
//   (Team)<-[:MEMBER_OF]-(member)-[:HAS_SKILL]->(teamSkill)
//   (candidate)-[:HAS_SKILL]->(candidateSkill)-[:COMPLEMENTS]->(teamSkill)
//
// The candidate's contributing skill must NOT already be a team skill
// (otherwise it's not filling a gap). The COMPLEMENTS edge is traversed
// directionally from candidateSkill to teamSkill.
//
// After Neo4j returns candidate IDs with scores, we hydrate with Mongo
// (name, bio, avatar, skills) — typical polyglot persistence pattern.

const { session } = require('../db/neo4j');
const { db } = require('../db/mongo');

/**
 * Finds candidates who complement a team's existing skills.
 *
 * Walking the query:
 *   1. Find the team and collect its current skill set (teamSkills).
 *   2. Find users NOT on the team who have skills NOT already in teamSkills.
 *      These "new skills" are the only ones eligible to score.
 *   3. For each new skill, follow COMPLEMENTS -> to a team skill.
 *   4. Sum the COMPLEMENTS strengths per candidate.
 *   5. Filter to candidates with non-zero score.
 *   6. Return top N by that sum.
 */
async function findMatches(teamId, { limit = 20 } = {}) {
  const s = session();
  try {
    const result = await s.run(
      `
      // 1. Collect the team's existing skills
      MATCH (t:Team {id: $teamId})<-[:MEMBER_OF]-(m:User)-[:HAS_SKILL]->(ts:Skill)
      WITH t, collect(DISTINCT ts) AS teamSkills

      // 2. Candidates: not on team, with skills the team does NOT have
      MATCH (c:User)-[:HAS_SKILL]->(cs:Skill)
      WHERE NOT (c)-[:MEMBER_OF]->(t)
        AND NOT cs IN teamSkills

      // 3. Follow directed COMPLEMENTS to a team skill
      OPTIONAL MATCH (cs)-[r:COMPLEMENTS]->(x:Skill)
      WHERE x IN teamSkills

      // 4. Sum strengths per candidate
      WITH c,
           sum(coalesce(r.strength, 0)) AS gapCoverage,
           count(DISTINCT cs) AS candidateNewSkillCount

      // 5. Only candidates who actually fill a gap
      WHERE gapCoverage > 0

      // 6. Top N
      RETURN c.id AS userId,
             c.username AS username,
             gapCoverage,
             candidateNewSkillCount
      ORDER BY gapCoverage DESC
      LIMIT toInteger($limit)
      `,
      { teamId, limit }
    );

    return result.records.map(r => ({
      userId: r.get('userId'),
      username: r.get('username'),
      gapCoverage: r.get('gapCoverage'),
      skillCount: r.get('candidateNewSkillCount').toNumber
        ? r.get('candidateNewSkillCount').toNumber()
        : r.get('candidateNewSkillCount'),
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

  const ids = matches.map(m => m.userId);

  const profiles = await db().collection('users').find(
    { _id: { $in: ids } },
    { projection: { passwordHash: 0 } }
  ).toArray();

  const profileMap = new Map(profiles.map(p => [String(p._id), p]));

  return matches.map(m => ({
    ...m,
    profile: profileMap.get(m.userId) || null,
  }));
}

/**
 * Returns, for a given candidate and team, the specific skill pairs
 * that drove their gap-coverage score. Used by the frontend explain modal.
 *
 * Same constraints as findMatches: candidate skill must be a NEW skill
 * (not already a team skill), and edges are directed candidateSkill -> teamSkill.
 */
async function matchExplanation(candidateId, teamId) {
  const s = session();
  try {
    const result = await s.run(
      `
      MATCH (t:Team {id: $teamId})<-[:MEMBER_OF]-(:User)-[:HAS_SKILL]->(ts:Skill)
      WITH t, collect(DISTINCT ts) AS teamSkills

      MATCH (c:User {id: $candidateId})-[:HAS_SKILL]->(cs:Skill)
      WHERE NOT cs IN teamSkills

      MATCH (cs)-[r:COMPLEMENTS]->(x:Skill)
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
