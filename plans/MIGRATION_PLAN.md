# The Game Shack — React + TypeScript Migration

**Status:** Not started
**Last updated:** 2026-07-13

Consolidate The Game Shack from ~35,000 lines of vanilla HTML/CSS/JS into a single React 19 +
TypeScript + Vite SPA, where the hub is the shell and **every game is an in-app lazy route** —
sharing one auth, one profile/economy, one theme, one router. Firebase stays exactly as it is.

This is a well-worn pattern: standalone apps folded into one shell as `React.lazy` routes under
`src/apps/<name>/`. Same shape here, with `src/games/<id>/`.

---

## Why

| Today | Problem |
|---|---|
| 2,000-line `hub_app.js`, 1,200-line `hub-style.css` | Untyped, unsplittable, untestable |
| ~6,000-line `system/` layer wired by `window.System*` globals + script load order | Load order is a hidden contract; one typo = silent breakage |
| `system_ui.js` has a `wireSystemModules()` back-compat shim | Every change must keep two call styles alive forever |
| Firebase config duplicated inline in **32** HTML files | Change a credential, edit 32 files |
| 31 games launched **in an iframe** | Hard state boundary, double-loaded system layer, cached-mute bugs, no shared router/history |
| No build, no types, no tests | Adding game #32 is copy-paste-and-pray |

Goal state: adding a game = write a component against a documented SDK + add one registry entry.

> ⚠️ **`CLAUDE.md` is stale — do not trust it.** It still describes homegrown auth with
> `users/<username>` records, and the "no build step, no package manager" rule that Phase 1 deletes.
> Auth was replaced with **real Firebase Authentication** on 2026-07-13 (commit `ec39072`): identity
> is now a `uid`, game data lives at `users/<uid>` locked to its owner, dev rights come from
> `admins/<uid>`, and there's a public `leaderboard/<uid>` projection. Phase 2 documents the real
> model; Phase 7 rewrites `CLAUDE.md`. Until then, **read the code, not the docs.**

## Architecture: one SPA, many routes. **No iframes.**

The iframe is being **removed, not preserved**. Alternatives considered and rejected:

- **iframe embedding** — ❌ what we have. State/rendering/history boundary, double system layer.
- **Module Federation / microfrontends** — ❌ complexity tax with no payoff for a solo hobby repo.
- **Astro islands** — ❌ built for hydrating widgets on static pages, not hosting whole games.
- **One Vite SPA with lazy-loaded route bundles** — ✅ **this plan.**

```
src/
├── App.tsx                    ← shell: router, nav, auth gate, theme
├── system/                    ← the old system/ layer, typed (profile, auth, audio, economy…)
├── games/
│   ├── registry.ts            ← replaces games.json — typed, one entry per game
│   ├── uno/
│   │   ├── UnoGame.tsx        ← default export, lazy-loaded
│   │   ├── logic/             ← PURE TS. no DOM, no React. unit-tested.
│   │   ├── components/
│   │   └── styles.css
│   └── …
└── ui/                        ← shared components (GameShell, Lobby, Chat, BetBar…)
```

Routes: `/` (hub) · `/play/:gameId` (lazy game) · `/store` · `/profile` · `/leaderboard`

### How legacy games survive the transition (without iframes)

A game that hasn't been ported yet is **not embedded** — it's a **standalone page you navigate to**.
The hub card does a plain full-page navigation to `/legacy/games/uno/uno.html`. That page loads its
own old scripts and runs exactly as it does today.

It still shares state with the new shell because **it's the same origin** — same `localStorage`, same
Firebase project. Coexistence comes from a frozen **data schema**, not from a shared runtime.

> **The load-bearing rule of this entire migration:**
> While any legacy game remains, the `localStorage` profile schema and the Firebase room/user schema
> are **frozen**. Port the code; do not reshape the data. Schema changes come in Phase 7, after the
> last legacy game is deleted.

Once a game is ported, its card flips from "navigate to legacy page" to an in-app `/play/:id` route,
and its `games/<id>/` legacy folder is deleted in the same commit. The legacy tree shrinks to zero.

## Stack

| Concern | Choice | Note |
|---|---|---|
| Build | **Vite 6** | Fast, zero-config TS + React |
| Language | **TypeScript, `strict: true`** | New code strict from commit one |
| UI | **React 19** | |
| Routing | **react-router-dom 7** | `React.lazy` + `<Suspense>` per game |
| State | **Zustand** global (profile, auth, audio); `useReducer` for game state | Context re-renders would thrash on a ticking bankroll |
| Firebase | **One** typed `src/system/firebase.ts` singleton, modular v9 | Kills the 32× duplication |
| Styling | **CSS Modules** + existing CSS custom properties | Ports `hub-style.css` mostly as-is; no Tailwind rewrite tax |
| Lint | **ESLint 9 flat config**, fails the build | Architectural invariants become lint rules |
| Tests | **Vitest** on pure game logic + system modules | Deck shuffles, scoring, win checks, bet math |
| Deploy | **GitHub Pages** via Actions (`vite build` → `dist/`) | Matches current hosting (`.nojekyll`, lowercase `index.html`) |

### Conventions that outlive the migration

- **Game logic is pure and framework-free.** `logic/` = pure TS, no DOM, no React, unit-tested.
  `components/` = React. This is what makes game #32 cheap — and it's what later lets the *server*
  run the exact same rules the client runs (see the backend plan).
- **No `window.System*` in new code.** Import from `@/system/*`. The globals live only inside the
  frozen legacy tree and die with it.
