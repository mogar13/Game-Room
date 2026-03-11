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
                // Merge safely
                this.data.global = { ...this.data.global, ...(parsed.global || {}) };
                this.data.games = parsed.games || {};
            } catch (e) {
                console.error("Casino OS: Failed to parse stats.", e);
            }
        }
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