# Phase 7 — Cutover

**Status:** ⬜ Not started
**Depends on:** Phase 6 at **31 / 31**. Do not start early.
**Unblocks:** `plans/BACKEND_PLAN.md` (Phase 8+)

## Goal

Delete the old world, unfreeze the schema, and collect the payoffs that were impossible while legacy
code was still running. When this phase merges, The Game Shack is a React + TypeScript application
with no vanilla JS left in it.

## Gate

Do not open this phase until:
- [ ] `plans/phases/PHASE-6-game-ports.md` reads **31 / 31**.
- [ ] `public/legacy/games/` is empty.

## Scope

### 1. Delete the old world

```
public/legacy/            ← the whole tree: hub.html, hub_app.js, hub-style.css,
                            games.json, system/*.js  — all of it
```

Plus the last vestiges in `src/`:
- The `status: 'legacy'` branch of the registry, `legacyUrl`, and the `<a href>` card path.
  Every card is now a `<Link>`. The `GameEntry` type loses two fields and gets simpler.
- Any `window.System*` type declarations, `global.d.ts` shims, or `// @ts-expect-error` bridges.
- The `postMessage` / `hubFirebaseReady` / iframe-sweeper vocabulary is already gone — grep to be
  sure nothing still mentions them.

Verify with a grep that must return **zero** hits:
```bash
grep -rn "SystemUI\|SystemProfile\|hubFirebaseReady\|CASINO_OS_CLOSE_GAME\|iframe" src/ public/
```

### 2. Unfreeze the schema

The rule "do not reshape the data" has held since Phase 2. It can now be lifted — and this is the
moment to spend that credit, because it's the last moment before a backend makes it expensive.

- **Version the profile.** Add `schemaVersion` and a real migration runner. Fold in the ancient
  `blackjack_money` / `casino_player_name` legacy-key migration as `v0 → v1` and stop carrying it
  around ad hoc.
- **Normalize what legacy left ugly** — but only where it's genuinely painful. This is not an
  invitation to redesign the data model; the backend plan will do that properly, server-side.
  Keep this to: consistent naming, dropping dead fields, fixing the `id` ≠ folder-name mess from
  Phase 6 (with a migration so nobody loses their stats).
- **Tighten `database.rules.json`.** With no legacy client, the RTDB rules can finally assume the
  new shape and validate it. Anything a legacy game needed loose can now be locked down.

### 3. Collect the payoffs

Things that were impossible while 31 vanilla games were in the tree:

- **PWA / offline.** `manifest.json` already exists and the app already claims to be a PWA. With a
  real build, add a service worker (Vite PWA plugin): precache the shell, cache game chunks on
  first play. Single-player games become genuinely offline-playable — which is a real feature, not
  a checkbox.
- **Bundle budget.** Set a CI size limit on the initial chunk. The hub should load fast and games
  should arrive as separate lazy chunks. Verify: opening the hub must **not** download Scrabble's
  dictionary, Chess's move generator, or Risk's 2,585 lines. If it does, a lazy boundary is wrong.
- **Strict lint.** Turn the warnings that were tolerable mid-migration (`no-explicit-any`,
  `exhaustive-deps`) into errors, now that there's no legacy pressure.
- **Accessibility + mobile pass.** The arcade is played on phones. Now that the markup is React and
  centralized in `<GameShell>`, a single pass fixes focus traps, tap targets, and viewport handling
  everywhere at once.
- **Kill `games.json` for good.** The registry is the only source of truth. Nothing fetches JSON to
  find out what games exist.

### 4. Documentation

- **Rewrite `CLAUDE.md` completely.** It currently describes a world that no longer exists: "no build
  step, no package manager, no tests", `window.System*` globals, script load order as a contract,
  Firebase config duplicated per page, iframe launching. **Every one of those statements will be
  false.** Leaving it in place actively misleads the next conversation — this is the highest-value
  cleanup in the phase.
  New content: the build/dev/test commands, the `src/games/<id>/` + `logic/` convention, the hooks
  table, the repo boundary rule, and a pointer to `GAME_PORT_GUIDE.md` (renamed: it's now
  `ADDING_A_GAME.md`, because that's what it is once nothing is being ported).
- Move `plans/MIGRATION_PLAN.md` and `plans/phases/` → `plans/done/`.
- Update `README.md` if it still describes the static-file world.

## Acceptance criteria

- [ ] Zero vanilla JS in the repo. The grep above returns nothing.
- [ ] All 31 games load as lazy routes and play correctly. **Play each one at least once.** Yes,
      all 31 — this is the last checkpoint before the old implementation is gone forever and you
      can't diff against it anymore.
- [ ] Multiplayer works end-to-end from two browsers on at least 3 games (one turn-based, one
      real-time, one with betting).
- [ ] Opening the hub downloads the shell only — confirmed in the network tab.
- [ ] Profile migration runs cleanly against a localStorage fixture captured from the *pre-migration*
      site. **Nobody loses their bankroll, stats, or cosmetics.** Test this with a real old profile.
- [ ] Lint is strict and green. Typecheck strict and green. Tests green.
- [ ] `CLAUDE.md` describes the app that now exists.
- [ ] Deployed, and the live site plays.

## Gotchas

- **This is the point of no return.** Once `public/legacy/` is deleted, there is no reference
  implementation to diff against. Do the 31-game playthrough *before* the delete commit, not after.
- **Real users have real profiles.** The migration runner will run against localStorage blobs written
  by code from years ago, including keys you've never seen. Be liberal in what you accept; never
  throw away a field you don't recognize — carry it forward.
- **Don't chase a redesign here.** The moment the last legacy file dies there'll be an urge to
  "finally fix the UI." Ship the cutover, merge it, then open a separate plan.

---

## Outcome

_(Fill in before merging. This one closes out the whole migration — write it like a postmortem:
what the migration actually cost, what surprised you, what the backend plan should know.)_
