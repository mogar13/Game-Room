# Phase 4 — Multiplayer

**Status:** ⬜ Not started
**Depends on:** Phase 2 (repo boundary), Phase 3 (shell to render into)
**Unblocks:** Phase 5 (the Uno pilot is multiplayer)

## Goal

Port the three multiplayer modules — `system_lobby.js` (333), `system_match.js` (307),
`system_chat.js` (266) — into typed React hooks + components, with the Firebase room schema pinned
down in TypeScript **as derived from what legacy actually writes**.

27 of 31 games are multiplayer (only 4 have `roomPath: null`). This layer is the spine of the arcade;
get it right and Phase 6 is mechanical.

## The three layers, kept separate

The legacy split is actually good — preserve it:

| Legacy | Role | → New |
|---|---|---|
| `system_lobby.js` | **UI**: host/join overlay, seat rendering, `onHost/onJoin/onLeave/onStart/onClose` callbacks | `src/ui/lobby/<Lobby>.tsx` — presentational, dumb |
| `system_match.js` | **Infrastructure**: seat assignment (host=1, joiner=2), writes/reads the room node, tracks the listener, cleans up | `src/system/match/useMatch.ts` — the hook games actually call |
| `system_chat.js` | Per-room chat, `chat/<roomId>/messages` | `src/system/chat/useChat.ts` + `<ChatPanel/>` |

Games call **one** thing:

```ts
const match = useMatch({ gameId: 'uno', roomPath: 'uno_rooms' })
// → { status, roomId, seat, seats, isHost, host(), join(id), start(), leave() }
```

`useMatch` owns the `onValue` subscription and its teardown. **This is the single most important
correctness detail in the phase:** every subscription must be torn down in the `useEffect` cleanup,
and the room node must be removed when the host leaves. `system_match.js:292` already documents a
bug about rooms lingering "until the hub iframe-close sweeper happens to run" — **that sweeper is
gone** (no more iframe). So cleanup can no longer be backstopped by the hub. It has to be right here.

## Freeze the room schema

While *any* legacy game shares a `roomPath` with a ported one, both must read and write the identical
node shape. Derive the types from the legacy code — don't design them:

```ts
// src/system/match/schema.ts
export type Seat = { type: 'human' | 'open'; name: string }
export type RoomStatus = 'waiting' | 'playing'
export interface Room<TState = unknown> {
  status: RoomStatus
  seats: Record<string, Seat>   // "1" = host, "2" = joiner
  state?: TState                // per-game payload — games own this
  // …read system_match.js and mirror EVERY field it writes, including ones that look vestigial
}
```

The handshake is: host writes the room with two seats → joiner fills seat 2 → host flips `status`
from `waiting` to `playing` → the `onValue` fires on both clients and the game starts. Do not
"improve" this while legacy games still speak it.

Write a **schema conformance test**: host a room with the TS implementation, dump the node, and diff
it against a fixture captured from a legacy game hosting the same room. Byte-identical or bust.

## Chat

- Per-room chat: `chat/<roomId>/messages` — `useChat(roomId)`.
- Global hub chat: Phase 3 left a placeholder. Wire it here.
- Chat bubble color comes from `profile.loadout.color` (Phase 2's store), **not** hardcoded — the
  same rule as the rest of the cosmetics system.

## Repository boundary applies here too

Phase 8's backend replaces RTDB rooms with WebSockets. So, exactly as in Phase 2: `useMatch` and
`useChat` talk to a `MatchRepo` / `ChatRepo` interface, and `firebase/*` is imported **only** inside
`src/system/repo/firebase/`. The ESLint guard from Phase 2 already enforces this — make sure the new
files don't get an exemption.

## Acceptance criteria

- [ ] `useMatch` + `useChat` + `<Lobby/>` exist, typed, strict-clean.
- [ ] Room schema types match legacy byte-for-byte; conformance test proves it.
- [ ] **Cross-world multiplayer works**: a *legacy* Uno client and a *ported*-style test harness
      (or, if Phase 5 has landed, a real ported client) can host/join **the same room** and play.
      If this doesn't work, Phase 6 cannot proceed — do not hand-wave it.
- [ ] Host leaves → room node is removed from RTDB. Verify in the Firebase console. There is no
      sweeper anymore.
- [ ] Rapid mount/unmount of a game route leaves **zero** dangling `onValue` listeners
      (check via Firebase's `.info/connected` / listener counts, or instrument the repo layer).
- [ ] Chat works in-room, both directions, with the correct loadout color.
- [ ] Hub's live-match bar still sees rooms created by the new hook.

## Gotchas

- **The iframe-close sweeper is gone.** Anything that relied on the hub tearing down the iframe to
  clean up (`system_match.js:292`, the `CASINO_OS_CLOSE_GAME` postMessage) has no backstop now.
  Route unmount + `beforeunload` are your cleanup points. Test the ugly paths: browser back button,
  hard refresh mid-game, closing the tab.
- **React 18/19 StrictMode double-mounts effects in dev.** A naive "host a room on mount" will create
  **two** rooms. Make room creation explicit and idempotent, not an effect side-effect.
- **Seat IDs are string keys** (`"1"`, `"2"`) in RTDB, not numbers. Firebase does this. Type it
  correctly or you'll get a very confusing bug.
- **RTDB has no transactions in the naive path** — two clients can race to claim seat 2. Check how
  legacy handles it (it may not!). If it doesn't, don't fix it here — note it for the backend plan,
  where server-authoritative seating solves it properly.

---

## Outcome

_(Fill in before merging.)_
