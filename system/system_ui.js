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
            shuffle: new Audio(basePath + 'shuffle.mp3')
        };
    },

    playSound: function(type) {
        if (this.isMuted) return;
        
        let sound = this.audioTracks[type];
        if (!sound) return;

        if (Array.isArray(sound)) {
            let randomTrack = sound[Math.floor(Math.random() * sound.length)];
            randomTrack.currentTime = 0;
            randomTrack.play().catch(e => console.log("Audio play failed:", e));
        } else {
            sound.currentTime = 0;
            sound.play().catch(e => console.log("Audio play failed:", e));
        }
    },

    init: function(config = {}) {
        this.preloadAudio();

        const dropdownsHTML = (config.hudDropdowns || []).map(d => `
            <select id="${d.id}" class="hud-dropdown" title="${d.label || ''}">
                ${d.options.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
            </select>
        `).join('');
        
        const hudHTML = `
            <div id="universal-hud">
                <div class="hud-stat">
                    <img src="../../system/images/icons/dollar.png" class="hud-icon" alt="Chips">
                    $<span id="sys-money">${this.money}</span>
                    <button id="sys-bankrupt-refill" class="hud-refill-btn sys-hidden">↺ REFILL</button>
                </div>
                ${dropdownsHTML ? `<div class="hud-center">${dropdownsHTML}</div>` : ''}
                <div style="display:flex; gap:10px; justify-content:flex-end;">
                    <button class="hud-btn" id="sys-btn-sound" title="Toggle Sound">
                        <img src="../../system/images/icons/${this.isMuted ? 'mute' : 'sound'}.png" class="hud-icon">
                    </button>
                    <button class="hud-btn" id="sys-btn-menu" title="Menu">
                        <img src="../../system/images/icons/settings.png" class="hud-icon">
                    </button>
                    <button class="hud-btn" id="sys-btn-home" title="Return to Casino">
                        <img src="../../system/images/icons/home.png" class="hud-icon">
                    </button>
                </div>
            </div>
            
            <div id="sys-modal" class="sys-hidden">
                <div class="sys-modal-box">
                    <h2>${config.gameName || 'CASINO OS'}</h2>
                    
                    <div class="sys-section">
                        <h3>📖 HOW TO PLAY</h3>
                        <p class="sys-rules-text">${config.rules || 'Rules not loaded.'}</p>
                    </div>

                    ${config.customToggles ? `
                        <div class="sys-section" id="sys-custom-settings">
                            <h3>⚙️ TABLE SETTINGS</h3>
                            ${config.customToggles}
                        </div>
                    ` : ''}

                    <div class="sys-section sys-danger-zone">
                        <h3>⚠️ DANGER ZONE</h3>
                        <p class="sys-rules-text" style="margin-bottom:10px;">Reset your progress, streak, and settings for this game.</p>
                        <button class="sys-btn btn-nuke" id="sys-reset-game-btn">RESET GAME PROGRESS</button>
                    </div>
                    
                    <button id="sys-close-btn">BACK TO GAME</button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('afterbegin', hudHTML);
        
        // Add padding dynamically if not already applied
        document.body.classList.add('game-wrapper-padding');

        this.bindEvents();
    },

    bindEvents: function() {
        document.getElementById('sys-btn-home').addEventListener('click', () => {
            this.playSound('click');
            window.location.href = '../../index.html'; 
        });

        document.getElementById('sys-btn-sound').addEventListener('click', (e) => {
            this.isMuted = !this.isMuted;
            localStorage.setItem("casino_muted", this.isMuted);
            let iconImg = e.target.tagName === 'IMG' ? e.target : e.target.querySelector('img');
            if (iconImg) {
                iconImg.src = `../../system/images/icons/${this.isMuted ? 'mute' : 'sound'}.png`;
            }
            if (!this.isMuted) this.playSound('click');
        });

        document.getElementById('sys-btn-menu').addEventListener('click', () => {
            this.playSound('click');
            document.getElementById('sys-modal').classList.remove('sys-hidden');
        });
        
        document.getElementById('sys-close-btn').addEventListener('click', () => {
            this.playSound('click');
            document.getElementById('sys-modal').classList.add('sys-hidden');
        });

        const refillBtn = document.getElementById('sys-bankrupt-refill');
        if (refillBtn) refillBtn.addEventListener('click', () => this.refillBankroll());
    },

    updateMoneyDisplay: function() {
        const moneyEl = document.getElementById("sys-money");
        if (moneyEl) moneyEl.innerText = this.money;
        localStorage.setItem("blackjack_money", this.money);

        const refillBtn = document.getElementById("sys-bankrupt-refill");
        if (refillBtn) {
            if (this.money <= 0) refillBtn.classList.remove("sys-hidden");
            else refillBtn.classList.add("sys-hidden");
        }
    },

    setupBetting: function(containerId, options = {}) {
        const container = document.getElementById(containerId);
        if(!container) return;

        const { minBet = 5, maxBet = 500, onBet, onClear } = options;

        const html = `
            <div class="sys-betting-zone">
                <div class="sys-bet-info">
                    BET: $<span id="sys-current-bet-display">0</span>
                    <button class="sys-clear-bet" id="sys-clear-bet">CLEAR</button>
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

        container.querySelectorAll(".sys-chip").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const val = parseInt(e.target.dataset.val);
                if(onBet) onBet(val);
                
                // Add a small bounce animation on the specific chip element clicked
                const el = e.target.closest('.sys-chip');
                el.style.transform = "scale(0.85)";
                setTimeout(() => el.style.transform = "scale(1)", 100);
            });
        });

        document.getElementById("sys-clear-bet").addEventListener("click", () => {
            this.playSound('click');
            if(onClear) onClear();
        });
    },

    updateBetDisplay: function(betAmount) {
        const betEl = document.getElementById("sys-current-bet-display");
        if(betEl) betEl.innerText = betAmount;
    },

    enableBetting: function(enable) {
        document.querySelectorAll(".sys-chip, .sys-clear-bet").forEach(btn => {
            btn.disabled = !enable;
        });
    },

    // Only callable when broke — button only visible when money <= 0
    refillBankroll: function() {
        this.money = 1000;
        this.updateMoneyDisplay();
        this.playSound('win');
    },

    getPlayerName: function() {
        return localStorage.getItem("casino_player_name") || "Player";
    },

    // Generates absolute 3D stacks based on an array mapping
    renderTableStacks: function(amount, containerId) {
        const container = document.getElementById(containerId);
        if(!container) return;
        
        container.innerHTML = "";
        if(amount <= 0) return;

        const chipTiers = [
            {val: 1000, cls: 'sys-table-chip-1k'},
            {val: 500, cls: 'sys-table-chip-500'},
            {val: 100, cls: 'sys-table-chip-100'},
            {val: 25, cls: 'sys-table-chip-25'},
            {val: 5, cls: 'sys-table-chip-5'},
            {val: 1, cls: 'sys-table-chip-1'}
        ];

        let remaining = amount;
        
        chipTiers.forEach(tier => {
            let count = Math.floor(remaining / tier.val);
            if(count > 0) {
                let stackContainer = document.createElement("div");
                stackContainer.className = "sys-table-chip-stack";
                
                let renderCount = Math.min(count, 5); 
                
                for(let i=0; i<renderCount; i++) {
                    let chipEl = document.createElement("div");
                    chipEl.className = `sys-table-chip ${tier.cls}`;
                    
                    // The magic calculation to simulate 3D stacking (shifting them up Y-axis)
                    // The isometric chip graphics require ~4px shift per physical chip
                    chipEl.style.bottom = `${i * 4}px`; 
                    
                    if(i === renderCount - 1 && count > 5) {
                        let multi = document.createElement("div");
                        multi.innerText = `x${count}`;
                        multi.style.position = "absolute";
                        multi.style.top = "-15px";
                        multi.style.right = "-20px";
                        multi.style.background = "rgba(0,0,0,0.8)";
                        multi.style.color = "white";
                        multi.style.padding = "2px 5px";
                        multi.style.borderRadius = "5px";
                        multi.style.fontSize = "10px";
                        multi.style.fontWeight = "bold";
                        chipEl.appendChild(multi);
                    }
                    stackContainer.appendChild(chipEl);
                }
                container.appendChild(stackContainer);
                remaining %= tier.val;
            }
        });
    }
};

