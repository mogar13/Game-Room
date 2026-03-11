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
    },

    injectHTML: function() {
        const html = `
            <div id="v2-lobby-overlay" class="sys-hidden">
                <div class="v2-lobby-box">
                    <button id="v2-btn-close-lobby" style="position:absolute; top:10px; right:10px; background:none; border:none; color:#f1c40f; font-size:1.5rem; cursor:pointer;">&times;</button>
                    <h2 class="v2-lobby-title">MULTIPLAYER ARENA</h2>
                    
                    <div id="v2-setup-phase">
                        <div class="v2-lobby-section">
                            <h3 class="v2-lobby-subtitle">HOST A GAME</h3>
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
if (document.readyState === "loading") {
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