# Phase 2 — Core Systems

**Status:** ⬜ Not started
**Depends on:** Phase 1
**Unblocks:** Phase 3 (hub needs typed profile/auth/store), Phase 4, Phase 5

## Goal

Port the `system/` layer from `window.System*` globals into typed TypeScript modules under
`src/system/`, behind a **repository boundary** so the storage engine can be swapped later — with
**one** Firebase singleton replacing the config duplicated across 32 HTML files.

This is the phase where the codebase stops being a pile of scripts and starts being a program.

## How coexistence works (read this first)

There is **no runtime bridge** and **no iframe**. The legacy tree in `public/legacy/` keeps its own
copy of `system/*.js` and keeps running against it, **completely untouched**. The new TS modules are
a *parallel implementation*.

The two worlds share state because they are the **same origin** — same `localStorage`, same Firebase
project. They agree on the **data schema**, not on the code.

```
React shell  ──> src/system/profile.ts  ──┐
                                          ├──> localStorage["casino_player_profile"]
legacy page  ──> legacy/system/…js      ──┘    Firebase Auth (uid) + RTDB:
                                                 users/<uid>          owner-only
                                                 usernames/<name>     → uid index
                                                 leaderboard/<uid>    public projection
                                                 admins/<uid>         dev flag
                                                 <roomPath>/<id>      open
```

Which means the rule from `MIGRATION_PLAN.md` is now load-bearing and literal:

> **Do not change the `localStorage` or Firebase schema in this phase.** Port the behavior; keep the
> bytes identical. Reshaping the schema happens in Phase 7, after the last legacy game is deleted.

Two implementations of the same rules can drift. Mitigations, both required:
1. **The legacy tree is frozen.** No commits touch `public/legacy/` except to delete from it.
2. **Conformance tests** (below) assert the TS modules read and write byte-identical localStorage.

## The repository boundary (new — because a backend is coming)

`plans/BACKEND_PLAN.md` will later replace Firebase with a Node/Express + SQLite API. That swap must
not touch a single game. So persistence goes behind an interface **now**, while it's free:

```ts
// src/system/repo/types.ts
export interface ProfileRepo {
  load(userId: string): Promise<Profile | null>
  save(userId: string, p: Profile): Promise<void>
}
export interface AuthRepo   { /* … */ }
export interface StatsRepo  { /* … */ }
```

- `src/system/repo/firebase/` — today's implementation (RTDB + localStorage mirror).
- `src/system/repo/api/` — Phase 8 drops this in. Nothing else changes.
- Stores (`profile.ts`, `auth.ts`) depend on the **interface**, never on `firebase/database` directly.

Rule: **`import 'firebase/*'` may appear only inside `src/system/repo/firebase/` and
`src/system/firebase.ts`.** Enforce it with an ESLint `no-restricted-imports` rule so it can't rot —
an invariant that lives only in a doc gets violated; one that fails the build doesn't. Give the rule
its own test.

## Modules to port

Read each legacy file before porting it. The LOC counts tell you where the substance is.

| Legacy | LOC | → New | Notes |
|---|---|---|---|
| `system_profile.js` | 221 | `src/system/profile.ts` | Source of truth: bankroll, XP, level, loadout. Zustand store. |
| `system_auth.js` | **718** | `src/system/auth.ts` | ⚠️ **Rewritten 2026-07-13** — see below. Real Firebase Auth now; the port is *easier* than it looks. |
| `system_ui.js` | **1088** | ⚠️ **split — see below** | Not a module. Three things in a trenchcoat. |
| `system_rewards.js` | 218 | `src/system/rewards.ts` | |
| `system_betting.js` | 182 | `src/system/betting.ts` | Bet math + economy guard. **Pure → unit test it.** |
| `system_achievements.js` | 176 | `src/system/achievements.ts` | |
| `system_stats.js` | 146 | `src/system/stats.ts` | Per-game win/loss. |
| `system_store.js` | 140 | `src/system/store/catalog.ts` | `CATALOG` → typed `const` with literal item IDs. |
| `system_audio.js` | 117 | `src/system/audio.ts` | See the mute-caching gotcha below. |
| `player_name.js` | 71 | fold into `profile.ts` | |
| `system_lobby.js` | 333 | → **Phase 4** | Leave it. |
| `system_match.js` | 307 | → **Phase 4** | Leave it. |
| `system_chat.js` | 266 | → **Phase 4** | Leave it. |

### ⚠️ Auth was rewritten on 2026-07-13 — the old descriptions are dead

Commit `ec39072` ("Replace homegrown auth with Firebase Authentication") replaced the
browser-verified, `btoa`-"hashed" auth with **real Firebase Authentication**. Anything you read
elsewhere — including `CLAUDE.md`, which is now stale — describing `users/<username>` records with
passwords in them is **describing code that no longer exists**. Read `system/system_auth.js` fresh.

The model as it actually is now:

| Node | Rule | Purpose |
|---|---|---|
| Firebase Auth | — | Owns credentials. Passwords never stored or readable by us. |
| `users/<uid>` | owner-or-admin read/write | The player's game data (profile, stats, loadout). |
| `usernames/<name>` | public read, owner write | Username → uid index, so username login still works. |
| `leaderboard/<uid>` | **public read**, owner write | Projection: name/avatar/bankroll/xp/level/wins only. |
| `admins/<uid>` | self-read | **The dev flag.** Replaced the hardcoded username check. |
| `<roomPath>/<id>` | open read/write | Multiplayer rooms (`*_rooms`, `*_hands`, `*_hand_incoming`). |

