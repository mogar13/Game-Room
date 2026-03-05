const SystemUI = {
    money: parseInt(localStorage.getItem("blackjack_money")) || 5000,
    isMuted: localStorage.getItem("casino_muted") === "true",
    
    init: function(config) {
        this.injectHTML();
        this.bindEvents();
        
        document.getElementById("sys-game-title").innerText = (config.gameName || "CASINO") + " SETTINGS";
        document.getElementById("sys-rules-text").innerHTML = config.rules || "No rules provided.";
        
        if (config.customToggles) {
            document.getElementById("sys-custom-toggles-container").style.display = "block";
            document.getElementById("sys-custom-toggles").innerHTML = config.customToggles;
        }

        this.updateMoneyDisplay();
        this.updateMuteBtn();
    },

    updateMoneyDisplay: function() {
        localStorage.setItem("blackjack_money", this.money);
        const display = document.getElementById("sys-money");
        if (display) display.innerText = this.money;
    },

    updateMuteBtn: function() {
        const btn = document.getElementById("sys-mute-btn");
        if (this.isMuted) {
            btn.innerText = "🔊 AUDIO: MUTED";
            btn.style.color = "#e74c3c";
        } else {
            btn.innerText = "🔊 AUDIO: ON";
            btn.style.color = "white";
        }
    },

    injectHTML: function() {
        if (document.getElementById("universal-hud")) return;

        const uiHTML = `
        <div id="universal-hud">
           <a href="../../index.html" class="hud-btn" id="home-btn"><img src="../blackjack/home.png" class="hud-icon"></a>
           <div class="hud-stat"><img src="../blackjack/dollar.png" class="hud-icon"> $<span id="sys-money">${this.money}</span></div>
           <button class="hud-btn" id="sys-settings-btn"><img src="../blackjack/settings.png" class="hud-icon"></button>
        </div>

        <div id="sys-modal" class="sys-hidden">
           <div class="sys-modal-box">
               <h2 id="sys-game-title">SETTINGS</h2>
               <div class="sys-section">
                   <h3>RULES & MECHANICS</h3>
                   <div class="sys-rules-text" id="sys-rules-text"></div>
               </div>
               <div class="sys-section" id="sys-custom-toggles-container" style="display:none;">
                   <h3>GAME OPTIONS</h3>
                   <div id="sys-custom-toggles"></div>
               </div>
               <div class="sys-section">
                   <h3>GLOBAL AUDIO</h3>
                   <button class="sys-btn" id="sys-mute-btn">AUDIO: ON</button>
               </div>
               <div class="sys-section sys-danger-zone">
                   <h3>DANGER ZONE</h3>
                   <button class="sys-btn" id="sys-reset-game-btn">RESET CURRENT GAME STATS</button>
                   <button class="sys-btn btn-nuke" id="sys-nuke-btn">NUKE ENTIRE ACCOUNT</button>
               </div>
               <button id="sys-close-btn">CLOSE</button>
           </div>
        </div>
        `;
        document.body.insertAdjacentHTML('afterbegin', uiHTML);
        document.body.classList.add("game-wrapper-padding"); 
    },

    bindEvents: function() {
        document.getElementById("sys-settings-btn").addEventListener("click", () => {
            document.getElementById("sys-modal").classList.remove("sys-hidden");
        });
        document.getElementById("sys-close-btn").addEventListener("click", () => {
            document.getElementById("sys-modal").classList.add("sys-hidden");
        });
        document.getElementById("sys-mute-btn").addEventListener("click", () => {
            this.isMuted = !this.isMuted;
            localStorage.setItem("casino_muted", this.isMuted);
            this.updateMuteBtn();
        });
        document.getElementById("sys-nuke-btn").addEventListener("click", () => {
            if (confirm("WARNING: This will permanently erase your $5,000 bankroll and ALL game data across the entire library. Are you absolutely sure?")) {
                localStorage.clear();
                window.location.reload();
            }
        });
    },

    // --- NEW: UNIVERSAL BETTING RACK ---
    setupBetting: function(containerId, options) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Default layout if none is passed
        const denoms = options.chips || [
            { val: 1, cls: 'sys-chip-1', text: '1' },
            { val: 5, cls: 'sys-chip-5', text: '5' },
            { val: 25, cls: 'sys-chip-25', text: '25' },
            { val: 100, cls: 'sys-chip-100', text: '100' },
            { val: 500, cls: 'sys-chip-500', text: '500' },
            { val: 1000, cls: 'sys-chip-1k', text: '1K' }
        ];

        let chipsHTML = denoms.map(d => `<button class="sys-chip ${d.cls}" data-val="${d.val}">${d.text}</button>`).join('');

        container.innerHTML = `
            <div class="sys-betting-zone">
                <div class="sys-bet-info">
                    <span id="sys-current-bet-display">Bet: $0</span>
                    <button class="sys-clear-bet" id="sys-clear-bet-btn">Clear</button>
                </div>
                <div class="sys-chip-rack">
                    ${chipsHTML}
                </div>
            </div>
        `;

        // Wire up the clicks to ping your individual game files!
        container.querySelectorAll('.sys-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                let val = parseInt(chip.dataset.val);
                if (options.onBet) options.onBet(val);
            });
        });

        document.getElementById('sys-clear-bet-btn').addEventListener('click', () => {
            if (options.onClear) options.onClear();
        });
    },

    updateBetDisplay: function(amount) {
        const display = document.getElementById("sys-current-bet-display");
        if (display) display.innerText = `Bet: $${amount}`;
    },
    
    enableBetting: function(isEnabled) {
        const container = document.querySelector(".sys-betting-zone");
        if(container) {
            container.querySelectorAll("button").forEach(btn => btn.disabled = !isEnabled);
        }
    },
    // --- NEW: 3D TABLE CHIP STACKER ---
    renderTableStacks: function(amount, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = ""; // Clear old chips

        if (amount <= 0) return;

        // The math to break a bet down into the largest possible chips
        const denoms = [
            { val: 1000, cls: 'sys-table-chip-1k' },
            { val: 500, cls: 'sys-table-chip-500' },
            { val: 100, cls: 'sys-table-chip-100' },
            { val: 25, cls: 'sys-table-chip-25' },
            { val: 5, cls: 'sys-table-chip-5' },
            { val: 1, cls: 'sys-table-chip-1' }
        ];

        let tempAmount = amount;
        
        // A wrapper to line the stacks up neatly side-by-side
        let flexContainer = document.createElement('div');
        flexContainer.style.display = 'flex';
        flexContainer.style.gap = '8px';
        flexContainer.style.justifyContent = 'center';
        flexContainer.style.alignItems = 'flex-end';

        denoms.forEach(d => {
            let count = 0;
            while(tempAmount >= d.val) {
                tempAmount -= d.val;
                count++;
            }

            if (count > 0) {
                let col = document.createElement("div");
                col.className = "sys-table-chip-stack";
                
                // Stack them visually by offsetting the 'bottom' style
                for(let i=0; i<count; i++) {
                    let cEl = document.createElement("div");
                    cEl.className = `sys-table-chip ${d.cls}`;
                    cEl.style.bottom = `${i * 6}px`; // 6px creates the 3D overlap thickness
                    col.appendChild(cEl);
                }
                flexContainer.appendChild(col);
            }
        });

        container.appendChild(flexContainer);
    }
};