// ==========================================
// GLOBAL CASINO OS ADDITIONS (MULTIPLAYER MODAL & FULLSCREEN)
// ==========================================

// 1. INJECT GLOBAL MULTIPLAYER LOBBY SYNCHRONOUSLY
if (!document.getElementById("multiplayer-lobby")) {
    const lobbyHTML = `
    <div id="multiplayer-lobby" class="hidden">
      <div class="lobby-box">
        <button id="lobby-close-btn" style="position:absolute; top:10px; right:10px; background:none; border:none; color:#f1c40f; font-size:1.5rem; cursor:pointer; font-family: inherit;">&times;</button>
        <h2 style="font-family: inherit;">MULTIPLAYER ARENA</h2>
        <div class="lobby-section">
          <h3 style="font-family: inherit;">HOST A GAME</h3>
          <button id="btn-create-room" class="lobby-btn primary" style="font-family: inherit;">CREATE NEW ROOM</button>
          <div id="room-code-display" class="hidden">
            <span style="font-family: inherit;">Room Code: </span><span id="host-room-id" class="highlight" style="font-family: inherit;"></span>
            <p class="waiting-text" style="font-family: inherit;">Waiting for opponent...</p>
          </div>
        </div>
        <div class="lobby-divider" style="font-family: inherit;">OR</div>
        <div class="lobby-section">
          <h3 style="font-family: inherit;">JOIN A GAME</h3>
          <input type="text" id="join-room-input" placeholder="Enter 4-Digit Code" maxlength="4" style="font-family: inherit;">
          <button id="btn-join-room" class="lobby-btn secondary" style="font-family: inherit;">JOIN ROOM</button>
        </div>
        <p id="lobby-error-msg" class="error-text" style="font-family: inherit;"></p>
        <button id="btn-cancel-lobby" class="lobby-btn" style="background:#444; margin-top:10px; font-family: inherit;">BACK TO LOCAL PLAY</button>
      </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', lobbyHTML);
}

// 2. FORCE FULLSCREEN ON MOBILE (Triggered on first tap)
const isMobileDevice = window.innerWidth <= 800 || /Mobi|Android/i.test(navigator.userAgent);
if (isMobileDevice) {
    const goFullscreen = () => {
        const doc = document.documentElement;
        if (doc.requestFullscreen && !document.fullscreenElement) {
            doc.requestFullscreen().catch(e => console.log("Fullscreen blocked:", e));
        } else if (doc.webkitRequestFullscreen && !document.webkitFullscreenElement) {
            doc.webkitRequestFullscreen().catch(e => console.log("Fullscreen blocked:", e));
        }
        document.removeEventListener('touchstart', goFullscreen);
        document.removeEventListener('click', goFullscreen);
    };
    
    document.addEventListener('touchstart', goFullscreen, { passive: true });
    document.addEventListener('click', goFullscreen, { passive: true });
}