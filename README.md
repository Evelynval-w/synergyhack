# SynergyHack

A multi-tenant hackathon **event platform** built for EPITA's Database Systems course. Organizations host public or private events; individuals register, form teams, invite collaborators, chat, and compete on leaderboards. The matching engine finds teammates who **complement** your skills rather than duplicating them.

Built on three databases that each do a job the others cannot do well:

- **MongoDB** for profiles, teams, events, registrations, leaderboards, notifications, and analytical aggregations
- **Neo4j** for the skill-complementarity graph and the matching algorithm
- **Redis** for sessions, presence, and real-time chat via Streams

For the full design rationale, see [REPORT.md](./REPORT.md). For the architecture diagrams and per-database schemas, see [docs/](./docs/).

---

## Platform overview

Two account types share one `users` collection (`account_type: individual | organization`):

- **Individuals** — build a skill profile, join or create teams tied to an event, request to join or accept outbound invites, register for events (solo or as a team), and use team chat / DMs.
- **Organizations** — create and edit events (stored in the existing `hackathons` collection), set visibility and registration mode (`individual` / `team` / `both`), approve private registrations, invite users to register, and update the event leaderboard when enabled.
- **In-app notifications** — team invites, event invites, registration updates, and unread team chat rows in the nav. Chat deep-links go to `/teams/:id?chat=1`. There is no email delivery.

After sign-in, **Events** is the home for browsing open hackathons; orgs create and manage events from the same page.

---

## Quick start

The whole stack runs in Docker:

```bash
git clone https://github.com/Evelynval-w/synergyhack.git
cd synergyhack
cp .env.example .env

# Bring up everything: Mongo, Redis, Neo4j, server, client
docker compose up -d --build

# Seed both databases (first run only).
# Scripts live at /app/synergyhack/scripts while the container CWD is
# /app/synergyhack/server, so set the working directory explicitly.
docker compose exec -w /app/synergyhack server node scripts/seed-mongo.js
docker compose exec -w /app/synergyhack server node scripts/seed-neo4j.js

# Open the app
open http://localhost:8080
```

That's it. Five containers, no local Node or npm install required on the host machine.

To stop everything: `docker compose down`. To reset Mongo and Redis volumes too: `docker compose down -v`.

### Demo accounts

Every seeded user signs in with the password **`password123`**. Try `makuo`, `aadithya`, `chris`, `noah`, `lina_dev`, or any other seeded username (50 in total). Organization host demo: **`synergy_org`** (same password) — open **Events** to create hackathons, approve private registrations, and edit leaderboards. You can also create a fresh **individual** or **organization** account from the landing page, or sign in with Google / GitHub once OAuth credentials are set in `.env`.

### Optional: Google / GitHub SSO

1. Create OAuth apps and set the redirect URIs to:
   - `http://localhost:8080/api/auth/google/callback`
   - `http://localhost:8080/api/auth/github/callback`
2. Copy client id/secret into `.env` (see `.env.example`). Keep:
   - `OAUTH_CALLBACK_BASE_URL=http://localhost:8080/api`
   - `CLIENT_ORIGIN=http://localhost:8080`
3. Recreate the stack so the server picks up the vars:
   ```bash
   docker compose up -d --force-recreate --build
   ```
4. Open `http://localhost:8080` and click **GitHub** (or Google). No demo seed is required for SSO — the first successful login creates your user in Mongo.
5. If you previously had a stale browser session ("Invalid token" on Teams), hard-refresh once; the app now clears bad JWTs automatically. After changing `JWT_SECRET`, sign in again.

Landing only shows SSO buttons for providers that are actually configured.

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

Express serves auth, event CRUD/registration/leaderboard, teams, matching, chat, DMs, and notifications. For sequence diagrams of the core flows (login, match, chat, inbox) and the per-database role breakdown, see [docs/architecture.md](./docs/architecture.md).

---

## Features

**Auth.** Real bcrypt-backed register and login for individuals and organizations (`account_type`). Sessions stored in Redis with 24-hour TTL. SSO (Google / GitHub) creates individual accounts.

**Events.** Organizations create public or private hackathon events (same `hackathons` collection teams already use). Registration mode is `individual`, `team`, or `both`. Public events accept registrations immediately; private events require a valid invite token or org approval (`pending` → `accepted` / `rejected`). Hosts list registrations and can update a leaderboard when `leaderboardEnabled` is set.

**People discovery.** Browse all users alphabetically or full-text search across **username**, skill names, role, and bio (compound text index in Mongo with weighted fields). Click into anyone's profile to see their skills with level/years and their past hackathon projects.

