# Neo4j Graph Model

This document describes the graph schema used by SynergyHack for skill,
relationship, and team matching.

## Why a graph

The matching algorithm asks: *given a team's existing skills, which candidates
extend that coverage the most?* This is a path traversal — start from the team's
skills, follow `COMPLEMENTS` edges to candidate skills, sum the edge weights —
which a graph database answers natively. The same query in SQL would need
recursive joins and would not scale.

Profile content (bios, avatars, full project text) lives in MongoDB. The graph
holds only IDs and the relationships between them. Match results are hydrated
with profile data from Mongo before being returned to the client.

## Nodes

| Label | Properties | Notes |
|---|---|---|
| `User` | `id`, `username` | `id` matches the MongoDB `_id` so the two stores can join. |
| `Skill` | `name`, `category` | Centralised so `COMPLEMENTS` edges can connect them. Categories: frontend, backend, design, data, devops, mobile, pm. |
| `Role` | `name` | Aspirational ("Frontend Lead", "Designer", "Backend"). Separate from skills. |
| `Team` | `id`, `name` | Hydrated from MongoDB for full details. |
| `Hackathon` | `id`, `name` | Same. |
| `Project` | `id`, `title` | Used to give context to the `TEAMED_WITH` edge. |

## Relationships

| Pattern | Properties | Purpose |
|---|---|---|
| `(User)-[:HAS_SKILL]->(Skill)` | `level` (1–5), `years` | A user has a skill at a self-rated level. |
| `(Skill)-[:COMPLEMENTS]->(Skill)` | `strength` (0.0–1.0) | Hand-curated weight for how well two skills pair on a team. The match algorithm sums these. |
| `(User)-[:WANTS_ROLE]->(Role)` | — | What role the user wants to fill on a team. |
| `(User)-[:MEMBER_OF]->(Team)` | `joinedAt` | Current team membership. |
| `(Team)-[:PARTICIPATES_IN]->(Hackathon)` | — | Which event a team is for. |
| `(User)-[:TEAMED_WITH]->(User)` | `rating` (1–5), `projectId` | Past collaboration. Used to boost matches between users who shipped together successfully. |
| `(User)-[:WORKED_ON]->(Project)` | `role` | Provides context for the `TEAMED_WITH` edge. |

## Constraints and indexes

Uniqueness constraints (which also create indexes):

- `User.id`
- `Skill.name`
- `Team.id`
- `Hackathon.id`
- `Role.name`
- `Project.id`

These make node lookups O(1) and prevent duplicate inserts when the seed
script runs more than once.

## The match query (preview)

The core gap-coverage match traverses:
```
(Team)<-[:MEMBER_OF]-(member)-[:HAS_SKILL]->(teamSkill)
(candidate)-[:HAS_SKILL]->(candidateSkill)-[:COMPLEMENTS]->(teamSkill)
```

For each candidate, it sums the `strength` of all `COMPLEMENTS` edges that
connect their skills back to the team's existing skills. Higher total = better
fit. Implemented in `server/src/services/match.service.js`.

## Why this model and not alternatives

- **Skills as nodes vs as User properties**: Storing skills as a string array
  on User would work, but `COMPLEMENTS` between skills is the entire point of
  the algorithm — and you can't put edges on strings. Nodes are required.

- **`COMPLEMENTS` as a single direction**: Conceptually symmetric (backend
  pairs with design = design pairs with backend), but stored once to avoid
  duplicating the weight. Cypher queries traverse undirected by omitting the
  arrow when needed.

- **Separate `Role` node vs string property on User**: A node lets us add
  properties later (e.g. "this role typically requires these skills") without
  schema migration. Cheap insurance.

- **`TEAMED_WITH` as a direct User-User edge**: We could derive it by walking
  through `Project` each time, but storing it as a direct edge with the rating
  baked in keeps the match query fast.
