# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"The Game Shack" — a static, single-page web arcade/casino hub (PWA) hosting 31 mini-games. Pure browser app: vanilla HTML/CSS/JS, no build step, no package manager, no tests. Deploys as static files to GitHub Pages from `main` at the repo root (live at https://mogar13.github.io/Game-Room/). Persistence is split between `localStorage` (offline-first) and Firebase (Authentication for accounts; Realtime Database for player records, multiplayer rooms, and chat).

A React + TypeScript migration is planned but not started — see [plans/MIGRATION_PLAN.md](plans/MIGRATION_PLAN.md). Until it begins, the conventions below still hold.

## Run / develop

There is no build, lint, or test pipeline. Serve the repo root over HTTP and open `index.html` (lowercase — Pages is case-sensitive, and the file was renamed for it):

```
python -m http.server 8000
# then visit http://localhost:8000/index.html
```

`file://` will not work — Firebase modules and `fetch('games.json')` require an HTTP origin. The hub uses a cache-buster (`games.json?v=<timestamp>`) so edits to `games.json` show up immediately; other static assets may need a hard refresh.

## Architecture

### Hub vs games (two-tier)

- **Hub** (`index.html` + `hub_app.js` + `hub-style.css`) — the launcher. Loads `games.json`, renders cards grouped by `category`, scans Firebase for live rooms across every game's `roomPath`, and opens games inside an iframe launch panel.
- **Games** (`games/<id>/<id>.html` + `<id>_app.js` + `<id>_style.css`) — each game is a self-contained page. The hub does not import game code; games are launched by URL.

Adding a game: drop a folder under `games/`, then add an entry to `games.json` (id, name, category, icon, url, badges, `roomPath`). The hub picks it up on next load. `roomPath` must match the Firebase node the game writes its rooms under (e.g. `uno_rooms`); `null` means single-player only.

### The "Casino OS" system layer

Everything under `system/` is a shared runtime that both the hub and every game depend on. Modules attach themselves to `window.System*` globals and talk to each other through those globals + a pub/sub on `SystemUI` (`SystemUI.on/emit`). There is no module system — script load order matters.

Standard load order in a game's HTML (see [games/uno/uno.html](games/uno/uno.html#L145-L154) or [games/chess/chess.html](games/chess/chess.html#L131-L140) for the canonical example):

```
system_profile.js    →  SystemProfile  (player data, bankroll, XP/level, localStorage)
system_audio.js      →  SystemAudio    (sounds, mute)
system_stats.js      →  SystemStats    (per-game win/loss tracking)
system_achievements.js → SystemAchievements
system_betting.js    →  SystemBetting  (chip UI, bet math, economy guard)
system_lobby.js      →  SystemLobby    (v2 lobby overlay; create/join/seat UI)
system_chat.js       →  SystemChat     (in-room chat panel, Firebase synced)
system_ui.js         →  SystemUI       (event bus + back-compat wrappers)
system_match.js      →  SystemMatch    (room lifecycle; loads AFTER system_ui.js — it consumes
                                        the wired modules rather than being wired by them)
<game>_app.js
```

`system_ui.js` runs a `wireSystemModules()` IIFE at the bottom that re-exposes the other modules through `SystemUI.*` (e.g. `SystemUI.v2Lobby` is `SystemLobby`, `SystemUI.startChat` calls `SystemChat`). This back-compat shim exists because older games were written against a monolithic `SystemUI` before the modules were split out — keep both call styles working when touching the system layer.

