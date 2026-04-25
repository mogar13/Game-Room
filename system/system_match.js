/**
 * CASINO OS — SYSTEM MATCH MODULE (v1.0)
 *
 * A Match Controller that handles room lifecycle, seat management,
 * and Firebase wiring so games don't have to repeat that boilerplate.
 *
 * The game provides callbacks and handles its own state push/apply.
 * SystemMatch handles: v2Lobby wiring, room create/join, seat tracking, cleanup.
 *
 * Usage:
 * SystemMatch.setup({ gameId, roomPath, onHost, onJoin, onLeave, onStart, onClose })
 * SystemMatch.getMyId()              → 1 or 2
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
        // and seat data don't leak forward.
        this.cleanup();

        this._gameId   = config.gameId   || null;
        this._roomPath = config.roomPath || null;

        const self = this;

        const fbReady = function() {
            return !!(window.db && window.dbRef && window.dbUpdate && window.dbGet);
        };

        SystemUI.v2Lobby.setup({
            onHost: function() {
                if (!fbReady()) {
                    SystemUI.v2Lobby.showError('CONNECTING — TRY AGAIN');
                    return;
                }
                const id = Math.random().toString(36).substr(2, 4).toUpperCase();
                self._roomId  = id;
                self._myId    = 1;
                self._isHost  = true;

                Promise.resolve(window.dbUpdate(window.dbRef(window.db, self._roomPath + '/' + id), {
                    status:    'waiting',
                    createdAt: Date.now(),
                    seats: [
                        { type: 'human', name: SystemUI.getPlayerName() },
                        { type: 'open',  name: '' }
                    ]
                })).catch(function(e) {
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
                    if (!seats[1] || seats[1].type !== 'open') {
                        SystemUI.v2Lobby.showError('SEAT TAKEN');
                        return;
                    }
                    seats[1] = { type: 'human', name: myName };

                    return window.dbUpdate(window.dbRef(window.db, self._roomPath + '/' + code), { seats: seats })
                        .then(function() {
                            // Verify our claim after the write — if a concurrent joiner
                            // overwrote us, bail out instead of pretending to be seated.
                            return window.dbGet(window.dbRef(window.db, self._roomPath + '/' + code));
                        })
                        .then(function(verifySnap) {
                            const verified = verifySnap.val();
                            const seat2 = verified && verified.seats && verified.seats[1];
                            if (!seat2 || seat2.name !== myName) {
                                SystemUI.v2Lobby.showError('SEAT TAKEN');
                                return;
                            }
                            self._roomId = code;
                            self._myId   = 2;
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
                // Host marks room as started — triggers onValue for both players
                if (self._isHost && self._roomId && fbReady()) {
                    Promise.resolve(window.dbUpdate(window.dbRef(window.db, self._roomPath + '/' + self._roomId), { status: 'playing' }))
                        .catch(function(e) { console.warn('Casino OS: start failed', e); });
                }
                if (config.onStart) config.onStart();
            },

            onClose: function() {
                if (config.onClose) config.onClose();
            }
        });

        SystemUI.v2Lobby.show();
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