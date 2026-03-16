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
        this._gameId   = config.gameId   || null;
        this._roomPath = config.roomPath || null;

        const self = this;

        SystemUI.v2Lobby.setup({
            onHost: function() {
                const id = Math.random().toString(36).substr(2, 4).toUpperCase();
                self._roomId  = id;
                self._myId    = 1;
                self._isHost  = true;

                window.dbUpdate(window.dbRef(window.db, self._roomPath + '/' + id), {
                    status:    'waiting',
                    createdAt: Date.now(),
                    seats: [
                        { type: 'human', name: SystemUI.getPlayerName() },
                        { type: 'open',  name: '' }
                    ]
                });

                SystemUI.v2Lobby.showRoomPhase(id, true);
                if (config.onHost) config.onHost(id);
            },

            onJoin: function(code) {
                window.dbGet(window.dbRef(window.db, self._roomPath + '/' + code)).then(function(snap) {
                    const data = snap.val();
                    if (!data) { SystemUI.v2Lobby.showError('ROOM NOT FOUND'); return; }
                    if (data.status !== 'waiting') { SystemUI.v2Lobby.showError('GAME ALREADY STARTED'); return; }

                    self._roomId = code;
                    self._myId   = 2;
                    self._isHost = false;
                    self._seats  = [...(data.seats || [])];
                    self._seats[1] = { type: 'human', name: SystemUI.getPlayerName() };

                    window.dbUpdate(window.dbRef(window.db, self._roomPath + '/' + code), { seats: self._seats });
                    SystemUI.v2Lobby.showRoomPhase(code, false);
                    if (config.onJoin) config.onJoin(code);
                });
            },

            onLeave: function() {
                self.cleanup();
                if (config.onLeave) config.onLeave();
            },

            onStart: function() {
                // Host marks room as started — triggers onValue for both players
                if (self._isHost && self._roomId) {
                    window.dbUpdate(window.dbRef(window.db, self._roomPath + '/' + self._roomId), { status: 'playing' });
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
        if (this._isHost && this._roomId && window.db) {
            window.dbRemove(window.dbRef(window.db, this._roomPath + '/' + this._roomId));
        }
        this._roomId  = null;
        this._myId    = 1;
        this._isHost  = false;
        this._seats   = [];
        SystemUI.stopChat();
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