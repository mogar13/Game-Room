/**
 * CASINO OS - DAILY REWARDS MODULE
 * Handles login streaks, date comparisons, and the Daily Bonus UI.
 * Relies on SystemProfile to manage the actual bankroll.
 */

window.SystemRewards = {
    key: "casino_daily_reward",
    
    // The 7-day reward tier structure
    rewards: [200, 400, 600, 800, 1000, 1200, 5000],

    data: {
        lastClaim: null, // "YYYY-MM-DD" format
        streak: 0        // Current streak (0-6, where 0 is Day 1, 6 is Day 7)
    },

    init: function() {
        this.loadData();
        this.checkDailyLogin();
    },

    loadData: function() {
        const stored = localStorage.getItem(this.key);
        if (stored) {
            try {
                this.data = { ...this.data, ...JSON.parse(stored) };
            } catch (e) {
                console.error("Casino OS: Failed to parse daily rewards.", e);
            }
        }
    },

    saveData: function() {
        localStorage.setItem(this.key, JSON.stringify(this.data));
    },

    // Helper to get today's date strictly as a YYYY-MM-DD string
    getTodayString: function() {
        const date = new Date();
        // Adjusting for local timezone offset to prevent weird midnight bugs
        const offset = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() - offset);
        return localDate.toISOString().split('T')[0];
    },

    // Get a Date object set to midnight for easy day math
    getMidnightDate: function(dateString) {
        if (!dateString) return new Date(0);
        const [year, month, day] = dateString.split('-');
        return new Date(year, month - 1, day);
    },

    checkDailyLogin: function() {
        const todayStr = this.getTodayString();
        
        // If never claimed, or no data
        if (!this.data.lastClaim) {
            this.data.streak = 0; // Day 1
            this.showRewardModal();
            return;
        }

        // If already claimed today
        if (this.data.lastClaim === todayStr) {
            console.log("Casino OS: Daily reward already claimed today.");
            return;
        }

        // Calculate days between last claim and today
        const todayDate = this.getMidnightDate(todayStr);
        const lastClaimDate = this.getMidnightDate(this.data.lastClaim);
        const diffTime = Math.abs(todayDate - lastClaimDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
            // Perfect streak, increment day
            this.data.streak++;
            // If they beat day 7, reset to day 1
            if (this.data.streak >= this.rewards.length) {
                this.data.streak = 0; 
            }
        } else if (diffDays > 1) {
            // Streak broken
            this.data.streak = 0;
        }

        this.showRewardModal();
    },

    claimReward: function() {
        // Calculate reward based on streak index
        const rewardAmount = this.rewards[this.data.streak];
        
        // Give money via SystemProfile (Safely decoupled)
        if (window.SystemProfile) {
            window.SystemProfile.addMoney(rewardAmount);
            
            // Give a little bonus XP just for logging in
            window.SystemProfile.addXP(50);
        } else {
            console.error("Casino OS: SystemProfile missing! Cannot award chips.");
            return;
        }

        // Play sound if UI is available
        if (window.SystemUI && typeof window.SystemUI.playSound === 'function') {
            window.SystemUI.playSound('win');
        } else if (window.SystemAudio) {
            // Fallback: if AudioModule is available (game context) use it directly
            window.SystemAudio.play('win');
        }
        // Note: on the hub page SystemUI/SystemAudio are not loaded — silence is fine there

        // Save progress
        this.data.lastClaim = this.getTodayString();
        this.saveData();

        // Close UI
        const overlay = document.getElementById("sys-rewards-overlay");
        if (overlay) overlay.remove();
        
        // Re-check the hub bonus button if we are on the index page
        if (typeof updateBonusButton === 'function') {
            updateBonusButton();
        }
    },

    showRewardModal: function() {
        const dayNumber = this.data.streak + 1;
        const rewardAmount = this.rewards[this.data.streak];

        // Generate the visual dots for the 7-day progression
        let progressHTML = `<div style="display: flex; justify-content: space-between; margin-bottom: 20px; padding: 0 10px;">`;
        for (let i = 0; i < 7; i++) {
            let color = "#333"; // Upcoming days
            let icon = "🔒";
            
            if (i < this.data.streak) {
                color = "#2ecc71"; // Past claimed days
                icon = "✓";
            } else if (i === this.data.streak) {
                color = "#f1c40f"; // Today
                icon = "🎁";
            }

            progressHTML += `
                <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                    <div style="width: 30px; height: 30px; border-radius: 50%; background: ${color}; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; border: 1px solid #000; box-shadow: 0 2px 5px rgba(0,0,0,0.5);">
                        ${icon}
                    </div>
                    <span style="font-size: 0.6rem; color: #888;">D${i+1}</span>
                </div>
            `;
        }
        progressHTML += `</div>`;

        const overlay = document.createElement("div");
        overlay.id = "sys-rewards-overlay";
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.95);
            z-index: 10000; display: flex; align-items: center; justify-content: center;
            font-family: 'Orbitron', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            backdrop-filter: blur(5px);
        `;

        overlay.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #1a0b2e 0%, #0a0410 100%);
                border: 2px solid #f1c40f; border-radius: 12px;
                padding: 30px 20px; width: 90%; max-width: 380px; text-align: center;
                box-shadow: 0 0 50px rgba(241,196,15,0.2); position: relative;
            ">
                <div style="font-size: 3rem; margin-bottom: 10px; filter: drop-shadow(0 0 10px #f1c40f);">🎰</div>
                <h2 style="color: #f1c40f; margin: 0 0 5px; letter-spacing: 2px; font-size: 1.5rem; text-transform: uppercase;">DAILY BONUS</h2>
                <p style="color: #bbb; margin: 0 0 25px; font-size: 0.9rem; font-family: 'Roboto', sans-serif;">Welcome back! Here is your daily reward.</p>
                
                ${progressHTML}

                <div style="
                    background: rgba(0,0,0,0.6); border: 1px solid #3a1c61;
                    padding: 20px; border-radius: 8px; margin-bottom: 25px;
                ">
                    <p style="color: #a29bfe; font-size: 0.85rem; margin: 0 0 5px; text-transform: uppercase; letter-spacing: 1px;">Day ${dayNumber} Reward</p>
                    <p style="color: #2ecc71; font-size: 2.5rem; margin: 0; font-weight: bold; text-shadow: 0 0 15px rgba(46, 204, 113, 0.4);">
                        +$${rewardAmount}
                    </p>
                </div>

                <button id="sys-claim-btn" style="
                    width: 100%; padding: 15px; background: #f1c40f; color: #000;
                    border: none; border-radius: 8px; font-weight: bold;
                    font-size: 1.1rem; cursor: pointer; letter-spacing: 2px;
                    transition: all 0.2s; box-shadow: 0 5px 15px rgba(241, 196, 15, 0.4);
                ">CLAIM CHIPS</button>
            </div>
        `;

        document.body.appendChild(overlay);

        const claimBtn = overlay.querySelector("#sys-claim-btn");
        
        // Button interactions
        claimBtn.addEventListener("mouseover", () => claimBtn.style.transform = "scale(1.02)");
        claimBtn.addEventListener("mouseout", () => claimBtn.style.transform = "scale(1)");
        claimBtn.addEventListener("mousedown", () => claimBtn.style.transform = "scale(0.98)");
        
        claimBtn.addEventListener("click", () => this.claimReward());
    }
};

// Auto-initialize when the DOM is ready so it pops up immediately if eligible
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.SystemRewards.init());
} else {
    window.SystemRewards.init();
}