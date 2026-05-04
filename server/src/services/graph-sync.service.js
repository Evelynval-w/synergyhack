// server/src/services/graph-sync.service.js
//
// The single cross-DB sync point. Every operation that touches both
// MongoDB and Neo4j goes through here. Routes should not call
// neo4j.session() directly except for read-only graph queries
// (e.g. the match algorithm in match.service.js).
//
// All operations use MERGE so they're idempotent — safe to re-run
// if a sync fails and gets retried.

const { session } = require('../db/neo4j');

/**
 * Mirrors a user from MongoDB into Neo4j as a User node.
 * Called after mongo user.service.createUser().
 */
async function syncUser(mongoDoc) {
  const s = session();
  try {
    await s.run(
      `MERGE (u:User {id: $id})
       SET u.username = $username`,
      {
        id: mongoDoc._id.toString(),
        username: mongoDoc.username,
      }
    );
  } finally {
    await s.close();
  }
}

async function syncTeam(mongoDoc) {
  const s = session();
  try {
    await s.run(
      `MERGE (t:Team {id: $id})
       SET t.name = $name`,
      {
        id: mongoDoc._id.toString(),
        name: mongoDoc.name,
      }
    );

    if (mongoDoc.hackathonId) {
      await s.run(
        `MERGE (h:Hackathon {id: $hackathonId})
         WITH h
         MATCH (t:Team {id: $teamId})
         MERGE (t)-[:PARTICIPATES_IN]->(h)`,
        {
          hackathonId: mongoDoc.hackathonId.toString(),
          teamId: mongoDoc._id.toString(),
        }
      );
    }
  } finally {
    await s.close();
  }
}

async function joinTeam(userId, teamId) {
  const s = session();
  try {
    await s.run(
      `MATCH (u:User {id: $userId})
       MATCH (t:Team {id: $teamId})
       MERGE (u)-[r:MEMBER_OF]->(t)
       SET r.joinedAt = timestamp()`,
      { userId, teamId }
    );
  } finally {
    await s.close();
  }
}

async function leaveTeam(userId, teamId) {
  const s = session();
  try {
    await s.run(
      `MATCH (u:User {id: $userId})-[r:MEMBER_OF]->(t:Team {id: $teamId})
       DELETE r`,
      { userId, teamId }
    );
  } finally {
    await s.close();
  }
}

async function addSkill(userId, skillName, level = 3, years = 0) {
  const skillService = require('./skill.service');
  await skillService.addUserSkill(userId, skillName, level, years);
}

/**
 * Reconciles a user's HAS_SKILL edges in Neo4j with the canonical
 * skill list from Mongo. Called by users.service.updateOwnProfile
 * whenever the skills array changes.
 *
 * Strategy: diff current skills vs new skills, then:
 *   - Remove edges for skills that disappeared from the new list
 *   - Add edges for skills that are new
 *   - Update level/years on edges that already exist (skill name
 *     unchanged but proficiency edited)
 *
 * This is safer than a "delete all + re-add" approach because it
 * preserves edge metadata if any extra fields ever get added later.
 *
 * @param {string} userId
 * @param {Array<{name:string, level:number, years:number}>} newSkills
 */
async function syncUserSkills(userId, newSkills) {
  const s = session();
  try {
    // 1. Read current HAS_SKILL edges
    const currentResult = await s.run(
      `MATCH (u:User {id: $userId})-[r:HAS_SKILL]->(sk:Skill)
       RETURN sk.name AS name`,
      { userId }
    );
    const currentNames = new Set(currentResult.records.map(r => r.get('name')));
    const newNames = new Set(newSkills.map(s => s.name));

    // 2. Remove edges that are gone from the new list
    const toRemove = [...currentNames].filter(n => !newNames.has(n));
    if (toRemove.length > 0) {
      await s.run(
        `MATCH (u:User {id: $userId})-[r:HAS_SKILL]->(sk:Skill)
         WHERE sk.name IN $toRemove
         DELETE r`,
        { userId, toRemove }
      );
    }

    // 3. MERGE every skill in the new list — adds new ones, updates
    //    level/years on existing ones. Skills not in the catalogue
    //    (Skill nodes don't exist) are silently skipped by MATCH.
    for (const skill of newSkills) {
      await s.run(
        `MATCH (sk:Skill {name: $name})
         MERGE (u:User {id: $userId})
         MERGE (u)-[r:HAS_SKILL]->(sk)
         SET r.level = $level, r.years = $years`,
        {
          userId,
          name: skill.name,
          level: skill.level || 3,
          years: skill.years || 0,
        }
      );
    }
  } finally {
    await s.close();
  }
}

async function recordTeamedWith(userAId, userBId, rating, projectId) {
  const s = session();
  try {
    await s.run(
      `MATCH (a:User {id: $a})
       MATCH (b:User {id: $b})
       MERGE (a)-[r1:TEAMED_WITH]->(b)
       SET r1.rating = $rating, r1.projectId = $projectId
       MERGE (b)-[r2:TEAMED_WITH]->(a)
       SET r2.rating = $rating, r2.projectId = $projectId`,
      { a: userAId, b: userBId, rating, projectId }
    );
  } finally {
    await s.close();
  }
}

module.exports = {
  syncUser,
  syncTeam,
  joinTeam,
  leaveTeam,
  addSkill,
  syncUserSkills,
  recordTeamedWith,
};
