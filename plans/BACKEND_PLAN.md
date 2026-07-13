# The Game Shack — Backend Plan (Node + SQLite)

**Status:** Blocked — do not start until `plans/MIGRATION_PLAN.md` is complete (Phase 7 merged).
**Last updated:** 2026-07-13

Replace Firebase (RTDB + its ad-hoc auth) with a **Node/Express + SQLite** API. This is a **separate
project from the React/TS migration** and runs after it, so that a bug ever only has one possible
cause.

---

## Why this is worth doing (and why not yet)

Today every rule that matters is enforced **on the client**, and the database is a public JSON tree.
That means, concretely:

- A player can open devtools and set their bankroll to 10,000,000. Nothing stops them.
- Battleship writes your ship positions, Clue your hand, Hold'em your hole cards — into a node the
  other player's client can read. **Hidden information isn't hidden**, it's just not displayed.
  (Phase 6 of the migration is told to catalogue every instance of this rather than try to fix it —
  because you *can't* fix it without a server.)
- "Global leaderboard" can't mean anything, because the scores are self-reported.
- Two clients can race for the same seat; there's no authority to arbitrate.

A server fixes all four, because they're all the same bug: **there is no referee.**

**But it fixes nothing about the frontend**, which is why it doesn't belong in the migration. And it
has real costs, stated honestly:

| Cost | Detail |
|---|---|
| 💵 Hosting | Firebase's free tier → a paid app host + persistent disk. Small, but no longer $0. |
| 🔌 Realtime | RTDB gives sync for free. You'd replace it with WebSockets and own reconnects, presence, and backpressure yourself. **This is the bulk of the work.** |
| 🧰 Ops | A database you can lose. Needs streaming backups, migrations, and a tested restore drill. |

The frontend **stays on GitHub Pages** — static SPA, cross-origin calls to the API with a JWT. This
is a standard split: static frontend on free hosting, one small stateful service behind it.

### The migration pays for this in advance

Two decisions in the React migration exist specifically to make this phase cheap. Don't squander them:

1. **The repository boundary** (`MIGRATION_PLAN` Phase 2): every store talks to `ProfileRepo` /
   `AuthRepo` / `StatsRepo` / `MatchRepo` interfaces, and `firebase/*` may only be imported inside
   `src/system/repo/firebase/`, enforced by ESLint. So swapping the data layer means **writing
   `src/system/repo/api/` and changing one wiring line.** No game is touched.

2. **Pure `logic/` folders** (`MIGRATION_PLAN` Phase 5): every game's rules are pure TypeScript with
   no DOM, no React, no Firebase. Which means **the server can import and run the exact same rules
   the client runs** — the referee and the player agree by construction, because they're executing
   the same code. This is the single biggest payoff of the whole migration, and it only works if the
   `logic/` purity rule was actually enforced.

---

## Architecture

```
GitHub Pages (static, free)          App host (paid)
┌──────────────────────┐            ┌────────────────────────────────┐
│  React SPA           │  HTTPS +   │  game-api  (Node/Express)      │
│  src/system/repo/api │ ─ JWT ───► │    SQLite (better-sqlite3)     │
│                      │            │    streaming off-box backup    │
│                      │  WSS       │                                │
│  useMatch / useChat  │ ◄────────► │  rooms (WebSocket, authoritative)│
└──────────────────────┘            └────────────────────────────────┘
              │
              └──► packages/game-logic  ← the SAME pure TS rules run on both sides
```

**One service, not six.** The Game Shack is one app with one data model; it does not need a service
per domain, and splitting it would buy nothing but latency and ops.

### Schema sketch

```sql
users(id, username UNIQUE, password_hash, created_at, is_dev)
profiles(user_id PK, bankroll, xp, level, loadout_json, updated_at)
stats(user_id, game_id, wins, losses, wagered, PRIMARY KEY(user_id, game_id))
achievements(user_id, achievement_id, unlocked_at)
purchases(user_id, item_id, purchased_at)
ledger(id, user_id, game_id, delta, reason, created_at)   -- every bankroll change, append-only
matches(id, game_id, status, created_at, ended_at)
match_seats(match_id, seat_no, user_id)
```

`ledger` is the one table worth insisting on: **the bankroll becomes a derived value, not a stored
number you overwrite.** Every win, loss, bet, and purchase is an append-only row. That gives you
audit, anti-cheat forensics, and "why did I lose 500 chips" support answers, for basically free.

---

## Phases

Same rules as the migration: **one phase per conversation**, never break `main`, closeout ritual
(commit → push → PR → merge → update this file's status + `## Outcome`).

### Phase 8 — The API service + read-only shadow
**Goal:** stand up `game-api` and prove it agrees with Firebase, without trusting it yet.

- New workspace `game-api/`: Express + `better-sqlite3`, JWT auth, the schema above.
- One-time export script: Firebase `users/<username>` → SQLite `users` + `profiles`.
- Implement `src/system/repo/api/` against the interfaces from migration Phase 2.
- **Shadow mode:** the client keeps writing to Firebase as the source of truth, *and* mirrors every
  write to the API. A comparison script diffs the two nightly.
- Ship nothing user-visible. The deliverable is "the API produces identical results."

**Done when:** shadow diff is empty for a week of real play.

### Phase 9 — Cut over profile, economy, stats, auth
**Goal:** SQLite becomes the source of truth for everything that isn't realtime.

- Flip the repo wiring: `api` implementations become primary, Firebase becomes the mirror.
- Move bankroll mutations **server-side**: the client requests `POST /bet`, `POST /settle`; the
  server validates against the ledger and returns the new balance. **The client can no longer set
  its own bankroll.** This is the anti-cheat win.
- Real leaderboards, from data the server owns.
- Streaming off-box backups + a tested restore drill — and actually run the drill; a backup you
  haven't restored is a rumor.

**Done when:** editing `localStorage` in devtools changes nothing durable, and RTDB is no longer
read for profile/stats.

### Phase 10 — Realtime rooms over WebSocket
**Goal:** retire RTDB entirely. This is the biggest phase — budget accordingly.

- WebSocket server owns rooms: create, join, seat assignment (**server-arbitrated → the seat-2 race
  from migration Phase 4 is fixed for free**), presence, disconnect cleanup.
- Rewrite `MatchRepo` / `ChatRepo` against it. `useMatch` / `useChat` signatures **do not change** —
  that's the whole point of the boundary.
- Real-time games (Pong, Pool, Bowman) need attention: their sync model is continuous, not turn-based.
  Read what migration Phase 6 recorded about them.

**Done when:** Firebase is removed from `package.json`.

### Phase 11 — Server-authoritative game state
**Goal:** the referee actually referees. Only worth doing for games where it matters.

- Move `packages/game-logic` (the pure `logic/` folders) into a shared workspace package imported by
  both client and server.
- Server validates every move against the same rules the client used, and **owns hidden state**:
  Hold'em hole cards, Battleship boards, Clue hands are sent only to the seat that owns them.
- Client keeps running the logic locally for instant feedback (optimistic), server confirms or
  rejects.

**Done when:** a player with devtools open cannot see their opponent's hand — because the server
never sent it.

---

## Open questions (answer before Phase 8)

- **Hosting:** pick whatever host you already know and already pay for — consistency with your
  other services beats novelty here.
- **Do guests survive?** Today anonymous players never touch Firebase. With a server, either guests
  stay purely local (simplest, recommended — keeps `localStorage` as a real offline mode) or every
  player gets an account.
- **Offline play.** The PWA work in migration Phase 7 makes single-player games offline-capable. A
  server-authoritative economy is fundamentally online. Decide: do offline wins bank chips when you
  reconnect (needs a sync/conflict story), or are offline games unranked/unpaid? **Recommend
  unranked** — it's honest, and it sidesteps an entire class of cheating.

---

## Outcome

_(Fill in per phase as they land.)_
