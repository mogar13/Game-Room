/**
 * CASINO OS - SYSTEM CHAT MODULE
 * Handles in-game multiplayer chat, Firebase syncing, and the UI slide-out panel.
 */

window.SystemChat = {
    roomId: null,
    playerName: null,
    listener: null,
    isOpen: false,
    hasUnread: false,
    lastKey: null,

    init: function() {
        if (!document.getElementById("sys-chat-panel")) {
            this.injectHTML();
        }
        this.bindEvents();
    },

    injectHTML: function() {
        const chatHTML = `
        <div id="sys-chat-backdrop" class="sys-chat-backdrop"></div>
        <div id="sys-chat-panel" class="sys-chat-panel">
            <div id="sys-chat-header" class="sys-chat-header">
                <span id="sys-chat-header-title" style="font-weight: bold; font-family: 'Orbitron', sans-serif; letter-spacing: 1px;">💬 ROOM CHAT</span>
                <button id="sys-chat-close" style="background: transparent; border: none; color: white; font-size: 1.8rem; cursor: pointer; line-height: 1;">&times;</button>
            </div>
            <div id="sys-chat-messages" class="sys-chat-messages" style="flex-grow: 1; padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;"></div>
            <div id="sys-chat-input-row" class="sys-chat-input-row" style="display: flex; padding: 15px; background: #1a1a1a; gap: 10px; border-top: 1px solid #333;">
                <input id="sys-chat-input" type="text" maxlength="80" placeholder="Say something..." autocomplete="off" style="flex-grow: 1; padding: 12px 15px; border-radius: 25px; border: 1px solid #444; background: #000; color: white; outline: none; font-family: inherit; font-size: 1rem;">
                <button id="sys-chat-send" style="background: #3498db; color: white; border: none; border-radius: 50%; width: 45px; height: 45px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; transition: 0.2s;">&#9658;</button>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', chatHTML);
    },

    bindEvents: function() {
        document.getElementById('sys-chat-close').addEventListener('click', () => this.closeChat());
        document.getElementById('sys-chat-backdrop').addEventListener('click', () => this.closeChat());
        
        document.getElementById('sys-chat-send').addEventListener('click', () => this.sendMessage());
        document.getElementById('sys-chat-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { 
                e.preventDefault(); 
                this.sendMessage(); 
            }
        });
    },

    startChat: function(roomId, playerName) {
        this.roomId = roomId;
        this.playerName = playerName || (window.SystemProfile ? window.SystemProfile.getPlayerName() : "Player");

        document.getElementById('sys-chat-messages').innerHTML = '';
        this.lastKey = null;
        this.hasUnread = false;

        const btn = document.getElementById('sys-btn-chat');
        if (btn) btn.classList.add('chat-visible');
        this.updateBadge(false);

        this.addSystemMessage('Connected to room ' + roomId);

        // Ensure Firebase DB objects exist before attaching listeners
        if (typeof window.dbRef === 'undefined' || typeof window.dbOnValue === 'undefined' || !window.db) {
            console.warn("Casino OS: Firebase DB not initialized. Chat will not connect.");
            return;
        }

        const msgRef = window.dbRef(window.db, 'chat/' + roomId + '/messages');
        this.listener = window.dbOnValue(msgRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            const keys = Object.keys(data).sort();
            keys.forEach(k => {
                if (this.lastKey && k <= this.lastKey) return;
                const msg = data[k];
                const isMine = msg.from === this.playerName;
                this.renderBubble(msg.text, msg.from, isMine);
                this.lastKey = k;

                if (!this.isOpen && !isMine) {
                    this.updateBadge(true);
                    if (window.SystemAudio) window.SystemAudio.play('message');
                    else if (window.SystemUI) window.SystemUI.playSound('message');
                }
            });
        });
    },

    stopChat: function() {
        if (this.listener) {
            this.listener();
            this.listener = null;
        }
        if (this.roomId && window.db && typeof window.dbSet !== 'undefined') {
            window.dbSet(window.dbRef(window.db, 'chat/' + this.roomId + '/messages'), null);
        }
        this.roomId = null;
        this.playerName = null;
        this.lastKey = null;
        this.hasUnread = false;

        document.getElementById('sys-chat-messages').innerHTML = '';
        const btn = document.getElementById('sys-btn-chat');
        if (btn) btn.classList.remove('chat-visible');
        this.updateBadge(false);
        this.closeChat();
    },

    openChat: function() {
        this.isOpen = true;
        document.getElementById('sys-chat-panel').classList.add('open');
        document.getElementById('sys-chat-backdrop').classList.add('open');
        this.updateBadge(false);
        
        const msgs = document.getElementById('sys-chat-messages');
        msgs.scrollTop = msgs.scrollHeight;
        
        if (window.innerWidth > 600) {
            document.getElementById('sys-chat-input').focus();
        }
    },

    closeChat: function() {
        this.isOpen = false;
        document.getElementById('sys-chat-panel').classList.remove('open');
        document.getElementById('sys-chat-backdrop').classList.remove('open');
    },

    sendMessage: function() {
        const input = document.getElementById('sys-chat-input');
        const text = input.value.trim().slice(0, 80);
        if (!text || !this.roomId) return;

        input.value = '';

        if (window.SystemAchievements) {
            window.SystemAchievements.unlock("social_butterfly");
        }

        if (typeof window.dbSet !== 'undefined' && window.db) {
            const key = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            window.dbSet(
                window.dbRef(window.db, 'chat/' + this.roomId + '/messages/' + key),
                { text: text, from: this.playerName, ts: Date.now() }
            );
        }
    },

    renderBubble: function(text, from, isMine) {
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

    addSystemMessage: function(text) {
        const msgs = document.getElementById('sys-chat-messages');
        const div = document.createElement('div');
        div.className = 'chat-system-msg';
        div.innerText = text;
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
    },

    updateBadge: function(show) {
        this.hasUnread = show;
        const badge = document.getElementById('sys-chat-badge');
        if (badge) {
            if (show) badge.classList.add('has-unread');
            else badge.classList.remove('has-unread');
        }
    }
};

// Initialize immediately if DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.SystemChat.init());
} else {
    window.SystemChat.init();
}

// ==========================================
// DROP-IN COMPATIBILITY OVERRIDES
// Bind to SystemUI so legacy or new games can call SystemUI.startChat()
// ==========================================
if (window.SystemUI) {
    window.SystemUI.startChat = function(roomId, playerName) { window.SystemChat.startChat(roomId, playerName); };
    window.SystemUI.stopChat = function() { window.SystemChat.stopChat(); };
    window.SystemUI.openChat = function() { window.SystemChat.openChat(); };
    window.SystemUI.closeChat = function() { window.SystemChat.closeChat(); };
    window.SystemUI._sendMessage = function() { window.SystemChat.sendMessage(); };
    
    // Map the internal _chatOpen property so the main UI HUD button toggle continues to function
    Object.defineProperty(window.SystemUI, '_chatOpen', {
        get: function() { return window.SystemChat.isOpen; },
        set: function(val) { window.SystemChat.isOpen = val; }
    });
}