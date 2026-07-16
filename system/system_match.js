/**
 * CASINO OS — SYSTEM MATCH MODULE (v1.1)
 *
 * A Match Controller that handles room lifecycle, seat management,
 * and Firebase wiring so games don't have to repeat that boilerplate.
 *
 * The game provides callbacks and handles its own state push/apply.
 * SystemMatch handles: v2Lobby wiring, room create/join, seat tracking, cleanup.
 *
 * Usage:
 * SystemMatch.setup({
 *   gameId, roomPath,
 *   numSeats: 2,                    // optional, default 2 — total seat count
 *   getSeatCount: () => playerCount,// optional, dynamic seat count for variable-player games
 *   buildSeats: (count) => [...],   // optional, custom seat builder for host
 *   extraRoomFields: () => ({...}), // optional, fields merged into the host room write
 *   onHost, onJoin, onLeave, onStart, onClose
 * })
 *
 * SystemMatch.getMyId()              → 1..N (host=1, joiners take first AI seat)
 * SystemMatch.isHost()               → bool
 * SystemMatch.getRoomId()            → string | null
 * SystemMatch.getRoomPath()          → string | null
 * SystemMatch.getSeats()             → array
 * SystemMatch.setSeats(arr)          → stores seats array
 * SystemMatch.setListener(fn)        → stores the onValue unsubscribe fn
 * SystemMatch.isMyTurn(activeTurn)   → bool
 * SystemMatch.getSeatName(idx)       → string (1-based idx)
 * SystemMatch.cleanup()              → tears down room + listener
 */

