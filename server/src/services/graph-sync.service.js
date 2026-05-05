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
 *
 * @param {object} mongoDoc - the MongoDB user document with _id, username
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

/**
 * Mirrors a team from MongoDB into Neo4j as a Team node,
 * plus connects it to its Hackathon via PARTICIPATES_IN.
 */
async function syncTeam(mongoDoc) {
  const s = session();
  try {
    // Create the Team node
    await s.run(
      `MERGE (t:Team {id: $id})
       SET t.name = $name`,
      {
        id: mongoDoc._id.toString(),
        name: mongoDoc.name,
      }
    );

    // Ensure Hackathon node exists and connect
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

/**
 * Adds a user to a team via a MEMBER_OF edge.
 * Called from team.service.joinTeam() and from createTeam (for the creator).
 */
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

/**
 * Removes a MEMBER_OF edge (user leaves team).
 */
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

/**
 * Adds a skill to a user. Delegates to skill.service for consistency.
 */
async function addSkill(userId, skillName, level = 3, years = 0) {
  const skillService = require('./skill.service');
  await skillService.addUserSkill(userId, skillName, level, years);
}

/**
 * Records a past collaboration between two users.
 * Used when seeding past_projects.
 */
async function recordTeamedWith(userAId, userBId, rating, projectId) {
  const s = session();
  try {
    // Symmetric — store edge both ways so traversal works either direction
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
  recordTeamedWith,
};

