# SynergyHack

A complementarity-based hackathon teammate matcher. Built for EPITA Paris — Database Systems final project (April–May 2026).

> **Status:** in active development through 4 May 2026. This README describes the finished system. Anything not yet implemented is tagged `[TODO]`.

---

## Demo

> **[TODO]** Add screenshots once frontend is functional. Suggested: home page, team page with chat panel, match results with skill coverage chart.
>
> **[TODO]** Optional: 3–5 minute demo video walking through a full session — register, create a team, request matches, see the gap-coverage explanation. Embed as a YouTube link or a `docs/demo.mp4` file.

---

## The problem

Most hackathon teammate-finding tools optimize for the wrong thing. They match people who already have similar skills — backend developers find other backend developers, designers find designers — and you end up with a team where everyone's strong in the same area and nobody owns the parts they're weak in.

SynergyHack flips this. Instead of finding people *like* you, it finds people who *complement* you. If your team is two backend developers, the tool surfaces designers and front-end developers, not more backend folks. The result: balanced teams that actually ship.

The matching is computed as a graph traversal in Neo4j over a hand-curated complementarity matrix between skills. That's the heart of the project, and the reason a graph database is the right tool here.

---

## Why three databases?

We use **MongoDB**, **Neo4j**, and **Redis** together because each one is the right tool for a different part of the problem:

- **MongoDB** is the source of truth for content — user profiles, team descriptions, hackathon details, past projects. Document-shaped data with variable schema, occasional full-text search needs (find people whose bio mentions "Python"), and analytics over historical projects via aggregation pipelines.
- **Neo4j** holds the graph projection — users, skills, teams, and the COMPLEMENTS edges between skills. It answers the matching question (a path traversal) in a single Cypher query that would be a recursive nightmare in SQL.
- **Redis** handles everything that's ephemeral or needs sub-millisecond reads: sessions, presence, atomic team-slot counters, leaderboards, recent activity, and durable chat via Redis Streams.

This is polyglot persistence: pick the database that fits the data shape and the access pattern, not the one you're most comfortable with.

---

## Architecture

> **[TODO]** Embed the architecture diagram. Export `docs/synergyhack_architecture.drawio` to PNG and reference it as `docs/architecture.png`, then uncomment the line below.

<!-- ![Architecture](docs/architecture.png) -->

The system is a single Express server backed by all three databases, plus a React frontend. Users hit the React app, which calls the Express API. The API reads and writes to all three stores through a thin service layer:

- `mongo.js`, `neo4j.js`, `redis.js` — connection singletons (one per DB)
- `*.service.js` files — business logic per resource (`user.service`, `team.service`, `match.service`, etc.)
- `graph-sync.service.js` — the only place where MongoDB and Neo4j writes are coordinated; routes never touch both directly

For the demo and submission, the whole stack runs locally via Docker Compose. For day-to-day development, MongoDB Atlas and Neo4j AuraDB are used so the team isn't dependent on Docker being up on every laptop.

---

## Tech stack

**Backend**
- Node.js 20 + Express
- MongoDB driver (`mongodb` — no Mongoose; the project rubric explicitly forbids ORMs)
- Neo4j driver (`neo4j-driver`)
- Redis client (`redis`)
- bcrypt for password hashing, jsonwebtoken for auth tokens

**Frontend**
- React 18 + Vite
- TailwindCSS
- React Router
- Recharts (for the skill-coverage radar chart)
- Axios

**Infrastructure**
- Docker + Docker Compose
- nginx (serves the built React app in the production container)

**Databases**
- MongoDB 7
- Neo4j 5 (Community)
- Redis 7

---

## Prerequisites

- **Docker Desktop** — https://www.docker.com/products/docker-desktop
- **Node.js 20** (only if you want to run the seed script outside Docker; the app itself runs in containers)
- **Git** — for cloning

That's it. No need to install MongoDB, Neo4j, or Redis separately.

---

## Quick start

```bash
# 1. Clone
git clone https://github.com/Evelynval-w/synergyhack.git
cd synergyhack

# 2. Set up environment variables
cp .env.example .env
# (the defaults work for Docker mode — only edit if you want cloud DBs)

# 3. Bring up the stack
docker compose up --build

# 4. In a second terminal, seed the databases with sample data
npm run seed

# 5. Open the app
# Frontend: http://localhost:5173
# API:      http://localhost:3000
# Neo4j Browser: http://localhost:7474 (login: neo4j / dev_password)
```

