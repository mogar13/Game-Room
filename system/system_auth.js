/**
 * CASINO OS — SYSTEM AUTH MODULE (Firebase Authentication)
 *
 * Accounts are real Firebase Auth users. Passwords are never stored, sent, or
 * readable by us — Firebase holds a one-way hash. Game data lives at
 * users/<uid> and is readable/writable only by that uid (see database.rules.json).
 *
 * Identity model:
 *   - No email  -> auth identity is a deterministic synthetic address,
 *                  <username>@gameshack.invalid, so username login still works.
 *                  No password recovery is possible for these accounts.
 *   - With email -> auth identity IS the real email, which enables Firebase's
 *                  password-reset email. Those users sign in with their email.
 * Real emails are therefore never written into the public usernames/ index.
 *
 * Public projection: leaderboard/<uid> holds only name/avatar/bankroll/xp/level/
 * wins so the leaderboard can be read by anyone without exposing private records.
 *
 * Load this AFTER system_profile.js in index.html.
 */

window.SystemAuth = {

    USERS_KEY:    "casino_users",        // local cache: uid -> record
    SESSION_KEY:  "casino_active_user",  // JSON { uid, username }
    SYNTH_DOMAIN: "gameshack.invalid",

    _users:          {},    // uid -> record (offline cache / working copy)
    _activeUid:      null,
    _activeUsername: null,
    _isAdmin:        false,
    _authReady:      false,

    MIN_PASSWORD: 6,        // Firebase Auth's own minimum

    // ── HELPERS ───────────────────────────────────
    _synthEmail: function(username) {
        return `${username}@${this.SYNTH_DOMAIN}`;
    },

    _looksLikeEmail: function(str) {
        return /.+@.+\..+/.test(str || "");
    },

    _cleanUsername: function(username) {
        return (username || "").trim().toLowerCase();
    },

    _validUsername: function(username) {
        return /^[a-z0-9_]{2,16}$/.test(username);
    },

    _emit: function() {
        window.dispatchEvent(new CustomEvent("casino-auth-changed", {
            detail: { loggedIn: this.isLoggedIn(), username: this._activeUsername }
        }));
    },

    _friendlyError: function(e) {
        const code = (e && e.code) || "";
        switch (code) {
            case "auth/invalid-credential":
            case "auth/wrong-password":
            case "auth/user-not-found":       return "Incorrect username or password.";
            case "auth/email-already-in-use": return "Username already taken.";
            case "auth/weak-password":        return `Password must be at least ${this.MIN_PASSWORD} characters.`;
            case "auth/invalid-email":        return "That email address doesn't look valid.";
            case "auth/too-many-requests":    return "Too many attempts. Please wait a minute and try again.";
            case "auth/network-request-failed": return "Network error. Check your connection.";
            default: return (e && e.message) ? e.message : "Something went wrong.";
        }
    },

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
            isDev:        false,
            avatar:       "👤",
            chatColor:    "#ffffff",
            title:        "Newcomer",
            equippedCardBack: "cardBack_blue1.png",
            equippedDice: "default",
            inventory:    [],
            loadout:      { cardback: null, dice: null, deck: null, avatar: null, title: null, color: null }
        };
    },

    // Shape MUST match SystemStats.data ({ global: {...}, games: {} }).
    // The old flat shape here silently replaced SystemStats.data on login,
    // leaving data.global undefined — profile stats showed "undefined" and
    // recordGameStart() threw, so logged-in users never accumulated stats.
    _defaultStats:        function() { return { global: { gamesPlayed: 0, wins: 0, losses: 0, ties: 0 }, games: {} }; },

    // Normalize a stats record from the cloud/localStorage into the canonical
    // shape. Handles the legacy flat shape and Firebase's empty-object
    // stripping (games:{} vanishes from snapshots).
    _normalizeStats: function(s) {
        s = s || {};
        const g = s.global || s;   // legacy flat records kept counters at the top level
        return {
            global: {
                gamesPlayed: g.gamesPlayed || 0,
                wins:        g.wins        || 0,
                losses:      g.losses      || 0,
                ties:        g.ties        || 0
            },
            games: s.games || {}
        };
    },
    _defaultAchievements: function() { return { unlocked: [] }; },
    _defaultRewards:      function() { return { lastClaim: "", streak: 0 }; },

    // ── INIT ──────────────────────────────────────
    // Restores the cached session synchronously so hub code calling isLoggedIn()
    // during first render sees the right answer, then reconciles against Firebase
    // once onAuthStateChanged reports the real state.
    init: function() {
        try {
            const stored = localStorage.getItem(this.USERS_KEY);
            this._users = stored ? JSON.parse(stored) : {};
        } catch(e) {
            console.error("Casino OS: Failed to parse users store.", e);
            this._users = {};
        }

        try {
            const session = JSON.parse(localStorage.getItem(this.SESSION_KEY) || "null");
            if (session && session.uid && this._users[session.uid]) {
                this._activeUid      = session.uid;
                this._activeUsername = session.username;
                this._loadIntoProfile(session.uid);
            }
        } catch(e) { /* no cached session */ }

        this._watchAuth();
    },

    _watchAuth: function(attempt) {
        attempt = attempt || 0;
        // The Firebase module script runs after this classic script; poll briefly.
        if (!window.fbOnAuthStateChanged || !window.fbAuth) {
            if (attempt > 100) return;
            return setTimeout(() => this._watchAuth(attempt + 1), 50);
        }

        window.fbOnAuthStateChanged(window.fbAuth, async (user) => {
            this._authReady = true;

            if (!user) {
                // Firebase says signed out. Drop any optimistic session.
                if (this._activeUid) {
                    this._activeUid = null;
                    this._activeUsername = null;
                    localStorage.removeItem(this.SESSION_KEY);
                    this._wipeSessionModules();
                    this._emit();
                }
                return;
            }

            this._activeUid = user.uid;
            try {
                await this._pullFromCloud(user.uid);
                await this._refreshAdminFlag(user.uid);
                this._loadIntoProfile(user.uid);
            } catch(e) {
                console.warn("Casino OS: cloud pull failed, using local cache.", e);
            }
            this._emit();
        });
    },

    // ── REGISTER ──────────────────────────────────
    register: async function(username, password, email) {
        const rawUsername = username || "";
        username = this._cleanUsername(rawUsername);
        password = (password || "").trim();
        email    = (email    || "").trim();

        if (!this._validUsername(username))
            return { ok: false, error: "Username must be 2–16 characters: letters, numbers or underscore." };
        if (password.length < this.MIN_PASSWORD)
            return { ok: false, error: `Password must be at least ${this.MIN_PASSWORD} characters.` };
        if (email && !this._looksLikeEmail(email))
            return { ok: false, error: "That email address doesn't look valid." };
        if (!navigator.onLine)
            return { ok: false, error: "You must be online to create an account." };
        if (!window.fbAuth || !window.fbCreateUser)
            return { ok: false, error: "Authentication not loaded." };

        // Username uniqueness — the usernames/ index is the registry.
        try {
            const snap = await window.dbGet(window.dbRef(window.db, `usernames/${username}`));
            if (snap.exists()) return { ok: false, error: "Username already taken." };
        } catch(e) {
            return { ok: false, error: "Network error checking username." };
        }

        const authEmail = email || this._synthEmail(username);

        let cred;
        try {
            cred = await window.fbCreateUser(window.fbAuth, authEmail, password);
        } catch(e) {
            return { ok: false, error: this._friendlyError(e) };
        }

        const uid = cred.user.uid;
        const record = {
            username:     username,
            profile:      this._defaultProfile(rawUsername.trim()),
            stats:        this._defaultStats(),
            achievements: this._defaultAchievements(),
            rewards:      this._defaultRewards(),
            lastUpdated:  Date.now()
        };

        this._users[uid] = record;
        this._activeUid = uid;
        this._activeUsername = username;
        this._saveUsers();
        this._saveSession();

        try {
            await window.dbSet(window.dbRef(window.db, `users/${uid}`), record);
            await window.dbSet(window.dbRef(window.db, `usernames/${username}`), {
                uid: uid, viaEmail: !!email
            });
            await this._pushLeaderboard(uid);
        } catch(e) {
            return { ok: false, error: "Account created but saving failed: " + this._friendlyError(e) };
        }

        this._loadIntoProfile(uid);
        this._emit();
        console.log(`Casino OS: ${username} registered.`);
        return { ok: true };
    },

    // ── LOGIN ─────────────────────────────────────
    // Accepts a username OR (for accounts that set one) an email address.
    login: async function(identifier, password) {
        identifier = (identifier || "").trim();
        password   = (password   || "").trim();

        if (!identifier || !password)
            return { ok: false, error: "Enter your username and password." };
        if (!navigator.onLine)
            return { ok: false, error: "You must be online to sign in." };
        if (!window.fbAuth || !window.fbSignIn)
            return { ok: false, error: "Authentication not loaded." };

        let authEmail;

        if (this._looksLikeEmail(identifier)) {
            authEmail = identifier;
        } else {
            const username = this._cleanUsername(identifier);
            let entry = null;
            try {
                const snap = await window.dbGet(window.dbRef(window.db, `usernames/${username}`));
                if (snap.exists()) entry = snap.val();
            } catch(e) {
                return { ok: false, error: "Network error. Please try again." };
            }
            if (!entry) return { ok: false, error: "User not found." };
            if (entry.viaEmail) {
                return { ok: false, error: "This account uses an email address — sign in with your email." };
            }
            authEmail = this._synthEmail(username);
        }

        let cred;
        try {
            cred = await window.fbSignIn(window.fbAuth, authEmail, password);
        } catch(e) {
            return { ok: false, error: this._friendlyError(e) };
        }

        const uid = cred.user.uid;
        this._activeUid = uid;

        try {
            await this._pullFromCloud(uid);
            await this._refreshAdminFlag(uid);
        } catch(e) {
            console.warn("Casino OS: cloud pull failed on login.", e);
        }

        this._activeUsername = (this._users[uid] && this._users[uid].username) || this._cleanUsername(identifier);
        this._saveSession();
        this._loadIntoProfile(uid);
        this._emit();

        console.log(`Casino OS: ${this._activeUsername} logged in.${this._isAdmin ? " [DEV]" : ""}`);
        return { ok: true };
    },

    // ── PASSWORD RESET ────────────────────────────
    // Only works for accounts registered with a real email. Synthetic-address
    // accounts have nowhere to deliver a reset — that is the tradeoff of
    // signing up without an email.
    sendPasswordReset: async function(email) {
        email = (email || "").trim();
        if (!this._looksLikeEmail(email))
            return { ok: false, error: "Enter the email address on your account." };
        if (email.endsWith("@" + this.SYNTH_DOMAIN))
            return { ok: false, error: "That account has no email, so it can't be reset." };
        if (!window.fbAuth || !window.fbSendPasswordReset)
            return { ok: false, error: "Authentication not loaded." };

        try {
            await window.fbSendPasswordReset(window.fbAuth, email);
        } catch(e) {
            // Don't confirm or deny whether the address exists.
            if (e && e.code === "auth/user-not-found") {
                return { ok: true, message: "If that email has an account, a reset link is on its way." };
            }
            return { ok: false, error: this._friendlyError(e) };
        }
        return { ok: true, message: "If that email has an account, a reset link is on its way." };
    },

    // ── UPDATE PROFILE (EDIT) ─────────────────────
    updateProfile: async function(newUsername, newAvatar, newTitle, newChatColor, newCardBack, newDice) {
        if (!this.isLoggedIn())  return { ok: false, error: "Not logged in." };
        if (!navigator.onLine)   return { ok: false, error: "You must be online to edit your profile." };

        const uid           = this._activeUid;
        const rawUsername   = newUsername || "";
        const cleanUsername = this._cleanUsername(rawUsername);
        const currentName   = this._activeUsername;

        if (!this._validUsername(cleanUsername))
            return { ok: false, error: "Username must be 2–16 characters: letters, numbers or underscore." };

        const isNameChange = (cleanUsername !== currentName);

        // A username change would orphan the synthetic sign-in address, so it is
        // only safe for accounts that sign in with a real email.
        if (isNameChange) {
            let viaEmail = false;
            try {
                const mine = await window.dbGet(window.dbRef(window.db, `usernames/${currentName}`));
                viaEmail = mine.exists() && !!mine.val().viaEmail;
            } catch(e) {
                return { ok: false, error: "Network error. Please try again." };
            }
            if (!viaEmail) {
                return { ok: false, error: "Accounts without an email can't change username — it's part of your sign-in." };
            }
            try {
                const taken = await window.dbGet(window.dbRef(window.db, `usernames/${cleanUsername}`));
                if (taken.exists()) return { ok: false, error: "Username already taken." };
            } catch(e) {
                return { ok: false, error: "Network error checking username availability." };
            }
        }

        const userObj = this._users[uid];
        if (!userObj) return { ok: false, error: "Profile not loaded." };

        userObj.profile.name   = rawUsername.trim();
        userObj.profile.avatar = newAvatar || userObj.profile.avatar || "👤";
        if (newTitle     !== undefined) userObj.profile.title            = newTitle;
        if (newChatColor !== undefined) userObj.profile.chatColor        = newChatColor;
        if (newCardBack  !== undefined) userObj.profile.equippedCardBack = newCardBack;
        if (newDice      !== undefined) userObj.profile.equippedDice     = newDice;
        userObj.lastUpdated = Date.now();

        if (isNameChange) {
            userObj.username     = cleanUsername;
            this._activeUsername = cleanUsername;
            this._saveSession();
            try {
                await window.dbSet(window.dbRef(window.db, `usernames/${cleanUsername}`), { uid: uid, viaEmail: true });
                await window.dbRemove(window.dbRef(window.db, `usernames/${currentName}`));
            } catch(e) {
                return { ok: false, error: "Failed to update username: " + this._friendlyError(e) };
            }
        }

        this._saveUsers();
        await this._pushToCloud(uid);
        this._loadIntoProfile(uid);
        return { ok: true };
    },

    // ── LOGOUT ────────────────────────────────────
    logout: async function() {
        if (!this._activeUid) return;
        await this._saveCurrentUserData();

        const name = this._activeUsername;
        this._activeUid      = null;
        this._activeUsername = null;
        this._isAdmin        = false;
        localStorage.removeItem(this.SESSION_KEY);

        if (window.fbSignOut && window.fbAuth) {
            try { await window.fbSignOut(window.fbAuth); } catch(e) { /* already gone */ }
        }

        this._wipeSessionModules();
        this._emit();
        console.log(`Casino OS: ${name} logged out.`);
    },

    // Hard reset — wipe everything so the next guest starts fresh.
    _wipeSessionModules: function() {
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
    },

    // ── SESSION HELPERS ───────────────────────────
    isLoggedIn:        function() { return this._activeUid !== null && !!this._users[this._activeUid]; },
    getActiveUsername: function() { return this._activeUsername; },
    getActiveUid:      function() { return this._activeUid; },
    isAdmin:           function() { return this._isAdmin; },

    saveCurrentUserData: function() {
        return this._saveCurrentUserData();
    },

    forceSync: async function() {
        if (!this.isLoggedIn())  return { ok: false, error: "No active user." };
        if (!navigator.onLine)   return { ok: false, error: "You are offline." };
        if (!window.dbGet)       return { ok: false, error: "Cloud database not connected." };

        const uid = this._activeUid;
        try {
            this._snapshotModules(uid); // local dict holds the very latest

            const snap = await window.dbGet(window.dbRef(window.db, `users/${uid}`));
            if (!snap.exists()) {
                await this._pushToCloud(uid);
                return { ok: true, message: "First cloud backup created successfully!" };
            }

            const cloudUser = snap.val();
            const localTime = this._users[uid].lastUpdated || 0;
            const cloudTime = cloudUser.lastUpdated || 0;

            if (cloudTime > localTime) {
                this._users[uid] = cloudUser;
                this._saveUsers();
                this._loadIntoProfile(uid);
                return { ok: true, message: "Cloud save downloaded! Your stats have been updated." };
            } else if (localTime > cloudTime) {
                await this._pushToCloud(uid);
                return { ok: true, message: "Local save backed up to cloud!" };
            }
            return { ok: true, message: "Cloud and Local are already perfectly in sync." };
        } catch(e) {
            return { ok: false, error: "Sync failed: " + this._friendlyError(e) };
        }
    },

    // ── INTERNAL ──────────────────────────────────
    _saveSession: function() {
        localStorage.setItem(this.SESSION_KEY, JSON.stringify({
            uid: this._activeUid, username: this._activeUsername
        }));
    },

    _pullFromCloud: async function(uid) {
        if (!navigator.onLine || !window.dbGet) return;
        const snap = await window.dbGet(window.dbRef(window.db, `users/${uid}`));
        if (!snap.exists()) return;

        const cloudUser = snap.val();
        const local     = this._users[uid];
        const localTime = (local && local.lastUpdated) || 0;
        const cloudTime = cloudUser.lastUpdated || 0;

        if (cloudTime >= localTime) {
            this._users[uid] = cloudUser;
            this._saveUsers();
        } else {
            await this._pushToCloud(uid);
        }
        if (this._users[uid] && this._users[uid].username) {
            this._activeUsername = this._users[uid].username;
            this._saveSession();
        }
    },

    _refreshAdminFlag: async function(uid) {
        this._isAdmin = false;
        if (!window.dbGet) return;
        try {
            const snap = await window.dbGet(window.dbRef(window.db, `admins/${uid}`));
            this._isAdmin = snap.exists();
        } catch(e) {
            this._isAdmin = false; // rules deny -> not an admin
        }
    },

    _pushToCloud: async function(uid) {
        if (!navigator.onLine || !window.dbUpdate || !this._users[uid]) return;
        try {
            await window.dbUpdate(window.dbRef(window.db, `users/${uid}`), this._users[uid]);
            await this._pushLeaderboard(uid);
        } catch(e) {
            console.warn("Casino OS: cloud push failed.", e);
        }
    },

    // Public, secret-free projection powering the leaderboard.
    _pushLeaderboard: async function(uid) {
        const user = this._users[uid];
        if (!user || !window.dbSet || !navigator.onLine) return;
        const p = user.profile || {};
        try {
            await window.dbSet(window.dbRef(window.db, `leaderboard/${uid}`), {
                name:     p.name     || user.username || "Unknown",
                avatar:   p.avatar   || "👤",
                bankroll: p.bankroll || 0,
                xp:       p.xp       || 0,
                level:    p.level    || 1,
                wins:     (user.stats && user.stats.global && user.stats.global.wins) ||
                          (user.stats && user.stats.wins) || p.wins || 0
            });
        } catch(e) {
            console.warn("Casino OS: leaderboard push failed.", e);
        }
    },

    _snapshotModules: function(uid) {
        const rec = this._users[uid];
        if (!rec) return;
        if (window.SystemProfile)      { rec.profile = { ...window.SystemProfile.data }; rec.profile.isDev = this._isAdmin; }
        if (window.SystemStats)        rec.stats        = { ...window.SystemStats.data };
        if (window.SystemAchievements) rec.achievements = { ...window.SystemAchievements.data };
        if (window.SystemRewards)      rec.rewards      = { ...window.SystemRewards.data };
        rec.lastUpdated = Date.now();
    },

    _saveCurrentUserData: async function() {
        if (!this.isLoggedIn()) return;
        const uid = this._activeUid;
        this._snapshotModules(uid);
        this._saveUsers();
        await this._pushToCloud(uid);
    },

    _loadIntoProfile: function(uid) {
        const user = this._users[uid];
        if (!user) return;

        user.profile = user.profile || {};
        if (!user.profile.inventory)        user.profile.inventory        = [];
        if (!user.profile.chatColor)        user.profile.chatColor        = "#ffffff";
        if (!user.profile.title)            user.profile.title            = "Newcomer";
        if (!user.profile.avatar)           user.profile.avatar           = "👤";
        if (!user.profile.equippedCardBack) user.profile.equippedCardBack = "cardBack_blue1.png";
        if (!user.profile.equippedDice)     user.profile.equippedDice     = "default";

        // Hard-replace from defaults + this user's saved profile — never merge in
        // the previous session's SystemProfile.data, since the previous user (or
        // guest) may have left stale loadout/inventory/bankroll fields behind.
        if (window.SystemProfile) {
            window.SystemProfile.data = { ...this._defaultProfile(user.username || "Player"), ...(user.profile || {}) };
            window.SystemProfile.data.isDev = this._isAdmin;
            window.SystemProfile.saveProfile();
        }
        if (window.SystemStats) {
            window.SystemStats.data = this._normalizeStats(user.stats);
            if (typeof window.SystemStats.saveData === 'function') window.SystemStats.saveData();
        }
        if (window.SystemAchievements) {
            const ach = { ...(user.achievements || this._defaultAchievements()) };
            // Firebase strips empty arrays — a fresh account comes back
            // without `unlocked`, which crashed the profile panel.
            if (!Array.isArray(ach.unlocked)) ach.unlocked = [];
            window.SystemAchievements.data = ach;
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
    // Gated by admins/<uid> in the database rules, not by a client-side password.
    // Cross-user writes only succeed if the signed-in uid is listed there.
    admin: {
        _resolve: async function(targetUser) {
            const A = window.SystemAuth;
            const name = A._cleanUsername(targetUser) || A._activeUsername;
            if (!name) return { ok: false, error: "No target user." };

            if (name === A._activeUsername) {
                A._snapshotModules(A._activeUid);
                return { ok: true, uid: A._activeUid, name: name, record: A._users[A._activeUid] };
            }
            try {
                const idx = await window.dbGet(window.dbRef(window.db, `usernames/${name}`));
                if (!idx.exists()) return { ok: false, error: "User not found." };
                const uid  = idx.val().uid;
                const snap = await window.dbGet(window.dbRef(window.db, `users/${uid}`));
                if (!snap.exists()) return { ok: false, error: "User record missing." };
                return { ok: true, uid: uid, name: name, record: snap.val() };
            } catch(e) {
                return { ok: false, error: "Permission denied — admin rights required." };
            }
        },

        _commit: async function(uid, record, name, message) {
            const A = window.SystemAuth;
            A._users[uid] = record;
            record.lastUpdated = Date.now();
            A._saveUsers();
            try {
                await window.dbUpdate(window.dbRef(window.db, `users/${uid}`), record);
                await A._pushLeaderboard(uid);
            } catch(e) {
                return { ok: false, error: "Permission denied — admin rights required." };
            }
            if (uid === A._activeUid) A._loadIntoProfile(uid);
            return { ok: true, message: message };
        },

        modifyMoney: async function(targetUser, amount) {
            const t = await this._resolve(targetUser);
            if (!t.ok) return t;
            const amt = parseInt(amount) || 0;
            t.record.profile.bankroll = Math.max(0, (t.record.profile.bankroll || 0) + amt);
            return this._commit(t.uid, t.record, t.name,
                `Modified money for ${t.name}. New balance: $${t.record.profile.bankroll}`);
        },

        modifyXP: async function(targetUser, amount) {
            const t = await this._resolve(targetUser);
            if (!t.ok) return t;
            const amt = parseInt(amount) || 0;
            t.record.profile.xp = Math.max(0, (t.record.profile.xp || 0) + amt);

            const thresholds = [
                { level: 1, xp: 0 }, { level: 2, xp: 500 }, { level: 3, xp: 2000 },
                { level: 4, xp: 5000 }, { level: 5, xp: 10000 }, { level: 6, xp: 25000 }
            ];
            let newLevel = 1;
            for (let i = thresholds.length - 1; i >= 0; i--) {
                if (t.record.profile.xp >= thresholds[i].xp) { newLevel = thresholds[i].level; break; }
            }
            t.record.profile.level = newLevel;
            return this._commit(t.uid, t.record, t.name,
                `Modified XP for ${t.name}. New Level: ${newLevel}`);
        },

        resetProgress: async function(targetUser) {
            const A = window.SystemAuth;
            const t = await this._resolve(targetUser);
            if (!t.ok) return t;
            const p = t.record.profile;
            p.gamesPlayed = 0; p.wins = 0; p.losses = 0; p.totalWagered = 0; p.xp = 0; p.level = 1;
            t.record.stats        = A._defaultStats();
            t.record.achievements = A._defaultAchievements();
            t.record.rewards      = A._defaultRewards();
            return this._commit(t.uid, t.record, t.name, `Account progress reset for ${t.name}.`);
        },

        toggleAchievement: async function(targetUser, achId, unlock) {
            const A = window.SystemAuth;
            if (!achId) return { ok: false, error: "Achievement ID required." };
            const t = await this._resolve(targetUser);
            if (!t.ok) return t;

            t.record.achievements = t.record.achievements || A._defaultAchievements();
            const list = t.record.achievements.unlocked || [];
            t.record.achievements.unlocked = unlock
                ? (list.includes(achId) ? list : [...list, achId])
                : list.filter(id => id !== achId);

            return this._commit(t.uid, t.record, t.name,
                `Achievement '${achId}' ${unlock ? 'unlocked' : 'locked'} for ${t.name}.`);
        },

        resetDailyBonus: async function(targetUser) {
            const A = window.SystemAuth;
            const t = await this._resolve(targetUser);
            if (!t.ok) return t;
            t.record.rewards = t.record.rewards || A._defaultRewards();
            t.record.rewards.lastClaim = "";
            return this._commit(t.uid, t.record, t.name, `Daily bonus timer reset for ${t.name}.`);
        },

        // Removes the user's data and frees the username. The Firebase Auth user
        // itself can only be deleted from the console — RTDB rules can't reach it.
        deleteAccount: async function(targetUser) {
            const A = window.SystemAuth;
            const t = await this._resolve(targetUser);
            if (!t.ok) return t;

            try {
                await window.dbRemove(window.dbRef(window.db, `users/${t.uid}`));
                await window.dbRemove(window.dbRef(window.db, `leaderboard/${t.uid}`));
                await window.dbRemove(window.dbRef(window.db, `usernames/${t.name}`));
            } catch(e) {
                return { ok: false, error: "Permission denied — admin rights required." };
            }

            delete A._users[t.uid];
            A._saveUsers();
            if (t.uid === A._activeUid) await A.logout();

            return { ok: true, message:
                `Data for '${t.name}' deleted. Remove the login itself in Firebase Console → Authentication.` };
        }
    }
};

window.SystemAuth.init();

// ── LIVE CLOUD SYNC ───────────────────────────
// Games run inside an iframe and write stats/profile/achievements to
// localStorage; the parent hub receives 'storage' events for those writes.
// Without this, the cloud record and public leaderboard only updated on
// logout or a manual "SYNC TO CLOUD" click — rankings looked frozen.
(function() {
    const WATCHED = ["casino_stats", "casino_player_profile", "casino_achievements"];
    let syncTimer = null;
    window.addEventListener("storage", function(e) {
        const A = window.SystemAuth;
        if (!A || !A.isLoggedIn()) return;
        if (!e || WATCHED.indexOf(e.key) === -1) return;
        clearTimeout(syncTimer);
        // Debounced: a game session fires many writes back-to-back.
        syncTimer = setTimeout(function() {
            try {
                if (window.SystemStats)        window.SystemStats.loadData();
                if (window.SystemProfile && window.SystemProfile.loadProfile) window.SystemProfile.loadProfile();
                if (window.SystemAchievements) window.SystemAchievements.loadData();
                A._saveCurrentUserData();
            } catch (err) {
                console.warn("Casino OS: live sync failed.", err);
            }
        }, 4000);
    });
})();
