# Phase 3 — The Hub

**Status:** ⬜ Not started
**Depends on:** Phase 2
**Unblocks:** Phase 5 (games need a shell to launch from)

## Goal

Replace the legacy hub — `index.html` (39 KB), `hub_app.js` (2,014 lines), `hub-style.css` (36 KB) —
with the React shell. After this phase the arcade's front door is React, and legacy games are
reached by navigating out to their standalone pages.

Visual parity is the target. This is a **port, not a redesign.**

## What `hub_app.js` actually does

Read it before you write anything. It is 2,000 lines and it does roughly:

| Concern | → New home |
|---|---|
| Fetch + parse `games.json`, group by `category` | `src/games/registry.ts` (typed, compiled — no fetch) |
| Render game cards, icons, badges | `src/ui/GameCard.tsx`, `src/ui/GameGrid.tsx` |
| Search / filter (`searchTags`) | `src/hub/useGameSearch.ts` |
| **Live-match scanner** — polls every game's `roomPath` in RTDB for open rooms | `src/hub/useLiveMatches.ts` |
| Launch panel (iframe) | ☠️ **deleted.** Replaced by `<Link to={/play/:id}>` or a legacy nav. |
| `window.hubFirebaseReady` polling flag | ☠️ **deleted.** Phase 2's singleton is imported, not polled. |
| Profile / bankroll / XP display | `src/ui/PlayerBar.tsx`, reading the Phase 2 store |
| Auth UI (login/register) | `src/hub/AuthGate.tsx` + Phase 2's `auth.ts` |
| Store / cosmetics UI | `src/hub/StorePanel.tsx` |
| Achievements + stats panels | `src/hub/StatsPanel.tsx` |
| Global chat | Phase 4 — leave a placeholder, wire it there |
| Dev-only tools (gated on `admins/<uid>`, cached as `profile.isDev`) | `src/hub/DevPanel.tsx`, same gate, no wider |

Two deletions in that table are worth pausing on, because they're the payoff for dropping the iframe:
**the launch panel** and **the `hubFirebaseReady` polling handshake** both simply cease to exist.

## The registry replaces `games.json`

```ts
// src/games/registry.ts
export interface GameEntry {
  id: string
  name: string
  category: 'board' | 'arcade' | 'cards' | 'casino'   // widen as needed
  icon: string
  searchTags: string
  badges: string[]
  roomPath: string | null          // null = single-player only
  status: 'ported' | 'legacy'      // ← drives how the card launches
  legacyUrl?: string               // required when status === 'legacy'
  load?: () => Promise<{ default: ComponentType<GameProps> }>   // required when 'ported'
}
```

- `status: 'ported'` → card renders `<Link to="/play/uno">`, React.lazy-loads the game in-shell.
- `status: 'legacy'` → card renders `<a href="/legacy/games/uno/uno.html">`, full-page navigation.

Every game starts as `'legacy'`. Phase 6 flips them one at a time. **The count of `'legacy'` entries
is the migration's progress bar** — surface it in the dev panel so it's impossible to lose track of.

Note today's `games.json` is 30× `"category": "board"` and 1× `"arcade"` — the categories are
basically unused. Fixing that is a nice-to-have; do it only if it's free.

## Routing

```
/                 Hub — game grid, search, live matches, player bar
/play/:gameId     Lazy-loaded ported game (Phase 5+). Unknown/legacy id → redirect to legacy URL.
/store            Cosmetics
/profile          Stats, achievements, loadout
```

Wrap the game route in the `RouteErrorBoundary` from Phase 1 — a crash in one game must not
white-screen the arcade.

## CSS

`hub-style.css` is 36 KB. Don't rewrite it; **move it**:
1. Lift its `:root` custom properties into `src/styles/tokens.css` (colors, spacing, the neon/casino
   palette). These are the design system and every game will consume them.
2. Split the rest into CSS Modules per component (`GameCard.module.css`, etc.), copying rules over
   mostly as-is.
3. Delete rules with no matching selector in the new markup as you go — but don't go hunting.
   Restyling is explicitly a non-goal.

## Acceptance criteria

- [ ] `/` renders every game card with correct icon, name, badges, category grouping — visually
      matching the current hub.
- [ ] Search/filter behaves as before.
- [ ] **Live matches bar works**: host a room in a *legacy* game in one browser, and the React hub
      in another browser shows it as a live match. (This proves the `roomPath` join key survived
      the port and that the two worlds still share Firebase.)
- [ ] Clicking a `'legacy'` card navigates to the standalone game page, which plays normally.
- [ ] Player bar shows live bankroll/XP/level from the Phase 2 store, and updates on change without
      a reload.
- [ ] Login/register/logout work (Firebase Auth — username *and* email login paths). Guest mode works.
      **Auth resolves asynchronously**: the hub must not flash a signed-out state before
      `onAuthStateChanged` fires. Handle `loading` explicitly.
- [ ] Store purchases and loadout equipping work; equipped cosmetics persist across reload.
- [ ] Dev panel appears **only** for users in `admins/<uid>` — hiding the button is cosmetic; the
      database rule is the real gate.
- [ ] Legacy `index.html`, `hub_app.js`, `hub-style.css` are **deleted from the repo root**
      (the copies under `public/legacy/` stay until Phase 7).
- [ ] `public/legacy/` still unmodified.

## Gotchas

- **The live-match scanner is the highest-risk piece.** It fans out across every game's `roomPath`
  in RTDB. Read the legacy implementation carefully — especially how it avoids leaking listeners.
  In React, an `onValue` subscription that isn't torn down in a `useEffect` cleanup will pile up on
  every re-render and quietly hammer Firebase.
- **`roomPath` is the join key** between the hub scanner and each game's room writes. A typo
  silently produces an empty LIVE MATCHES bar with no error. Type it: derive the union of valid
  room paths from the registry.
- **Don't let the hub re-render on every bankroll tick.** Zustand selectors, not one fat context.
- **Keep the `games.json` file alive in `public/legacy/`** — the legacy hub page (`hub.html`) still
  fetches it, and legacy games may too. It's frozen, not deleted.

---

## Outcome

_(Fill in before merging.)_
