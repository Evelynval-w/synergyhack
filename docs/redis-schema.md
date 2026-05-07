# Redis Schema

Redis handles everything ephemeral or needing sub-millisecond reads:
sessions, presence, atomic team-slot counters, leaderboards, recent
activity, and durable chat via Redis Streams.

## Keys and data types

| Key pattern | Type | Purpose |
|-------------|------|---------|
| session:{token} | STRING | Logged-in user state, 24h TTL |
| online:users | SET | Currently online user IDs |
| presence:{userId} | STRING | Per-user heartbeat marker, 60s TTL |
| team:{id}:slots | HASH | Atomic { capacity, filled } counters |
| ratelimit:{ip} | STRING | INCR per request, expires every 1s |
| chat:team:{id} | STREAM | Durable chat with cursor-based reads (XADD/XRANGE) |
| recent:joins | LIST | Last 20 team-join events for activity feed |
| leaderboard:matchers | ZSET | Most active match-requesters |

## Why Redis for each role

- **Sessions** — fast lookup on every authenticated request; TTL handles
  expiry without a cleanup job.
- **Presence** — set membership is exactly the right shape for "who's online"
  questions, and SADD/SREM are O(1).
- **Slot counters** — HINCRBY is atomic, so two users can't both grab the
  last slot. Combined with a rollback on overflow, race-safe by design.
- **Chat** — Streams give us auto-generated message IDs, efficient range
  queries (XRANGE), and a cursor-based "since" pattern that maps naturally
  to the polling model on the frontend. A user joining mid-event sees the
  full history with one fetch.
- **Activity feed** — bounded LIST keeps memory predictable; LTRIM after
  every push.
- **Leaderboards** — ZSET makes top-N queries O(log N).
- **Rate limiting** — INCR + EXPIRE in two commands gives a windowed
  rate limiter without a dedicated middleware library.
