/**
 * CASINO OS - SYSTEM STATS MODULE
 * Tracks global and per-game statistics (wins, losses, games played).
 * Interfaces with SystemProfile to award XP for playing and winning.
 */

window.SystemStats = {
    key: "casino_stats",
    
    data: {
        global: {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            ties: 0
        },
        games: {} // Will hold dynamically registered games, e.g., { blackjack: { gamesPlayed: 5, wins: 3 ... } }
    },

    init: function() {
        this.loadData();
    },

    loadData: function() {
        const stored = localStorage.getItem(this.key);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                // Accept both the canonical { global:{...}, games:{} } shape
                // and the legacy flat { gamesPlayed, ... } shape that older
                // auth builds wrote — never leave data.global undefined.
                const g = (parsed && parsed.global) || parsed || {};
                this.data.global = {
                    gamesPlayed: g.gamesPlayed || 0,
                    wins:        g.wins        || 0,
                    losses:      g.losses      || 0,
                    ties:        g.ties        || 0
                };
                this.data.games = (parsed && parsed.games) || {};
            } catch (e) {
                console.error("Casino OS: Failed to parse stats.", e);
            }
        }
    },

    // Self-heal: other modules historically replaced this.data with foreign
    // shapes — never let a record call throw on a missing node.
    _ensureShape: function() {
        if (!this.data || typeof this.data !== 'object') this.data = { global: {}, games: {} };
        if (!this.data.global || typeof this.data.global !== 'object') this.data.global = {};
        const g = this.data.global;
        if (typeof g.gamesPlayed !== 'number') g.gamesPlayed = 0;
        if (typeof g.wins   !== 'number') g.wins   = 0;
        if (typeof g.losses !== 'number') g.losses = 0;
        if (typeof g.ties   !== 'number') g.ties   = 0;
        if (!this.data.games || typeof this.data.games !== 'object') this.data.games = {};
    },

    saveData: function() {
        localStorage.setItem(this.key, JSON.stringify(this.data));
    },

    _ensureGameExists: function(gameId) {
        if (!gameId) return;
        if (!this.data.games[gameId]) {
            this.data.games[gameId] = {
                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                ties: 0
            };
        }
    },

    // --- CORE STATS API ---

    recordGameStart: function(gameId) {
        this._ensureShape();
        this.data.global.gamesPlayed++;
        
        if (gameId) {
            this._ensureGameExists(gameId);
            this.data.games[gameId].gamesPlayed++;
        }
        
        // Award a small amount of XP just for playing
        if (window.SystemProfile) window.SystemProfile.addXP(10);
        
        this.saveData();
        
        if (window.SystemUI && typeof window.SystemUI.emit === 'function') {
            window.SystemUI.emit("stats_updated", this.data);
        }
    },

    recordWin: function(gameId) {
        this._ensureShape();
        this.data.global.wins++;
        
        if (gameId) {
            this._ensureGameExists(gameId);
            this.data.games[gameId].wins++;
        }

        // Award larger XP for a win
        if (window.SystemProfile) window.SystemProfile.addXP(50);
        
        this.saveData();

        if (window.SystemUI && typeof window.SystemUI.emit === 'function') {
            window.SystemUI.emit("stats_updated", this.data);
            window.SystemUI.emit("player_win", gameId);
        }
    },

    recordLoss: function(gameId) {
        this._ensureShape();
        this.data.global.losses++;
        
        if (gameId) {
            this._ensureGameExists(gameId);
            this.data.games[gameId].losses++;
        }
        
        this.saveData();
        
        if (window.SystemUI && typeof window.SystemUI.emit === 'function') {
            window.SystemUI.emit("stats_updated", this.data);
        }
    },

    recordTie: function(gameId) {
        this._ensureShape();
        this.data.global.ties++;
        
        if (gameId) {
            this._ensureGameExists(gameId);
            this.data.games[gameId].ties++;
        }
        
        // Minor XP for a tie
        if (window.SystemProfile) window.SystemProfile.addXP(20);
        
        this.saveData();

        if (window.SystemUI && typeof window.SystemUI.emit === 'function') {
            window.SystemUI.emit("stats_updated", this.data);
        }
    },

    getStats: function(gameId = null) {
        this._ensureShape();
        if (gameId) {
            return this.data.games[gameId] || null;
        }
        return this.data.global;
    }
};

// Initialize the stats module immediately
window.SystemStats.init();

// ==========================================
// DROP-IN COMPATIBILITY OVERRIDES
// Bind to SystemUI so legacy or new games can call SystemUI.recordWin("blackjack")
// ==========================================
if (window.SystemUI) {
    window.SystemUI.recordGameStart = function(gameId) { window.SystemStats.recordGameStart(gameId); };
    window.SystemUI.recordWin = function(gameId) { window.SystemStats.recordWin(gameId); };
    window.SystemUI.recordLoss = function(gameId) { window.SystemStats.recordLoss(gameId); };
    window.SystemUI.recordTie = function(gameId) { window.SystemStats.recordTie(gameId); };
    window.SystemUI.getStats = function(gameId) { return window.SystemStats.getStats(gameId); };
}