/**
 * CASINO OS - SYSTEM PROFILE MODULE
 * Handles all persistent user data, bankroll mathematics, and player progression (XP/Levels).
 * Acts as the single source of truth for player data.
 */

window.SystemProfile = {
    key: "casino_player_profile",
    
    // Default structure for a brand new player
    data: {
        name: "Player",
        bankroll: 5000,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        totalWagered: 0,
        xp: 0,
        level: 1,
        isDev: false,
        loadout: { cardback: null, dice: null, deck: null, avatar: null, title: null, color: null }
    },

    init: function() {
        this.loadProfile();
        this.runMigration();
    },

    loadProfile: function() {
        const stored = localStorage.getItem(this.key);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                // Merge stored data with default structure to prevent missing keys
                this.data = { ...this.data, ...parsed };
            } catch (e) {
                console.error("Casino OS: Failed to parse player profile.", e);
            }
        }
    },

    saveProfile: function() {
        // Save the master profile object
        localStorage.setItem(this.key, JSON.stringify(this.data));
        
        // BACKWARD COMPATIBILITY: 
        // Keep the legacy keys synced so old games don't break during the refactor.
        localStorage.setItem("blackjack_money", this.data.bankroll);
        localStorage.setItem("casino_player_name", this.data.name);
    },

    runMigration: function() {
        let migrated = false;
        
        // 1. Migrate legacy name
        const legacyName = localStorage.getItem("casino_player_name");
        if (legacyName && this.data.name === "Player") {
            this.data.name = legacyName;
            migrated = true;
        }
        
        // 2. Migrate legacy money
        const legacyMoney = localStorage.getItem("blackjack_money");
        // Only migrate if we don't already have a saved profile
        if (legacyMoney !== null && !localStorage.getItem(this.key)) {
            this.data.bankroll = parseInt(legacyMoney) || 5000;
            migrated = true;
        }

        if (migrated) {
            this.saveProfile();
            console.log("Casino OS: Legacy player data migrated successfully.");
        }
    },

    // --- CORE API FOR SYSTEM UI ---

    getProfile: function() {
        return this.data;
    },

    getPlayerName: function() {
        return this.data.name;
    },

    setPlayerName: function(newName) {
        this.data.name = newName.trim() || "Player";
        this.saveProfile();
    },

    // --- LOADOUT & EQUIP SYSTEM ---

    getLoadout: function() {
        // Ensure loadout object exists for legacy players migrating over
        if (!this.data.loadout) {
            this.data.loadout = { cardback: null, dice: null, deck: null, avatar: null, title: null, color: null };
            this.saveProfile();
        }
        return this.data.loadout;
    },

    setLoadout: function(type, itemId) {
        if (!this.data.loadout) {
            this.data.loadout = { cardback: null, dice: null, deck: null, avatar: null, title: null, color: null };
        }
        this.data.loadout[type] = itemId;
        this.saveProfile();
    },

    // --- BANKROLL MANAGEMENT ---

    getMoney: function() {
        return this.data.bankroll;
    },

    setMoney: function(amount) {
        // Strict protection: Bankroll can NEVER go below zero
        this.data.bankroll = Math.max(0, parseInt(amount) || 0);
        this.saveProfile();
        this._notifyMoneyChange();
    },

    addMoney: function(amount) {
        if (amount > 0) {
            this.setMoney(this.data.bankroll + amount);
        }
    },

    removeMoney: function(amount) {
        if (amount > 0) {
            this.setMoney(this.data.bankroll - amount);
        }
    },

    // --- PROGRESSION & LEVEL SYSTEM ---

    addXP: function(amount) {
        if (amount <= 0) return;
        this.data.xp += amount;
        this.checkLevelUp();
        this.saveProfile();
    },

    checkLevelUp: function() {
        const thresholds = [
            { level: 1, xp: 0 },
            { level: 2, xp: 500 },
            { level: 3, xp: 2000 },
            { level: 4, xp: 5000 },
            { level: 5, xp: 10000 },
            { level: 6, xp: 25000 }
        ];

        let newLevel = 1;
        for (let i = thresholds.length - 1; i >= 0; i--) {
            if (this.data.xp >= thresholds[i].xp) {
                newLevel = thresholds[i].level;
                break;
            }
        }

        if (newLevel > this.data.level) {
            this.data.level = newLevel;
            // Emit level up event if the new Event System is ready
            if (window.SystemUI && typeof window.SystemUI.emit === 'function') {
                window.SystemUI.emit("player_level_up", newLevel);
            }
            console.log(`Casino OS: Player leveled up to Level ${newLevel}!`);
        }
    },

    getLevelTitle: function() {
        const titles = {
            1: "Newcomer",
            2: "Bronze Player",
            3: "Silver Player",
            4: "Gold Player",
            5: "High Roller",
            6: "VIP Gambler"
        };
        return titles[this.data.level] || "Casino Legend";
    },

    // --- DEV & TESTING API ---

    authenticateDev: function(password) {
        if (this.data.name === "forerunner" && password === "luna&abi") {
            this.data.isDev = true;
            this.saveProfile();
            console.log("Casino OS: Developer mode activated for forerunner.");
            return true;
        }
        return false;
    },

    isDev: function() {
        return this.data.isDev === true;
    },

    // --- INTERNAL SYNC LOGIC ---

    _notifyMoneyChange: function() {
        // 1. New Event Architecture (If SystemUI supports it)
        if (window.SystemUI && typeof window.SystemUI.emit === 'function') {
            window.SystemUI.emit("money_changed", this.data.bankroll);
        }
        
        // 2. Fallback for the current Legacy UI (Updates the DOM directly if events aren't wired yet)
        const moneyEl = document.getElementById("sys-money") || document.getElementById("display-player-money");
        if (moneyEl) moneyEl.innerText = this.data.bankroll;
        
        // 3. Handle bankrupt refill button visibility
        const refillBtn = document.getElementById("sys-bankrupt-refill");
        if (refillBtn) {
            if (this.data.bankroll <= 0) refillBtn.classList.remove("sys-hidden");
            else refillBtn.classList.add("sys-hidden");
        }
    }
};

// Initialize the profile module immediately upon loading
window.SystemProfile.init();