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
    seenKeys: null,
    msgCounter: 0,

    // Whitelist a chat color: pure hex always allowed; otherwise require
    // exact match against a SystemStore catalog "color" item (the catalog
    // is the only legitimate source of compound CSS values like glows).
    _isSafeChatColor: function(color) {
        if (typeof color !== 'string') return false;
        if (color.length > 200) return false;
        if (/^#[0-9a-fA-F]{3,8}$/.test(color)) return true;
        if (window.SystemStore && window.SystemStore.CATALOG) {
            for (const id in window.SystemStore.CATALOG) {
                const item = window.SystemStore.CATALOG[id];
                if (item && item.type === 'color' && item.value === color) return true;
            }
        }
        return false;
    },

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
        this.seenKeys = new Set();
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
                if (this.seenKeys && this.seenKeys.has(k)) return;
                if (this.seenKeys) this.seenKeys.add(k);
                const msg = data[k];
                const isMine = msg.from === this.playerName;
                this.renderBubble(msg.text, msg.from, isMine, msg.color);

                if (!this.isOpen && !isMine) {
                    this.updateBadge(true);
                    if (window.SystemAudio) window.SystemAudio.play('message');
                    else if (window.SystemUI) window.SystemUI.playSound('message');
                }
            });
        });
    },

    // Tear down the local listener. Pass {clearRemote:true} only when the
    // caller owns the room (host on cleanup) — otherwise a joiner leaving
    // would wipe the host's chat history mid-session.
    stopChat: function(opts) {
        const clearRemote = !!(opts && opts.clearRemote);

        if (this.listener) {
            this.listener();
            this.listener = null;
        }
        if (clearRemote && this.roomId && window.db && typeof window.dbSet !== 'undefined') {
            window.dbSet(window.dbRef(window.db, 'chat/' + this.roomId + '/messages'), null);
        }
        this.roomId = null;
        this.playerName = null;
        this.seenKeys = null;
        this.hasUnread = false;

        // DOM may not exist yet if stopChat fires during early init
        // (e.g. SystemMatch.cleanup running at module load before the
        // chat panel has been injected).
        const msgs = document.getElementById('sys-chat-messages');
        if (msgs) msgs.innerHTML = '';
        const btn = document.getElementById('sys-btn-chat');
        if (btn) btn.classList.remove('chat-visible');
        this.updateBadge(false);
        if (document.getElementById('sys-chat-panel')) this.closeChat();
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
        const panel = document.getElementById('sys-chat-panel');
        if (panel) panel.classList.remove('open');
        const backdrop = document.getElementById('sys-chat-backdrop');
        if (backdrop) backdrop.classList.remove('open');
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
            // Padded timestamp + monotonic per-session counter — guarantees
            // ASCII-sorted ordering matches send order even when two messages
            // land in the same millisecond.
            this.msgCounter = (this.msgCounter || 0) + 1;
            const key = String(Date.now()).padStart(15, '0') + '_' +
                        String(this.msgCounter).padStart(6, '0') + '_' +
                        Math.random().toString(36).slice(2, 6);

            let chatColor = "#ffffff";
            if (window.SystemProfile) {
                const profile = window.SystemProfile.getProfile();
                if (profile && profile.chatColor) chatColor = profile.chatColor;
            }

            window.dbSet(
                window.dbRef(window.db, 'chat/' + this.roomId + '/messages/' + key),
                { text: text, from: this.playerName, color: chatColor, ts: Date.now() }
            );
        }
    },

    renderBubble: function(text, from, isMine, color) {
        const msgs = document.getElementById('sys-chat-messages');
        const row = document.createElement('div');
        row.className = 'chat-bubble-row ' + (isMine ? 'mine' : 'theirs');

        const sender = document.createElement('div');
        sender.className = 'chat-sender';
        sender.innerText = from;
        if (color) {
            // Catalog "color" items intentionally ship compound CSS (e.g. glow
            // text-shadows), so cssText is allowed only for whitelisted values.
            // Anything unrecognized falls back to a single-property assignment,
            // which the browser silently drops if it's not a valid color.
            if (this._isSafeChatColor(color)) {
                sender.style.cssText = `color: ${color};`;
            } else {
                sender.style.color = color;
            }
        }

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
    window.SystemUI.stopChat = function(opts) { window.SystemChat.stopChat(opts); };
    window.SystemUI.openChat = function() { window.SystemChat.openChat(); };
    window.SystemUI.closeChat = function() { window.SystemChat.closeChat(); };
    window.SystemUI._sendMessage = function() { window.SystemChat.sendMessage(); };
    
    // Map the internal _chatOpen property so the main UI HUD button toggle continues to function
    Object.defineProperty(window.SystemUI, '_chatOpen', {
        get: function() { return window.SystemChat.isOpen; },
        set: function(val) { window.SystemChat.isOpen = val; }
    });
}