The first `docker compose up` takes 2–3 minutes because it builds the images. Subsequent starts take about 20 seconds.

To shut down:

```bash
docker compose down       # stops containers, keeps the data
docker compose down -v    # stops AND wipes all data (use this for a clean test)
```

---

## How to use

### As a hackathon participant

1. **Register** at `/register` with a username, email, password, and short bio.
2. **Add your skills** on `/profile` — pick from the catalogue and rate your level (1–5) and years of experience.
3. **Browse hackathons** at `/hackathons` and pick one you want to compete in.
4. **Create a team** for that hackathon, or join an existing one.
5. **Find teammates** by clicking "Find matches" on your team page. The system returns up to 20 candidates ranked by how much they'd extend your team's skill coverage.
6. **Click a match** to see exactly which of their skills complement yours — you can defend the recommendation, not just trust the score.
7. **Chat with your team** using the panel on the team page. Messages are persisted in Redis Streams so anyone joining mid-event sees the full history.

### As a developer poking around

- **API root:** `http://localhost:3000` returns the version
- **Health check:** `GET /health` returns the status of all three databases
- **API docs:** Postman collection committed at `docs/postman-collection.json`
- **Neo4j Browser:** `http://localhost:7474` lets you run Cypher queries against the graph

---

## Project structure

```
synergyhack/
├── client/                  # React frontend (Vite + Tailwind)
│   ├── src/
│   │   ├── api/             # Axios client with auth interceptor
│   │   ├── components/      # Layout, ChatPanel, MatchCard, SkillCoverageChart, SearchBox
│   │   ├── hooks/           # useAuth, usePolling, useChat, useOnline
│   │   └── pages/           # Login, Register, Profile, Hackathons, TeamDetail, Matches
│   ├── Dockerfile
│   └── nginx.conf
│
├── server/                  # Express backend
│   ├── src/
│   │   ├── db/              # Connection singletons: mongo.js, neo4j.js, redis.js
│   │   │                    # + neo4j.schema.cypher (constraints + indexes)
│   │   ├── data/            # skills.json, complements.json (the matching matrix)
│   │   ├── middleware/      # auth.js (JWT + Redis session check), rateLimit.js
│   │   ├── routes/          # auth, users, teams, hackathons, matches, messages, analytics, stats
│   │   ├── services/        # business logic per resource + the cross-DB sync layer
│   │   └── index.js         # Express entry point
│   └── Dockerfile
│
├── scripts/
│   ├── fixtures/            # Hand-crafted JSON: 50 users, 5 hackathons, 10 teams, 30 past projects
│   ├── seed-mongo.js        # Bulk inserts Mongo data
│   ├── seed-neo4j.js        # Schema + skills + complements + users + teams + memberships
│   ├── seed-redis.js        # Warms sessions, presence, slot counters, chat seed messages
│   └── seed.js              # Unified runner — calls all three in order
│
├── docs/
│   ├── architecture.png     # System diagram [TODO: export from drawio]
│   ├── mongo-schema.md
│   ├── neo4j-schema.md
│   ├── redis-schema.md
│   └── postman-collection.json
│
├── tests/
│   └── match.test.js        # Unit test for the gap-coverage match algorithm
│
├── docker-compose.yml
├── .env.example
├── REPORT.md                # Project report (rubric deliverable)
├── REPORT.pdf               # Same, exported
├── README.md                # ← you are here
└── LICENSE
```

---

## The databases in more detail

### MongoDB — content & analytics

Five collections: `users`, `teams`, `hackathons`, `past_projects`, plus indexes for unique constraints and full-text search.

Two aggregation pipelines power the analytics endpoints:

- `GET /analytics/skill-demand` — across all past projects, which skills are most in demand for each role? (`$unwind` members, `$unwind` skills, `$group` by role-skill, `$sort`)
- `GET /analytics/team-patterns` — in highly-rated past projects (rating > 4), which combinations of roles appear most often? (`$match`, `$unwind`, `$group` per project, `$sortArray`, `$group` again on combinations, `$limit`)

A text index on `bio` and `username` powers `/users/search?q=...`, used by the header search box on the frontend.