The hub itself loads a smaller subset: `system_profile.js`, `system_auth.js`, `system_store.js`, `system_stats.js`, `system_achievements.js`, `system_rewards.js` (see bottom of [index.html](index.html#L434-L440)).

### Firebase wiring

Firebase config is duplicated inline in every page that needs it (the hub's [index.html](index.html#L392-L432) and each game's HTML). Each page initializes Firebase as a `type="module"` script and assigns the API to globals — database: `window.db`, `window.dbRef`, `window.dbOnValue`, `window.dbUpdate`, `window.dbGet`, `window.dbRemove`, `window.dbSet`; auth (hub only): `window.fbAuth`, `window.fbCreateUser`, `window.fbSignIn`, `window.fbSignOut`, `window.fbOnAuthStateChanged`, `window.fbSendPasswordReset`. All other JS uses those globals — there is no shared `firebase.js`.

Because module scripts run *after* classic scripts, the hub sets `window.hubFirebaseReady = true` once init finishes, and `hub_app.js` polls for that flag before starting `scanActiveMatches()`; `SystemAuth` likewise polls for the `window.fb*` globals. Preserve this pattern when adding new Firebase-dependent hub features.

Security rules live in [database.rules.json](database.rules.json) and are the real enforcement boundary — the client cannot be trusted to hold a node open. Firebase data layout:
- `users/<uid>` — the full player record. **Owner-only** by rule (or an admin).
- `usernames/<username>` — public username → uid index, used for username login and uniqueness. Real email addresses are deliberately never written here.
- `leaderboard/<uid>` — public, secret-free projection (name, avatar, bankroll, xp, level, wins) that powers rankings, because `users/` is not publicly readable. Rules `.validate` the exact field set: adding a leaderboard field means updating the rules too, or the write is rejected.
- `admins/<uid>` — grants dev rights; readable only by that uid.
- `<game roomPath>/<roomId>` — multiplayer room state, owned by the game.
- `chat/<roomId>/messages` and `global_chat` — per-room and hub-wide chat (see [system_chat.js](system/system_chat.js)).

### Multiplayer flow (`SystemMatch` + `SystemLobby`)

The two abstractions:
- **`SystemLobby` / `SystemUI.v2Lobby`** — the *UI* layer: injects the host/join overlay, renders seats, exposes `onHost / onJoin / onLeave / onStart / onClose` callbacks.
- **`SystemMatch`** — the *infrastructure* layer on top of it: assigns seat IDs (host = 1, joiner = 2), writes/reads the room node, tracks the listener, cleans up on exit. Newer games should call `SystemMatch.setup({ gameId, roomPath, onHost, onJoin, onStart, onLeave, onClose })` instead of wiring `v2Lobby` by hand. See [system_match.js](system/system_match.js) for the full API.

Host writes the initial room with two seats (`{type:'human'|'open', name}`) at `<roomPath>/<id>`; joiner fills seat 2; host flipping `status` from `waiting` → `playing` triggers the game-start `onValue` for both clients. Cleanup removes the room node when the host leaves — games must not assume the node persists.

### Player data: `SystemProfile` is the source of truth

All bankroll / name / XP reads and writes go through `SystemProfile`. Legacy localStorage keys (`blackjack_money`, `casino_player_name`) are kept in sync by `saveProfile()` only for backward compatibility — do not read or write them directly in new code. `SystemUI.money` is a getter/setter that proxies into `SystemProfile`; same for `SystemUI.isMuted` → `SystemAudio`.

When `SystemAuth` is logged in, the active user's profile overrides the anonymous profile and is mirrored to Firebase at `users/<uid>`, plus the public `leaderboard/<uid>` projection. Guests use the anonymous profile and never touch Firebase.

### Auth (`SystemAuth`)

Firebase Authentication owns credentials — passwords are never stored in, sent to, or readable from the database. Do not reintroduce client-side credential comparison.

Email is optional, which shapes the identity model ([system_auth.js](system/system_auth.js)):
- **No email** — the account is created against a synthetic `<username>@gameshack.invalid` address so username login still works. No password recovery is possible; that is the accepted tradeoff.
- **With email** — the real email *is* the auth identity, which is what enables Firebase's password-reset email. Real emails therefore never appear in the public `usernames/` index.

Username login works by reading `usernames/<username>` to resolve a uid, then signing in against that account's email.

### Store / cosmetics

`SystemStore.CATALOG` ([system_store.js](system/system_store.js)) is the single registry of every purchasable item (avatars, chat colors, titles, card backs, dice). Items reference `type` + `value`; the equipped loadout lives on the profile under `loadout`. When adding new cosmetics, extend the catalog and make sure any rendering code (chat bubble color, card-back image, dice face) reads from `loadout` rather than hardcoding.

## Conventions worth keeping

- **No build step, no dependencies.** Resist adding npm/bundlers. Everything ships as static files served at the repo root.
- **Script load order is part of the contract.** New `system_*` modules must load before `system_ui.js` so the wiring IIFE can pick them up; new games must include the system bundle in the order shown above.
- **Firebase config is intentionally duplicated** in each entry HTML. If you need to change project credentials, search/replace across `index.html` and every `games/*/*.html`.
- **`roomPath` in `games.json` is the join key** between the hub's live-match scanner and the game's room writes. Mismatched values silently break the "LIVE MATCHES" bar.
- **Dev rights come from `admins/<uid>`**, enforced by the database rules. `profile.isDev` and the `.dev-only` CSS class only *hide* dev UI — they are not the security boundary. Never gate privileges on a hardcoded username or password; two such backdoors shipped in the public source and were removed.
- **Never trust the client with secrets.** Anything readable by the browser is readable by everyone. If a feature needs private data, it needs a rule that scopes it — not a client-side check.
