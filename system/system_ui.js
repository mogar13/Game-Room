/**
 * CASINO OS - MAIN CONTROLLER (v2.1)
 * Acts as the Event Hub and API wrapper for all games.
 * Preserves 100% backward compatibility with V1 games.
 */

window.SystemUI = {
    // ==========================================
    // 1. EVENT SYSTEM (PUB/SUB)
    // ==========================================
    events: {},
    
    on: function(event, listener) {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(listener);
    },
    
    emit: function(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(listener => listener(data));
        }
    },

    // ==========================================
    // 2. BACKWARD COMPATIBILITY WRAPPERS
    // ==========================================
    
    // Legacy games call SystemUI.money. This routes it to SystemProfile safely.
    get money() {
        return window.SystemProfile ? window.SystemProfile.getMoney() : parseInt(localStorage.getItem("blackjack_money")) || 5000;
    },
    
    set money(val) {
        if (window.SystemProfile) {
            window.SystemProfile.setMoney(val);
        } else {
            localStorage.setItem("blackjack_money", val);
        }
    },

    // Legacy games call SystemUI.isMuted. This routes to SystemAudio.
    get isMuted() {
        return window.SystemAudio ? window.SystemAudio.isMuted : localStorage.getItem("casino_muted") === "true";
    },

    set isMuted(val) {
        if (window.SystemAudio) {
            window.SystemAudio.isMuted = val;
            localStorage.setItem("casino_muted", val);
        } else {
            localStorage.setItem("casino_muted", val);
        }
    },

    playSound: function(type) {
        if (window.SystemAudio) {
            window.SystemAudio.play(type);
        }
    },

    getPlayerName: function() {
        return window.SystemProfile ? window.SystemProfile.getPlayerName() : (localStorage.getItem("casino_player_name") || "Player");
    },

    // ==========================================
    // 3. CORE UI INITIALIZATION
    // ==========================================

    init: function(config = {}) {
        // Set the browser tab favicon from the ?icon= URL param injected by the hub
        const urlIcon = new URLSearchParams(window.location.search).get('icon');
        if (urlIcon) {
            let link = document.querySelector("link[rel~='icon']");
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            // icon path is relative to the game folder (games/gamename/) so step up two levels
            link.href = '../../' + urlIcon;
        }

        const dropdownsHTML = (config.hudDropdowns || []).map(d => `
            <select id="${d.id}" class="hud-dropdown" title="${d.label || ''}" autocomplete="off">
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
                    <button class="hud-btn" id="sys-btn-chat" title="Chat" style="font-size:0.7rem; font-weight:bold; width:32px; height:32px; letter-spacing:-0.5px;">
                        CHAT
                        <span id="sys-chat-badge"></span>
                    </button>
                    <button class="hud-btn" id="sys-btn-bug" title="Report a Bug" style="background: rgba(231, 76, 60, 0.1); border: 1px solid #e74c3c; color: #e74c3c; padding: 2px 5px; font-size: 1rem;">
                        🐞
                    </button>
                    <button class="hud-btn" id="sys-btn-sound" title="Toggle Sound">
                        <img id="sys-sound-icon" src="../../system/images/icons/${this.isMuted ? 'mute' : 'sound'}.png" class="hud-icon">
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

            <div id="sys-bug-modal" class="sys-hidden" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(10, 4, 16, 0.95); z-index: 1000; display: flex; align-items: center; justify-content: center;">
                <div class="sys-bug-modal-box">
                    <button id="sys-close-bug-btn" style="position: absolute; top: 10px; right: 15px; background: none; border: none; color: #e74c3c; font-size: 2rem; cursor: pointer; line-height: 1;">&times;</button>
                    <h2 style="color: #e74c3c; font-family: 'Orbitron', sans-serif; margin: 0 0 10px 0; text-align: center; letter-spacing: 2px;">🐞 REPORT BUG</h2>
                    <p style="color: #aaa; font-size: 0.75rem; text-align: center; margin-bottom: 15px;">Found a glitch in ${config.gameName || 'this game'}? Let us know.</p>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <input type="text" id="sys-bug-title" placeholder="Short Title (e.g. Card didn't flip)" maxlength="50" class="sys-bug-input" autocomplete="off">
                        <textarea id="sys-bug-desc" placeholder="Describe what happened..." class="sys-bug-input" style="resize: vertical; min-height: 100px;"></textarea>
                        <div id="sys-bug-error" class="sys-hidden" style="color: #e74c3c; font-size: 0.85rem; font-weight: bold; text-align: center;">Error</div>
                        <div id="sys-bug-success" class="sys-hidden" style="color: #2ecc71; font-size: 0.85rem; font-weight: bold; text-align: center;">Bug reported! Thank you!</div>
                        <button id="sys-btn-submit-bug" class="sys-btn" style="background: #e74c3c; border: none; box-shadow: 0 0 15px rgba(231, 76, 60, 0.3);">SUBMIT REPORT</button>
                    </div>
                </div>
            </div>
            
            <div id="sys-loadout-modal" class="sys-hidden" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(10, 4, 16, 0.95); z-index: 1001; display: flex; align-items: center; justify-content: center;">
                <div class="sys-modal-box" style="width: 90%; max-width: 400px; max-height: 80vh; overflow-y: auto;">
                    <button id="sys-close-loadout-btn" style="position: absolute; top: 10px; right: 15px; background: none; border: none; color: #f1c40f; font-size: 2rem; cursor: pointer; line-height: 1;">&times;</button>
                    <h2 style="color: #f1c40f; font-family: 'Orbitron', sans-serif; margin: 0 0 15px 0; text-align: center; letter-spacing: 2px;">🎨 MY STYLE</h2>
                    <div id="sys-loadout-content" style="display: flex; flex-direction: column; gap: 15px;"></div>
                </div>
            </div>

            <div id="sys-hub-menu" class="sys-hidden">
                <div class="sys-hub-menu-box">
                    <div class="sys-hub-menu-title">${config.gameName || 'CASINO OS'}</div>
                    <div class="sys-hub-menu-divider"></div>
                    <button class="sys-hub-menu-btn" id="sys-hm-resume">▶&nbsp;&nbsp;RESUME GAME</button>
                    <button class="sys-hub-menu-btn" id="sys-hm-restart">🔄&nbsp;&nbsp;RESTART GAME</button>
                    <button class="sys-hub-menu-btn" id="sys-hm-info">📖&nbsp;&nbsp;GAME INFO</button>
                    <button class="sys-hub-menu-btn" id="sys-hm-style">🎨&nbsp;&nbsp;MY STYLE</button>
                    <div class="sys-hub-menu-divider"></div>
                    <button class="sys-hub-menu-btn sys-hub-menu-btn-exit" id="sys-hm-exit">🏠&nbsp;&nbsp;RETURN TO LIBRARY</button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('afterbegin', hudHTML);
        document.body.classList.add('game-wrapper-padding');

        this.bindEvents();

        // Always default mode dropdowns to 'ai' on page load.
        setTimeout(() => {
            document.querySelectorAll('.hud-dropdown').forEach(sel => {
                if ([...sel.options].some(o => o.value === 'ai')) sel.value = 'ai';
            });
        }, 0);

        // If launched with ?mode=online from the hub, auto-trigger the online mode dropdown.
        // Runs at 60ms so it fires after both the ai-default (0ms) and game's own sync (50ms).
        const urlMode = new URLSearchParams(window.location.search).get('mode');
        const urlJoin = new URLSearchParams(window.location.search).get('join');
        if (urlMode) {
            // Run at 100ms — after the ai-default (0ms) and game's own sync (50ms).
            // Find specifically the dropdown that HAS the requested mode as an option,
            // so we never accidentally target the difficulty or other dropdowns.
            setTimeout(() => {
                const allDropdowns = document.querySelectorAll('.hud-dropdown');
                let modeDropdown = null;
                allDropdowns.forEach(sel => {
                    if ([...sel.options].some(o => o.value === urlMode)) {
                        modeDropdown = sel;
                    }
                });
                if (modeDropdown) {
                    modeDropdown.value = urlMode;
                    modeDropdown.dispatchEvent(new Event('change'));
                }
                
                // Auto-join fires after mode change has opened the lobby overlay
                if (urlJoin) {
                    setTimeout(() => {
                        const joinInput = document.getElementById("v2-join-input");
                        const joinBtn = document.getElementById("v2-btn-join");
                        if (joinInput && joinBtn) {
                            joinInput.value = urlJoin.toUpperCase();
                            joinBtn.click();
                        }
                    }, 300);
                }
            }, 100);
        }

        // Listen for internal profile changes to auto-update HUD
        this.on("money_changed", (newAmount) => this.updateMoneyDisplay());
        
        // Listen for internal audio changes to auto-update Sound Icon
        this.on("audio_muted_changed", (isMuted) => {
            const iconImg = document.getElementById('sys-sound-icon');
            if (iconImg) iconImg.src = `../../system/images/icons/${isMuted ? 'mute' : 'sound'}.png`;
        });
    },

    bindEvents: function() {
        document.getElementById('sys-btn-home').addEventListener('click', () => {
            this.playSound('click');
            this.openHubMenu();
        });

        document.getElementById('sys-btn-sound').addEventListener('click', (e) => {
            if (window.SystemAudio) {
                window.SystemAudio.toggleMute();
            } else {
                this.isMuted = !this.isMuted;
                let iconImg = document.getElementById('sys-sound-icon');
                if (iconImg) iconImg.src = `../../system/images/icons/${this.isMuted ? 'mute' : 'sound'}.png`;
                if (!this.isMuted) this.playSound('click');
            }
        });

        document.getElementById('sys-btn-menu').addEventListener('click', () => {
            this.playSound('click');
            document.getElementById('sys-modal').classList.remove('sys-hidden');
        });
        
        document.getElementById('sys-close-btn').addEventListener('click', () => {
            this.playSound('click');
            document.getElementById('sys-modal').classList.add('sys-hidden');
        });

        // BUG REPORT EVENTS
        document.getElementById('sys-btn-bug').addEventListener('click', () => {
            this.playSound('click');
            document.getElementById('sys-bug-title').value = "";
            document.getElementById('sys-bug-desc').value = "";
            document.getElementById('sys-bug-error').classList.add('sys-hidden');
            document.getElementById('sys-bug-success').classList.add('sys-hidden');
            document.getElementById('sys-bug-modal').classList.remove('sys-hidden');
        });

        document.getElementById('sys-close-bug-btn').addEventListener('click', () => {
            this.playSound('click');
            document.getElementById('sys-bug-modal').classList.add('sys-hidden');
        });

        document.getElementById('sys-btn-submit-bug').addEventListener('click', () => {
            this.playSound('click');
            const title = document.getElementById("sys-bug-title").value.trim();
            const desc = document.getElementById("sys-bug-desc").value.trim();
            const errorEl = document.getElementById("sys-bug-error");
            const successEl = document.getElementById("sys-bug-success");
            
            if (!title || !desc) {
                errorEl.innerText = "Please fill out both fields.";
                errorEl.classList.remove("sys-hidden");
                return;
            }
            
            if (!window.dbUpdate || !window.dbRef || !window.db) {
                errorEl.innerText = "Database connection error.";
                errorEl.classList.remove("sys-hidden");
                return;
            }
            
            const username = this.getPlayerName();
            const gameId = window.location.pathname.split('/').slice(-2, -1)[0] || 'unknown';
            const reportId = "bug_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
            
            const payload = {
                title: title,
                description: desc,
                reportedBy: username,
                game: gameId,
                timestamp: Date.now(),
                userAgent: navigator.userAgent,
                status: "open"
            };
            
            window.dbUpdate(window.dbRef(window.db, `bug_reports/${reportId}`), payload)
                .then(() => {
                    errorEl.classList.add("sys-hidden");
                    successEl.classList.remove("sys-hidden");
                    setTimeout(() => document.getElementById('sys-bug-modal').classList.add('sys-hidden'), 2000);
                })
                .catch(() => {
                    errorEl.innerText = "Submission failed.";
                    errorEl.classList.remove("sys-hidden");
                });
        });
        
        document.getElementById('sys-hm-style').addEventListener('click', () => {
            this.playSound('click');
            this.closeHubMenu();
            this.openLoadoutModal();
        });

        document.getElementById('sys-close-loadout-btn').addEventListener('click', () => {
            this.playSound('click');
            document.getElementById('sys-loadout-modal').classList.add('sys-hidden');
        });

        const refillBtn = document.getElementById('sys-bankrupt-refill');
        if (refillBtn) refillBtn.addEventListener('click', () => this.refillBankroll());

        const chatBtn = document.getElementById('sys-btn-chat');
        if (chatBtn) chatBtn.addEventListener('click', () => {
            if (this._chatOpen) this.closeChat();
            else this.openChat();
        });

        document.getElementById('sys-hm-resume').addEventListener('click', () => {
            this.playSound('click');
            this.closeHubMenu();
        });

        document.getElementById('sys-hm-restart').addEventListener('click', () => {
            this.playSound('click');
            this.closeHubMenu();
            const resetBtn = document.getElementById('sys-reset-game-btn');
            if (resetBtn) resetBtn.click();
        });

        document.getElementById('sys-hm-info').addEventListener('click', () => {
            this.playSound('click');
            this.closeHubMenu();
            document.getElementById('sys-modal').classList.remove('sys-hidden');
        });

        document.getElementById('sys-hm-exit').addEventListener('click', () => {
            this.playSound('exit');
            setTimeout(() => {
                if (window.self !== window.top) {
                    window.parent.postMessage({ type: 'CASINO_OS_CLOSE_GAME' }, '*');
                } else {
                    window.location.href = '../../index.html';
                }
            }, 150);
        });
    },

    updateMoneyDisplay: function() {
        const moneyEl = document.getElementById("sys-money");
        if (moneyEl) moneyEl.innerText = this.money;

        const refillBtn = document.getElementById("sys-bankrupt-refill");
        if (refillBtn) {
            if (this.money <= 0) refillBtn.classList.remove("sys-hidden");
            else refillBtn.classList.add("sys-hidden");
        }
    },

    refillBankroll: function() {
        this.money = 1000;
        this.updateMoneyDisplay();
        this.playSound('win');
    },

    openHubMenu: function() {
        document.getElementById('sys-hub-menu').classList.remove('sys-hidden');
    },

    closeHubMenu: function() {
        document.getElementById('sys-hub-menu').classList.add('sys-hidden');
    },

    openLoadoutModal: function() {
        const modal = document.getElementById('sys-loadout-modal');
        const content = document.getElementById('sys-loadout-content');
        if (!modal || !content) return;

        const profile = window.SystemProfile ? window.SystemProfile.getProfile() : {};
        const inv = profile.inventory || [];
        const loadout = window.SystemProfile && window.SystemProfile.getLoadout ? window.SystemProfile.getLoadout() : {};

        const categories = {
            cardback: { label: "Card Backs", items: [] },
            deck: { label: "Card Faces", items: [] },
            dice: { label: "Dice", items: [] }
        };

        const catalogFallback = {
            'back_b1': { name: 'Blue Back 1', type: 'cardback' },
            'back_b2': { name: 'Blue Back 2', type: 'cardback' },
            'back_b3': { name: 'Blue Back 3', type: 'cardback' },
            'back_b4': { name: 'Blue Back 4', type: 'cardback' },
            'back_b5': { name: 'Blue Back 5', type: 'cardback' },
            'back_r1': { name: 'Red Back 1', type: 'cardback' },
            'back_r2': { name: 'Red Back 2', type: 'cardback' },
            'back_r3': { name: 'Red Back 3', type: 'cardback' },
            'back_r4': { name: 'Red Back 4', type: 'cardback' },
            'back_r5': { name: 'Red Back 5', type: 'cardback' },
            'back_g1': { name: 'Green Back 1', type: 'cardback' },
            'back_g2': { name: 'Green Back 2', type: 'cardback' },
            'back_g3': { name: 'Green Back 3', type: 'cardback' },
            'back_g4': { name: 'Green Back 4', type: 'cardback' },
            'back_g5': { name: 'Green Back 5', type: 'cardback' },
            'back_j2': { name: 'Jumbo Red', type: 'cardback' },
            'back_j3': { name: 'Jumbo Gold', type: 'cardback' },
            'back_j4': { name: 'Jumbo Purple', type: 'cardback' },
            'back_j5': { name: 'Jumbo Dark', type: 'cardback' },
            'back_j6': { name: 'Jumbo Light', type: 'cardback' },
            'back_j7': { name: 'Jumbo Hex', type: 'cardback' },
            'back_j8': { name: 'Jumbo Tech', type: 'cardback' },
            'deck_alt': { name: 'Jumbo Deck', type: 'deck' },
            'dice_red': { name: 'Red Casino Dice', type: 'dice' },
            'dice_gold': { name: 'Gold Dice', type: 'dice' }
        };

        inv.forEach(itemId => {
            let itemData = null;
            if (window.SystemStore && window.SystemStore.CATALOG && window.SystemStore.CATALOG[itemId]) {
                itemData = window.SystemStore.CATALOG[itemId];
            } else if (catalogFallback[itemId]) {
                itemData = catalogFallback[itemId];
                itemData.id = itemId;
            }

            if (itemData && categories[itemData.type]) {
                categories[itemData.type].items.push({ id: itemId, name: itemData.name });
            }
        });

        let html = '';
        Object.keys(categories).forEach(type => {
            const cat = categories[type];
            if (cat.items.length === 0) return;
            
            html += `<div style="margin-bottom: 10px;">
                        <div style="color: #aaa; font-size: 0.8rem; font-weight: bold; margin-bottom: 5px; text-transform: uppercase;">${cat.label}</div>
                        <div style="display: flex; flex-direction: column; gap: 5px;">`;
            
            const isDefaultEquipped = !loadout[type];
            html += `<button class="sys-btn sys-loadout-btn" data-type="${type}" data-id="" style="background: ${isDefaultEquipped ? '#2ecc71' : 'transparent'}; color: ${isDefaultEquipped ? '#000' : '#fff'}; border: 1px solid ${isDefaultEquipped ? '#2ecc71' : '#555'}; text-align: left; padding: 8px 12px; font-size: 0.9rem;">
                        ${isDefaultEquipped ? '✓ ' : ''}Default
                     </button>`;

            cat.items.forEach(item => {
                const isEquipped = loadout[type] === item.id;
                html += `<button class="sys-btn sys-loadout-btn" data-type="${type}" data-id="${item.id}" style="background: ${isEquipped ? '#2ecc71' : 'transparent'}; color: ${isEquipped ? '#000' : '#fff'}; border: 1px solid ${isEquipped ? '#2ecc71' : '#555'}; text-align: left; padding: 8px 12px; font-size: 0.9rem;">
                            ${isEquipped ? '✓ ' : ''}${item.name}
                         </button>`;
            });
            html += `</div></div>`;
        });

        if (html === '') {
            html = `<div style="text-align: center; color: #888; font-size: 0.9rem; padding: 20px;">You don't own any table cosmetics yet. Visit the Store in the Hub to buy some!</div>`;
        }

        content.innerHTML = html + `<div style="color: #f1c40f; font-size: 0.75rem; text-align: center; margin-top: 10px;">Note: Changes apply on the next hand/round.</div>`;

        content.querySelectorAll('.sys-loadout-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.playSound('click');
                const type = e.currentTarget.dataset.type;
                const id = e.currentTarget.dataset.id || null;
                if (window.SystemProfile && window.SystemProfile.setLoadout) {
                    window.SystemProfile.setLoadout(type, id);
                    if (window.SystemAuth && window.SystemAuth.isLoggedIn()) {
                        window.SystemAuth.saveCurrentUserData();
                    }
                    this.openLoadoutModal(); 
                }
            });
        });

        modal.classList.remove('sys-hidden');
    },

    // ==========================================
    // 4. UNIVERSAL BETTING SYSTEM
    // ==========================================

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

    // ==========================================
    // 5. V2 MULTIPLAYER LOBBY API
    // ==========================================
    v2Lobby: {
        callbacks: {},
        _bound: false,
        
        setup: function(callbacks) {
            this.callbacks = callbacks || {};
            if (!document.getElementById("v2-lobby-overlay")) this.injectHTML();
            // Guard: only bind DOM event listeners once — subsequent setup() calls
            // (e.g. after game reset) only update the callbacks, never re-bind.
            if (!this._bound) {
                this.bindEvents();
                this._bound = true;
            }
            
            const settingsContainer = document.getElementById("v2-custom-host-settings");
            if (settingsContainer) {
                settingsContainer.innerHTML = "";
                if (this.callbacks.settingsConfig && this.callbacks.settingsConfig.length > 0) {
                    let html = '<div id="v2-host-settings-wrapper" style="width: 100%; background: #111118; border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 18px 16px 14px; display: flex; flex-direction: column; gap: 16px; margin-bottom: 15px; box-sizing: border-box; transition: opacity 0.3s;">';
                    
                    this.callbacks.settingsConfig.forEach(setting => {
                        html += `<div class="ss-row" style="display: flex; flex-direction: column; gap: 8px;">
                            <div class="ss-label" style="font-size: 0.52rem; font-weight: 700; letter-spacing: 4px; color: rgba(255,255,255,0.35); text-align: left;">${setting.label}</div>
                            <div class="ss-pills" style="display: flex; flex-wrap: wrap; gap: 6px;">`;
                        
                        setting.options.forEach(opt => {
                            const isColor = setting.type === 'color';
                            const activeClass = opt.value == setting.default ? 'active' : '';
                            if (isColor) {
                                html += `<button class="ss-color-chip v2-setting-btn ${activeClass}" data-key="${setting.id}" data-val="${opt.value}" style="background:${opt.color}; width: 28px; height: 28px; border-radius: 50%; border: 3px solid transparent; cursor: pointer; outline: none; transition: all 0.15s;" title="${opt.label}"></button>`;
                            } else {
                                html += `<button class="ss-chip v2-setting-btn ${activeClass}" data-key="${setting.id}" data-val="${opt.value}" style="font-family: inherit; font-size: 0.62rem; font-weight: 700; letter-spacing: 1px; padding: 6px 14px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: rgba(255,255,255,0.45); cursor: pointer; transition: all 0.15s;">${opt.label}</button>`;
                            }
                        });
                        html += `</div></div>`;
                    });

                    // Add dynamic slot preview area
                    html += `
                        <div class="ss-row" style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.07); padding-top: 15px;">
                            <div class="ss-label" style="font-size: 0.52rem; font-weight: 700; letter-spacing: 4px; color: rgba(255,255,255,0.35); text-align: left;">LOBBY PREVIEW</div>
                            <div id="v2-lobby-slot-preview" style="display: flex; flex-direction: column; gap: 6px;"></div>
                        </div>
                    </div>`;
                    
                    settingsContainer.innerHTML = html;

                    // Bind click events to the new setting buttons
                    const wrapper = document.getElementById("v2-host-settings-wrapper");
                    wrapper.addEventListener("click", (e) => {
                        const btn = e.target.closest(".v2-setting-btn");
                        if (!btn) return;
                        
                        SystemUI.playSound('click');
                        const key = btn.dataset.key;
                        const val = btn.dataset.val;
                        
                        // Update active class for this specific group
                        wrapper.querySelectorAll(`.v2-setting-btn[data-key="${key}"]`).forEach(b => b.classList.remove("active"));
                        btn.classList.add("active");
                        
                        // Trigger callback
                        if (this.callbacks.onSettingChange) {
                            this.callbacks.onSettingChange(key, val);
                        }
                    });
                    
                    // Initial render of preview
                    if (this.callbacks.onSettingsRendered) {
                        this.callbacks.onSettingsRendered();
                    }
                } else if (this.callbacks.customHostHTML) {
                    // Fallback for older games using raw HTML
                    settingsContainer.innerHTML = this.callbacks.customHostHTML;
                    if (this.callbacks.onSettingsRendered) this.callbacks.onSettingsRendered();
                }
            }

            // Guest Lockout Logic
            const joinInput = document.getElementById("v2-join-input");
            const hostSettings = document.getElementById("v2-host-settings-wrapper") || document.getElementById("v2-custom-host-settings");
            if (joinInput && hostSettings) {
                joinInput.oninput = (e) => {
                    if (e.target.value.length > 0) {
                        hostSettings.style.opacity = "0.3";
                        hostSettings.style.pointerEvents = "none";
                    } else {
                        hostSettings.style.opacity = "1";
                        hostSettings.style.pointerEvents = "auto";
                    }
                };
            }
        },

        updatePreview: function(slotsArray) {
            const container = document.getElementById("v2-lobby-slot-preview");
            if (!container) return;
            container.innerHTML = "";
            
            slotsArray.forEach(slot => {
                const isHost = slot.type === "host";
                const icon = isHost ? "👤" : "🤖";
                const title = isHost ? slot.name : slot.name + " (Open)";
                const status = isHost ? "HOST" : "JOINABLE";
                const statusColor = isHost ? "#aaa" : "#3498db";
                const bgOpacity = isHost ? "0.4" : "0.2";
                
                container.innerHTML += `
                    <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,${bgOpacity}); padding: 8px 12px; border-radius: 6px; border-left: 4px solid ${slot.color};">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 1.1rem; ${isHost ? '' : 'filter: grayscale(1); opacity: 0.7;'}">${icon}</span>
                            <span style="font-size: 0.8rem; font-weight: bold; color: ${isHost ? '#fff' : '#aaa'}; font-family: inherit;">${title}</span>
                        </div>
                        <span style="font-size: 0.6rem; color: ${statusColor}; letter-spacing: 1px; font-family: inherit; font-weight: bold;">${status}</span>
                    </div>
                `;
            });
        },

        injectHTML: function() {
            const html = `
                <style>
                    .v2-setting-btn.ss-chip.active { border-color: #00e5c8 !important; background: #00e5c8 !important; color: #000 !important; }
                    .v2-setting-btn.ss-color-chip.active { border-color: #fff !important; box-shadow: 0 0 0 2px rgba(255,255,255,0.5) !important; transform: scale(1.15) !important; }
                </style>
                <div id="v2-lobby-overlay" class="sys-hidden">
                    <div class="v2-lobby-box" style="max-height: 85vh; overflow-y: auto; overflow-x: hidden;">
                        <button id="v2-btn-close-lobby" style="position:absolute; top:10px; right:10px; background:none; border:none; color:#f1c40f; font-size:1.5rem; cursor:pointer;">&times;</button>
                        <h2 class="v2-lobby-title">MULTIPLAYER ARENA</h2>
                        
                        <div id="v2-setup-phase">
                            <div class="v2-lobby-section">
                                <h3 class="v2-lobby-subtitle">HOST A GAME</h3>
                                <div id="v2-custom-host-settings"></div>
                                <button id="v2-btn-host" class="v2-btn v2-btn-primary">CREATE NEW ROOM</button>
                            </div>
                            <div class="v2-lobby-divider">OR</div>
                            <div class="v2-lobby-section">
                                <h3 class="v2-lobby-subtitle">JOIN A GAME</h3>
                                <input type="text" id="v2-join-input" class="v2-join-input" placeholder="Enter 4-Digit Code" maxlength="4" autocomplete="off">
                                <button id="v2-btn-join" class="v2-btn v2-btn-join">JOIN ROOM</button>
                            </div>
                            <div id="v2-error-msg" style="color: #e74c3c; font-size: 0.85rem; margin-top: 15px; min-height: 15px; font-weight: bold;"></div>
                        </div>

                        <div id="v2-room-phase" class="sys-hidden">
                            <div class="v2-lobby-section">
                                <h3 class="v2-lobby-subtitle">ROOM CODE</h3>
                                <span id="v2-code-display" class="v2-code-display">----</span>
                                <button id="v2-btn-copy-code" style="background:#f1c40f;color:#000;border:none;border-radius:6px;padding:4px 12px;font-weight:bold;cursor:pointer;font-size:0.8rem;margin-bottom:6px;">📋 COPY</button>
                            </div>
                            
                            <div id="v2-seat-list" class="v2-seat-list">
                                </div>
                            
                            <div class="v2-lobby-actions">
                                <button id="v2-btn-start" class="v2-btn v2-btn-start sys-hidden">START GAME</button>
                                <button id="v2-btn-leave" class="v2-btn v2-btn-leave">BACK TO LOCAL PLAY</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', html);
        },

        bindEvents: function() {
            document.getElementById("v2-btn-close-lobby").addEventListener("click", () => {
                SystemUI.playSound('click');
                this.hide();
                if (this.callbacks.onClose) this.callbacks.onClose();
            });

            document.getElementById("v2-btn-host").addEventListener("click", () => {
                SystemUI.playSound('click');
                if (this.callbacks.onHost) this.callbacks.onHost();
            });

            document.getElementById("v2-btn-join").addEventListener("click", () => {
                SystemUI.playSound('click');
                const code = document.getElementById("v2-join-input").value.trim().toUpperCase();
                if (code.length !== 4) {
                    this.showError("CODE MUST BE 4 CHARACTERS");
                    return;
                }
                if (this.callbacks.onJoin) this.callbacks.onJoin(code);
            });

            document.getElementById("v2-btn-leave").addEventListener("click", () => {
                SystemUI.playSound('click');
                this.showSetupPhase();
                if (this.callbacks.onLeave) this.callbacks.onLeave();
            });

            document.getElementById("v2-btn-start").addEventListener("click", () => {
                SystemUI.playSound('win');
                if (this.callbacks.onStart) this.callbacks.onStart();
            });

            document.getElementById("v2-btn-copy-code").addEventListener("click", (e) => {
                const code = document.getElementById("v2-code-display").innerText;
                navigator.clipboard.writeText(code).catch(()=>{});
                e.target.innerText = "✓ COPIED!";
                setTimeout(() => e.target.innerText = "📋 COPY", 2000);
            });
        },

        show: function() {
            document.getElementById("v2-lobby-overlay").classList.remove("sys-hidden");
            this.showSetupPhase();
        },

        hide: function() {
            document.getElementById("v2-lobby-overlay").classList.add("sys-hidden");
        },

        showSetupPhase: function() {
            document.getElementById("v2-setup-phase").classList.remove("sys-hidden");
            document.getElementById("v2-room-phase").classList.add("sys-hidden");
            document.getElementById("v2-error-msg").innerText = "";
            document.getElementById("v2-join-input").value = "";
        },

        showRoomPhase: function(roomCode, isHost) {
            document.getElementById("v2-setup-phase").classList.add("sys-hidden");
            document.getElementById("v2-room-phase").classList.remove("sys-hidden");
            document.getElementById("v2-code-display").innerText = roomCode;
            
            const startBtn = document.getElementById("v2-btn-start");
            if (isHost) startBtn.classList.remove("sys-hidden");
            else startBtn.classList.add("sys-hidden");
        },

        showError: function(msg) {
            document.getElementById("v2-error-msg").innerText = msg;
        },

        renderSeats: function(seatsArray) {
            const list = document.getElementById("v2-seat-list");
            list.innerHTML = "";
            
            seatsArray.forEach((seat, index) => {
                const isHuman = seat.type === "human";
                const icon = isHuman ? "👤" : "🤖";
                
                const html = `
                    <div class="v2-seat ${seat.type}">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:1.2rem;">${icon}</span>
                            <span class="v2-seat-name">${seat.name}</span>
                        </div>
                        <span class="v2-seat-type">${seat.type}</span>
                    </div>
                `;
                list.insertAdjacentHTML('beforeend', html);
            });
        }
    },

    // ==========================================
    // 6. IN-GAME CHAT
    // ==========================================
    _chatRoomId: null,
    _chatPlayerName: null,
    _chatListener: null,
    _chatOpen: false,
    _chatUnread: false,
    _chatLastKey: null,

    startChat: function(roomId, playerName) {
        this._chatRoomId = roomId;
        this._chatPlayerName = playerName || this.getPlayerName();

        document.getElementById('sys-chat-messages').innerHTML = '';
        this._chatLastKey = null;
        this._chatUnread = false;

        const btn = document.getElementById('sys-btn-chat');
        if (btn) btn.classList.add('chat-visible');
        this._updateBadge(false);

        this._addSystemMessage('Connected to room ' + roomId);

        const msgRef = window.dbRef(window.db, 'chat/' + roomId + '/messages');
        this._chatListener = window.dbOnValue(msgRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            const keys = Object.keys(data).sort();
            keys.forEach(k => {
                if (this._chatLastKey && k <= this._chatLastKey) return;
                const msg = data[k];
                const isMine = msg.from === this._chatPlayerName;
                this._renderBubble(msg.text, msg.from, isMine);
                this._chatLastKey = k;

                if (!this._chatOpen && !isMine) {
                    this._updateBadge(true);
                    this.playSound('message');
                }
            });
        });
    },

    stopChat: function(opts) {
        const clearRemote = !!(opts && opts.clearRemote);
        if (this._chatListener) {
            this._chatListener();
            this._chatListener = null;
        }
        if (clearRemote && this._chatRoomId && window.db) {
            window.dbSet(window.dbRef(window.db, 'chat/' + this._chatRoomId + '/messages'), null);
        }
        this._chatRoomId = null;
        this._chatPlayerName = null;
        this._chatLastKey = null;
        this._chatUnread = false;

        document.getElementById('sys-chat-messages').innerHTML = '';
        const btn = document.getElementById('sys-btn-chat');
        if (btn) btn.classList.remove('chat-visible');
        this._updateBadge(false);
        this.closeChat();
    },

    openChat: function() {
        this._chatOpen = true;
        document.getElementById('sys-chat-panel').classList.add('open');
        document.getElementById('sys-chat-backdrop').classList.add('open');
        this._updateBadge(false);
        const msgs = document.getElementById('sys-chat-messages');
        msgs.scrollTop = msgs.scrollHeight;
        if (window.innerWidth > 600) {
            document.getElementById('sys-chat-input').focus();
        }
    },

    closeChat: function() {
        this._chatOpen = false;
        document.getElementById('sys-chat-panel').classList.remove('open');
        document.getElementById('sys-chat-backdrop').classList.remove('open');
    },

    _sendMessage: function() {
        const input = document.getElementById('sys-chat-input');
        const text = input.value.trim().slice(0, 80);
        if (!text || !this._chatRoomId) return;

        input.value = '';

        const key = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        window.dbSet(
            window.dbRef(window.db, 'chat/' + this._chatRoomId + '/messages/' + key),
            { text: text, from: this._chatPlayerName, ts: Date.now() }
        );
    },

    _renderBubble: function(text, from, isMine) {
        const msgs = document.getElementById('sys-chat-messages');
        const row = document.createElement('div');
        row.className = 'chat-bubble-row ' + (isMine ? 'mine' : 'theirs');

        const sender = document.createElement('div');
        sender.className = 'chat-sender';
        sender.innerText = from;

        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        bubble.innerText = text;

        row.appendChild(sender);
        row.appendChild(bubble);
        msgs.appendChild(row);
        msgs.scrollTop = msgs.scrollHeight;
    },

    _addSystemMessage: function(text) {
        const msgs = document.getElementById('sys-chat-messages');
        const div = document.createElement('div');
        div.className = 'chat-system-msg';
        div.innerText = text;
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
    },

    _updateBadge: function(show) {
        this._chatUnread = show;
        const badge = document.getElementById('sys-chat-badge');
        if (badge) {
            if (show) badge.classList.add('has-unread');
            else badge.classList.remove('has-unread');
        }
    },

    // ==========================================
    // 7. TABLE CHIP RENDERING
    // ==========================================

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

// Note: legacy V1 lobby HTML and the chat panel HTML were previously injected
// here as well. They are now owned by system_lobby.js and system_chat.js
// respectively — keeping a copy here was a race-conditioned duplicate that
// could win the load order and ship inconsistent markup/styling.

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

// ==========================================
// MODULE WIRING
// The system modules (system_betting.js, system_lobby.js, etc.) load BEFORE
// this file in every game page's <script> order. Their own compatibility
// overrides all ran as no-ops because window.SystemUI didn't exist yet when
// they executed. This block is the fix: it runs after window.SystemUI is
// fully defined and wires each loaded module into SystemUI so the rest of
// the codebase (games, hub, etc.) works through the same stable API.
// ==========================================
(function wireSystemModules() {
    // -- Betting module --
    if (window.SystemBetting) {
        window.SystemUI.setupBetting   = function(id, opts) { window.SystemBetting.setup(id, opts); };
        window.SystemUI.updateBetDisplay = function(amt)   { window.SystemBetting.updateDisplay(); };
        window.SystemUI.enableBetting  = function(en)      { window.SystemBetting.enable(en); };
    }

    // -- Lobby module --
    if (window.SystemLobby) {
        window.SystemUI.v2Lobby = window.SystemLobby;
    }

    // -- Chat module --
    if (window.SystemChat) {
        window.SystemUI.startChat   = function(roomId, name) { window.SystemChat.startChat(roomId, name); };
        window.SystemUI.stopChat    = function(opts)         { window.SystemChat.stopChat(opts); };
        window.SystemUI.openChat    = function()             { window.SystemChat.openChat(); };
        window.SystemUI.closeChat   = function()             { window.SystemChat.closeChat(); };
        window.SystemUI._sendMessage = function()            { window.SystemChat.sendMessage(); };
        // Keep the _chatOpen flag in sync between SystemUI and SystemChat
        Object.defineProperty(window.SystemUI, '_chatOpen', {
            get: function() { return window.SystemChat.isOpen; },
            set: function(val) { window.SystemChat.isOpen = val; },
            configurable: true
        });
    }

    // -- Stats module --
    if (window.SystemStats) {
        window.SystemUI.recordGameStart = function(id) { window.SystemStats.recordGameStart(id); };
        window.SystemUI.recordWin       = function(id) { window.SystemStats.recordWin(id); };
        window.SystemUI.recordLoss      = function(id) { window.SystemStats.recordLoss(id); };
        window.SystemUI.recordTie       = function(id) { window.SystemStats.recordTie(id); };
        window.SystemUI.getStats        = function(id) { return window.SystemStats.getStats(id); };
    }

    // -- Achievements module --
    if (window.SystemAchievements) {
        window.SystemUI.unlockAchievement = function(id) { window.SystemAchievements.unlock(id); };
        window.SystemUI.getAchievements   = function()   { return window.SystemAchievements.getUnlocked(); };
    }
})();