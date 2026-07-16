# SynergyHack

A teammate-matching app for hackathon participants, built for EPITA's Database Systems course. Finds collaborators who **complement** your team's skills rather than duplicating them.

Built on three databases that each do a job the others cannot do well:

- **MongoDB** for profile content, team data, and analytical aggregations
- **Neo4j** for the skill-complementarity graph and the matching algorithm
- **Redis** for sessions, presence, and real-time chat via Streams

For the full design rationale, see [REPORT.md](./REPORT.md). For the architecture diagrams and per-database schemas, see [docs/](./docs/).

---

## Quick start

The whole stack runs in Docker:

```bash
git clone https://github.com/Evelynval-w/synergyhack.git
cd synergyhack
cp .env.example .env

# Bring up everything: Mongo, Redis, Neo4j, server, client
docker compose up -d --build

# Seed both databases (first run only)
docker compose exec server node ../scripts/seed-mongo.js
docker compose exec server node ../scripts/seed-neo4j.js

# Open the app
open http://localhost:8080
```

That's it. Five containers, no local Node or npm install required on the host machine.

To stop everything: `docker compose down`. To reset Mongo and Redis volumes too: `docker compose down -v`.

### Demo accounts

Every seeded user signs in with the password **`password123`**. Try `makuo`, `aadithya`, `chris`, `noah`, `lina_dev`, or any other seeded username (50 in total). You can also create a fresh account from the landing page.

---

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React 19, Vite, Tailwind, React Router |
| Backend | Node.js 20, Express, JSON Web Tokens, bcryptjs |
| Databases | MongoDB 7, Neo4j 5, Redis 7 |
| Infra | Docker Compose, Nginx (serves client + reverse-proxies API) |

No ORM. Each database is accessed via its native driver from a dedicated service module under `server/src/services/`. All cross-database writes go through `graph-sync.service.js`, which is the only module allowed to write to two stores in one call.

---

## Architecture

```
        ┌────────────────────────────┐
        │    Browser (port 8080)     │
        └─────────────┬──────────────┘
                      │
        ┌─────────────▼──────────────┐
        │  Nginx (client container)  │
        │  - serves built React SPA  │
        │  - reverse-proxies /api/*  │
        └─────────────┬──────────────┘
                      │ /api/*
        ┌─────────────▼──────────────┐
        │   Express (server:3000)    │
        └──┬───────────┬───────────┬─┘
           │           │           │
       ┌───▼──┐    ┌──▼──┐     ┌──▼───┐
       │Mongo │    │Neo4j│     │Redis │
       │27017 │    │7687 │     │ 6379 │
       └──────┘    └─────┘     └──────┘
```

The browser only ever talks to one origin (`http://localhost:8080`). Nginx routes `/api/*` to the Express server and serves everything else as static SPA assets. No CORS headaches, no separate API URL to configure.

For sequence diagrams of the four key flows (login, match, chat, inbox) and the per-database role breakdown, see [docs/architecture.md](./docs/architecture.md).

---

## Features

**Auth.** Real bcrypt-backed register and login. Sessions stored in Redis with 24-hour TTL.

**People discovery.** Browse all users alphabetically or full-text search across skill names, role, and bio (compound text index in Mongo with weighted fields). Click into anyone's profile to see their skills with level/years and their past hackathon projects.

**Profile editor.** Edit your bio, role, GitHub URL, email, and skills. Skill changes diff-and-apply against Neo4j: removed skills drop their `HAS_SKILL` edges, new ones get added, level/years on unchanged skills get updated. Mongo is the source of truth; Neo4j stays in sync via the single `graph-sync` boundary.

**Teams.** Browse teams or search by name and project pitch. Each team has a hackathon, a description, capacity, and a member roster.

**Matching.** A team's owner clicks "Find teammates" and sees a ranked list of candidates whose skills complement what the team is missing. The ranking is a Cypher path traversal: from the team's existing skills, follow `COMPLEMENTS` edges (with weights) to candidate skills, sum, and rank.

**Join requests.** A non-member can request to join a team with an optional message. The team's owner sees the request inline on the team page with the requester's profile preview, and can accept (which adds them to Mongo + creates the Neo4j edge) or reject (which keeps an audit record). The partial unique index prevents duplicate pending requests but allows re-requesting after rejection.

**Chat.** Each team has a live chat backed by Redis Streams (capped at 500 messages with `MAXLEN ~`). 1:1 DMs use a sorted-key channel pattern (`chat:dm:{sortedA}:{sortedB}`) so both participants read and write to the same stream. Every message is mirrored to a Mongo `messages` collection for durable archival and cross-channel queries (the inbox).

**Analytics.** Two MongoDB aggregation pipelines on `past_projects`:
- `GET /analytics/skill-demand` returns the top 5 skills demanded for each role across past hackathon projects
- `GET /analytics/team-patterns` returns the role combinations that appear most often on highly-rated past projects

---

## API endpoints

Auth:

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | New account: username, email, password, role |
| POST | `/api/auth/login` | bcrypt-verified login |
| POST | `/api/auth/logout` | Invalidate session |

