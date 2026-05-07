# SynergyHack: Project Report

**Course:** Database Systems · **Institution:** EPITA · **Cohort:** L2 / ING2 · **Term:** 2026

**Repository:** https://github.com/Evelynval-w/synergyhack
**Submitted by:** Chris Hazzouri
**Contributors:** Aadithya Reddy Manda, Okoene Makuochukwu

---

## 1. Project Idea

SynergyHack is a teammate-matching web application for hackathon participants. It solves a problem that every hackathon attendee runs into: when you join an event without a full team, finding the right collaborators is harder than finding the event itself. Most matchmaking tools cluster people who look alike (same school, same year, same skills). SynergyHack does the opposite. It looks at a team's existing skills and surfaces candidates who fill the gaps that team is missing.

The product has three concrete user journeys:

1. **Browse and join teams.** Anyone can search teams by name or by what they're building. A non-member can request to join; the team's owner reviews the request along with the requester's skill profile and accepts or rejects.
2. **Find teammates by skill complementarity.** A team owner clicks "Find teammates" and sees a ranked list of candidates whose skills extend the team's coverage. The ranking is driven by a graph-traversal query that walks from team skills to candidate skills along curated complement edges.
3. **Talk before committing.** Members of a team get a real-time team chat. Anyone can DM anyone before requesting to join. Both surfaces are backed by Redis Streams.

Behind these three journeys sit three databases. Each one is doing a job that the other two cannot do well, which is the engineering content of the project. The rest of this report explains each database's role, the queries we run against it, and how we keep them in sync without distributed transactions.

The seed dataset has 50 users, 10 teams across 5 hackathons, 30 past hackathon projects with member-role assignments and 1–5 star ratings, and a hand-curated catalogue of 69 skills with 119 complement-pair definitions covering 7 categories (frontend, backend, design, data, devops, mobile, pm).

---

## 2. Architecture Overview

SynergyHack is a single-page React frontend talking to an Express API server. The server uses three direct database drivers (`mongodb`, `neo4j-driver`, `redis`) with no ORM layer. Each request handler delegates to a service module which is the only place that touches a given database driver. Cross-database writes go through a single `graph-sync.service.js` boundary so we have one place to reason about consistency.

```
┌─────────────────────────────────────────────────────────────┐
│                  Browser (React + Vite)                     │
│   Landing · Teams · People · Profile · Chat · Messages      │
└─────────────────────────────────────────────────────────────┘
                              │  HTTPS + 2s polling for chat
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Express API server                         │
│   Routes  ─►  Middleware (CORS, JWT, rate limit)            │
│           ─►  Services (auth, match, chat, analytics, ...)  │
│                              │                              │
│                              ▼                              │
│              graph-sync.service.js (cross-DB)               │
└──────────┬──────────────────┬─────────────────────┬─────────┘
           │                  │                     │
           ▼                  ▼                     ▼
       ┌────────┐         ┌────────┐           ┌────────┐
       │MongoDB │         │ Neo4j  │           │ Redis  │
       └────────┘         └────────┘           └────────┘
       Documents          Graph                In-memory
       Search             Traversal            Streams + state
```

The split is deliberate. Mongo holds rich, semi-structured profile content and runs analytical aggregations. Neo4j holds the sparse but expressive skill-complementarity graph and runs the matching algorithm. Redis holds ephemeral state (sessions, presence) and the live chat log. None of these jobs is a great fit for the other two stores, which is what makes the assignment of jobs to engines coherent rather than arbitrary.

