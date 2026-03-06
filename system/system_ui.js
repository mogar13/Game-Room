const SystemUI = {
    money: parseInt(localStorage.getItem("blackjack_money")) || 5000,
    isMuted: localStorage.getItem("casino_muted") === "true",
    
    audioTracks: {}, 

    preloadAudio: function() {
        const basePath = "../../system/audio/";
        this.audioTracks = {
            chipTable: new Audio(basePath + 'chip-lay-3.ogg'),
            chipStack: [
                new Audio(basePath + 'chip-lay-1.ogg'),
                new Audio(basePath + 'chip-lay-2.ogg')
            ],
            card: [
                new Audio(basePath + 'card-slide-6.ogg'),
                new Audio(basePath + 'cardPlace2.ogg')
            ],
            win: new Audio(basePath + 'win.mp3'),
            click: new Audio(basePath + 'switch4.ogg'),
            roulette: new Audio(basePath + 'roulette.mp3'),
            // Newly added globals!
            lose: new Audio(basePath + 'lose.mp3'),
            tie: new Audio(basePath + 'tie.mp3'),
            shuffle: new Audio(basePath + 'shuffle.mp3'),
            diceShake: [
                new Audio(basePath + 'dice-shake-1.ogg'),
                new Audio(basePath + 'dice-shake-2.ogg')
            ],
            diceThrow: [
                new Audio(basePath + 'dice-throw-1.ogg'),
                new Audio(basePath + 'dice-throw-2.ogg')
            ]
        };
    },

    playSound: function(type) {
        if (this.isMuted || !this.audioTracks[type]) return null;

        let sound;
        if (Array.isArray(this.audioTracks[type])) {
            sound = this.audioTracks[type][Math.floor(Math.random() * this.audioTracks[type].length)];
        } else {
            sound = this.audioTracks[type];
        }

        let soundClone = sound.cloneNode();
        soundClone.volume = 0.6; 
        soundClone.play().catch(e => console.log("Audio blocked:", e));
        
        return soundClone;
    },

    init: function(config) {
        this.preloadAudio(); 
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

        // FIXED: Now points to the new /images/icons/ folder!
        const uiHTML = `
        <div id="universal-hud">
           <a href="../../index.html" class="hud-btn" id="home-btn"><img src="../../system/images/icons/home.png" class="hud-icon"></a>
           <div class="hud-stat"><img src="../../system/images/icons/dollar.png" class="hud-icon"> $<span id="sys-money">${this.money}</span></div>
           <button class="hud-btn" id="sys-settings-btn"><img src="../../system/images/icons/settings.png" class="hud-icon"></button>
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
            this.playSound('click'); 
            document.getElementById("sys-modal").classList.remove("sys-hidden");
        });
        document.getElementById("sys-close-btn").addEventListener("click", () => {
            this.playSound('click'); 
            document.getElementById("sys-modal").classList.add("sys-hidden");
        });
        document.getElementById("sys-mute-btn").addEventListener("click", () => {
            this.playSound('click'); 
            this.isMuted = !this.isMuted;
            localStorage.setItem("casino_muted", this.isMuted);
            this.updateMuteBtn();
        });
        document.getElementById("sys-nuke-btn").addEventListener("click", () => {
            this.playSound('click');
            if (confirm("WARNING: This will permanently erase your bankroll and ALL game data. Are you absolutely sure?")) {
                localStorage.clear();
                window.location.reload();
            }
        });
    },

    setupBetting: function(containerId, options) {
        const container = document.getElementById(containerId);
        if (!container) return;

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

        container.querySelectorAll('.sys-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                let val = parseInt(chip.dataset.val);
                if (options.onBet) options.onBet(val);
            });
        });

        document.getElementById('sys-clear-bet-btn').addEventListener('click', () => {
            this.playSound('click');
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

    renderTableStacks: function(amount, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = ""; 

        if (amount <= 0) return;

        const denoms = [
            { val: 1000, cls: 'sys-table-chip-1k' },
            { val: 500, cls: 'sys-table-chip-500' },
            { val: 100, cls: 'sys-table-chip-100' },
            { val: 25, cls: 'sys-table-chip-25' },
            { val: 5, cls: 'sys-table-chip-5' },
            { val: 1, cls: 'sys-table-chip-1' }
        ];

        let tempAmount = amount;
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
                
                for(let i=0; i<count; i++) {
                    let cEl = document.createElement("div");
                    cEl.className = `sys-table-chip ${d.cls}`;
                    cEl.style.bottom = `${i * 6}px`; 
                    col.appendChild(cEl);
                }
                flexContainer.appendChild(col);
            }
        });

        container.appendChild(flexContainer);
    }
};