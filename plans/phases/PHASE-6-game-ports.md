# Phase 6 — Game Ports (the other 29)

**Status:** ⬜ Not started — 2 / 31 ported
**Depends on:** Phase 5 (SDK + `GAME_PORT_GUIDE.md`)
**Unblocks:** Phase 7 (gated on 31/31)

## Goal

Port the remaining 29 games into `src/games/<id>/` as lazy routes, deleting each one's legacy folder
in the same commit. When the last row of the table below is checked, `public/legacy/` is empty and
Phase 7 can run.

**Read `plans/GAME_PORT_GUIDE.md` first.** It has the folder shape, the hooks table, and the 9-step
procedure. This file is just the work queue and the per-game intel.

## How to work this phase

This is 29 independent units. Spread them across as many conversations as you like — **one wave per
conversation**, and don't start a wave until the previous one is merged.

Per game, per the guide: read the legacy app → extract `logic/` as pure TS → **unit test the logic
before writing any UI** → build the React UI → wire hooks → move assets → flip the registry entry →
delete the legacy folder → actually play it.

**Do not batch the registry flip.** Each game merges green and playable on its own. If a wave
half-lands, the arcade is still fully playable — some games in-shell, some as legacy pages.

## Waves

Ordered by rising difficulty, so the pattern is well-worn before it meets Monopoly.

### Wave 1 — Warm-up (single-player, no lobby, no room sync)
The four `roomPath: null` games. No multiplayer surface at all; pure logic + UI.

| ✅ | Game | id | LOC | roomPath | Notes |
|---|---|---|---|---|---|
| ⬜ | Roulette | `roulette` | 198 | — | Smallest in the repo. Betting-heavy → lean on `useBetting`. |
| ⬜ | Slots | `slots` | 247 | — | Reels + payout table. Pure math, trivially testable. |
| ⬜ | Solitaire | `solitaire` | 541 | — | Drag/drop. Watch out for legacy direct-DOM drag handling. |
| ⬜ | Texas Hold'em | `texas_holdem` | 682 | — | ⚠️ folder is `games/holdem/`, id is `texas_holdem`. Hand evaluation → **big unit-test win**. |

### Wave 2 — Simple multiplayer
Small games that exercise `useMatch` for real. If `useMatch` has a flaw, it surfaces here — cheaply.

| ✅ | Game | id | LOC | roomPath | Notes |
|---|---|---|---|---|---|
| ⬜ | Liar's Dice | `liars_dice` | 354 | `liars_dice_rooms` | |
| ⬜ | Battleship | `battleship` | 471 | `bs_rooms` | Hidden state per player — first game where seat-scoped state matters. |
| ⬜ | Snakes & Ladders | `snl` | 498 | `snl_rooms` | ⚠️ folder `snakes-and-ladders`, id `snl`. |
| ⬜ | Old Maid | `maid` (check) | 510 | `maid_rooms` | |
| ⬜ | RPS | `rps` | 555 | `rps_rooms` | Simultaneous reveal — a genuine sync edge case. Do it early. |
| ⬜ | War | `war` | 632 | `war_rooms` | |
| ⬜ | Connect 4 | `c4` | 696 | `c4_rooms` | ⚠️ folder `connect4`, id `c4`. |
| ⬜ | Memory | `memory` | 731 | `memory_rooms` | |

### Wave 3 — Card & board staples

| ✅ | Game | id | LOC | roomPath | Notes |
|---|---|---|---|---|---|
| ⬜ | Rummy | `rummy` | 614 | `rummy_rooms` | Meld detection → test it hard. |
| ⬜ | Domino | `domino` | 643 | `domino_rooms` | |
| ⬜ | Crazy 8 | `crazy8` | 660 | `c8_rooms` | Close cousin of Uno — reuse what the pilot taught you. |
| ⬜ | Backgammon | `backgammon` | 676 | `bg_rooms` | Dice + `loadout.dice` cosmetic. |
| ⬜ | Blackjack | `blackjack` | 829 | `bj_rooms` | The economy's flagship. **Settle math must be exact.** Legacy `blackjack_money` key is the origin of the whole profile system — tread carefully. |
| ⬜ | Pong | `pong` | 858 | `pong_rooms` | ⚠️ Real-time, not turn-based. Animation loop → `requestAnimationFrame`, not React state per frame. See gotchas. |
| ⬜ | Checkers | `checkers` | 946 | `checkers_rooms` | |
| ⬜ | Yahtzee | `yahtzee` | 1035 | `yahtzee_rooms` | Scoring table → the single most test-worthy pure function in the repo. |

