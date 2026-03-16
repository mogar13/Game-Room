/**
 * CASINO OS - SYSTEM BETTING MODULE
 * Manages the global betting UI, chip limits, math (Double, Half, All-In), 
 * and economy protection to prevent games from going into negative balance.
 */

window.SystemBetting = {
    containerId: null,
    minBet: 2,
    maxBet: 999999999,
    currentBet: 0,
    lastBet: 0, 
    callbacks: { onBet: null, onClear: null },

    setup: function(containerId, options = {}) {
        this.containerId = containerId;
        this.minBet = options.minBet || 2;
        this.maxBet = options.maxBet || 1000;
        this.callbacks.onBet = options.onBet;
        this.callbacks.onClear = options.onClear;
        this.currentBet = 0;

        this.injectHTML();
        this.bindEvents();
    },

    injectHTML: function() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        // Expanded HTML with the new Advanced Betting Controls
        const html = `
            <div class="sys-betting-zone">
                <div class="sys-bet-info" style="flex-direction: column; gap: 8px; padding: 12px 20px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <span>BET: $<span id="sys-current-bet-display">0</span></span>
                        <button class="sys-clear-bet" id="sys-clear-bet">CLEAR</button>
                    </div>
                    <div style="display: flex; gap: 8px; font-size: 0.75rem; justify-content: center; width: 100%;">
                        <button class="sys-bet-mod" id="sys-bet-repeat" style="background:#3a1c61; color:white; border:1px solid #5a3c8a; border-radius:4px; padding:4px 8px; cursor:pointer;">REPEAT</button>
                        <button class="sys-bet-mod" id="sys-bet-half" style="background:#3a1c61; color:white; border:1px solid #5a3c8a; border-radius:4px; padding:4px 8px; cursor:pointer;">1/2</button>
                        <button class="sys-bet-mod" id="sys-bet-double" style="background:#3a1c61; color:white; border:1px solid #5a3c8a; border-radius:4px; padding:4px 8px; cursor:pointer;">2X</button>
                        <button class="sys-bet-mod" id="sys-bet-max" style="background:#e74c3c; color:white; border:1px solid #c0392b; border-radius:4px; padding:4px 8px; cursor:pointer; font-weight:bold;">ALL IN</button>
                    </div>
                </div>
                <div class="sys-chip-rack">
                    <button class="sys-chip sys-chip-1" data-val="1">1</button>
                    <button class="sys-chip sys-chip-5" data-val="5">5</button>
                    <button class="sys-chip sys-chip-25" data-val="25">25</button>
                    <button class="sys-chip sys-chip-100" data-val="100">100</button>
                    <button class="sys-chip sys-chip-500" data-val="500">500</button>
                    <button class="sys-chip sys-chip-1k" data-val="1000">1K</button>
                </div>
            </div>
        `;
        container.innerHTML = html;
    },

    bindEvents: function() {
        const container = document.getElementById(this.containerId);
        if(!container) return;

        // Base Chips
        container.querySelectorAll(".sys-chip").forEach(btn => {
            btn.addEventListener("click", (e) => {
                if (btn.disabled) return;
                const val = parseInt(e.target.dataset.val);
                this.addBet(val);
                
                const el = e.target.closest('.sys-chip');
                el.style.transform = "scale(0.85)";
                setTimeout(() => el.style.transform = "scale(1)", 100);
            });
        });

        // Advanced Controls
        document.getElementById("sys-clear-bet").addEventListener("click", () => this.clearBet(true));
        document.getElementById("sys-bet-repeat").addEventListener("click", () => { if (!document.getElementById("sys-bet-repeat").disabled) this.repeatBet(); });
        document.getElementById("sys-bet-half").addEventListener("click", () => { if (!document.getElementById("sys-bet-half").disabled) this.halfBet(); });
        document.getElementById("sys-bet-double").addEventListener("click", () => { if (!document.getElementById("sys-bet-double").disabled) this.doubleBet(); });
        document.getElementById("sys-bet-max").addEventListener("click", () => { if (!document.getElementById("sys-bet-max").disabled) this.allIn(); });
    },

    // --- CORE LOGIC & PROTECTIONS ---

    addBet: function(val) {
        if (!window.SystemProfile) return;
        
        const bankroll = window.SystemProfile.getMoney();
        let newBet = this.currentBet + val;

        // Strict Economy Validation
        if (newBet > this.maxBet) newBet = this.maxBet;
        if (newBet > bankroll) newBet = bankroll;

        const actualAdded = newBet - this.currentBet;
        if (actualAdded <= 0) {
            if (window.SystemUI) window.SystemUI.playSound('click'); // Or an error sound
            return;
        }

        if (window.SystemUI) window.SystemUI.playSound('click');
        this.currentBet = newBet;
        this.updateDisplay();

        // Pass only the delta to legacy games so they can keep counting correctly
        if (this.callbacks.onBet) this.callbacks.onBet(actualAdded);
    },

    clearBet: function(playAudio = false) {
        if (playAudio && window.SystemUI) window.SystemUI.playSound('click');
        this.currentBet = 0;
        this.updateDisplay();
        if (this.callbacks.onClear) this.callbacks.onClear();
    },

    // A clever wrapper that clears a legacy game's internal bet and sets it to an exact total
    _syncTotalToLegacyGame: function(targetTotal) {
        this.clearBet(false);
        if (targetTotal > 0) {
            this.addBet(targetTotal);
        }
    },

    repeatBet: function() {
        if (this.lastBet > 0) this._syncTotalToLegacyGame(this.lastBet);
    },

    doubleBet: function() {
        if (this.currentBet > 0) this._syncTotalToLegacyGame(this.currentBet * 2);
    },

    halfBet: function() {
        if (this.currentBet > 1) this._syncTotalToLegacyGame(Math.floor(this.currentBet / 2));
    },

    allIn: function() {
        if (!window.SystemProfile) return;
        const bankroll = window.SystemProfile.getMoney();
        const target = Math.min(bankroll, this.maxBet);
        if (target > 0) this._syncTotalToLegacyGame(target);
    },

    updateDisplay: function() {
        const betEl = document.getElementById("sys-current-bet-display");
        if(betEl) betEl.innerText = this.currentBet;
    },

    enable: function(isEnabled) {
        const container = document.getElementById(this.containerId);
        if(!container) return;
        container.querySelectorAll(".sys-chip, .sys-clear-bet, .sys-bet-mod").forEach(btn => {
            btn.disabled = !isEnabled;
        });
    },

    // --- API FOR NEW GAMES ---
    // Instead of doing math, new games just call this to validate against the minBet and deduct the money cleanly.
    validateAndCommit: function() {
        if (this.currentBet < this.minBet) {
            console.warn(`Casino OS: Minimum bet is $${this.minBet}`);
            return false;
        }
        if (this.currentBet > window.SystemProfile.getMoney()) {
            console.warn("Casino OS: Insufficient funds.");
            return false;
        }
        
        window.SystemProfile.removeMoney(this.currentBet);
        this.lastBet = this.currentBet; // Lock in the repeat
        return this.currentBet;
    }
};

// ==========================================
// DROP-IN COMPATIBILITY OVERRIDES
// Overrides the functions inside system_ui.js seamlessly.
// ==========================================
if (window.SystemUI) {
    window.SystemUI.setupBetting = function(id, opts) { window.SystemBetting.setup(id, opts); };
    window.SystemUI.updateBetDisplay = function(amt) { window.SystemBetting.updateDisplay(); }; // Ignores legacy amt, uses internal state
    window.SystemUI.enableBetting = function(en) { window.SystemBetting.enable(en); };
}