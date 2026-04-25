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
                if (n >= 2) return n;
            }
            return parseInt(config.numSeats, 10) || 2;
        };

        const buildSeats = function(count) {
            if (typeof config.buildSeats === 'function') {
                const built = config.buildSeats(count);
                if (Array.isArray(built) && built.length >= 2) return built;
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
                    seats[claimIdx] = { type: 'human', name: myName };

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
        if (!(count >= 2)) return;

        const newSeats = [];
        for (let i = 0; i < count; i++) {
            if (this._seats[i] && this._seats[i].type === 'human') newSeats.push(this._seats[i]);
            else if (i === 0) newSeats.push({ type: 'human', name: SystemUI.getPlayerName() });
            else newSeats.push({ type: 'ai', name: 'AI ' + (i + 1) });
        }
        this._seats = newSeats;
        window.dbUpdate(window.dbRef(window.db, this._roomPath + '/' + this._roomId), { seats: newSeats });
    },

    // ── CLEANUP ───────────────────────────────────
    // Tears down the Firebase listener and removes waiting room.
    cleanup: function() {
        if (this._roomListener) {
            this._roomListener();
            this._roomListener = null;
        }
        const wasHost = this._isHost;
        if (wasHost && this._roomId && window.db && window.dbRemove) {
            window.dbRemove(window.dbRef(window.db, this._roomPath + '/' + this._roomId));
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