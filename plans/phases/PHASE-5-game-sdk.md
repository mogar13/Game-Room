# Phase 5 — Game SDK + Pilot Ports

**Status:** ⬜ Not started
**Depends on:** Phases 2, 3, 4
**Unblocks:** Phase 6 (all 29 remaining ports follow this template)

## Goal

Define the contract a game implements, prove it on **two** real games, and write the doc that makes
port #3 through #31 mechanical. This phase is worth taking slowly — every shortcut here gets paid
for 29 times.

Prove the pattern end-to-end on the smallest game first — but do **two**, because one of them has to
be multiplayer or the pattern isn't actually proven.

## The two pilots

| Game | LOC | Why this one |
|---|---|---|
| **Tic-Tac-Toe** | small (24 KB folder) | Simplest possible port. Proves the SDK's happy path: pure logic, board UI, win detection, AI opponent, stats. |
| **Uno** | 983 | Proves the hard path: multiplayer via `useMatch`, lobby, chat, betting, card cosmetics (`loadout.cardback`), turn/state sync. |

If the SDK survives Uno, it survives anything except Monopoly/Risk/Scrabble (which get their own
attention in Phase 6).

## The contract

### Folder shape — non-negotiable, this is the whole convention

```
src/games/uno/
├── UnoGame.tsx          ← default export. THE only entry point. Lazy-loaded by the router.
├── logic/               ← PURE TypeScript. No DOM. No React. No Firebase. No imports from ../
│   ├── deck.ts
│   ├── rules.ts
│   ├── ai.ts
│   └── *.test.ts        ← unit tests live next to the logic
├── components/          ← React. Renders the logic's state. Owns no rules.
├── styles.module.css
└── index.ts             ← re-export
```

**The `logic/` boundary is the point of the entire migration.** A game's rules must be testable
without a browser. If a shuffle, a scoring rule, or a win check is written inside a component, the
port is wrong — send it back.

Enforce it with an ESLint rule: nothing in `logic/` may import React, the DOM, or `@/system/*`.
An invariant that lives only in a doc gets violated; one that fails the build doesn't.

### The props a game receives

```ts
// src/games/types.ts
export interface GameProps {
  onExit: () => void          // back to the hub — the router handles it
}
```

That's deliberately almost nothing. Everything else a game needs, it **imports as a hook**:

```ts
import { useProfile, useBankroll }        from '@/system/profile'
import { useBetting }                     from '@/system/betting'
import { useStats }                       from '@/system/stats'
import { useAudio }                       from '@/system/audio'
import { useAchievements }                from '@/system/achievements'
import { useMatch }                       from '@/system/match'     // multiplayer only
import { useChat }                        from '@/system/chat'      // multiplayer only
import { GameShell, BetBar, Lobby, ChatPanel } from '@/ui'
```

Props-drilling a "system" object would recreate the `window.SystemUI` god-object we're escaping.
Hooks + Zustand selectors mean a game imports exactly what it uses and re-renders only on what it
reads.

### `<GameShell>` — the chrome every game gets for free

Wraps the game with: header (name, back button), player bar (bankroll/XP), mute toggle, chat panel
if multiplayer, and the `RouteErrorBoundary`. Extracted from what the 31 legacy games each
hand-rolled. Once this exists, a new game writes **zero** chrome.

## The port procedure (this becomes the Phase 6 checklist)

For each game, in this order — **the order matters**:

1. **Read** the legacy `<game>_app.js` end to end. Don't skim it.
2. **Extract logic first.** Pull rules/deck/scoring/AI into `logic/` as pure TS functions.
3. **Test the logic.** Unit tests *before* any UI exists. Deck composition, shuffle fairness,
   legal-move generation, win/draw detection, score math, AI move selection. This is where the
   subtle bugs are, and this is the only phase where you'll catch them.
4. **Then** build the React UI against the tested logic.
5. Wire `useMatch`/`useChat` if multiplayer; wire `useBetting` if it has an economy.
6. Move assets to `public/assets/games/<id>/` — **never `import` a large data file** (see Scrabble
   note in Phase 6).
7. Flip the registry entry: `status: 'legacy'` → `'ported'`, add the `load()` lazy import,
   drop `legacyUrl`.
8. **Delete `public/legacy/games/<id>/`** in the same commit. No orphans, ever.
9. Play it. Actually play it, against a second browser if multiplayer.

## Write the doc

Ship `plans/GAME_PORT_GUIDE.md` at the end of this phase: the folder shape, the hooks table, the
9-step procedure above, and — most valuably — **every gotcha the two pilots surfaced.** Phase 6
conversations will read that guide instead of re-deriving it. It is the actual deliverable of this
phase; the two ported games are just how you find out what belongs in it.

## Acceptance criteria

- [ ] `src/games/types.ts`, `<GameShell>`, and the `@/ui` shared components exist.
- [ ] ESLint rule enforces the `logic/` purity boundary, and the rule has a test.
- [ ] **Tic-Tac-Toe** is fully ported: plays at `/play/tic-tac-toe`, AI works, stats record, its
      legacy folder is deleted.
- [ ] **Uno** is fully ported: host + join from two browsers, full game plays to completion, betting
      settles correctly, chat works, the equipped card-back cosmetic renders.
- [ ] Uno logic has real unit tests (deck composition, legal plays incl. wilds/draw-4, turn
      direction reversal, win detection).
- [ ] A ported Uno client and a *legacy* Uno client... **cannot** meet — because legacy Uno is
      deleted. ⚠️ **Decide this explicitly:** the moment a game is ported, its legacy version is
      gone, so no cross-version matchmaking is possible *for that game*. That's fine and intended.
      Just confirm the room schema is still shared so the **hub's live-match bar** works across both.
- [ ] `plans/GAME_PORT_GUIDE.md` exists and is good enough that the next conversation needs nothing else.
- [ ] Registry shows 2 ported / 29 legacy.

## Gotchas

- **Resist the urge to build a generic "board game engine."** You have 31 games and no idea yet what
  they share. Port two, note the duplication, and extract *only* what actually repeats. A premature
  abstraction here will fight you for 29 games.
- **Uno's betting settle path is money.** Get it wrong and players lose real bankroll. Unit test the
  settle math against the legacy implementation's behavior.
- **Don't port the legacy DOM manipulation.** Legacy games mutate the DOM directly. The React port
  is a rewrite of the *view*, driven by state. If you find yourself calling `getElementById`, stop.
- **Keep the visuals identical.** Copy the game's CSS across. Restyling is not this project.

---

## Outcome

_(Fill in before merging. Especially: what the pilots taught you that went into GAME_PORT_GUIDE.md.)_
