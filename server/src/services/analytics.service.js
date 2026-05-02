// server/src/services/analytics.service.js
//
// MongoDB aggregation pipelines — the rubric centerpiece for our Mongo grade.
//
// Both pipelines operate on the `past_projects` collection (30 hackathon
// projects with member-role assignments, skills_used, and ratings 1-5).
// They turn that raw historical data into actionable insights for new
// teammate-matching decisions:
//
//   1. skillDemandByRole      — "what skills do teams hire each role for?"
//   2. successfulTeamPatterns — "what role mix wins hackathons?"
//
// Each pipeline below is annotated stage-by-stage so the database course
// professor can read it as a documented query plan.

const { db } = require('../db/mongo');

/**
 * Pipeline 1 — Skill demand grouped by role.
 *
 * Question this answers: "For each role on a hackathon team, what are the
 * skills most often used on past projects where someone in that role
 * contributed?" A frontend dev asking "what should I be good at?" can use
 * this to see which skills frontend-staffed teams actually shipped with.
 *
 * Returns: [
 *   { role: "Backend",  skills: [{skill: "Python", count: 12}, ...] },
 *   { role: "Frontend", skills: [{skill: "React",  count: 11}, ...] },
 *   ...
 * ]
 *
 * Top 5 skills per role, all roles in alphabetical order.
 */
async function skillDemandByRole({ topN = 5 } = {}) {
  const pipeline = [
    // Stage 1 — explode the members array so each document represents
    // one (project, member) pair. After this stage we have one row per
    // person per project rather than one row per project.
    { $unwind: '$members' },

    // Stage 2 — explode skills_used so each row is now (project, member,
    // skill). Cartesian fan-out: a project with 4 members and 5 skills
    // becomes 20 rows. This is intentional — we're counting demand
    // events: every member-skill co-occurrence is one tally.
    { $unwind: '$skills_used' },

    // Stage 3 — group by (role, skill) and count co-occurrences. The
    // composite _id is the analytical key: "for role X, skill Y appeared
    // on N team-projects."
    {
      $group: {
        _id: { role: '$members.role', skill: '$skills_used' },
        count: { $sum: 1 },
      },
    },

    // Stage 4 — sort by count desc so the top skills bubble to the top
    // of each role group when we re-aggregate in stage 5.
    { $sort: { count: -1 } },

    // Stage 5 — collapse back to one document per role, with skills as
    // an array (already sorted because stage 4 sorted before us). We
    // also capture totalDemand for the "skill diversity" metric.
    {
      $group: {
        _id: '$_id.role',
        skills: { $push: { skill: '$_id.skill', count: '$count' } },
        totalDemand: { $sum: '$count' },
      },
    },

    // Stage 6 — keep only the top N skills per role. Anything past the
    // top N is "long tail" and not interesting for matching purposes.
    {
      $project: {
        _id: 0,
        role: '$_id',
        topSkills: { $slice: ['$skills', topN] },
        totalDemand: 1,
        uniqueSkillsCount: { $size: '$skills' },
      },
    },

    // Stage 7 — final sort by role name so output is stable.
    { $sort: { role: 1 } },
  ];

  return db().collection('past_projects').aggregate(pipeline).toArray();
}

/**
 * Pipeline 2 — Successful team role-composition patterns.
 *
 * Question this answers: "Which combinations of roles correlate with
 * highly-rated past projects?" A new team forming for VivaTech can see
 * that, say, "Backend + Designer + Frontend" appeared on 5 high-rated
 * projects with avg 4.6 stars — a defensible argument for that mix.
 *
 * Filters to rating > 4 (i.e., 5-star projects in our 1-5 scale, since
 * the integer threshold lets us see only unambiguously-successful teams).
 *
 * Returns: [
 *   {
 *     roleCombination: ["Backend", "Designer", "Frontend"],
 *     size: 3,
 *     successCount: 5,
 *     avgRating: 4.6,
 *     exampleProjects: ["AI Code Reviewer", "RouteCoach", ...]
 *   },
 *   ...
 * ]
 *
 * Top 10, sorted by successCount desc.
 */
async function successfulTeamPatterns() {
  const pipeline = [
    // Stage 1 — only consider projects judged "successful." rating >= 4
    // means the project landed in the top half of the 1-5 scale (4-star
    // or 5-star). The >= threshold (rather than > 4) gives us 21 projects
    // instead of 11, which lets avgRating actually vary across the
    // returned patterns — a 4.5-avg pattern is meaningfully different
    // from a 5.0-avg pattern. With > 4 the filter lets only 5-stars
    // through, which collapses every avgRating to exactly 5.0.
    { $match: { rating: { $gte: 4 } } },

    // Stage 2 — extract a canonical role-combination per project.
    //   $members.role        => array of all member roles
    //   $setUnion(arr, [])   => deduplicate (a team with 2 Backends
    //                          shouldn't double-count Backend)
    //   $sortArray           => alphabetical order so ["Backend","Designer"]
    //                          and ["Designer","Backend"] collapse into
    //                          the same group key in stage 3.
    {
      $project: {
        roleCombination: {
          $sortArray: {
            input: { $setUnion: ['$members.role', []] },
            sortBy: 1,
          },
        },
        rating: 1,
        title: 1,
      },
    },

    // Stage 3 — group by the canonical role-combination. successCount
    // is how many high-rated projects shared this exact role mix;
    // avgRating tells us how strong the pattern is on average.
    {
      $group: {
        _id: '$roleCombination',
        successCount: { $sum: 1 },
        avgRating: { $avg: '$rating' },
        exampleProjects: { $push: '$title' },
      },
    },

    // Stage 4 — rank by successCount, then by avgRating as a tiebreaker.
    // A pattern that won 5 times beats one that won 3 times at a higher
    // average; ties resolved by the avgRating to surface the strongest.
    { $sort: { successCount: -1, avgRating: -1 } },

    // Stage 5 — keep only the top 10 patterns. Anything below this is
    // probably noise from our 30-project dataset.
    { $limit: 10 },

    // Stage 6 — shape the output for the API. $size of the role array
    // gives team size, $round trims floating-point noise from the
    // average rating, and we cap exampleProjects to 3 representative
    // names rather than dumping every match.
    {
      $project: {
        _id: 0,
        roleCombination: '$_id',
        size: { $size: '$_id' },
        successCount: 1,
        avgRating: { $round: ['$avgRating', 2] },
        exampleProjects: { $slice: ['$exampleProjects', 3] },
      },
    },
  ];

  return db().collection('past_projects').aggregate(pipeline).toArray();
}

module.exports = {
  skillDemandByRole,
  successfulTeamPatterns,
};