window.SystemMatch = {

    // ── INTERNAL STATE ────────────────────────────
    _gameId:       null,
    _roomPath:     null,
    _myId:         1,
    _isHost:       false,
    _seats:        [],
    _roomId:       null,
    _roomListener: null,

    // ── SETUP ─────────────────────────────────────
    // Call this when the game switches to online mode.
    // Wires v2Lobby and exposes room infrastructure to the game.
    setup: function(config) {
        // Reset any stale state from a prior setup() (e.g. host left, then
        // re-opened the lobby in the same session) so the previous listener
        // and seat data don't leak forward. Skip when there is no state to
        // clean up — avoids touching the DOM during early module-load init
        // before the chat panel has been injected.
        if (this._roomId || this._roomListener) {
            this.cleanup();
        }

        this._gameId   = config.gameId   || null;
        this._roomPath = config.roomPath || null;

        const self = this;

        const fbReady = function() {
            return !!(window.db && window.dbRef && window.dbUpdate && window.dbGet);
        };

        const seatCount = function() {
            if (typeof config.getSeatCount === 'function') {
                const n = parseInt(config.getSeatCount(), 10);
                if (n >= 1) return n;
            }
            return parseInt(config.numSeats, 10) || 2;
        };

        const buildSeats = function(count) {
            if (typeof config.buildSeats === 'function') {
                const built = config.buildSeats(count);
                if (Array.isArray(built) && built.length >= 1) return built;
            }
            const seats = [{ type: 'human', name: SystemUI.getPlayerName() }];
            for (let i = 1; i < count; i++) {
                seats.push({ type: 'ai', name: 'AI ' + (i + 1) });
            }
            return seats;
        };

        const extraFields = function() {
            if (typeof config.extraRoomFields === 'function') {
                const extra = config.extraRoomFields();
                return extra && typeof extra === 'object' ? extra : {};
            }
            return {};
        };

        // Forward host-side lobby settings the game cares about (e.g. player
        // count or AI difficulty changes from the V2 lobby controls).
        const lobbyHooks = {
            settingsConfig:     config.settingsConfig,
            customHostHTML:     config.customHostHTML,
            onSettingsRendered: config.onSettingsRendered,
            onSettingChange:    config.onSettingChange
        };

        SystemUI.v2Lobby.setup(Object.assign({}, lobbyHooks, {
            onHost: function() {
                if (!fbReady()) {
                    SystemUI.v2Lobby.showError('CONNECTING — TRY AGAIN');
                    return;
                }
                // Never orphan a previously hosted room — if one is still live
                // (e.g. a code path re-opened the setup phase), remove it first.
                if (self._roomId) self.cleanup();
                const id = Math.random().toString(36).substr(2, 4).toUpperCase();
                const count = seatCount();
                const seats = buildSeats(count);
                self._roomId  = id;
                self._myId    = 1;
                self._isHost  = true;
                self._seats   = seats;

                const payload = Object.assign({}, extraFields(), {
                    status:    'waiting',
                    createdAt: Date.now(),
                    seats:     seats
                });

                Promise.resolve(window.dbUpdate(window.dbRef(window.db, self._roomPath + '/' + id), payload))
                    .catch(function(e) {
                        console.warn('Casino OS: host write failed', e);
                        SystemUI.v2Lobby.showError('NETWORK ERROR');
                        self._roomId = null;
                        self._isHost = false;
                    });

                SystemUI.v2Lobby.showRoomPhase(id, true);
                if (config.onHost) config.onHost(id);
            },

            onJoin: function(code) {
                if (!fbReady()) {
                    SystemUI.v2Lobby.showError('CONNECTING — TRY AGAIN');
                    return;
                }
                const myName = SystemUI.getPlayerName();
                window.dbGet(window.dbRef(window.db, self._roomPath + '/' + code)).then(function(snap) {
                    const data = snap.val();
                    if (!data) { SystemUI.v2Lobby.showError('ROOM NOT FOUND'); return; }
                    if (data.status !== 'waiting') { SystemUI.v2Lobby.showError('GAME ALREADY STARTED'); return; }

                    const seats = [...(data.seats || [])];
                    // Find the first replaceable seat: open or AI.
                    let claimIdx = -1;
                    for (let i = 1; i < seats.length; i++) {
                        const s = seats[i];
                        if (!s) continue;
                        if (s.type === 'open' || s.type === 'ai') { claimIdx = i; break; }
                    }
                    if (claimIdx === -1) {
                        SystemUI.v2Lobby.showError('ROOM FULL');
                        return;
                    }
                    // Preserve any extra fields the host put on the seat
                    // (e.g. assigned color, slot id) — only the type/name flip.
                    seats[claimIdx] = Object.assign({}, seats[claimIdx], { type: 'human', name: myName });

                    return window.dbUpdate(window.dbRef(window.db, self._roomPath + '/' + code), { seats: seats })
                        .then(function() {
                            // Verify our claim — concurrent joiners may have overwritten us.
                            return window.dbGet(window.dbRef(window.db, self._roomPath + '/' + code));
                        })
                        .then(function(verifySnap) {
                            const verified = verifySnap.val();
                            const claimed = verified && verified.seats && verified.seats[claimIdx];
                            if (!claimed || claimed.name !== myName) {
                                SystemUI.v2Lobby.showError('SEAT TAKEN');
                                return;
                            }
                            self._roomId = code;
                            self._myId   = claimIdx + 1; // 1-based seat ID
                            self._isHost = false;
                            self._seats  = verified.seats;
                            SystemUI.v2Lobby.showRoomPhase(code, false);
                            if (config.onJoin) config.onJoin(code);
                        });
                }).catch(function(e) {
                    console.warn('Casino OS: join failed', e);
                    SystemUI.v2Lobby.showError('NETWORK ERROR');
                });
            },

            onLeave: function() {
                self.cleanup();
                if (config.onLeave) config.onLeave();
            },

            onStart: function() {
                // Host marks room as started — triggers onValue for all players
                if (self._isHost && self._roomId && fbReady()) {
                    Promise.resolve(window.dbUpdate(window.dbRef(window.db, self._roomPath + '/' + self._roomId), { status: 'playing' }))
                        .catch(function(e) { console.warn('Casino OS: start failed', e); });
                }
                if (config.onStart) config.onStart();
            },

            onClose: function() {
                // Closing the lobby with the X while a room is live abandons it.
                // Tear it down (host: delete the node, joiner: free the seat) —
                // without this every X-close left a ghost "waiting" room in
                // Firebase, and re-hosting piled them up (worst in Hold'em).
                if (self._roomId || self._roomListener) {
                    self.cleanup();
                }
                if (config.onClose) config.onClose();
            }
        }));

        // Auto-show by default (matches v1 behavior). Games that wire setup
        // at module load can opt out and call SystemUI.v2Lobby.show() later.
        if (config.autoShow !== false) {
            SystemUI.v2Lobby.show();
        }
    },

    // Resize seats while waiting (host only). Used by N-player games whose
    // lobby exposes a player-count picker.
    resizeSeats: function(count) {
        if (!this._isHost || !this._roomId || !this._roomPath) return;
        if (!window.db || !window.dbUpdate) return;
        count = parseInt(count, 10);
        if (!(count >= 1)) return;

        const newSeats = [];
        for (let i = 0; i < count; i++) {
            if (this._seats[i] && this._seats[i].type === 'human') newSeats.push(this._seats[i]);
            else if (i === 0) newSeats.push({ type: 'human', name: SystemUI.getPlayerName() });
            else newSeats.push({ type: 'ai', name: 'AI ' + (i + 1) });
        }
        this._seats = newSeats;
        window.dbUpdate(window.dbRef(window.db, this._roomPath + '/' + this._roomId), { seats: newSeats });
    },

    // A joiner leaving must free their seat, or the host stares at a ghost
    // "human" seat whose turn never comes. Best-effort write.
    _releaseSeat: function() {
        if (this._isHost || !this._roomId || !this._roomPath) return;
        if (!window.db || !window.dbUpdate) return;
        const idx = this._myId - 1;
        if (idx < 1 || !this._seats[idx] || this._seats[idx].type !== 'human') return;
        const seats = this._seats.slice();
        seats[idx] = Object.assign({}, seats[idx], { type: 'open', name: 'Open' });
        try {
            window.dbUpdate(window.dbRef(window.db, this._roomPath + '/' + this._roomId), { seats: seats });
        } catch (e) {}
    },

    // ── CLEANUP ───────────────────────────────────
    // Tears down the Firebase listener and removes waiting room.
    cleanup: function() {
        if (this._roomListener) {
            this._roomListener();
            this._roomListener = null;
        }
        const wasHost = this._isHost;
        if (!wasHost) this._releaseSeat();
        if (wasHost && this._roomId && window.db) {
            // Prefer dbRemove if the page imported it; otherwise fall back to
            // dbSet(null) which has the same effect and is universally
            // available across every game's Firebase wiring. Without this
            // fallback, host-leave rooms pile up in Firebase forever on the
            // many games that don't import remove().
            const ref = window.dbRef(window.db, this._roomPath + '/' + this._roomId);
            if (typeof window.dbRemove === 'function') {
                window.dbRemove(ref);
            } else if (typeof window.dbSet === 'function') {
                window.dbSet(ref, null);
            }
        }
        this._roomId  = null;
        this._myId    = 1;
        this._isHost  = false;
        this._seats   = [];
        // Only the host should clear the chat node — otherwise a joiner
        // leaving early would wipe the host's still-active chat history.
        if (window.SystemUI && typeof window.SystemUI.stopChat === 'function') {
            window.SystemUI.stopChat({ clearRemote: wasHost });
        }
    },

    // ── PUBLIC API ────────────────────────────────
    getMyId:     function() { return this._myId; },
    isHost:      function() { return this._isHost; },
    getRoomId:   function() { return this._roomId; },
    getRoomPath: function() { return this._roomPath; },
    getSeats:    function() { return this._seats; },

    setSeats: function(seats) {
        this._seats = seats || [];
    },

    // Store the onValue unsubscribe fn so cleanup() can detach it
    setListener: function(unsubFn) {
        this._roomListener = unsubFn;
    },

    // Returns true when the given activeTurn value matches this player's seat
    isMyTurn: function(activeTurn) {
        return activeTurn === this._myId;
    },

    // 1-based seat index
    getSeatName: function(idx) {
        const seat = this._seats[idx - 1];
        return (seat && seat.name) ? seat.name : ('Player ' + idx);
    }
};

