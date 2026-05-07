# Neo4j Graph Model

This document describes the graph schema used by SynergyHack for skill,
relationship, and team matching, as it actually exists in the seeded
database. Constraints and edge directions match the running code.

## Why a graph

The matching algorithm asks: *given a team's existing skills, which
candidates extend that coverage the most?* This is a path traversal —
start from the team's skills, follow `COMPLEMENTS` edges to candidate
skills, sum the edge weights — which a graph database answers natively.
The same query in SQL would need recursive joins or pre-joined denormal
tables, neither of which scales as the skills catalogue grows.

Profile content (bios, full project text, emails) lives in MongoDB.
The graph holds only IDs and relationships. Match results are hydrated
with profile data from Mongo before being returned to the client.

## Active nodes

These are the labels actually populated by the seed script.

| Label | Properties | Source | Notes |
|---|---|---|---|
| `User` | `id`, `username` | Mongo `users` collection | `id` matches the MongoDB `_id` so the two stores can join. |
| `Skill` | `name`, `category` | `server/src/data/skills.json` | 69 skills, 7 categories: frontend, backend, design, data, devops, mobile, pm. |
| `Team` | `id`, `name` | Mongo `teams` collection | Hydrated from MongoDB for full details. |
| `Hackathon` | `id`, `name` | Mongo `hackathons` collection | Currently only `id` and `name` are stored in graph. |

## Active relationships

These are the relationship types actually populated by the seed script.

| Pattern | Properties | Direction | Purpose |
|---|---|---|---|
| `(User)-[:HAS_SKILL]->(Skill)` | `level` (1–5), `years` | one-way | A user has a skill at a self-rated level. |
| `(Skill)-[:COMPLEMENTS]->(Skill)` | `strength` (0.0–1.0) | **stored both directions** | Hand-curated weight for how well two skills pair on a team. The match query uses directed traversal. |
| `(User)-[:MEMBER_OF]->(Team)` | — | one-way | Current team membership. The chat membership check reads this edge. |
| `(Team)-[:PARTICIPATES_IN]->(Hackathon)` | — | one-way | Which event a team is for. |
| `(User)-[:TEAMED_WITH]->(User)` | `rating` (1–5), `projectId` | bidirectional pairs created at seed | Past collaboration. Could be used to boost matches between users who shipped together; reserved for future ranking. |

### A note on `COMPLEMENTS` directionality

Each entry in `complements.json` (e.g. `{ from: "React", to: "UI Design",
strength: 0.95 }`) seeds **two directed edges**: `React -> UI Design` and
`UI Design -> React`, both with the same strength. This stores the
symmetric meaning of "these skills complement each other" while letting
the match query traverse with arrows (`->`) — which is faster than
undirected matches and follows the per-prof-spec convention.

## Reserved (not currently populated)

The schema file `server/src/db/neo4j.schema.cypher` declares uniqueness
constraints for two more node labels that are *not* populated by the
current seed. They're reserved so future iterations can plug into the
schema without migration:

| Label | Why reserved |
|---|---|
| `Role` | A `(User)-[:WANTS_ROLE]->(Role)` edge would let users declare which role they want to fill on a team, separately from their skills. Not used in v1. |
| `Project` | A `(User)-[:WORKED_ON]->(Project)` edge would tie past-collaboration context to a specific project node. v1 stores past projects in MongoDB only and uses `TEAMED_WITH.projectId` as a foreign key reference. |

## Constraints

All node labels have a uniqueness constraint on their natural key:

- `User.id`
- `Skill.name`
- `Team.id`
- `Hackathon.id`
- `Role.name` (reserved)
- `Project.id` (reserved)

In Neo4j, a uniqueness constraint also creates an index. Node lookups by
these keys are O(1) and re-running the seed is idempotent — `MERGE` on
the unique key updates rather than duplicates.

There is also an additional non-unique index for query performance:

- `Skill.category` — used when filtering skills by category in the UI.

All schema is defined in `server/src/db/neo4j.schema.cypher` and applied
at the start of every seed run.

## The match query, in full

The gap-coverage match in `server/src/services/match.service.js`:

```cypher
MATCH (t:Team {id: $teamId})<-[:MEMBER_OF]-(member:User)-[:HAS_SKILL]->(teamSkill:Skill)
WITH t, collect(DISTINCT teamSkill) AS teamSkills

MATCH (candidate:User)-[:HAS_SKILL]->(candidateSkill:Skill)
WHERE NOT (candidate)-[:MEMBER_OF]->(t)
  AND NOT candidateSkill IN teamSkills

MATCH (candidateSkill)-[c:COMPLEMENTS]->(teamSkill:Skill)
WHERE teamSkill IN teamSkills

WITH candidate, candidateSkill, sum(c.strength) AS skillContribution
WITH candidate,
     count(DISTINCT candidateSkill) AS skillCount,
     sum(skillContribution) AS gapCoverage
WHERE gapCoverage > 0

RETURN candidate.id AS userId,
       candidate.username AS username,
       gapCoverage,
       skillCount
ORDER BY gapCoverage DESC
LIMIT 20
```

Read top-down:

1. **Collect team's skills** by traversing through members.
2. **Find candidates** who aren't already on the team and whose skills
   aren't already covered.
3. **Sum the COMPLEMENTS strength** from each candidate skill back to
   each team skill. This is the gap-coverage score.
4. **Group by candidate**, count distinct contributing skills, sort by
   total score descending.

The arrow direction on `COMPLEMENTS` is what lets us traverse from the
candidate's skill *toward* the team's skill — without bidirectional
edges this would miss matches where the curated direction in
`complements.json` happens to be `team-skill -> candidate-skill`. That's
why we seed both directions.

## Why this model and not alternatives

- **Skills as nodes vs as User properties.** Storing skills as a string
  array on User would work, but `COMPLEMENTS` between skills is the
  entire point of the algorithm — and you can't put edges on strings.
  Nodes are required.

- **`COMPLEMENTS` stored both directions instead of using undirected
  traversal.** Cypher *can* traverse undirected edges (`-[:COMPLEMENTS]-`
  with no arrow), but the per-prof-spec convention is directed traversal.
  Storing both directions is cheap (~250 extra edges in our seed) and
  lets every query follow the same directional pattern.

- **Mongo for profile, graph for relationships.** Bios and project text
  are blobs of unstructured content; they don't benefit from graph
  traversal. Putting them in Mongo means search can use a text index
  there, while the graph stays small, fast, and laser-focused on
  matching.