Full schema and rationale: [`docs/mongo-schema.md`](docs/mongo-schema.md).

### Neo4j — the matching graph

Six node types (User, Skill, Role, Team, Hackathon, Project) and seven relationship types. The interesting one is `(:Skill)-[:COMPLEMENTS {strength: 0.0–1.0}]->(:Skill)` — a hand-curated matrix that encodes which skills pair well on a hackathon team.

The match algorithm is one Cypher query that:

1. Collects all skills currently held by team members
2. Finds candidate users not already on the team
3. For each candidate skill, follows COMPLEMENTS edges back to team skills
4. Sums the edge strengths per candidate
5. Returns top 20 by total

The query lives in `server/src/services/match.service.js`. It's exposed at `GET /teams/:id/matches`.

Full schema and the walked-through query: [`docs/neo4j-schema.md`](docs/neo4j-schema.md).

### Redis — sessions, presence, real-time

All six base Redis data types are in active use:

| Type | Key pattern | Role |
|---|---|---|
| STRING | `session:{token}` | Logged-in user state, 24h TTL |
| SET | `online:users` | Currently online user IDs |
| HASH | `team:{id}:slots` | Atomic team-slot counters |
| ZSET | `leaderboard:matchers` | Ranked top-N most active matchers |
| LIST | `recent:joins` | Bounded activity feed (last 20 joins) |
| STREAM | `chat:team:{id}` | Durable chat with cursor-based reads |

The chat is the standout piece — Redis Streams give us auto-generated message IDs, efficient `XRANGE` queries to fetch only new messages since a client's last-seen ID, and durability without any extra storage layer. Full reasoning in [`docs/redis-schema.md`](docs/redis-schema.md).

---

## Running without Docker

If you want to develop against cloud-hosted databases instead of containers:

1. Sign up for **MongoDB Atlas** (free M0 tier) and **Neo4j AuraDB Free**.
2. For Redis, you can run it locally with `brew install redis && redis-server`, or sign up for Upstash (free tier).
3. Update `.env` with the cloud connection strings (templates are commented in `.env.example`).
4. Run the server directly: `cd server && npm install && npm run dev`
5. Run the frontend directly: `cd client && npm install && npm run dev`

This is what the team uses for day-to-day development. Docker mode is for the demo and submission.

---

## Troubleshooting

**`docker compose up` hangs at "waiting for healthchecks"**
Neo4j takes 30–60 seconds to fully boot on first run. Wait it out. If it's still stuck after 2 minutes, run `docker compose logs neo4j` and check for errors.

**`npm run seed` fails with connection errors**
The databases need to be healthy before seeding. Make sure `docker compose ps` shows all services as `healthy`, not `starting`.

**Port already in use (3000, 5173, 27017, 7474, 7687, or 6379)**
Something else is using one of the ports. Either stop it, or change the port mapping in `docker-compose.yml`.

**Match results look weird / empty**
The graph needs to be seeded. Run `npm run seed` and check Neo4j Browser at `http://localhost:7474` — you should see User and Skill nodes with edges between them.

**`git push` blocked by branch protection**
That's working as intended. Push to a feature branch and open a Pull Request.

---

## The team

> **[TODO]** Add real names, GitHub profile links, short bios. Suggested: 1–2 sentences each + role on the project.

- **Makuochukwu Okoene** ([@Evelynval-w](https://github.com/Evelynval-w)) — Neo4j, match algorithm, frontend match UI
- **Aadithya** ([@TODO](#)) — MongoDB, authentication, aggregations, frontend auth pages
- **Chris** ([@chrissoo1213](https://github.com/chrissoo1213)) — Redis, Docker, real-time features, frontend scaffold

Course: **EPITA Paris — Database Systems** (Spring 2026). Project deadline: **4 May 2026**.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Acknowledgments

> **[TODO]** Add anything you want to credit here. Suggestions:
> - Your professor (with permission — usually fine to name them)
> - Any tutorials, articles, or papers that influenced the design
> - Tools you relied on (Neo4j AuraDB, MongoDB Atlas, etc.)
> - Anyone outside the team who helped (TAs, classmates who reviewed PRs, etc.)

Built as a final project for the EPITA Paris Database Systems course. The complementarity-based matching idea was inspired by the observation that real hackathon teams need *complementary* skills, not redundant ones — a problem we ran into ourselves at past events.
