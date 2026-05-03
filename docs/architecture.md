# SynergyHack — System Architecture

This document is the source of truth for the system topology. Everything
below reflects the code as it actually runs (May 2026), not aspirational
design.

## High-level picture

```mermaid
flowchart TB
    subgraph Client["Browser (React SPA)"]
        UI["Vite + Tailwind UI<br/>People · Teams · Matches · Chat · Messages"]
    end

    subgraph API["API Layer (Node.js + Express)"]
        Routes["REST routes<br/>/auth /users /teams /matches<br/>/messages /dms /analytics /heartbeat"]
        Mid["Middleware<br/>CORS · JWT auth · rate-limit (60/s)"]
        Services["Services<br/>auth · session · match · chat<br/>analytics · users · dms · graph-sync"]
    end

    subgraph Data["Data Layer (direct drivers)"]
        Mongo[("MongoDB<br/>document store")]
        Neo[("Neo4j<br/>graph database")]
        Redis[("Redis<br/>in-memory store")]
    end

    UI -- "HTTPS / JSON<br/>+ 2s polling for chat" --> Routes
    Routes --> Mid --> Services
    Services -- "mongodb driver" --> Mongo
    Services -- "neo4j-driver" --> Neo
    Services -- "redis driver" --> Redis
```

No Socket.io. No GraphQL. No ORM. Just three direct database drivers
behind a thin Express service layer, talked to by a polling React SPA.

## What each database is used for

```mermaid
flowchart LR
    subgraph MongoFlow["MongoDB"]
        direction TB
        Users["users<br/>(profile, bio, skills, skill_names)"]
        Teams["teams<br/>(metadata, roster, hackathonId)"]
        Hacks["hackathons<br/>(events, dates)"]
        Projects["past_projects<br/>(write-ups, ratings, members)"]
        Messages["messages<br/>(chat mirror, channel-indexed)"]
        Idx1["compound text index:<br/>skill_names:10, role:5, bio:3"]
        Pipe["aggregation pipelines:<br/>① skill demand per role<br/>② successful team patterns"]
        Users -.-> Idx1
        Projects -.-> Pipe
    end
```

```mermaid
flowchart LR
    subgraph NeoFlow["Neo4j (★ core value)"]
        direction TB
        UserN["(:User)"]
        SkillN["(:Skill)"]
        TeamN["(:Team)"]
        HackN["(:Hackathon)"]
        UserN -- "HAS_SKILL<br/>{level, years}" --> SkillN
        SkillN -- "COMPLEMENTS<br/>{strength 0-1}<br/>both directions" --> SkillN
        UserN -- "MEMBER_OF" --> TeamN
        TeamN -- "PARTICIPATES_IN" --> HackN
        UserN -. "TEAMED_WITH<br/>{rating, projectId}" .- UserN
    end
```

```mermaid
flowchart LR
    subgraph RedisFlow["Redis"]
        direction TB
        S["STRING<br/>session:{token} (TTL 24h)<br/>presence:{userId} (TTL 60s)<br/>ratelimit:{ip} (TTL 1s)"]
        Set["SET<br/>online:users"]
        H["HASH<br/>team:{id}:slots<br/>{capacity, filled}"]
        Stream["STREAM<br/>chat:team:{id}<br/>chat:dm:{sortedA}:{sortedB}<br/>MAXLEN ~ 500"]
    end
```

## Key flows

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant API
    participant Mongo
    participant Neo
    participant Redis

    Note over User,Redis: 1. Login
    User->>API: POST /auth/login {username}
    API->>Mongo: findOne(users, {username})
    Mongo-->>API: user doc with _id
    API->>Redis: SET session:{token} = userId (TTL 24h)
    API-->>User: {token, userId, username}

    Note over User,Redis: 2. Find matches for a team
    User->>API: GET /teams/:id/matches
    API->>Neo: gap-coverage Cypher (path traversal)
    Neo-->>API: [{userId, gapCoverage, skillCount}, ...]
    API->>Mongo: find(users, {_id: {$in: ids}})
    Mongo-->>API: hydrated profiles
    API-->>User: matches with full profile

    Note over User,Redis: 3. Send team chat message
    User->>API: POST /teams/:id/messages {body}
    API->>Neo: MATCH membership check
    Neo-->>API: ok / not member
    API->>Redis: XADD chat:team:{id} MAXLEN ~ 500
    API-->>Mongo: insertOne(messages, mirror)
    API-->>User: {id: streamId}

    Note over User,Redis: 4. Read DM inbox
    User->>API: GET /dms
    API->>Mongo: aggregate messages: group by channel,<br/>$first per group, $lookup peer user
    Mongo-->>API: list of threads with peer + last message
    API-->>User: threads
```

## Why each database earns its place

| Database | Earns its seat by handling | If you removed it, what breaks |
|---|---|---|
| **MongoDB** | Profile content (bios, skill objects, past project text), 2 aggregation pipelines, text search via compound index, durable archive of every chat message | Profile pages can't render, analytics pipelines have no data, search becomes regex over arrays, chat history loses durability beyond the 500-message Stream cap |
| **Neo4j** | Gap-coverage match algorithm via path traversal, team membership check, skill complementarity graph | The whole match feature is the project's main value — without graph traversal you'd need recursive joins or pre-joined denormal tables in Mongo, neither of which scales as the catalogue grows |
| **Redis** | Session storage with TTL, presence with auto-expiry, atomic slot counters, real-time chat via Streams (capped log), rate limiter | Sessions become a JWT-only bearer (no revocation), no presence, no real-time chat, every API request hits the DB without throttling |

## What is NOT in the system (despite older docs)

These were in the original deck or older drawio versions but are not
implemented in v1:

- **Socket.io** — chat uses HTTP polling at 2s intervals. Polling is
  simpler to demo and reliable across browser tabs. Real-time push is
  a future iteration.
- **Recharts** — analytics endpoints exist but no charting library is
  installed. The viva-grade demonstration is via JSON output, not a
  visual chart.
- **`/events` route, leaderboard ZSET, recent-joins LIST** — earlier
  designs included these; the current code does not use them.
- **Role / Project nodes in Neo4j** — schema constraints are reserved
  for future use but no nodes of these types are seeded.

## Service modules — single source of truth

| Module | File | Owns |
|---|---|---|
| Auth | `services/auth.service.js` | JWT sign/verify (stub login) |
| Sessions | `services/session.service.js` | Redis-backed session store |
| Match | `services/match.service.js` | Gap-coverage Cypher query |
| Chat | `services/chat.service.js` | Streams XADD/XRANGE + Mongo mirror + membership check |
| Analytics | `services/analytics.service.js` | The two aggregation pipelines |
| Users | `services/users.service.js` | Browse / profile / search |
| DMs | `services/dms.service.js` | DM inbox aggregation |
| Graph sync | `services/graph-sync.service.js` | Cross-DB write boundary (User/Team/membership go to both Mongo and Neo4j) |
| Skill | `services/skill.service.js` | Skill catalogue + COMPLEMENTS seed and reads |
| Slot | `services/slot.service.js` | Atomic slot counters in Redis (reserved) |

`graph-sync.service.js` is the disciplined choke point: any code that
needs to keep Mongo and Neo4j in sync (e.g. creating a User, joining a
Team) goes through it. No route writes to two databases on its own.