Users:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/users` | Paginated browse |
| GET | `/api/users/search?q=` | Full-text search |
| GET | `/api/users/me` | Own profile (includes email) |
| PATCH | `/api/users/me` | Update bio, role, email, github_url, skills |
| GET | `/api/users/:id` | Public profile |

Teams:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/teams` | Browse, optional `?q=` text search |
| GET | `/api/teams/:id` | Detail with hackathon, members, combined skills |
| GET | `/api/teams/:id/matches` | Gap-coverage match (Cypher path traversal) |
| GET | `/api/teams/:id/messages` | Read team chat (Redis Streams) |
| POST | `/api/teams/:id/messages` | Post to team chat (members only) |
| POST | `/api/teams/:id/requests` | Request to join |
| GET | `/api/teams/:id/requests` | List pending (owner only) |
| POST | `/api/teams/:id/requests/:rid/accept` | Accept (owner only) |
| POST | `/api/teams/:id/requests/:rid/reject` | Reject (owner only) |

DMs and miscellaneous:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/dms` | DM inbox (Mongo aggregate over chat mirror) |
| GET | `/api/dms/:peerId/messages` | Read 1:1 conversation |
| POST | `/api/dms/:peerId/messages` | Send DM |
| GET | `/api/me/requests` | Own request history (any status) |
| GET | `/api/skills` | Skill catalogue for typeahead |
| GET | `/api/analytics/skill-demand` | MongoDB aggregation pipeline 1 |
| GET | `/api/analytics/team-patterns` | MongoDB aggregation pipeline 2 |

All routes except `/auth/login` and `/auth/register` require a `Bearer` token in the `Authorization` header.

---

## Project structure

```
synergyhack/
├── client/                  # React SPA
│   ├── src/
│   │   ├── api/client.js    # Centralized fetch + auth header injection
│   │   ├── components/      # Reusable UI (ChatPanel, SkillEditor, etc.)
│   │   ├── pages/           # Routed pages (Teams, People, Profile, ...)
│   │   ├── hooks/           # useAuth (read-only event subscriber)
│   │   └── App.jsx
│   ├── nginx.conf           # /api reverse proxy + SPA fallback
│   └── Dockerfile
├── server/                  # Express API
│   ├── src/
│   │   ├── routes/          # Express routers, one per resource
│   │   ├── services/        # All DB access lives here
│   │   ├── middleware/      # auth (JWT), rateLimit (Redis-backed)
│   │   ├── db/              # mongo.js, neo4j.js, redis.js connectors
│   │   └── data/            # Skill catalogue + complement-pair seeds
│   └── Dockerfile
├── scripts/
│   ├── seed-mongo.js        # 5 collections + 13 indexes
│   ├── seed-neo4j.js        # All graph nodes + relationships
│   └── fixtures/            # JSON seed data (50 users, 10 teams, ...)
├── docs/
│   ├── architecture.md      # System diagrams + sequence flows
│   ├── neo4j-schema.md      # Graph model
│   └── redis-schema.md      # Key patterns and TTLs
├── docker-compose.yml       # Five-service stack
├── REPORT.md                # Project report
└── README.md                # This file
```

---

## Local development without Docker

If you want hot reload while developing, you can run the client and server outside Docker while keeping the databases in containers:

```bash
# 1. Start only the databases
docker compose up -d mongo redis neo4j

# 2. Install and start the server
cd server
npm install
npm start  # runs on http://localhost:3000

# 3. In another terminal, start the client (Vite dev mode with HMR)
cd client
npm install
npm run dev  # runs on http://localhost:5173
```

In Vite dev mode the API base URL auto-resolves to `http://localhost:3000` (no Nginx proxy). Both modes can coexist; switch between them as needed.

---

## Environment variables

See `.env.example` for the full list. The defaults work out of the box for the Docker setup. Notable:

- `MONGO_URI`: connection string for the seed scripts
- `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD`: local container by default; can be repointed at Aura cloud for development
- `REDIS_URL`: `redis://redis:6379` inside Docker, `redis://localhost:6379` for local dev
- `JWT_SECRET`: change this in any non-development setup

---

## Known limitations

The submission is intentionally scoped. Things explicitly not built:

- **Real-time push.** Chat polls every 2 seconds rather than using WebSockets. Streams support consumer groups for true push, but polling is simpler and fully functional for a demo.
- **Email notifications.** Join request decisions are visible only when the requester checks the app.
- **Fuzzy search.** Mongo's text index does stemming and tokenization but not fuzzy matching ("chrss" won't find "chris"). Atlas Search would solve this.
- **Mobile responsiveness audit.** The UI is built mobile-first but has not been polished for small screens specifically.

These are roadmap items, not bugs.

---

## Contributors

Built by:

- **Okoene Makuochukwu** ([@Evelynval-w](https://github.com/Evelynval-w)): architecture, matching algorithm, chat system, search, frontend, join-request workflow, documentation
- **Aadithya Reddy Manda** ([@adithyareddym105-gif](https://github.com/adithyareddym105-gif)): Express scaffold, MongoDB connector and indexes, register/bcrypt auth (co-author)
- **Chris Hazzouri** ([@chrissoo1213](https://github.com/chrissoo1213)): chat UI exploration, landing page, profile editor, team search, README and Docker (co-author)

Co-author trailers on commits surface contributions on the GitHub contributors graph. See [REPORT.md](./REPORT.md) section 7 for the full breakdown.

---

## License

This project is submitted as coursework for EPITA's Database Systems class. Code can be referenced freely; please do not submit it as your own coursework.
