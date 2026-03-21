/**
 * CASINO OS — SYSTEM STORE MODULE (v1.1)
 * Handles the catalog, purchasing, and inventory management.
 */

window.SystemStore = {

    // ── THE MASTER CATALOG ─────────────────────────
    CATALOG: {
        // Avatars (Cosmetic)
        "av_dragon": { id: "av_dragon", name: "Dragon Avatar", type: "avatar", value: "🐲", price: 50000, desc: "Breathe fire in the Hub." },
        "av_crown":  { id: "av_crown", name: "Crown Avatar", type: "avatar", value: "👑", price: 75000, desc: "Royalty only." },
        "av_gem":    { id: "av_gem", name: "Diamond Avatar", type: "avatar", value: "💎", price: 100000, desc: "Lucy in tht Sky With Diamonds." },
        "av_skull":  { id: "av_skull", name: "Skull Avatar", type: "avatar", value: "💀", price: 25000, desc: "Why do you wear a mask?" },
        "av_ninja":  { id: "av_ninja", name: "Harambe", type: "avatar", value: "🦍", price: 15000, desc: "Dicks Out for Harambe." },
        "av_alien":  { id: "av_alien", name: "Sriracha", type: "avatar", value: "🐓", price: 20000, desc: "You know the one." },
        "av_ghost":  { id: "av_ghost", name: "Xbox Controller", type: "avatar", value: "🎮", price: 15000, desc: "Just chilling on my desk." },
        "av_robot":  { id: "av_robot", name: "Luna", type: "avatar", value: "🐱", price: 20000, desc: "Sleeping Over There." },
        "av_clown":  { id: "av_clown", name: "Clown", type: "avatar", value: "🤡", price: 10000, desc: "Joker." },
        "av_demon":  { id: "av_demon", name: "Hector", type: "avatar", value: "🦼", price: 50000, desc: "Ding Ding." },
        "av_monkey": { id: "av_monkey", name: "Monkey", type: "avatar", value: "🐒", price: 12000, desc: "Return to monke." },
        "av_poop":   { id: "av_poop", name: "Fleur-de-lis", type: "avatar", value: "⚜️", price: 5000, desc: "Lily Flower." },

        // Chat Colors (Cosmetic) - Expanded selection with Glowing CSS Injections
        "col_red":     { id: "col_red",     name: "Neon Red",    type: "color", value: "#ff003c", price: 100000, desc: "Stand out in global chat." },
        "col_gold":    { id: "col_gold",    name: "Solid Gold",   type: "color", value: "#f1c40f", price: 150000, desc: "The ultimate status symbol." },
        "col_green":   { id: "col_green",   name: "Hacker Green", type: "color", value: "#00ff00", price: 100000, desc: "Straight from the mainframe." },
        "col_cyan":    { id: "col_cyan",    name: "Electric Cyan",type: "color", value: "#00d2ff", price: 80000,  desc: "Cool, calm, and collected." },
        "col_magenta": { id: "col_magenta", name: "Hot Magenta",  type: "color", value: "#ff00ff", price: 80000,  desc: "Bold and unmissable." },
        "col_orange":  { id: "col_orange",  name: "Neon Orange",  type: "color", value: "#ff9f43", price: 80000,  desc: "High energy vibes." },
        "col_purple":  { id: "col_purple",  name: "Deep Purple",  type: "color", value: "#9b59b6", price: 80000,  desc: "Mysterious and regal." },
        "col_silver":  { id: "col_silver",  name: "Chrome Silver",type: "color", value: "#bdc3c7", price: 50000,  desc: "Sleek and professional." },
        "col_glow_g":  { id: "col_glow_g",  name: "Toxic Glow",   type: "color", value: "#ccffcc; text-shadow: 0 0 8px #00ff00, 0 0 12px #00ff00", price: 200000, desc: "Radioactive green aura." },
        "col_glow_r":  { id: "col_glow_r",  name: "Demon Glow",   type: "color", value: "#ffcccc; text-shadow: 0 0 8px #ff0000, 0 0 12px #ff0000", price: 200000, desc: "Ominous red aura." },
        "col_glow_b":  { id: "col_glow_b",  name: "Plasma Glow",  type: "color", value: "#ccccff; text-shadow: 0 0 8px #0000ff, 0 0 12px #0000ff", price: 200000, desc: "High-tech blue energy." },
        "col_glow_gold":{ id: "col_glow_gold",name: "Divine Glow",type: "color", value: "#fffbe6; text-shadow: 0 0 8px #f1c40f, 0 0 12px #f1c40f", price: 500000, desc: "Godlike golden radiance." },

        // Titles (Cosmetic)
        "tit_roller": { id: "tit_roller", name: "High Roller", type: "title", value: "High Roller", price: 20000, desc: "Show them you mean business." },
        "tit_shark":  { id: "tit_shark", name: "Card Shark",  type: "title", value: "Card Shark",  price: 50000, desc: "Predator of the felt." },
        "tit_whale":  { id: "tit_whale", name: "Casino Whale",type: "title", value: "Casino Whale",price: 250000, desc: "Too big to fail." },
        "tit_sweat":  { id: "tit_sweat", name: "Tryhard",     type: "title", value: "Tryhard",     price: 10000, desc: "Sweating profusely." },
        "tit_noob":   { id: "tit_noob",  name: "Noob",        type: "title", value: "Noob",        price: 1000,  desc: "Embrace the beginning." },
        "tit_champ":  { id: "tit_champ", name: "Champion",    type: "title", value: "Champion",    price: 100000,desc: "The undisputed best." },
        "tit_hacker": { id: "tit_hacker",name: "Hacker",      type: "title", value: "Hacker",      price: 75000, desc: "10010101." },
        "tit_bot":    { id: "tit_bot",   name: "Actual Bot",  type: "title", value: "Actual Bot",  price: 5000,  desc: "Beep boop." },
        "tit_god":    { id: "tit_god",   name: "God Gamer",   type: "title", value: "God Gamer",   price: 500000,desc: "Bow down." },
        "tit_legend": { id: "tit_legend",name: "The Legend",  type: "title", value: "The Legend",  price: 200000,desc: "They write songs about you." },

        // Table Equipment (Functional)
        "deck_alt":   { id: "deck_alt", name: "Jumbo Deck", type: "deck", value: "standard-1", price: 10000, desc: "HD 352x512 cards for better visibility." },
        
        // Jumbo Card Backs
        "back_j2":    { id: "back_j2", name: "Jumbo Red",    type: "cardback", value: "../standard-1/back02.png", price: 15000, desc: "Red back for Jumbo Deck." },
        "back_j3":    { id: "back_j3", name: "Jumbo Gold",   type: "cardback", value: "../standard-1/back03.png", price: 20000, desc: "Gold back for Jumbo Deck." },
        "back_j4":    { id: "back_j4", name: "Jumbo Purple", type: "cardback", value: "../standard-1/back04.png", price: 20000, desc: "Purple back for Jumbo Deck." },
        "back_j5":    { id: "back_j5", name: "Jumbo Dark",   type: "cardback", value: "../standard-1/back05.png", price: 25000, desc: "Dark back for Jumbo Deck." },
        "back_j6":    { id: "back_j6", name: "Jumbo Light",  type: "cardback", value: "../standard-1/back06.png", price: 25000, desc: "Light back for Jumbo Deck." },
        "back_j7":    { id: "back_j7", name: "Jumbo Hex",    type: "cardback", value: "../standard-1/back07.png", price: 30000, desc: "Hex pattern for Jumbo Deck." },
        "back_j8":    { id: "back_j8", name: "Jumbo Tech",   type: "cardback", value: "../standard-1/back08.png", price: 50000, desc: "Tech pattern for Jumbo Deck." },

        // Card Backs - BLUE
        "back_b1":    { id: "back_b1", name: "Blue Back 1", type: "cardback", value: "cardBack_blue1.png", price: 2000, desc: "Standard blue pattern." },
        "back_b2":    { id: "back_b2", name: "Blue Back 2", type: "cardback", value: "cardBack_blue2.png", price: 4000, desc: "Style 2 blue pattern." },
        "back_b3":    { id: "back_b3", name: "Blue Back 3", type: "cardback", value: "cardBack_blue3.png", price: 6000, desc: "Style 3 blue pattern." },
        "back_b4":    { id: "back_b4", name: "Blue Back 4", type: "cardback", value: "cardBack_blue4.png", price: 8000, desc: "Style 4 blue pattern." },
        "back_b5":    { id: "back_b5", name: "Blue Back 5", type: "cardback", value: "cardBack_blue5.png", price: 10000, desc: "Premium blue pattern." },

        // Card Backs - RED
        "back_r1":    { id: "back_r1", name: "Red Back 1", type: "cardback", value: "cardBack_red1.png", price: 2000, desc: "Standard red pattern." },
        "back_r2":    { id: "back_r2", name: "Red Back 2", type: "cardback", value: "cardBack_red2.png", price: 4000, desc: "Style 2 red pattern." },
        "back_r3":    { id: "back_r3", name: "Red Back 3", type: "cardback", value: "cardBack_red3.png", price: 6000, desc: "Style 3 red pattern." },
        "back_r4":    { id: "back_r4", name: "Red Back 4", type: "cardback", value: "cardBack_red4.png", price: 8000, desc: "Style 4 red pattern." },
        "back_r5":    { id: "back_r5", name: "Red Back 5", type: "cardback", value: "cardBack_red5.png", price: 10000, desc: "Premium red pattern." },

        // Card Backs - GREEN
        "back_g1":    { id: "back_g1", name: "Green Back 1", type: "cardback", value: "cardBack_green1.png", price: 2000, desc: "Standard green pattern." },
        "back_g2":    { id: "back_g2", name: "Green Back 2", type: "cardback", value: "cardBack_green2.png", price: 4000, desc: "Style 2 green pattern." },
        "back_g3":    { id: "back_g3", name: "Green Back 3", type: "cardback", value: "cardBack_green3.png", price: 6000, desc: "Style 3 green pattern." },
        "back_g4":    { id: "back_g4", name: "Green Back 4", type: "cardback", value: "cardBack_green4.png", price: 8000, desc: "Style 4 green pattern." },
        "back_g5":    { id: "back_g5", name: "Green Back 5", type: "cardback", value: "cardBack_green5.png", price: 10000, desc: "Premium green pattern." },

        // Dice
        "dice_red":   { id: "dice_red", name: "Red Casino Dice", type: "dice", value: "dieRed_border", price: 15000, desc: "Switch your dice to casino red." },
        "dice_gold":  { id: "dice_gold", name: "Gold Dice", type: "dice", value: "dieYellow_border", price: 25000, desc: "Solid gold rollers." }
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