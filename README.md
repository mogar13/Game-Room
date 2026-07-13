# The Game Shack

A browser arcade hosting 31 mini-games — board games, card games, and casino tables — behind a
single hub with one shared account, bankroll, XP/level system, cosmetics store, and live
multiplayer.

**Play:** https://mogar13.github.io/Game-Room/

No build step, no package manager, no dependencies to install. The whole thing is static
HTML/CSS/JS served from the repo root, with Firebase providing authentication, multiplayer rooms,
and chat.

---

## Running it locally

Serve the repo root over HTTP and open the hub:

```bash
python -m http.server 8000
# http://localhost:8000/index.html
```

Opening `index.html` as a `file://` URL will **not** work — the Firebase SDK loads as an ES module
and the hub does `fetch('games.json')`, both of which require an HTTP origin.

The hub cache-busts `games.json` (`?v=<timestamp>`), so game-list edits appear on reload. Other
static assets may need a hard refresh.

---

## Layout

```
index.html          Hub shell — Firebase init, script loads
hub_app.js          Hub logic: game grid, live-match scanner, global chat, profile UI
hub-style.css       Hub styles
games.json          The game registry — the hub renders whatever is in here
manifest.json       PWA manifest
database.rules.json Firebase Realtime Database security rules

system/             "Casino OS" — the shared runtime every page loads
  system_profile.js       Player data: bankroll, XP, level, loadout (localStorage)
  system_auth.js          Firebase Authentication: sign-up, login, account management
  system_audio.js         Sounds and mute state
  system_stats.js         Per-game win/loss tracking
  system_achievements.js  Achievement unlocks
  system_rewards.js       Daily rewards
  system_betting.js       Chip UI and bet math
  system_store.js         Cosmetics catalog (avatars, chat colors, titles, card backs, dice)
  system_lobby.js         Host/join overlay and seat UI
  system_match.js         Multiplayer room infrastructure on top of the lobby
  system_chat.js          In-room chat panel
  system_ui.js            Event bus + back-compat wrappers over the modules above

games/<id>/         One folder per game: <id>.html + <id>_app.js + <id>_style.css
plans/              Design docs for the in-progress React + TypeScript migration
```

The hub never imports game code. Games are standalone pages launched by URL into an iframe panel,
and they share state with the hub only through the `system/` layer and Firebase.

---

## Adding a game

1. Create `games/<id>/` containing `<id>.html`, `<id>_app.js`, and `<id>_style.css`.
2. In the game's HTML, initialize Firebase and load the `system/` scripts **in the documented
   order** — copy [games/uno/uno.html](games/uno/uno.html) as the reference. Load order is a real
   contract, not a style preference: `system_ui.js` wires the preceding modules together, so a new
   `system_*` module has to load before it, and `system_match.js` loads after it because it consumes
   that wiring.
3. Add an entry to `games.json`:

```json
{
  "id": "backgammon",
  "name": "Backgammon",
  "searchTags": "backgammon",
  "category": "board",
  "icon": "system/images/icons/bg-icon.png",
  "iconStyle": "",
  "url": "games/backgammon/bg.html",
  "badges": ["👥 Online", "🤖 Solo"],
  "roomPath": "bg_rooms"
}
```

`roomPath` is the Firebase node the game writes its multiplayer rooms under, and it is the join key
the hub's live-match scanner uses. If it doesn't match what the game actually writes, the game still
works but the "LIVE MATCHES" bar silently stops showing its rooms. Use `null` for single-player-only
games.

The hub picks the game up on the next load — nothing else to register.

---

## Multiplayer

Games call `SystemMatch.setup({ gameId, roomPath, onHost, onJoin, onStart, onLeave, onClose })`,
which handles the room lifecycle: the host writes a room node with two seats, the joiner claims seat
2, and the host flipping `status` from `waiting` to `playing` starts the game for both clients. The
room node is removed when the host leaves, so games must not assume it persists.

`SystemLobby` underneath it owns the host/join overlay UI. Older games wire it directly; new games
should go through `SystemMatch`.

---

## Accounts and Firebase

Credentials are owned by Firebase Authentication — passwords are never stored in or readable from
the database.

Email is optional, which shapes the identity model:

- **No email** — the account gets a synthetic `<username>@gameshack.invalid` address so username
  login still works. There is no password recovery; that's the tradeoff.
- **With email** — the real email *is* the auth identity, which enables Firebase's password-reset
  email. Real emails are therefore never written into the public `usernames/` index.

Database layout:

| Node | Access | Contents |
|---|---|---|
| `users/<uid>` | owner only | The full player record (profile, bankroll, stats, loadout) |
| `usernames/<username>` | public read | Username → uid index, for username login and uniqueness |
| `leaderboard/<uid>` | public read | Secret-free projection: name, avatar, bankroll, xp, level, wins |
| `admins/<uid>` | self read | Grants dev rights; enforced by the rules, not the client |
| `<roomPath>/<roomId>` | public | Multiplayer room state, owned by the game |
| `chat/<roomId>/messages` | public | Per-room chat |
| `global_chat` | public | Hub-wide chat |

Guests never touch Firebase — they run entirely off the anonymous local profile in `localStorage`.

The leaderboard reads the `leaderboard/` projection rather than the `users/` node precisely because
`users/` is owner-only. If you add a field the leaderboard needs to display, add it to the
projection *and* to the `.validate` list in `database.rules.json`, or the write will be rejected.

### Firebase project setup

Pointing this at a fresh Firebase project requires four things:

1. Enable the **Email/Password** provider in Authentication.
2. Publish `database.rules.json` to the Realtime Database.
3. Authorize the hosting domain under Authentication → Settings → Authorized domains.
4. Replace the `firebaseConfig` block, which is **intentionally duplicated inline** in `index.html`
   and in every `games/*/*.html`. There is no shared `firebase.js` — changing credentials means a
   search/replace across all of them.

---

## Deployment

GitHub Pages serves `main` from the repo root; a push deploys. `.nojekyll` is present so Jekyll
doesn't strip files, and `index.html` is lowercase because Pages is case-sensitive.

---

## Conventions

- **No build step, no dependencies.** Everything ships as static files. Resist adding npm or a
  bundler — a React + TypeScript migration is planned and scoped in [plans/](plans/), and that's the
  place for it.
- **Script load order is part of the contract.** New `system_*` modules must load before
  `system_ui.js` so its wiring pass picks them up.
- **`SystemProfile` is the source of truth** for bankroll, name, and XP. Legacy localStorage keys
  (`blackjack_money`, `casino_player_name`) are mirrored for backward compatibility only — don't
  read or write them in new code.
- **Cosmetics live in `SystemStore.CATALOG`.** Rendering code should read the equipped `loadout`
  from the profile rather than hardcoding a color, card back, or dice face.