**Profile editor.** Individuals edit bio, role, GitHub URL, email, and skills; organizations edit name, website, and bio. Skill changes diff-and-apply against Neo4j: removed skills drop their `HAS_SKILL` edges, new ones get added, level/years on unchanged skills get updated. Mongo is the source of truth; Neo4j stays in sync via the single `graph-sync` boundary.

**Teams.** Browse teams or search by name and project pitch. Each team has a hackathon event, a description, capacity, and a member roster.

**Matching.** A team member clicks "Find teammates" and sees a ranked list of candidates whose skills complement what the team is missing. Primary action: **Invite to team** (outbound invite). Ranking is a Cypher path traversal: from the team's existing skills, follow `COMPLEMENTS` edges (with weights) to candidate skills, sum, and rank.

**Join requests & invites.** Non-members can request to join (inbound). Members can invite candidates from Matches (outbound). Invitees accept/reject on the team page. Accept adds them to Mongo + creates the Neo4j `MEMBER_OF` edge. A partial unique index prevents duplicate pending requests.

**Chat.** Each team has a live chat backed by Redis Streams (capped at 500 messages with `MAXLEN ~`). Unread team channels appear in the nav banner and deep-link to `/teams/:id?chat=1`. 1:1 DMs use a sorted-key channel pattern (`chat:dm:{sortedA}:{sortedB}`) so both participants read and write to the same stream. Every message is mirrored to a Mongo `messages` collection for durable archival and cross-channel queries (the inbox).

**Analytics.** Two MongoDB aggregation pipelines on `past_projects`:
- `GET /analytics/skill-demand` returns the top 5 skills demanded for each role across past hackathon projects
- `GET /analytics/team-patterns` returns the role combinations that appear most often on highly-rated past projects

---

## API endpoints

Auth:

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | New account: individual or organization (`account_type`) |
| POST | `/api/auth/login` | bcrypt-verified login |
| POST | `/api/auth/logout` | Invalidate session |

Users:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/users` | Paginated browse |
| GET | `/api/users/search?q=` | Full-text search (includes username) |
| GET | `/api/users/me` | Own profile (includes email) |
| PATCH | `/api/users/me` | Update bio, role, email, github_url, skills, org fields |
| GET | `/api/users/:id` | Public profile |

Events (hackathons collection):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/hackathons` | List visible events |
| POST | `/api/hackathons` | Create event (org only) |
| GET | `/api/hackathons/:id` | Detail + teams + my regs + leaderboard |
| PATCH | `/api/hackathons/:id` | Update (owning org) |
| POST | `/api/hackathons/:id/register` | Individual or `{ teamId }` |
| POST | `/api/hackathons/:id/invite` | Invite user by username |
| GET | `/api/hackathons/:id/registrations` | Org: list registrations |
| POST | `/api/hackathons/:id/registrations/:rid/accept` | Org approve or invitee redeem |
| POST | `/api/hackathons/:id/registrations/:rid/reject` | Org reject |
| GET/PUT | `/api/hackathons/:id/leaderboard` | Read / org update scores |

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
| POST | `/api/teams/:id/invites` | Outbound invite (any member) |
| POST | `/api/teams/:id/invites/:rid/accept` | Invitee accepts |
| POST | `/api/teams/:id/invites/:rid/reject` | Invitee declines |

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
│   │   ├── components/      # Reusable UI (ChatPanel, SkillEditor, Layout, ...)
│   │   ├── pages/           # Teams, Events (EventList/EventDetail), People, Profile, ...
│   │   ├── hooks/           # useAuth (read-only event subscriber)
│   │   └── App.jsx
│   ├── nginx.conf           # /api reverse proxy + SPA fallback
│   └── Dockerfile
├── server/                  # Express API
│   ├── src/
│   │   ├── routes/          # Express routers, one per resource
│   │   ├── services/        # All DB access lives here (events, registration, ...)
│   │   ├── middleware/      # auth (JWT + requireOrg), rateLimit (Redis-backed)
│   │   ├── db/              # mongo.js, neo4j.js, redis.js, ensureIndexes.js
│   │   └── data/            # Skill catalogue + complement-pair seeds
│   └── Dockerfile
├── scripts/
│   ├── seed-mongo.js        # Users/orgs/teams/events + indexes; wipes regs/leaderboard
│   ├── seed-neo4j.js        # All graph nodes + relationships
│   └── fixtures/            # users.json, orgs.json, hackathons.json (event fields), ...
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
- **Email notifications.** Team invites, event invites, and join-request decisions are in-app only — visible when the user opens the app.
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