// Catch the host closing the tab / refreshing / navigating away while a
// room is still live — without this, abandoned host rooms pile up in
// Firebase until the hub iframe-close sweeper happens to run. Mirrors
// the per-game beforeunload that UNO has had for a while.
//
// Wired to BOTH beforeunload and pagehide: games run inside the hub's
// iframe, which is closed by clearing its src — that navigation fires
// pagehide reliably but often skips beforeunload. Best-effort either way.
function systemMatchTeardownOnUnload() {
    const m = window.SystemMatch;
    if (!m || !m._roomId || !m._roomPath) return;
    if (!window.db || !window.dbRef) return;
    try {
        if (m._isHost) {
            const ref = window.dbRef(window.db, m._roomPath + '/' + m._roomId);
            if (typeof window.dbRemove === 'function') {
                window.dbRemove(ref);
            } else if (typeof window.dbSet === 'function') {
                window.dbSet(ref, null);
            }
            m._roomId = null; // both events can fire — only tear down once
        } else {
            // Joiner tab close: free the seat so the room stays usable.
            m._releaseSeat();
            m._roomId = null;
        }
    } catch (e) {
        // unload handlers are best-effort — never block the unload
    }
}
window.addEventListener('beforeunload', systemMatchTeardownOnUnload);
window.addEventListener('pagehide', systemMatchTeardownOnUnload);