Consequences for this phase:
- **`AuthRepo` wraps Firebase Auth, not just RTDB.** So `firebase/auth` joins `firebase/database`
  in the allowed-imports list for `src/system/repo/firebase/` — the ESLint guard must permit it there
  and nowhere else.
- **Identity is a `uid`, not a username.** Everything keyed by username in the old code is keyed by
  uid now. Type it as a distinct `Uid` branded type if you want the compiler's help.
- **`onAuthStateChanged` is async and fires after first paint.** The store needs a genuine
  `loading | signed-in | guest` state. Don't render the hub assuming auth has resolved.
- The port is now **smaller and safer** than the 718 LOC suggests — a lot of it is Firebase Auth
  plumbing that maps onto the SDK directly.

### Breaking up `system_ui.js` (1,088 lines)

1. **Event bus** (`on`/`emit`) → `src/system/events.ts`, with a typed event map:
   ```ts
   type SystemEvents = { money_changed: number; player_level_up: number; /* … */ }
   ```
   Long-term most of this becomes plain Zustand subscriptions, but games call `emit` today — keep it.
2. **`wireSystemModules()` back-compat shim** → **does not get ported.** It exists only to serve
   legacy games, which now have their own frozen copy. Delete it from the new world. This is the
   single biggest simplification in the migration — take the win.
3. **DOM/UI helpers** (toasts, `sys-money` element updates, the `CASINO_OS_CLOSE_GAME`
   `postMessage`) → **do not port.** These become React components in Phase 3, and the
   `postMessage` is iframe-only and dies here.

Do the archaeology honestly before deciding what survives:
```bash
grep -rhoE 'SystemUI\.[a-zA-Z]+' public/legacy/games/ | sort | uniq -c | sort -rn
```
Anything with zero call sites doesn't get ported. Record the deleted list in `## Outcome`.

## Firebase: kill the 32× duplication

`src/system/firebase.ts` — one `initializeApp`, one `getDatabase`, typed exports. Config from
`import.meta.env.VITE_FIREBASE_*`, with the current literal values as fallback defaults. (They're
already public in 32 HTML files; this isn't a secret leak — RTDB is protected by
`database.rules.json` — but env vars make the project swappable.) Add `.env.example`.

**Do not** touch the inline Firebase blocks in `public/legacy/**`. Those files are frozen and each
one dies when its game is ported in Phase 6.

## Tests

**Unit** (pure logic, no excuses — these are functions with inputs and outputs):
- `betting.test.ts` — bet math, min/max clamps, insufficient-funds guard, all-in edge case.
- `profile.test.ts` — XP→level thresholds, loadout set/get, the `blackjack_money` /
  `casino_player_name` legacy-key migration path.
- `store.test.ts` — can't buy what you can't afford; can't equip what you don't own.
- `achievements.test.ts` — each unlock fires exactly once.

**Conformance** (this is the one that protects the users' bankrolls):
- `schema-conformance.test.ts` — seed `localStorage` with a fixture captured from the *legacy*
  implementation, load it through the TS modules, mutate, write back, and assert the resulting JSON
  is byte-identical in shape to what legacy produces. Any drift here is a corruption bug in waiting.

## Acceptance criteria

- [ ] Every module in the table exists in `src/system/`, typed, `strict` clean, no `any`.
- [ ] Persistence is behind `ProfileRepo`/`AuthRepo`/`StatsRepo`; the ESLint guard forbids
      `firebase/*` imports outside `src/system/repo/firebase/`, and the guard has a test.
- [ ] One `firebase.ts`. Zero Firebase config in new code.
- [ ] `public/legacy/` is **unmodified** (`git diff` proves it).
- [ ] **Cross-world state check:** set the bankroll in the React shell, navigate to a legacy game,
      the new bankroll is there. Win a hand in the legacy game, come back to the shell, the bankroll
      and stats updated. This is the single most important behavior in the phase — test it explicitly.
- [ ] Conformance test passes. Unit tests pass. All 7 checks from Phase 1's verification still pass.
- [ ] Dead `SystemUI.*` methods identified and *not* ported; the list is in `## Outcome`.

## Gotchas

- **Port auth verbatim first, refactor second.** Get a faithful port committed, *then* clean it up in
  a follow-up commit, so the diff stays reviewable.
- **`isDev` gating changed.** There is **no more hardcoded `forerunner` username check** — dev rights
  now come from `admins/<uid>` in the database rules, and `profile.isDev` is just a cached reflection
  of that. The rule is the gate; the UI flag is cosmetic. **Never grant dev powers from the client
  flag alone** — anything that actually matters must be enforced by the RTDB rule.
- **Audio mute caching.** `system_audio.js:11` documents a real bug fix about a cached mute boolean
  going stale. Read the comment. Don't regress it. (Its *cause* — the iframe — is gone, which may
  mean the fix simplifies. Verify before deleting it.)
- **`SystemUI.money` is a getter/setter proxy** into `SystemProfile`, and legacy code assigns to it.
  That's a legacy-only concern now — but understand it before you conclude it's dead.

---

## Outcome

_(Fill in before merging: what shipped, deleted dead code, deviations, what Phase 3 needs to know.)_