### Wave 4 — Heavy logic

| ✅ | Game | id | LOC | roomPath | Notes |
|---|---|---|---|---|---|
| ⬜ | Family Feud | `family-feud` | 1213 | `feud_rooms` | Question data → `public/assets/`, fetched. Don't bundle it. |
| ⬜ | Chess | `chess` | 1286 | `chess_rooms` | Move generation, check/mate detection, castling, en passant, promotion. **The best unit-test target in the entire codebase.** Budget real time. |
| ⬜ | Trivial Pursuit | `trivia` (check) | 1459 | `trivia_rooms` | Question bank → `public/assets/`. |
| ⬜ | Clue | `clue` | 1466 | `clue_rooms` | Deduction state, hidden info per seat. |
| ⬜ | Bowman | `bowman` | 1540 | `bowman_rooms` | ⚠️ Physics/animation, like Pong. |
| ⬜ | Pool | `pool` | 1586 | `pool_rooms` | ⚠️ Physics sim. Hardest real-time port. Consider keeping the physics loop on canvas and letting React own only the chrome. |

### Wave 5 — The monsters

| ✅ | Game | id | LOC | roomPath | Notes |
|---|---|---|---|---|---|
| ⬜ | Scrabble | `scrabble` | 1538 | `scrabble_rooms` | 🚨 **732 KB folder** — the dictionary. **MUST stay in `public/assets/` and be `fetch`ed at runtime.** If you `import` it, it lands in the JS bundle and every player downloads it to open the hub. Non-negotiable. |
| ⬜ | Monopoly | `monopoly` | 2291 | `mono_rooms` | Biggest game. Property/trade/rent/jail state machine. Expect a full conversation for this one alone. |
| ⬜ | Risk | `risk` | 2585 | `risk_rooms` | Largest file in the repo. Territory graph + combat resolution → pure logic, heavily tested. Possibly two conversations. |

## Progress

**2 / 31 ported** (Tic-Tac-Toe + Uno, from Phase 5).
Update this count and the checkboxes at the end of every wave, and mirror it in `MIGRATION_PLAN.md`.
Phase 7 does not start until this reads **31 / 31** and `public/legacy/games/` is empty.

## Cross-cutting gotchas

- **⚠️ `id` ≠ folder name for four games.** `ttt`/`tic-tac-toe`, `c4`/`connect4`, `snl`/
  `snakes-and-ladders`, `texas_holdem`/`holdem`. Any script that assumes `games/<id>/` will
  silently skip or mangle these. The new registry should use the **folder name as the canonical id**
  and record the old id only if something still depends on it (check `roomPath` usage and any saved
  stats keyed by game id — **stats keyed by the old id must keep working or players lose their
  records**).
- **🚨 Big assets never get `import`ed.** Scrabble's dictionary, Trivial Pursuit's and Family Feud's
  question banks. `public/assets/` + runtime `fetch`. Check the built bundle size after each of
  these three; if it jumps, you got it wrong.
- **Real-time games (Pong, Pool, Bowman) are not turn-based games.** Do not drive an animation loop
  through React state — you'll re-render 60×/sec. Keep the sim in a `requestAnimationFrame` loop
  writing to a ref/canvas, and let React render only the chrome around it. Their multiplayer sync is
  also fundamentally different (continuous position updates vs. discrete turns) — read the legacy
  netcode carefully before assuming `useMatch` fits as-is. If it doesn't, extend it; don't hack
  around it.
- **Hidden per-seat state** (Battleship's board, Clue's hand, Hold'em's hole cards) is written to a
  *public* RTDB node. Legacy almost certainly trusts the client. **Don't fix this here** — you can't,
  without a server. Note each instance; it becomes the anti-cheat case in `plans/BACKEND_PLAN.md`.
- **Stats/achievements keys must not change.** They're keyed by game id in `localStorage`. Changing
  an id orphans a player's history. If you must change one, migrate the key.
- **Delete the legacy folder in the same commit as the registry flip.** Two sources of truth for one
  game, even for a day, is how you end up with a bug fixed in the wrong one.

---

## Outcome

_(Update after every wave: which games landed, gotchas found, anything that changed
`GAME_PORT_GUIDE.md`.)_
