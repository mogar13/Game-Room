/**
 * CASINO OS — SYSTEM STORE MODULE (v1.0)
 * Handles the catalog, purchasing, and inventory management.
 */

window.SystemStore = {

    // ── THE MASTER CATALOG ─────────────────────────
    CATALOG: {
        // Avatars (Cosmetic)
        "av_dragon": { id: "av_dragon", name: "Dragon Avatar", type: "avatar", value: "🐲", price: 50000, desc: "Breathe fire in the Hub." },
        "av_crown":  { id: "av_crown", name: "Crown Avatar", type: "avatar", value: "👑", price: 75000, desc: "Royalty only." },
        "av_gem":    { id: "av_gem", name: "Diamond Avatar", type: "avatar", value: "💎", price: 100000, desc: "Flawless flex." },
        "av_skull":  { id: "av_skull", name: "Skull Avatar", type: "avatar", value: "💀", price: 25000, desc: "Intimidate the table." },

        // Chat Colors (Cosmetic)
        "col_red":   { id: "col_red", name: "Neon Red Name", type: "color", value: "#ff003c", price: 100000, desc: "Stand out in global chat." },
        "col_gold":  { id: "col_gold", name: "Solid Gold Name", type: "color", value: "#f1c40f", price: 150000, desc: "The ultimate status symbol." },
        "col_green": { id: "col_green", name: "Hacker Green", type: "color", value: "#00ff00", price: 100000, desc: "Straight from the mainframe." },

        // Titles (Cosmetic)
        "tit_roller": { id: "tit_roller", name: "High Roller", type: "title", value: "High Roller", price: 20000, desc: "Show them you mean business." },
        "tit_shark":  { id: "tit_shark", name: "Card Shark", type: "title", value: "Card Shark", price: 50000, desc: "Predator of the felt." },
        "tit_whale":  { id: "tit_whale", name: "Casino Whale", type: "title", value: "Casino Whale", price: 250000, desc: "Too big to fail." },

        // Table Equipment (Functional)
        "deck_alt":   { id: "deck_alt", name: "Jumbo Deck", type: "deck", value: "standard-1", price: 10000, desc: "HD 352x512 cards for better visibility." },
        "back_b1":    { id: "back_b1", name: "Blue Back 1", type: "cardback", value: "cardBack_blue1.png", price: 5000, desc: "Classic blue patterned back." },
        "back_b5":    { id: "back_b5", name: "Blue Back 5", type: "cardback", value: "cardBack_blue5.png", price: 15000, desc: "Premium blue patterned back." },
        "back_r1":    { id: "back_r1", name: "Red Back 1", type: "cardback", value: "cardBack_red1.png", price: 5000, desc: "Classic red patterned back." },
        "back_r5":    { id: "back_r5", name: "Red Back 5", type: "cardback", value: "cardBack_red5.png", price: 15000, desc: "Premium red patterned back." },
        "back_g1":    { id: "back_g1", name: "Green Back 1", type: "cardback", value: "cardBack_green1.png", price: 5000, desc: "Classic green patterned back." },
        "dice_red":   { id: "dice_red", name: "Red Casino Dice", type: "dice", value: "red", price: 8000, desc: "Swap your standard white dice for casino red." }
    },

    // ── STORE API ──────────────────────────────────
    buyItem: async function(itemId) {
        const item = this.CATALOG[itemId];
        if (!item) return { ok: false, error: "Item not found." };
        
        if (!window.SystemAuth || !window.SystemAuth.isLoggedIn()) {
            return { ok: false, error: "Must be logged in to purchase items." };
        }

        // Safety check to ensure inventory array exists
        if (!window.SystemProfile.data.inventory) {
            window.SystemProfile.data.inventory = [];
        }

        if (window.SystemProfile.data.inventory.includes(itemId)) {
            return { ok: false, error: "You already own this item." };
        }

        if (window.SystemProfile.data.bankroll < item.price) {
            return { ok: false, error: "Insufficient funds. Keep grinding." };
        }

        // Deduct Cash & Add to Inventory
        window.SystemProfile.data.bankroll -= item.price;
        window.SystemProfile.data.inventory.push(itemId);
        
        // Save locally and push to cloud instantly
        window.SystemProfile.saveProfile();
        window.SystemAuth.saveCurrentUserData();

        // Broadcast to update the Hub UI
        if (window.SystemUI && typeof window.SystemUI.trigger === 'function') {
            window.SystemUI.trigger("money_changed");
        }

        return { ok: true, item: item };
    },

    getInventory: function() {
        if (!window.SystemProfile || !window.SystemProfile.data.inventory) return [];
        return window.SystemProfile.data.inventory;
    },

    ownsItem: function(itemId) {
        return this.getInventory().includes(itemId);
    },
    
    getOwnedItemsByType: function(type) {
        return this.getInventory()
            .map(id => this.CATALOG[id])
            .filter(item => item && item.type === type);
    }
};