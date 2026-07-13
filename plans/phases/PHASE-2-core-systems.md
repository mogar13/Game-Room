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
legacy page  ──> legacy/system/…js      ──┘    Firebase: users/<username>, <roomPath>/<id>
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
| `system_auth.js` | **718** | `src/system/auth.ts` | The big one. `users/<username>` RTDB + `casino_users` localStorage mirror, prefers cloud when online. |
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

- **Port auth verbatim first, refactor second.** 718 lines with an online/offline fallback. Get a
  faithful port committed, *then* clean it up in a follow-up commit, so the diff stays reviewable.
- **`isDev` gating.** `profile.isDev` + the explicit `forerunner` username check
  (`hub_app.js:125`) gates dev-only UI. Port the gate faithfully; do not accidentally widen it.
- **Audio mute caching.** `system_audio.js:11` documents a real bug fix about a cached mute boolean
  going stale. Read the comment. Don't regress it. (Its *cause* — the iframe — is gone, which may
  mean the fix simplifies. Verify before deleting it.)
- **`SystemUI.money` is a getter/setter proxy** into `SystemProfile`, and legacy code assigns to it.
  That's a legacy-only concern now — but understand it before you conclude it's dead.

---

## Outcome

_(Fill in before merging: what shipped, deleted dead code, deviations, what Phase 3 needs to know.)_