- **One game = one folder = one lazy route = one registry entry.** No exceptions.
- **Persistence lives behind a repository interface.** Stores talk to `ProfileRepo` / `MatchRepo` /
  etc., and `firebase/*` may only be imported inside `src/system/repo/firebase/` (ESLint-enforced).
  See below.

## Data layer: Firebase now, SQLite later — deliberately

**Decided 2026-07-13.** SQLite is the right long-term answer, but it's a *backend* decision, not a
storage-format one — and this app has no backend. The sequencing is:

- **This migration keeps Firebase + `localStorage` exactly as they are.** `games.json` becomes a
  typed `registry.ts` (it's config, not data — a DB would be strictly worse than a TS file).
- **`plans/BACKEND_PLAN.md`** (Phase 8+, after Phase 7) adds a Node/Express + SQLite API:
  server-authoritative economy so a player can't edit their bankroll in devtools, durable
  leaderboards, real hidden information, and no Firebase lock-in.

Doing both at once would mean rewriting the frontend and moving the data layer simultaneously, so any
bug would have two possible causes and no clean rollback point. So: **one at a time.**

Two decisions in *this* plan exist to make that later swap cheap — honor them:
1. **The repository boundary** (Phase 2) — swapping Firebase for an API means writing
   `src/system/repo/api/` and changing one wiring line. No game gets touched.
2. **Pure `logic/` folders** (Phase 5) — the server can import and run the identical rules the
   client runs, so the referee and the player agree by construction.

## Phases

One phase per conversation. Do not freestyle across phase boundaries.

| # | Phase | File | Status |
|---|---|---|---|
| 1 | Shell foundation — Vite/TS/React/router, CI, Pages deploy, legacy passthrough | [phases/PHASE-1-shell-foundation.md](phases/PHASE-1-shell-foundation.md) | ⬜ Not started |
| 2 | Core systems — `system/*` → typed modules + stores, one Firebase singleton | [phases/PHASE-2-core-systems.md](phases/PHASE-2-core-systems.md) | ⬜ Not started |
| 3 | The Hub — `hub_app.js` + `index.html` + `hub-style.css` → React shell | [phases/PHASE-3-hub.md](phases/PHASE-3-hub.md) | ⬜ Not started |
| 4 | Multiplayer — lobby/match/chat → typed React hooks | [phases/PHASE-4-multiplayer.md](phases/PHASE-4-multiplayer.md) | ⬜ Not started |
| 5 | Game SDK — define the contract, port 2 pilot games | [phases/PHASE-5-game-sdk.md](phases/PHASE-5-game-sdk.md) | ⬜ Not started |
| 6 | Game ports — the other 29, in waves | [phases/PHASE-6-game-ports.md](phases/PHASE-6-game-ports.md) | ⬜ Not started |
| 7 | Cutover — delete legacy, PWA, perf, schema cleanup | [phases/PHASE-7-cutover.md](phases/PHASE-7-cutover.md) | ⬜ Not started |
| 8+ | **Backend** — Node/Express + SQLite, server-authoritative economy *(separate plan)* | [BACKEND_PLAN.md](BACKEND_PLAN.md) | 🔒 Blocked on Phase 7 |

Phases 1→5 are strictly sequential. Phase 6 is 29 independent units and can span many
conversations. Phase 7 is gated on Phase 6 hitting 31/31. The backend plan is a separate project
and does not start until this one is done.

## Ground rules (every phase, no exceptions)

1. **One phase per conversation.** Start it with:
   > Read `plans/MIGRATION_PLAN.md` and `plans/phases/PHASE-N-*.md`. Execute phase N.
2. **Never break `main`.** Every phase ends with a working deploy. If it can't land in one merge,
   land it behind a flag.
3. **Read the legacy file before replacing it.** Each phase names the files it kills.
4. **Verify by running it.** `npm run dev`, open it, click the thing. Not "the types compile."
5. **Data schema is frozen** until Phase 7. Port behavior, not shape.
6. **Closeout ritual — this is how the next conversation knows where it is:**
   ```bash
   git checkout -b migration/phase-N-<slug>
   git add -A && git commit          # conventional commits, one logical change each
   git push -u origin HEAD
   gh pr create --fill
   gh pr merge --squash              # after CI is green
   ```
   Then fill in the phase file's `## Outcome` section (what shipped, what changed vs the plan,
   gotchas the next phase needs), flip the status in the table above, and commit that too.
   Tree clean at the end.

## Non-goals

- Not redesigning the UI. Visual parity first; restyling is a separate project.
- Not changing game rules, economy math, or the Firebase data layout.
- Not adding a backend. Still a static site + Firebase RTDB.
- Not SSR/Next.js. It's a client-side arcade.

## Risk register

| Risk | Mitigation |
|---|---|
| Migration stalls half-done; repo has two of everything forever | Phase 6 has a 31-row per-game checklist. It's visible and countable. |
| Legacy and ported games write incompatible profile/room data | Schema freeze (above). Phase 4 derives the room types **from what legacy actually writes**. |
| A ported game plays subtly wrong (bad shuffle, off-by-one score) | Phase 5 mandates: extract logic → unit test it → *then* draw the UI. |
| `games/scrabble` is **732 KB** (dictionary) — would blow up the bundle | Big data assets stay in `public/`, fetched at runtime. Never `import`ed. Called out in Phase 6. |
| Bankroll/profile corruption during the transition | Schema frozen; Phase 2 ships conformance tests asserting the TS modules read/write byte-identical localStorage to the legacy ones. |
