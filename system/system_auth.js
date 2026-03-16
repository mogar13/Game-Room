/**
 * CASINO OS — SYSTEM AUTH MODULE
 * Purely additive — wraps around the existing SystemProfile.
 * Does NOT require any changes to system_profile.js.
 * Load this AFTER system_profile.js in index.html.
 */

window.SystemAuth = {

    USERS_KEY:   "casino_users",
    SESSION_KEY: "casino_active_user",

    _users:      {},
    _activeUser: null,

    _defaultProfile: function(username) {
        return {
            name:         username,
            bankroll:     5000,
            gamesPlayed:  0,
            wins:         0,
            losses:       0,
            totalWagered: 0,
            xp:           0,
            level:        1,
            isDev:        false
        };
    },

    _defaultStats: function() {
        return { gamesPlayed: 0, wins: 0, losses: 0, ties: 0, games: {} };
    },

    _defaultAchievements: function() {
        return { unlocked: [] };
    },

    _defaultRewards: function() {
        return { lastClaim: "", streak: 0 };
    },

    // ── INIT ──────────────────────────────────────
    init: function() {
        try {
            const stored = localStorage.getItem(this.USERS_KEY);
            this._users = stored ? JSON.parse(stored) : {};
        } catch(e) {
            console.error("Casino OS: Failed to parse users store.", e);
            this._users = {};
        }

        const savedUser = localStorage.getItem(this.SESSION_KEY);
        if (savedUser && this._users[savedUser]) {
            this._activeUser = savedUser;
            this._loadIntoProfile(savedUser);
        }
    },

    // ── REGISTER ──────────────────────────────────
    register: function(username, password, securityQuestion, securityAnswer) {
        username       = (username       || "").trim().toLowerCase();
        password       = (password       || "").trim();
        securityAnswer = (securityAnswer || "").trim().toLowerCase();

        if (!username || username.length < 2)
            return { ok: false, error: "Username must be at least 2 characters." };
        if (!password || password.length < 4)
            return { ok: false, error: "Password must be at least 4 characters." };
        if (!securityQuestion)
            return { ok: false, error: "Please select a security question." };
        if (!securityAnswer)
            return { ok: false, error: "Please provide an answer to your security question." };
        if (this._users[username])
            return { ok: false, error: "Username already taken." };

        // Initialize a brand new, completely isolated user
        this._users[username] = {
            password:         password,
            securityQuestion: securityQuestion,
            securityAnswer:   securityAnswer,
            profile:          this._defaultProfile(username),
            stats:            this._defaultStats(),
            achievements:     this._defaultAchievements(),
            rewards:          this._defaultRewards()
        };
        this._saveUsers();
        return this.login(username, password);
    },

    // ── LOGIN ─────────────────────────────────────
    login: function(username, password) {
        username = (username || "").trim().toLowerCase();
        password = (password || "").trim();

        const user = this._users[username];
        if (!user)               return { ok: false, error: "User not found." };
        if (user.password !== password) return { ok: false, error: "Incorrect password." };

        // isDev: strictly forerunner + exact password only
        user.profile.isDev = (username === "forerunner" && password === "luna&abi");

        this._activeUser = username;
        localStorage.setItem(this.SESSION_KEY, username);
        this._loadIntoProfile(username);

        console.log(`Casino OS: ${username} logged in.${user.profile.isDev ? " [DEV]" : ""}`);
        return { ok: true };
    },

    // ── LOGOUT ────────────────────────────────────
    logout: function() {
        if (!this._activeUser) return;
        this._saveCurrentUserData();

        const name = this._activeUser;
        this._activeUser = null;
        localStorage.removeItem(this.SESSION_KEY);

        // Hard reset — Wipe EVERYTHING from the global memory so the next guest starts fresh
        if (window.SystemProfile) {
            window.SystemProfile.data = this._defaultProfile("Player");
            window.SystemProfile.saveProfile();
        }
        if (window.SystemStats) {
            window.SystemStats.data = this._defaultStats();
            if (typeof window.SystemStats.saveData === 'function') window.SystemStats.saveData();
        }
        if (window.SystemAchievements) {
            window.SystemAchievements.data = this._defaultAchievements();
            if (typeof window.SystemAchievements.saveData === 'function') window.SystemAchievements.saveData();
        }
        if (window.SystemRewards) {
            window.SystemRewards.data = this._defaultRewards();
            if (typeof window.SystemRewards.saveData === 'function') window.SystemRewards.saveData();
        }

        console.log(`Casino OS: ${name} logged out. All data wiped from session.`);
    },

    // ── SESSION HELPERS ───────────────────────────
    isLoggedIn: function() {
        return this._activeUser !== null && !!this._users[this._activeUser];
    },

    getActiveUsername: function() {
        return this._activeUser;
    },

    getSecurityQuestion: function(username) {
        username = (username || "").trim().toLowerCase();
        const user = this._users[username];
        if (!user) return null;
        return user.securityQuestion || null;
    },

    verifySecurityAnswer: function(username, answer) {
        username = (username || "").trim().toLowerCase();
        answer   = (answer   || "").trim().toLowerCase();
        const user = this._users[username];
        if (!user) return { ok: false, error: "User not found." };
        if (!user.securityAnswer) return { ok: false, error: "No security question set for this account." };
        if (user.securityAnswer !== answer) return { ok: false, error: "Incorrect answer." };
        return { ok: true, password: user.password };
    },

    saveCurrentUserData: function() {
        this._saveCurrentUserData();
    },

    // ── INTERNAL ──────────────────────────────────
    _saveCurrentUserData: function() {
        if (!this._activeUser) return;
        if (!this._users[this._activeUser]) return;
        
        // Backup all modules to this specific user's dictionary
        if (window.SystemProfile) {
            this._users[this._activeUser].profile = { ...window.SystemProfile.data };
            if (this._activeUser !== "forerunner") this._users[this._activeUser].profile.isDev = false;
        }
        if (window.SystemStats) {
            this._users[this._activeUser].stats = { ...window.SystemStats.data };
        }
        if (window.SystemAchievements) {
            this._users[this._activeUser].achievements = { ...window.SystemAchievements.data };
        }
        if (window.SystemRewards) {
            this._users[this._activeUser].rewards = { ...window.SystemRewards.data };
        }

        this._saveUsers();
    },

    _loadIntoProfile: function(username) {
        const user = this._users[username];
        if (!user) return;
        
        // Load the specific user's data into the active session, with fallback defaults for older accounts
        if (window.SystemProfile) {
            window.SystemProfile.data = { ...window.SystemProfile.data, ...(user.profile || this._defaultProfile(username)) };
            if (username !== "forerunner") window.SystemProfile.data.isDev = false;
            window.SystemProfile.saveProfile(); 
        }

        if (window.SystemStats) {
            window.SystemStats.data = { ...(user.stats || this._defaultStats()) };
            if (typeof window.SystemStats.saveData === 'function') window.SystemStats.saveData();
        }

        if (window.SystemAchievements) {
            window.SystemAchievements.data = { ...(user.achievements || this._defaultAchievements()) };
            if (typeof window.SystemAchievements.saveData === 'function') window.SystemAchievements.saveData();
        }

        if (window.SystemRewards) {
            window.SystemRewards.data = { ...(user.rewards || this._defaultRewards()) };
            if (typeof window.SystemRewards.saveData === 'function') window.SystemRewards.saveData();
        }
    },

    _saveUsers: function() {
        try {
            localStorage.setItem(this.USERS_KEY, JSON.stringify(this._users));
        } catch(e) {
            console.error("Casino OS: Failed to save users store.", e);
        }
    },

    // ── DEV DASHBOARD: ADMIN METHODS ────────────────
    admin: {
        _getTarget: function(targetUser) {
            return (targetUser || "").trim().toLowerCase() || window.SystemAuth._activeUser;
        },

        modifyMoney: function(targetUser, amount) {
            const target = this._getTarget(targetUser);
            const user = window.SystemAuth._users[target];
            if (!user) return { ok: false, error: "User not found." };
            
            const amt = parseInt(amount) || 0;
            user.profile.bankroll = Math.max(0, user.profile.bankroll + amt);
            
            if (target === window.SystemAuth._activeUser && window.SystemProfile) {
                window.SystemProfile.data.bankroll = user.profile.bankroll;
                window.SystemProfile.saveProfile();
                if (typeof window.SystemProfile._notifyMoneyChange === 'function') window.SystemProfile._notifyMoneyChange();
            }
            window.SystemAuth._saveUsers();
            return { ok: true, message: `Modified money for ${target}. New balance: $${user.profile.bankroll}` };
        },

        modifyXP: function(targetUser, amount) {
            const target = this._getTarget(targetUser);
            const user = window.SystemAuth._users[target];
            if (!user) return { ok: false, error: "User not found." };
            
            const amt = parseInt(amount) || 0;
            user.profile.xp = Math.max(0, user.profile.xp + amt);
            
            // Recalculate level
            const thresholds = [
                { level: 1, xp: 0 }, { level: 2, xp: 500 }, { level: 3, xp: 2000 }, 
                { level: 4, xp: 5000 }, { level: 5, xp: 10000 }, { level: 6, xp: 25000 }
            ];
            let newLevel = 1;
            for (let i = thresholds.length - 1; i >= 0; i--) {
                if (user.profile.xp >= thresholds[i].xp) {
                    newLevel = thresholds[i].level;
                    break;
                }
            }
            user.profile.level = newLevel;
            
            if (target === window.SystemAuth._activeUser && window.SystemProfile) {
                window.SystemProfile.data.xp = user.profile.xp;
                window.SystemProfile.data.level = user.profile.level;
                window.SystemProfile.saveProfile();
            }
            window.SystemAuth._saveUsers();
            return { ok: true, message: `Modified XP for ${target}. New Level: ${user.profile.level}` };
        },

        deleteAccount: function(targetUser) {
            const target = this._getTarget(targetUser);
            if (target === "forerunner") return { ok: false, error: "CRITICAL: Cannot delete the forerunner account." };
            if (!window.SystemAuth._users[target]) return { ok: false, error: "User not found." };
            
            delete window.SystemAuth._users[target];
            window.SystemAuth._saveUsers();
            
            if (target === window.SystemAuth._activeUser) {
                window.SystemAuth.logout();
            }
            return { ok: true, message: `Account '${target}' deleted successfully.` };
        },

        resetProgress: function(targetUser) {
            const target = this._getTarget(targetUser);
            const user = window.SystemAuth._users[target];
            if (!user) return { ok: false, error: "User not found." };
            
            // Preserve bankroll and auth, reset progression and stats
            user.profile.gamesPlayed = 0;
            user.profile.wins = 0;
            user.profile.losses = 0;
            user.profile.totalWagered = 0;
            user.profile.xp = 0;
            user.profile.level = 1;
            
            user.stats = window.SystemAuth._defaultStats();
            user.achievements = window.SystemAuth._defaultAchievements();
            user.rewards = window.SystemAuth._defaultRewards();
            
            if (target === window.SystemAuth._activeUser) {
                window.SystemAuth._loadIntoProfile(target);
            }
            window.SystemAuth._saveUsers();
            return { ok: true, message: `Account progress reset for ${target}.` };
        },

        toggleAchievement: function(targetUser, achId, unlock) {
            const target = this._getTarget(targetUser);
            const user = window.SystemAuth._users[target];
            if (!user) return { ok: false, error: "User not found." };
            if (!achId) return { ok: false, error: "Achievement ID required." };
            
            user.achievements = user.achievements || window.SystemAuth._defaultAchievements();
            user.achievements.unlocked = user.achievements.unlocked || [];
            
            if (unlock) {
                if (!user.achievements.unlocked.includes(achId)) {
                    user.achievements.unlocked.push(achId);
                }
            } else {
                user.achievements.unlocked = user.achievements.unlocked.filter(id => id !== achId);
            }
            
            if (target === window.SystemAuth._activeUser && window.SystemAchievements) {
                window.SystemAchievements.data.unlocked = [...user.achievements.unlocked];
                if (typeof window.SystemAchievements.saveData === 'function') window.SystemAchievements.saveData();
            }
            window.SystemAuth._saveUsers();
            return { ok: true, message: `Achievement '${achId}' ${unlock ? 'unlocked' : 'locked'} for ${target}.` };
        },

        resetDailyBonus: function(targetUser) {
            const target = this._getTarget(targetUser);
            const user = window.SystemAuth._users[target];
            if (!user) return { ok: false, error: "User not found." };
            
            user.rewards = user.rewards || window.SystemAuth._defaultRewards();
            user.rewards.lastClaim = "";
            
            if (target === window.SystemAuth._activeUser && window.SystemRewards) {
                window.SystemRewards.data.lastClaim = "";
                if (typeof window.SystemRewards.saveData === 'function') window.SystemRewards.saveData();
            }
            window.SystemAuth._saveUsers();
            return { ok: true, message: `Daily bonus timer reset for ${target}.` };
        }
    }
};

// Init after SystemProfile has already run
window.SystemAuth.init();