The three-database setup is the course mandate; using all three was the requirement, not an open design choice. The interesting work is therefore not "should we use polyglot persistence" but "given that we must, how do we assign each engine a job it actually does well?" The rest of this report answers that question one database at a time. For each, we describe what it owns, why that match is honest, and what the alternative inside one of the other two engines would look like (and why we didn't go there).

---

## 3. MongoDB

MongoDB stores everything that has rich structure or needs analytical queries. It owns five collections:

| Collection | Documents | Purpose |
|---|---|---|
| `users` | 50 | Profile, skills as embedded objects with level/years, bio, auth credentials |
| `teams` | 10 | Name, description, capacity, member roster, hackathon reference |
| `hackathons` | 5 | Event metadata: dates, location, tracks |
| `past_projects` | 30 | Historical hackathon projects with member-role assignments and 1–5 star ratings |
| `messages` | (variable) | Mirror of every chat message written to Redis Streams; the durable archive |

### 3.1 Why a document store

User profiles are heterogeneous. Each user has a different number of skills, optional fields like `github_url`, a free-text `bio`, and historical project links of varying depth. Forcing this into a relational schema would mean either a wide `users` table with many nullable columns, or a 1:N `user_skills` join table that needs an extra query and join on every profile read. Mongo's nested documents fit the read pattern better: one round-trip returns a user's complete profile.

The same applies to teams. A team has a name and description, a member roster (which is naturally an array of references), and a hackathon link. Embedding the roster directly on the team document means listing a team's members is a projection, not a join.

### 3.2 Indexes

Ten indexes cover the access patterns the app actually has. The most important is the **compound text index on the `users` collection**, which powers the People search:

```js
db.users.createIndex(
  { skill_names: 'text', role: 'text', bio: 'text' },
  { weights: { skill_names: 10, role: 5, bio: 3 }, name: 'user_search_idx' }
);
```

The weights matter. A search for "react" should rank a frontend developer with React in their `skill_names` higher than someone who merely mentions React in their bio. The 10:5:3 ratio enforces that. Mongo's text index also gives us stemming and tokenization for free, so "designer" matches "design" matches "designs".

A parallel `team_search_idx` on the `teams` collection (`name` weight 10, `description` weight 3) backs the Teams search, with name matches outranking description matches.

The `messages` collection has a compound `(channel, ts)` index to support the most common chat read: "give me all messages on this channel in time order". The `team_requests` collection (introduced for the join-request workflow) uses a partial unique index that prevents duplicate pending requests but allows re-requesting after rejection:

```js
db.team_requests.createIndex(
  { teamId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);
```

### 3.3 Aggregation pipeline 1: Skill demand by role

This pipeline answers a concrete question: *"For each role on a hackathon team, what are the skills most often used on past projects where someone in that role contributed?"*

A frontend developer asking "what should I be good at?" can use this to see what frontend-staffed teams actually shipped with. The pipeline operates on `past_projects` and runs in seven stages.

```js
db.past_projects.aggregate([
  { $unwind: '$members' },
  { $unwind: '$skills_used' },
  { $group: {
      _id: { role: '$members.role', skill: '$skills_used' },
      count: { $sum: 1 }
  } },
  { $sort: { count: -1 } },
  { $group: {
      _id: '$_id.role',
      skills: { $push: { skill: '$_id.skill', count: '$count' } },
      totalDemand: { $sum: '$count' }
  } },
  { $project: {
      _id: 0,
      role: '$_id',
      topSkills: { $slice: ['$skills', 5] },
      totalDemand: 1,
      uniqueSkillsCount: { $size: '$skills' }
  } },
  { $sort: { role: 1 } }
])
```

The two `$unwind` stages do a deliberate Cartesian fan-out. After stage 2, each row represents one (project, member, skill) triple, so every member-skill co-occurrence becomes one tally. The first `$group` counts those tallies by (role, skill). A second `$sort + $group` collapses back to one document per role with its skills sorted in descending demand. The final `$slice` keeps only the top 5 skills per role.

Sample output (excerpt):

```json
{
  "role": "Backend",
  "topSkills": [
    { "skill": "Python",     "count": 12 },
    { "skill": "Node.js",    "count": 9 },
    { "skill": "PostgreSQL", "count": 7 },
    { "skill": "MongoDB",    "count": 6 },
    { "skill": "Express",    "count": 5 }
  ],
  "totalDemand": 39,
  "uniqueSkillsCount": 18
}
```

The result is what a job board calls a "skill demand index": the most-requested skills by role, computed from real project data rather than self-reported preferences.

### 3.4 Aggregation pipeline 2: Successful team patterns

The second pipeline answers a complementary question: *"What role combinations appear most often on highly-rated past projects?"* A new team forming for a hackathon can see, for instance, that "Backend + Designer + Frontend" appeared on 5 high-rated projects with average 4.6 stars, which is a data-driven argument for the mix.

```js
db.past_projects.aggregate([
  { $match: { rating: { $gte: 4 } } },
  { $project: {
      roleCombination: {
        $sortArray: {
          input: { $setUnion: ['$members.role', []] },
          sortBy: 1
        }
      },
      rating: 1,
      title: 1
  } },
  { $group: {
      _id: '$roleCombination',
      successCount: { $sum: 1 },
      avgRating: { $avg: '$rating' },
      exampleProjects: { $push: '$title' }
  } },
  { $sort: { successCount: -1, avgRating: -1 } },
  { $limit: 10 },
  { $project: {
      _id: 0,
      roleCombination: '$_id',
      size: { $size: '$_id' },
      successCount: 1,
      avgRating: { $round: ['$avgRating', 2] },
      exampleProjects: { $slice: ['$exampleProjects', 3] }
  } }
])
```

The interesting stage is stage 2. We extract a canonical role-combination per project by taking `$setUnion` of `$members.role` with `[]` to deduplicate (a team with 2 Backends shouldn't double-count Backend), then `$sortArray` to canonicalize order. Without that sort, `["Backend", "Designer"]` and `["Designer", "Backend"]` would group as different keys.

The `rating >= 4` threshold (rather than `> 4`) is a deliberate calibration choice. Using `> 4` only lets 5-star projects through, which collapses every `avgRating` to exactly 5.0 and erases the variance that makes the metric useful. With `>= 4` we get 21 projects spanning 4-star and 5-star, which lets `avgRating` actually differentiate strong patterns from very strong ones.

Sample output (excerpt):

```json
{
  "roleCombination": ["Backend", "Designer", "Frontend"],
  "size": 3,
  "successCount": 5,
  "avgRating": 4.6,
  "exampleProjects": ["AI Code Reviewer", "RouteCoach", "DataLensor"]
}
```

A team forming for a hackathon and looking at this output sees that the canonical "Backend + Designer + Frontend" trio has shipped 5 high-rated projects in our dataset, which is defensible evidence to recruit toward that mix rather than guessing.

Both pipelines are exposed via the `/analytics` API (`GET /analytics/skill-demand`, `GET /analytics/team-patterns`). They are not currently wired to a chart in the UI; the JSON output is the deliverable, designed to be consumed by future dashboards or recruitment recommendations.

---

## 4. Neo4j

Neo4j stores the skill-complementarity graph and the team-membership relationships. It is the engine that powers the matching algorithm, which is the project's distinctive feature.

### 4.1 What lives in the graph

The active schema has four node labels and five relationship types. All natural keys are unique-constrained, which Neo4j enforces with an index, so every node lookup by id or by skill name is O(1).

| Label | Properties | Source |
|---|---|---|
| `User` | `id`, `username` | Mongo `_id` mirrored at register time |
| `Skill` | `name`, `category` | The 69-skill catalogue in `data/skills.json` |
| `Team` | `id`, `name` | Mongo `_id` mirrored at team creation |
| `Hackathon` | `id`, `name` | Mongo `_id` |

| Relationship | Properties | Direction |
|---|---|---|
| `(User)-[:HAS_SKILL]->(Skill)` | `level` 1-5, `years` | one-way |
| `(Skill)-[:COMPLEMENTS]->(Skill)` | `strength` 0.0-1.0 | stored both directions |
| `(User)-[:MEMBER_OF]->(Team)` | (none) | one-way |
| `(Team)-[:PARTICIPATES_IN]->(Hackathon)` | (none) | one-way |
| `(User)-[:TEAMED_WITH]->(User)` | `rating`, `projectId` | bidirectional pair |

### 4.2 Why a graph store

The match algorithm asks: "given a team's existing skills, which candidates extend that coverage the most, weighted by how strongly their skills complement what's already there?" That is a path traversal: start from team skills, follow `COMPLEMENTS` edges to candidate skills, sum the edge weights. In Cypher it is three lines. In Mongo aggregation it would be a hand-rolled BFS using `$graphLookup` against a denormalized adjacency collection. Neo4j is the right home because the data is fundamentally a graph (skills connected by curated complement weights) and the read pattern is fundamentally graph traversal.

The other graph property in use is membership. `(User)-[:MEMBER_OF]->(Team)` is the source of truth for who can post in a team's chat. The chat service does a one-line Cypher check before every team message:

```cypher
MATCH (u:User {id: $userId})-[:MEMBER_OF]->(t:Team {id: $teamId})
RETURN count(*) AS n
```

If `n` is 0, the message is rejected with a 403. This same edge is created when a join request is accepted, which is how the cross-database sync stays coherent (covered in Section 6).

### 4.3 A note on COMPLEMENTS directionality

Each entry in the seed (`{from: "React", to: "UI Design", strength: 0.95}`) creates two directed edges: `React -[:COMPLEMENTS]-> UI Design` and `UI Design -[:COMPLEMENTS]-> React`, both with the same strength. The match query traverses with arrows (`->`) per the assignment specification, and storing both directions lets every query follow the same directional pattern without missing matches that happened to be defined in the "wrong" direction in the JSON. The cost is roughly 250 extra edges in the seed, which is trivial.

### 4.4 The match query (path traversal)

The match query is the centerpiece of Neo4j's role in the project. It runs against `/teams/:id/matches` and returns the top 20 candidates ranked by gap-coverage score.

```cypher
// 1. Collect the team's existing skills via two-hop traversal
MATCH (t:Team {id: $teamId})<-[:MEMBER_OF]-(m:User)-[:HAS_SKILL]->(ts:Skill)
WITH t, collect(DISTINCT ts) AS teamSkills

// 2. Find candidate users who are not on the team and whose skills
//    are not already covered by the team
MATCH (c:User)-[:HAS_SKILL]->(cs:Skill)
WHERE NOT (c)-[:MEMBER_OF]->(t)
  AND NOT cs IN teamSkills

// 3. Follow the directed COMPLEMENTS edge from candidate skill
//    to a team skill (the "filling the gap" hop)
OPTIONAL MATCH (cs)-[r:COMPLEMENTS]->(x:Skill)
WHERE x IN teamSkills

// 4. Sum the COMPLEMENTS strengths per candidate
WITH c,
     sum(coalesce(r.strength, 0)) AS gapCoverage,
     count(DISTINCT cs) AS candidateNewSkillCount

// 5. Only keep candidates who actually fill a gap
WHERE gapCoverage > 0

// 6. Top N by gap-coverage score
RETURN c.id AS userId,
       c.username AS username,
       gapCoverage,
       candidateNewSkillCount
ORDER BY gapCoverage DESC
LIMIT toInteger($limit)
```

Walking the query stage by stage:

**Stage 1** is a two-hop traversal from the team. We go from the `Team` node to its members via `MEMBER_OF`, then from each member to their skills via `HAS_SKILL`, and collect the distinct set. This is `teamSkills`: everything the team can already do.

**Stage 2** finds candidates. The two `WHERE` clauses are the eligibility filter: the candidate must not be a member of the team, and the candidate's skill must not be one the team already has. A candidate whose skills overlap entirely with the team gets zero new skills to score, and is correctly excluded.

**Stage 3** is the "gap-filling" hop. From each new skill, we follow `COMPLEMENTS` to a team skill. The `OPTIONAL MATCH` is important: a candidate skill might not complement any team skill, in which case `r` is null and `coalesce(r.strength, 0)` gives 0 for that hop instead of erasing the candidate from the result.

**Stage 4** aggregates per candidate. `sum(coalesce(r.strength, 0))` is the total complementarity score across all of that candidate's new skills. `count(DISTINCT cs)` tells us how many distinct skills contributed.

**Stages 5 and 6** filter to nonzero scores and return the top N.

Sample output for Dark Scan (whose team skills are MongoDB, Node.js, Python, React, TypeScript, Express):

```json
[
  { "userId": "650...015", "username": "noah",  "gapCoverage": 3.45, "skillCount": 4 },
  { "userId": "650...022", "username": "ava",   "gapCoverage": 2.85, "skillCount": 3 },
  { "userId": "650...008", "username": "lina",  "gapCoverage": 2.40, "skillCount": 3 },
  ...
]
```

The frontend hydrates these results with full profile data from Mongo (bio, role, top skills) before rendering, which is the standard polyglot-persistence pattern: graph for the ranking, document store for the display content.

### 4.5 What this would look like without a graph database

A relational or document-store implementation of this query would need a `complements` adjacency table or collection, a `user_skills` join, and either a recursive CTE (in PostgreSQL) or a hand-coded BFS (in Mongo aggregation). The recursion depth here is constant (two hops), so it is technically feasible. But every additional traversal feature we might want later (transitive complements, weighted shortest paths between skill clusters, "most central skills" via PageRank-style queries) gets exponentially harder in non-graph stores. Neo4j gives us those for free if we ever need them.

---

## 5. Redis

Redis is the in-memory engine and serves three roles in SynergyHack: ephemeral state with TTLs, atomic counters for rate limiting, and the live chat backbone via Streams. Each of those is a job the other two stores can do but would do worse.

### 5.1 Data structures used

Redis is a multi-data-structure store, and we use four of them deliberately. Each one is matched to a specific access pattern.

| Data type | Key pattern | What it holds | Why this type |
|---|---|---|---|
| `STRING` | `session:{token}` | userId, TTL 24 hours | O(1) get/set with native expiry |
| `STRING` | `ratelimit:{ip}` | counter, TTL 1 second | INCR is atomic, TTL is built in |
| `STRING` | `presence:{userId}` | timestamp, TTL 60 seconds | last-seen heartbeat |
| `SET` | `online:users` | userIds currently active | SADD/SMEMBERS for online list |
| `STREAM` | `chat:team:{teamId}` | chat messages, MAXLEN ~ 500 | append-only ordered log with auto-trim |
| `STREAM` | `chat:dm:{sortedA}:{sortedB}` | DM messages | same, with sorted-key trick for 1:1 |

The two `STRING`-with-TTL roles (sessions and rate limit) demonstrate why Redis is the correct tool here. A logout in our system is a single `DEL session:{token}` rather than a database write; an unused session simply expires without any cleanup job; and a rate limit window is "set a counter to 1 with a 1-second TTL, then INCR on every subsequent hit." Doing either of those in Mongo would require a polling cleanup job and explicit timestamp comparisons.

### 5.2 Streams for chat

The most ambitious use of Redis in the project is the chat system. Both team chat and direct messages run on Redis Streams, which is the right primitive because:

- **Streams are append-only ordered logs**, exactly the data shape of a chat conversation
- **`XADD` returns a millisecond-precision stream ID** that doubles as a cursor for incremental reads
- **`MAXLEN` trimming caps each channel's memory footprint** so the chat can run forever without manual cleanup
- **`XRANGE` with a `since` cursor lets clients poll for new messages efficiently** (we poll every 2 seconds; only changes since the last seen ID are returned)

The send code is one line plus the trim:

```js
await client.xAdd(channelKey, '*', { from, to, body, ts }, {
  TRIM: {
    strategy: 'MAXLEN',
    strategyModifier: '~',     // approximate trim, runs in batches
    threshold: 500,
  },
});
```

The `~` modifier on `MAXLEN` is "approximate trim": Redis trims in batches when convenient rather than on every write, which keeps the operation fast at the cost of letting the stream briefly hold slightly more than 500 entries. For a hackathon-scale chat this is the correct trade.

### 5.3 The DM channel-key trick

DMs need a single channel name regardless of which user opens the conversation. Without a trick, if user A messages user B, the natural key would be `chat:dm:A:B`. But when B opens the conversation, they would naturally compute `chat:dm:B:A`, which is a different Redis key, and they would see no messages. We solve this by sorting the two user IDs lexicographically before forming the key:

```js
function dmKey(userA, userB) {
  const [a, b] = [userA, userB].sort();
  return `chat:dm:${a}:${b}`;
}
```

Both participants compute the same key from their two IDs, so they read and write to the same stream. No separate "channel" record is needed in any database. This is the entire design of 1:1 chat in two lines of code.

### 5.4 The Mongo mirror

Streams hold the live truth, but they are capped at 500 entries per channel. For a long-lived conversation that would mean losing history. We mirror every message to a Mongo `messages` collection in a fire-and-forget write right after the `XADD`:

```js
await xaddCapped(channelKey, fields);          // canonical write
await mirrorToMongo({ channel, fromUserId, toUserId, body, ts });  // archive
```

The Mongo write is wrapped in a try/catch that logs but does not throw, so a Mongo blip never tells the user that their message failed when it was actually delivered to the stream. The mirror is what powers the Messages inbox (`GET /dms`), which asks "all DM channels involving user X". That is a cross-channel query that Streams cannot answer (a stream is per-channel by design), but Mongo's aggregation framework handles it cleanly.

This is the pattern the project leans on most: each engine owns the queries it is good at, and we copy data when a different engine needs to answer a different question. The cost is one extra write per message; the benefit is that both real-time chat and "show me my conversations" can be expressed as one-liners against the engine that fits.

---

## 6. Cross-Database Integrity

A polyglot system has one structural risk that a single-database system does not: the stores can drift out of sync. If a user is added to a team in Mongo but the matching `MEMBER_OF` edge fails to land in Neo4j, the chat permission check fails and the user looks like a member who cannot post. We chose not to use distributed transactions (Mongo, Neo4j, and Redis do not share a transaction coordinator) and instead built a single sync boundary plus an explicit ordering rule.

### 6.1 The single sync point

`server/src/services/graph-sync.service.js` is the only module that writes to both databases in one call. Every cross-DB operation goes through it:

```
syncUser(mongoDoc)              create User node from a Mongo user
syncTeam(mongoDoc)              create Team node from a Mongo team
joinTeam(userId, teamId)        create MEMBER_OF edge
leaveTeam(userId, teamId)       remove MEMBER_OF edge
syncUserSkills(userId, skills)  diff and reconcile HAS_SKILL edges
recordTeamedWith(...)           create TEAMED_WITH pair
```

Routes are not allowed to call `neo4j.session()` directly for writes; they call into a service which calls graph-sync. This rule has two practical benefits. First, every cross-DB write is grep-able from one file. Second, when something drifts, the bug is in graph-sync, not scattered across seven route handlers.

Every operation in graph-sync is built on `MERGE` rather than `CREATE`, which makes them idempotent. Re-running them is safe; recovering from a partial failure is just calling them again.

### 6.2 Ordering: Mongo first, then Neo4j

Every dual-write follows the same rule: write to Mongo first, then sync to Neo4j. Mongo is treated as the source of truth, and Neo4j as a derived secondary that can be reconciled if it drifts. This decision shapes the failure mode: if a write succeeds in Mongo but fails in Neo4j, the user sees their action take effect (their profile is updated, they are added to the team), and the graph drift gets logged for later reconciliation rather than rolled back.

The alternative (Neo4j first, then Mongo) would invert the failure mode: if Mongo failed after Neo4j succeeded, the user would see "save failed" while the graph already had their data. That is worse, because the visible truth (the UI) and the persistent truth (Mongo, the store with backups) would disagree.

A worked example, register flow:

```js
// 1. Validate, hash password, generate _id
const userDoc = { _id, username, email, password_hash, ... };

// 2. Write to Mongo (canonical)
await db().collection('users').insertOne(userDoc);

// 3. Mirror to Neo4j (derived)
try {
  await graphSync.syncUser({ _id, username });
} catch (err) {
  console.error('graph-sync.syncUser failed during register:', err.message);
  // Mongo doc still exists; graph-sync is idempotent so a later
  // seed/sync can recover the missing edge without losing the user.
}

// 4. Issue session
const token = auth.signToken({ id: _id, username });
await sessionService.createSession(token, _id);
```

The same pattern repeats in `acceptRequest`: update Mongo first (status flag plus team membership), then call `graphSync.joinTeam` to create the `MEMBER_OF` edge. If the Neo4j call fails, we log a `[graph-drift]` line tagged with the user and team IDs, and Mongo continues to reflect the truth.

### 6.3 Reconciling skills via diff-and-apply

The most interesting case is editing a user's skills. When a user updates their profile, the new skills array is written to Mongo wholesale, but Neo4j needs incremental edge changes (drop old `HAS_SKILL` edges, add new ones, update level/years on unchanged ones). `graphSync.syncUserSkills` handles this by diffing:

```js
// 1. Read current edges from Neo4j
const currentResult = await s.run(
  `MATCH (u:User {id: $userId})-[:HAS_SKILL]->(sk:Skill) RETURN sk.name AS name`,
  { userId }
);
const currentNames = new Set(currentResult.records.map(r => r.get('name')));
const newNames = new Set(newSkills.map(s => s.name));

// 2. Drop edges that are gone from the new list
const toRemove = [...currentNames].filter(n => !newNames.has(n));
if (toRemove.length > 0) { /* DELETE r */ }

// 3. MERGE every skill in the new list (adds new + updates existing)
for (const skill of newSkills) {
  await s.run(
    `MATCH (sk:Skill {name: $name})
     MERGE (u:User {id: $userId})
     MERGE (u)-[r:HAS_SKILL]->(sk)
     SET r.level = $level, r.years = $years`,
    { userId, name: skill.name, level: skill.level, years: skill.years }
  );
}
```

Why diff-and-apply rather than "delete all edges then re-add the new list"? Two reasons. First, it preserves any extra metadata on edges we have not yet written into the schema (forward-compatibility). Second, it produces the smallest possible graph mutation, which makes the Neo4j operation log easier to reason about during debugging. Skills not in the catalogue (unknown `Skill` nodes) are silently skipped by the `MATCH (sk:Skill {name: $name})` clause, so the user can add a custom skill on their profile without breaking the sync; the UI surfaces an amber "not in catalogue, won't surface in matching" hint to make this transparent.

### 6.4 What we accept

We do not have ACID guarantees across the three stores. We accept this consciously and bound the impact:

- **Mongo failures roll back the user-visible action.** A failed Mongo write returns an error to the client; nothing happens in Neo4j or Redis.
- **Neo4j drift is logged, not rolled back.** A `[graph-drift]` log entry is the recovery signal; the seed scripts and graph-sync helpers are idempotent, so a manual or scheduled sync can repair drift.
- **Redis is treated as best-effort cache.** Sessions can be re-issued; presence has a TTL anyway; chat messages are mirrored to Mongo for durability.

The result is a system that can have brief inconsistencies under failure but never silently loses user-visible data and never gets stuck in a state that cannot be recovered.

---

## 7. Contributions

This project was built as a team of three. The code that landed in the submission was authored predominantly by one team member, but the design and earlier exploration drew on work and conversations from all three. We list contributions honestly here so the grader can read the git history accurately.

**Okoene Makuochukwu** wrote the architecture, the matching algorithm and Cypher query, the chat system (Streams, Mongo mirror, DM channel-key design), the analytics aggregation pipelines, the search infrastructure, the React frontend including the landing page and all routed pages, the join-request workflow, and the documentation in `docs/`. Single-author commits on `makuo/feat/finish-line` cover the body of the work.

**Aadithya Reddy Manda** authored the original Express scaffold and the MongoDB connector with collection indexes (visible on `aadithya/feat/mongo-schemas` and `aadithya/chore/backend-scaffold`), and is co-author on commits where his earlier work was extended: the production register and bcrypt-backed login flow, the join-request workflow that builds on his Mongo schema, and the report itself. The auth.service stub he was meant to replace explicitly named him as the intended author of bcrypt integration; that integration is now present and credited.

**Chris Hazzouri** authored the original chat UI and backend exploration (visible on `chris/feature/chat-ui`), and is co-author on commits where his earlier work was extended: the landing page (which builds on his frontend instincts), the profile editor, the team search and project overview, and the README and Docker work in the deployment phase and this report.

`Co-authored-by` trailers on commits make these attributions visible on GitHub's contributors graph and on each individual commit page. The git log is the canonical record; this section is the prose summary.

---

## 8. Setup

The repository ships with everything needed to run the project locally. Quick start:

```bash
# 1. Bring up Mongo and Redis via Docker Compose
docker compose up -d

# 2. Configure Neo4j (Aura cloud or local Docker; see README)
cp .env.example .env
# Edit .env with your Neo4j URI / credentials

# 3. Install server + client dependencies
cd server && npm install
cd ../client && npm install

# 4. Seed the databases
cd ..
node scripts/seed-mongo.js
node scripts/seed-neo4j.js

# 5. Start the server and the client (in two terminals)
cd server && npm start
cd client && npm run dev
```

Demo accounts sign in with the password `password123`. Try `makuo`, `aadithya`, `noah`, `lina_dev`, or any other seeded username. The README has full details, including how to swap Aura for a local Neo4j Docker container.

---

*End of report.*
