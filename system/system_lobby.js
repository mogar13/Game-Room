/**
 * CASINO OS - SYSTEM LOBBY MODULE
 * Handles multiplayer room creation, joining, and seat management.
 * Contains both the V2 API and legacy V1 HTML injections for full backward compatibility.
 */

window.SystemLobby = {
    callbacks: {},
    
    setup: function(callbacks) {
        this.callbacks = callbacks || {};
        if (!document.getElementById("v2-lobby-overlay")) this.injectHTML();
        this.bindEvents();
        
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
                    
                    const playSound = (type) => {
                        if (window.SystemAudio) window.SystemAudio.play(type);
                        else if (window.SystemUI) window.SystemUI.playSound(type);
                    };
                    playSound('click');

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
        // Bind exactly once. setup() can run multiple times per page (e.g. a game
        // re-enters online mode), but the handlers read this.callbacks live, so the
        // latest callbacks are always used — re-binding would only stack duplicate
        // listeners and fire onHost/onJoin N times.
        if (this._bound) return;
        this._bound = true;

        const playSound = (type) => {
            if (window.SystemAudio) window.SystemAudio.play(type);
            else if (window.SystemUI) window.SystemUI.playSound(type);
        };

        document.getElementById("v2-btn-close-lobby").addEventListener("click", () => {
            playSound('click');
            this.hide();
            if (this.callbacks.onClose) this.callbacks.onClose();
        });

        document.getElementById("v2-btn-host").addEventListener("click", () => {
            playSound('click');
            if (this.callbacks.onHost) this.callbacks.onHost();
        });

        document.getElementById("v2-btn-join").addEventListener("click", () => {
            playSound('click');
            const code = document.getElementById("v2-join-input").value.trim().toUpperCase();
            if (code.length !== 4) {
                this.showError("CODE MUST BE 4 CHARACTERS");
                return;
            }
            if (this.callbacks.onJoin) this.callbacks.onJoin(code);
        });

        document.getElementById("v2-btn-leave").addEventListener("click", () => {
            playSound('click');
            this.showSetupPhase();
            if (this.callbacks.onLeave) this.callbacks.onLeave();
        });

        document.getElementById("v2-btn-start").addEventListener("click", () => {
            playSound('win');
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
        
        seatsArray.forEach((seat) => {
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
};

// ==========================================
// DROP-IN COMPATIBILITY OVERRIDES
// Bind to SystemUI so legacy or new games can call SystemUI.v2Lobby.setup()
// ==========================================
if (window.SystemUI) {
    window.SystemUI.v2Lobby = window.SystemLobby;
}

// =========================================
// LEGACY HTML INJECTIONS (V1 Multiplayer Lobby)
// Do Not Remove - Needed for backward compatibility of V1 games
// =========================================
// Inject immediately whenever <body> already exists — this script is loaded
// inside <body>, BEFORE the game scripts that bind the lobby's buttons at
// top level. Deferring to DOMContentLoaded made those games (rummy, yahtzee,
// snakes-and-ladders, clue) crash on load with a null addEventListener and
// killed their whole online mode.
if (document.body) {
    injectLegacyLobby();
} else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectLegacyLobby);
} else {
    injectLegacyLobby();
}

function injectLegacyLobby() {
    if (!document.getElementById("multiplayer-lobby")) {
        const lobbyHTML = `
        <div id="multiplayer-lobby" class="hidden">
          <div class="lobby-box">
            <button id="lobby-close-btn" style="position:absolute; top:10px; right:10px; background:none; border:none; color:#f1c40f; font-size:1.5rem; cursor:pointer; font-family: inherit;">&times;</button>
            <h2 style="font-family: inherit;">MULTIPLAYER ARENA</h2>
            <div class="lobby-section">
              <h3 style="font-family: inherit;">HOST A GAME</h3>
              <button id="btn-create-room" class="lobby-btn primary" style="font-family: inherit; margin-bottom: 14px;">CREATE NEW ROOM</button>
              <div id="room-code-display" class="hidden">
                <span style="font-family: inherit;">Room Code: </span><span id="host-room-id" class="highlight" style="font-family: inherit;"></span>
                <button id="btn-copy-code" style="background:#f1c40f;color:#000;border:none;border-radius:6px;padding:4px 12px;font-weight:bold;cursor:pointer;font-size:0.8rem;font-family:inherit;margin-bottom:6px;">📋 COPY</button>
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

        document.getElementById('btn-copy-code').addEventListener('click', function() {
            const code = document.getElementById('host-room-id').textContent.trim();
            if (!code) return;
            navigator.clipboard.writeText(code).catch(() => {});
            this.textContent = '✓ COPIED!';
            setTimeout(() => { this.textContent = '📋 COPY'; }, 2000);
        });

        document.getElementById('btn-create-room').addEventListener('click', function() {
            this.disabled = true;
            this.textContent = '⏳ CREATING...';
            setTimeout(() => {
                this.disabled = false;
                this.textContent = 'CREATE NEW ROOM';
            }, 4000);
        }, true); 
    }
}