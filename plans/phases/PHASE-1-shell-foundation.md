# Phase 1 — Shell Foundation

**Status:** ⬜ Not started
**Depends on:** nothing
**Unblocks:** everything

## Goal

Stand up the Vite + TypeScript + React + Router shell that every later phase drops code into —
**without changing a single line of game behavior.** At the end of this phase the site looks and
plays exactly as it does today, but it's built by Vite, deployed by CI, type-checked, and there's
a router with a proven `React.lazy` route convention waiting to receive games.

If a user can tell the difference, Phase 1 failed.

## Why this shape

The temptation is to start by rewriting the hub. Don't. The hub is 2,000 lines of JS + 1,200 lines
of CSS with a live-Firebase match scanner in it. Rewriting it *and* introducing a build system *and*
introducing TypeScript at once means when something breaks you won't know which of the three did it.

Phase 1 changes exactly one thing: **how bytes get to the browser.**

## Scope — in

### 1. Toolchain

```bash
npm init -y
npm i react react-dom react-router-dom zustand firebase
npm i -D vite @vitejs/plugin-react typescript @types/react @types/react-dom vitest \
         eslint @eslint/js typescript-eslint eslint-plugin-react-hooks globals
```

Pin modern versions (React 19, Vite 6, react-router 7, TS 5.8).

`package.json` scripts:

| script | does |
|---|---|
| `dev` | `vite` |
| `build` | `npm run lint && tsc -b && vite build` — **lint failure fails the build**, on purpose |
| `preview` | `vite preview` — check `dist/` locally before pushing |
| `test` | `vitest run` |
| `typecheck` | `tsc --noEmit` |
| `lint` | `eslint .` |

`tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`, path alias `@/* → src/*`.
Strict from day one — the legacy tree isn't in `src/`, so it isn't type-checked, so strict costs us
nothing today and saves us from a "we'll turn it on later" that never happens.

### 2. Directory layout

```
├── index.html                 ← Vite entry (React root). REPLACES the current 39 KB hub page.
├── public/
│   ├── legacy/                ← the entire old world, moved wholesale, still works standalone
│   │   ├── hub.html           ← the current index.html, renamed (fallback only, not linked)
│   │   ├── hub_app.js
│   │   ├── hub-style.css
│   │   ├── games.json
│   │   ├── system/
│   │   └── games/             ← all 31, untouched
│   ├── assets/                ← icons, audio (shared by BOTH worlds — do not duplicate)
│   ├── manifest.json
│   └── .nojekyll
├── src/
│   ├── main.tsx
│   ├── App.tsx                ← router + shell chrome
│   ├── system/                ← Phase 2 fills this
│   ├── games/                 ← Phase 5+ fills this
│   ├── ui/
│   └── styles/
└── plans/
```

**Critical:** legacy games load `../../system/*.js` with relative paths. Moving the tree *wholesale*
into `public/legacy/` preserves every relative path inside it. Do not "tidy up" the structure while
moving it — `git mv` the whole thing and change nothing inside.

Shared assets (game icons, audio) are referenced by both worlds. Keep **one** copy in
`public/assets/` and fix the legacy references to point at it, or keep them where legacy expects and
have the new code reference that path. Either is fine — just don't end up with two copies that drift.

### 3. Router + the lazy-route convention (the real deliverable)

`src/App.tsx`:
- Routes: `/` → `<Hub/>` (a placeholder for now), `/play/:gameId` → lazy game loader,
  `/store`, `/profile` — placeholders.
- `React.lazy()` + `<Suspense fallback={<GameSpinner/>}>` around the route outlet.
- A `RouteErrorBoundary` so one broken game can't white-screen the whole arcade.
- **A `/playground` route that lazy-loads a dummy component** — this exists purely to prove the
  lazy-loading pipeline works (you should see a separate chunk in the network tab and the Suspense
  fallback flash on first visit). Delete it in Phase 5 when real games take its place.

### 4. The legacy bridge — a link, not an iframe

