/**
 * CASINO OS - SYSTEM ACHIEVEMENTS MODULE
 * Tracks unlocked milestones, grants rewards, and displays AAA toast notifications.
 */

window.SystemAchievements = {
    key: "casino_achievements",
    
    // The master list of available achievements
    list: {
        "first_win": { name: "First Win", desc: "Win your very first game.", icon: "🏆", xp: 100, chips: 500 },
        "win_10": { name: "On a Roll", desc: "Win 10 games total.", icon: "🔥", xp: 500, chips: 1000 },
        "win_100": { name: "Casino Legend", desc: "Win 100 games total.", icon: "👑", xp: 5000, chips: 10000 },
        "blackjack_hand": { name: "Blackjack!", desc: "Get a natural 21 in Blackjack.", icon: "🃏", xp: 200, chips: 500 },
        "big_win": { name: "High Roller", desc: "Win $1,000 or more in a single bet.", icon: "💸", xp: 500, chips: 2000 },
        "social_butterfly": { name: "Social Butterfly", desc: "Send your first chat message.", icon: "💬", xp: 50, chips: 100 }
    },

    data: {
        unlocked: [] // Array of string IDs, e.g., ["first_win", "blackjack_hand"]
    },

    init: function() {
        this.loadData();
        // Defer bindEvents until DOMContentLoaded so system_ui.js is guaranteed
        // to have run first (system_achievements.js loads before system_ui.js)
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => this.bindEvents());
        } else {
            this.bindEvents();
        }
    },

    loadData: function() {
        const stored = localStorage.getItem(this.key);
        if (stored) {
            try {
                this.data = JSON.parse(stored);
                // Ensure legacy data structure doesn't break
                if (!Array.isArray(this.data.unlocked)) {
                    this.data.unlocked = [];
                }
            } catch (e) {
                console.error("Casino OS: Failed to parse achievements.", e);
            }
        }
    },

    saveData: function() {
        localStorage.setItem(this.key, JSON.stringify(this.data));
    },

    bindEvents: function() {
        // Auto-unlock certain achievements by listening to the Event Hub
        if (window.SystemUI && typeof window.SystemUI.on === 'function') {
            window.SystemUI.on("player_win", () => {
                if (!this.hasUnlocked("first_win")) {
                    this.unlock("first_win");
                }
                
                // Check stats for 10 or 100 wins
                if (window.SystemStats) {
                    const stats = window.SystemStats.getStats();
                    if (stats.wins >= 10 && !this.hasUnlocked("win_10")) this.unlock("win_10");
                    if (stats.wins >= 100 && !this.hasUnlocked("win_100")) this.unlock("win_100");
                }
            });
        }
    },

    hasUnlocked: function(id) {
        return this.data.unlocked.includes(id);
    },

    getUnlocked: function() {
        return this.data.unlocked.map(id => this.list[id]).filter(Boolean);
    },

    unlock: function(id) {
        const achievement = this.list[id];
        if (!achievement) {
            console.warn(`Casino OS: Achievement '${id}' does not exist.`);
            return;
        }

        if (this.hasUnlocked(id)) {
            return; // Already unlocked
        }

        // 1. Save state
        this.data.unlocked.push(id);
        this.saveData();

        console.log(`Casino OS: Achievement Unlocked - ${achievement.name}`);

        // 2. Grant Rewards safely via SystemProfile
        if (window.SystemProfile) {
            if (achievement.xp) window.SystemProfile.addXP(achievement.xp);
            if (achievement.chips) window.SystemProfile.addMoney(achievement.chips);
        }

        // 3. Play Sound
        if (window.SystemUI && typeof window.SystemUI.playSound === 'function') {
            window.SystemUI.playSound('win');
        }

        // 4. Show Visual Notification
        this.showToast(achievement);
    },

    showToast: function(achievement) {
        // Create toast container if it doesn't exist
        let container = document.getElementById("sys-toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "sys-toast-container";
            container.style.cssText = `
                position: fixed; bottom: 20px; right: 20px;
                display: flex; flex-direction: column; gap: 10px;
                z-index: 100000; pointer-events: none;
                font-family: 'Roboto', sans-serif;
            `;
            document.body.appendChild(container);
        }

        // Build the specific notification element
        const toast = document.createElement("div");
        toast.style.cssText = `
            background: linear-gradient(135deg, #1a0b2e 0%, #0a0410 100%);
            border: 2px solid #f1c40f; border-radius: 8px;
            padding: 12px 15px; display: flex; align-items: center; gap: 15px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.8), 0 0 15px rgba(241,196,15,0.3);
            transform: translateX(120%); opacity: 0; transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            min-width: 250px;
        `;

        toast.innerHTML = `
            <div style="font-size: 2.2rem; filter: drop-shadow(0 0 5px #f1c40f);">${achievement.icon}</div>
            <div style="display: flex; flex-direction: column;">
                <span style="color: #f1c40f; font-family: 'Orbitron', sans-serif; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;">Achievement Unlocked</span>
                <span style="color: #fff; font-weight: bold; font-size: 1rem;">${achievement.name}</span>
                <span style="color: #bbb; font-size: 0.75rem;">${achievement.desc}</span>
                <div style="display: flex; gap: 8px; margin-top: 4px; font-size: 0.7rem; font-weight: bold;">
                    <span style="color: #3498db;">+${achievement.xp} XP</span>
                    <span style="color: #2ecc71;">+$${achievement.chips}</span>
                </div>
            </div>
        `;

        container.appendChild(toast);

        // Animate In
        requestAnimationFrame(() => {
            toast.style.transform = "translateX(0)";
            toast.style.opacity = "1";
        });

        // Animate Out & Remove after 4.5 seconds
        setTimeout(() => {
            toast.style.transform = "translateX(120%)";
            toast.style.opacity = "0";
            setTimeout(() => toast.remove(), 500); // Wait for transition to finish
        }, 4500);
    }
};

// Initialize immediately
window.SystemAchievements.init();

// ==========================================
// DROP-IN COMPATIBILITY OVERRIDES
// Bind to SystemUI so legacy or new games can call SystemUI.unlockAchievement("id")
// ==========================================
if (window.SystemUI) {
    window.SystemUI.unlockAchievement = function(id) { window.SystemAchievements.unlock(id); };
    window.SystemUI.getAchievements = function() { return window.SystemAchievements.getUnlocked(); };
}