The placeholder hub at `/` lists games and, for now, **every card is a plain link** to
`/legacy/games/<id>/<file>.html`. Full-page navigation. New tab or same tab, your call — same tab
with a "← The Game Shack" link injected is nicer, but do not spend time on it; this is temporary.

Simplest way to get the card list: `fetch('/legacy/games.json')` for now. Phase 3 replaces it with
the typed registry. Do not build the real hub UI in this phase.

There is **no iframe**. There is **no `postMessage`**. The legacy page is just a page.

### 5. Deploy + CI

`.github/workflows/deploy.yml` — on push to `main`: `npm ci`, `npm run build`, deploy `dist/` to Pages.

`.github/workflows/ci.yml` — on PR: `npm ci && npm run lint && npm run typecheck && npm run test && npm run build`.
This is the gate that keeps `main` deployable for six more phases. Set it up now, when it's cheap
and there's nothing to fix.

Two things that will bite you:
- **Vite `base`.** If Pages serves from a project subpath (`user.github.io/Game-Room/`), you need
  `base: '/Game-Room/'`. If it's a custom domain or user site, `base: '/'`. **Check the actual Pages
  settings before guessing** — a wrong `base` silently 404s every asset and looks like a build bug.
- **SPA fallback.** Pages has no rewrite rules, so `/play/uno` on a hard refresh 404s. Fix: build
  step copies `dist/index.html` → `dist/404.html`. (The alternative, `HashRouter`, gives uglier URLs
  — only fall back to it if the 404 trick misbehaves.)

## Scope — out

- ❌ Touching `system/*.js`
- ❌ Touching any game's code
- ❌ Porting `hub_app.js` (Phase 3)
- ❌ Deduplicating the Firebase config (Phase 2)
- ❌ Any visual change
- ❌ Any `localStorage` or Firebase schema change (frozen until Phase 7)

## Acceptance criteria

- [ ] `npm run dev` serves the placeholder hub; clicking a card navigates to the legacy game page,
      which plays normally.
- [ ] `npm run build && npm run preview` — same behavior, from the built output.
- [ ] `/playground` lazy-loads a separate chunk (confirm in the network tab) and shows the Suspense
      fallback on first visit.
- [ ] Browser back/forward works across shell routes.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test` all pass (test suite may be near-empty —
      the *script* must work).
- [ ] CI runs on PRs and blocks on failure. Push to `main` deploys, and the live site still works.
- [ ] `.gitignore` covers `node_modules/`, `dist/`.
- [ ] `CLAUDE.md` updated: **there is a build step now.** The "no build, no dependencies, resist
      adding npm" convention is dead — say so explicitly and say what replaced it. Leaving that
      instruction in place will actively mislead the next conversation.

## Verification script (do this by hand — don't assume)

From `npm run preview`, i.e. the real built output:

1. Hub loads, cards render.
2. Launch **Uno** (multiplayer, `SystemMatch`) — the legacy page opens, lobby appears.
3. Second browser profile joins the room. Both clients see seat 2 fill. Host starts. Game runs.
4. Send a chat message — appears on both sides.
5. Log in via `SystemAuth`. Bankroll persists across a reload.
6. Launch **Solitaire** (`roomPath: null`, single-player). It runs.
7. Win/lose something and confirm stats + bankroll still update.

If all 7 pass from `dist/`, the pipeline is sound and Phase 2 can start.

## Gotchas

- **Case sensitivity.** Recent commits renamed `Index.html` → `index.html` for Pages. Don't
  reintroduce a capitalized path. Linux CI catches it; a local dev machine may not.
- **`games.json` cache-buster.** `hub_app.js` fetches `games.json?v=<timestamp>`. Still fine from
  `public/legacy/` — just confirm the relative path resolves after the move.
- **`.gitattributes`** already normalizes LF. Leave it alone.
- **Don't install a CSS framework, a UI kit, or a state library you haven't needed yet.** Every
  dependency added in Phase 1 is one you'll be arguing with in Phase 6.

---

## Outcome

_(Fill in before merging: what shipped, what changed vs the plan, what's deferred, what Phase 2
needs to know. Then flip the status row in `plans/MIGRATION_PLAN.md`.)_
