// =============================================
// MONOPOLY — monopoly_app.js
// The Game Shack | Casino OS
// Modes: vs AI | Hotseat | Online (v2Lobby)
// =============================================

// ── 1. OS INIT ────────────────────────────────
let gameMode     = localStorage.getItem("mono_mode")    || "ai";
let aiDifficulty = localStorage.getItem("mono_ai_diff") || "medium";
let playerCount  = parseInt(localStorage.getItem("mono_pcount") || "2");
let startingCash = parseInt(localStorage.getItem("mono_cash")   || "1500");
let myId         = 1;
let isHost       = false;
let chatStarted  = false;
let currentRoomId= null;
let seats        = [];

let p1Name = SystemUI.getPlayerName();

SystemUI.init({
    gameName: "MONOPOLY",
    rules: `Roll dice, buy properties, build houses and hotels, and bankrupt your opponents. Pass GO to collect $200. Rolling three doubles in a row sends you to Jail!`,
    hudDropdowns: [
        {
            id: "sys-mono-mode",
            options: [
                { value: "ai",      label: "🤖 vs AI"  },
                { value: "hotseat", label: "👥 Hotseat" },
                { value: "online",  label: "🌐 Online"  }
            ]
        }
    ]
});

setTimeout(() => {
    const modeEl = document.getElementById("sys-mono-mode");
    if (modeEl) {
        modeEl.value = gameMode;
        modeEl.addEventListener("change", e => {
            gameMode = e.target.value;
            localStorage.setItem("mono_mode", gameMode);
            document.getElementById("sys-modal").classList.add("sys-hidden");
            if (gameMode === "online") {
                SystemUI.v2Lobby.show();
            } else {
                SystemUI.v2Lobby.hide();
                SystemUI.stopChat();
                chatStarted = false;
            }
            const aiRow = document.getElementById("ss-ai-row");
            if (aiRow) aiRow.style.display = gameMode === "ai" ? "" : "none";
        });
    }
}, 10);

// ── 2. BOARD DATA ─────────────────────────────
/*
 * 40 spaces, index 0 = GO (bottom-right corner).
 * Types: go | property | railroad | utility | tax | chance | chest | jail | parking | gotojail
 * rent[0..5] = base, 1h, 2h, 3h, 4h, hotel
 */
const BOARD = [
    { id:0,  type:"go",       name:"GO"                   },
    { id:1,  type:"property", name:"Mediterranean Ave",  group:"brown",    price:60,  rent:[2,10,30,90,160,250],   houseCost:50,  mortgage:30  },
    { id:2,  type:"chest",    name:"Community Chest"      },
    { id:3,  type:"property", name:"Baltic Ave",          group:"brown",    price:60,  rent:[4,20,60,180,320,450],  houseCost:50,  mortgage:30  },
    { id:4,  type:"tax",      name:"Income Tax",          amount:200        },
    { id:5,  type:"railroad", name:"Reading Railroad",    price:200, mortgage:100 },
    { id:6,  type:"property", name:"Oriental Ave",        group:"lightblue",price:100, rent:[6,30,90,270,400,550],  houseCost:50,  mortgage:50  },
    { id:7,  type:"chance",   name:"Chance"               },
    { id:8,  type:"property", name:"Vermont Ave",         group:"lightblue",price:100, rent:[6,30,90,270,400,550],  houseCost:50,  mortgage:50  },
    { id:9,  type:"property", name:"Connecticut Ave",     group:"lightblue",price:120, rent:[8,40,100,300,450,600], houseCost:50,  mortgage:60  },
    { id:10, type:"jail",     name:"Jail / Just Visiting" },
    { id:11, type:"property", name:"St. Charles Place",   group:"pink",     price:140, rent:[10,50,150,450,625,750],houseCost:100, mortgage:70  },
    { id:12, type:"utility",  name:"Electric Company",    price:150, mortgage:75 },
    { id:13, type:"property", name:"States Ave",          group:"pink",     price:140, rent:[10,50,150,450,625,750],houseCost:100, mortgage:70  },
    { id:14, type:"property", name:"Virginia Ave",        group:"pink",     price:160, rent:[12,60,180,500,700,900],houseCost:100, mortgage:80  },
    { id:15, type:"railroad", name:"Pennsylvania RR",     price:200, mortgage:100 },
    { id:16, type:"property", name:"St. James Place",     group:"orange",   price:180, rent:[14,70,200,550,750,950],houseCost:100, mortgage:90  },
    { id:17, type:"chest",    name:"Community Chest"      },
    { id:18, type:"property", name:"Tennessee Ave",       group:"orange",   price:180, rent:[14,70,200,550,750,950],houseCost:100, mortgage:90  },
    { id:19, type:"property", name:"New York Ave",        group:"orange",   price:200, rent:[16,80,220,600,800,1000],houseCost:100,mortgage:100 },
    { id:20, type:"parking",  name:"Free Parking"         },
    { id:21, type:"property", name:"Kentucky Ave",        group:"red",      price:220, rent:[18,90,250,700,875,1050],houseCost:150,mortgage:110 },
    { id:22, type:"chance",   name:"Chance"               },
    { id:23, type:"property", name:"Indiana Ave",         group:"red",      price:220, rent:[18,90,250,700,875,1050],houseCost:150,mortgage:110 },
    { id:24, type:"property", name:"Illinois Ave",        group:"red",      price:240, rent:[20,100,300,750,925,1100],houseCost:150,mortgage:120},
    { id:25, type:"railroad", name:"B&O Railroad",        price:200, mortgage:100 },
    { id:26, type:"property", name:"Atlantic Ave",        group:"yellow",   price:260, rent:[22,110,330,800,975,1150],houseCost:150,mortgage:130},
    { id:27, type:"property", name:"Ventnor Ave",         group:"yellow",   price:260, rent:[22,110,330,800,975,1150],houseCost:150,mortgage:130},
    { id:28, type:"utility",  name:"Water Works",         price:150, mortgage:75 },
    { id:29, type:"property", name:"Marvin Gardens",      group:"yellow",   price:280, rent:[24,120,360,850,1025,1200],houseCost:150,mortgage:140},
    { id:30, type:"gotojail", name:"Go to Jail"           },
    { id:31, type:"property", name:"Pacific Ave",         group:"green",    price:300, rent:[26,130,390,900,1100,1275],houseCost:200,mortgage:150},
    { id:32, type:"property", name:"N. Carolina Ave",     group:"green",    price:300, rent:[26,130,390,900,1100,1275],houseCost:200,mortgage:150},
    { id:33, type:"chest",    name:"Community Chest"      },
    { id:34, type:"property", name:"Pennsylvania Ave",    group:"green",    price:320, rent:[28,150,450,1000,1200,1400],houseCost:200,mortgage:160},
    { id:35, type:"railroad", name:"Short Line RR",       price:200, mortgage:100 },
    { id:36, type:"chance",   name:"Chance"               },
    { id:37, type:"property", name:"Park Place",          group:"darkblue", price:350, rent:[35,175,500,1100,1300,1500],houseCost:200,mortgage:175},
    { id:38, type:"tax",      name:"Luxury Tax",          amount:75         },
    { id:39, type:"property", name:"Boardwalk",           group:"darkblue", price:400, rent:[50,200,600,1400,1700,2000],houseCost:200,mortgage:200},
];

const GROUPS = {
    brown:    { spaces:[1,3],       size:2 },
    lightblue:{ spaces:[6,8,9],     size:3 },
    pink:     { spaces:[11,13,14],  size:3 },
    orange:   { spaces:[16,18,19],  size:3 },
    red:      { spaces:[21,23,24],  size:3 },
    yellow:   { spaces:[26,27,29],  size:3 },
    green:    { spaces:[31,32,34],  size:3 },
    darkblue: { spaces:[37,39],     size:2 },
    railroad: { spaces:[5,15,25,35],size:4 },
    utility:  { spaces:[12,28],     size:2 },
};

// ── 3. SPACE POSITIONS ────────────────────────
/*
 * TOKEN POSITIONING SYSTEM
 * ─────────────────────────
 * A standard Monopoly board divides each side into 11 spaces: 1 corner + 9 regular + 1 corner.
 * The key insight is that corner squares are LARGER than regular spaces.
 *
 * CORNER_PCT = the percentage of board width that one corner square occupies.
 * REG_PCT    = (100 - 2 × CORNER_PCT) / 9  (the remaining width divided evenly across 9 spaces)
 *
 * For the standard layout: CORNER_PCT ≈ 11%, REG_PCT ≈ 8.67%
 * If your SVG has a visible border or internal padding, increase BOARD_INSET slightly.
 *
 * To verify calibration: double-click the board during gameplay to toggle debug dots.
 * Adjust CORNER_PCT until debug dots land on each space center.
 */
const CORNER_PCT  = 11.0;  // ← change this if corners are off
const BOARD_INSET = 0.5;   // ← % inset if SVG has an internal border
const REG_PCT     = (100 - 2 * CORNER_PCT) / 9;

const SPACE_POS = (() => {
    const pos = new Array(40);

    // Scale all measurements to the inset-compensated coordinate space
    const C = CORNER_PCT;
    const R = REG_PCT;
    const I = BOARD_INSET;

    // Four corners
    pos[0]  = { x: 100 - I - C / 2, y: 100 - I - C / 2 }; // GO (bottom-right)
    pos[10] = { x: I + C / 2,        y: 100 - I - C / 2 }; // Jail (bottom-left)
    pos[20] = { x: I + C / 2,        y: I + C / 2        }; // Free Parking (top-left)
    pos[30] = { x: 100 - I - C / 2,  y: I + C / 2        }; // Go to Jail (top-right)

    // Bottom row: spaces 1–9, going right to left
    // Space 1 is just left of GO, space 9 is just right of Jail
    for (let i = 1; i <= 9; i++) {
        pos[i] = {
            x: 100 - I - C - (i - 0.5) * R,
            y: 100 - I - C / 2
        };
    }

    // Left column: spaces 11–19, going bottom to top
    for (let i = 11; i <= 19; i++) {
        pos[i] = {
            x: I + C / 2,
            y: 100 - I - C - (i - 10 - 0.5) * R
        };
    }

    // Top row: spaces 21–29, going left to right
    for (let i = 21; i <= 29; i++) {
        pos[i] = {
            x: I + C + (i - 20 - 0.5) * R,
            y: I + C / 2
        };
    }

    // Right column: spaces 31–39, going top to bottom
    for (let i = 31; i <= 39; i++) {
        pos[i] = {
            x: 100 - I - C / 2,
            y: I + C + (i - 30 - 0.5) * R
        };
    }

    return pos;
})();

// Token stacking offsets so multiple pieces on the same space don't overlap exactly
const TOKEN_OFFSETS = [
    { dx: -2.2, dy: -2.2 }, // P1
    { dx:  2.2, dy: -2.2 }, // P2
    { dx: -2.2, dy:  2.2 }, // P3
    { dx:  2.2, dy:  2.2 }, // P4
];

// ── 4. CARD DECKS ─────────────────────────────
/*
 * Each card: { text, action, ...params }
 *
 * Actions:
 *   goto(target, passGo)  — move to space ID, optionally collect $200
 *   back3                 — go back 3 spaces
 *   jail                  — go directly to jail
 *   gain(amount)          — receive money from bank
 *   lose(amount)          — pay bank
 *   jailfree              — receive Get Out of Jail Free card
 *   payall(amount)        — pay each other player
 *   collectall(amount)    — collect from each other player
 *   nearest_rr(doubleRent)— advance to nearest railroad
 *   nearest_util          — advance to nearest utility
 *   repairs(house,hotel)  — pay per house/hotel owned
 */
let chanceIdx = 0;
let chestIdx  = 0;

const CHANCE = shuffleDeck([
    { text:"Advance to GO. Collect $200.",                      action:"goto",  target:0,  passGo:true  },
    { text:"Advance to Illinois Ave. If you pass GO, collect $200.", action:"goto", target:24, passGo:true  },
    { text:"Advance to St. Charles Place. If you pass GO, collect $200.", action:"goto", target:11, passGo:true },
    { text:"Advance token to nearest Railroad. If unowned, buy it. If owned, pay DOUBLE rent!", action:"nearest_rr", doubleRent:true },
    { text:"Advance token to nearest Railroad. If unowned, buy it. If owned, pay DOUBLE rent!", action:"nearest_rr", doubleRent:true },
    { text:"Advance token to nearest Utility. If unowned, buy it. If owned, pay 10× your dice roll.", action:"nearest_util" },
    { text:"Bank pays you dividend of $50.",                    action:"gain",  amount:50  },
    { text:"Get Out of Jail Free. Keep this card.",             action:"jailfree"           },
    { text:"Go back 3 spaces.",                                 action:"back3"              },
    { text:"Go to Jail! Do not pass GO. Do not collect $200.",  action:"jail"               },
    { text:"Make general repairs on all your property. Pay $25 per house, $100 per hotel.", action:"repairs", house:25, hotel:100 },
    { text:"Speeding fine — pay $15.",                          action:"lose",  amount:15  },
    { text:"Take a trip to Boardwalk.",                         action:"goto",  target:39, passGo:false },
    { text:"You have been elected Chairman. Pay each player $50.", action:"payall", amount:50 },
    { text:"Your building loan matures. Collect $150.",         action:"gain",  amount:150 },
    { text:"You have won a crossword competition. Collect $100.", action:"gain", amount:100 },
]);

const CHEST = shuffleDeck([
    { text:"Advance to GO. Collect $200.",                      action:"goto",  target:0,  passGo:true  },
    { text:"Bank error in your favor. Collect $200.",           action:"gain",  amount:200 },
    { text:"Doctor's fees. Pay $50.",                           action:"lose",  amount:50  },
    { text:"From sale of stock, you get $50.",                  action:"gain",  amount:50  },
    { text:"Get Out of Jail Free. Keep this card.",             action:"jailfree"           },
    { text:"Go to Jail! Do not pass GO. Do not collect $200.",  action:"jail"               },
    { text:"Grand opera night. Collect $50 from every player.", action:"collectall", amount:50 },
    { text:"Holiday fund matures — receive $100.",              action:"gain",  amount:100 },
    { text:"Income tax refund. Collect $20.",                   action:"gain",  amount:20  },
    { text:"It is your birthday! Collect $10 from each player.", action:"collectall", amount:10 },
    { text:"Life insurance matures. Collect $100.",             action:"gain",  amount:100 },
    { text:"Pay hospital fees of $100.",                        action:"lose",  amount:100 },
    { text:"Pay school fees of $50.",                           action:"lose",  amount:50  },
    { text:"Receive $25 consultancy fee.",                      action:"gain",  amount:25  },
    { text:"You are assessed for street repairs: $40 per house, $115 per hotel.", action:"repairs", house:40, hotel:115 },
    { text:"You inherit $100.",                                 action:"gain",  amount:100 },
]);

function shuffleDeck(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ── 5. PLAYER SETUP ───────────────────────────
const PLAYER_COLORS = ["red","blue","green","yellow"];
const PLAYER_HEX    = ["#DC143C","#1a7fd4","#27ae60","#f39c12"];
const PLAYER_PIECES = [
    "../../system/images/pieces/red/pieceRed_border03.png",
    "../../system/images/pieces/blue/pieceBlue_border04.png",
    "../../system/images/pieces/green/pieceGreen_border03.png",
    "../../system/images/pieces/yellow/pieceYellow_border02.png",
];
const DICE_FACES = [
    "../../system/images/dice/dieWhite_border1.png",
    "../../system/images/dice/dieWhite_border2.png",
    "../../system/images/dice/dieWhite_border3.png",
    "../../system/images/dice/dieWhite_border4.png",
    "../../system/images/dice/dieWhite_border5.png",
    "../../system/images/dice/dieWhite_border6.png",
];

// GROUP → CSS hex color map (for rendering colored dots / bars)
const GROUP_HEX = {
    brown:"#8B4513", lightblue:"#87CEEB", pink:"#FF69B4", orange:"#FFA500",
    red:"#E53935", yellow:"#FDD835", green:"#2E7D32", darkblue:"#1565C0",
    railroad:"#666", utility:"#888"
};

function createPlayer(idx, name, isAI) {
    return {
        id: idx + 1, idx, name, isAI,
        color: PLAYER_COLORS[idx],
        hex:   PLAYER_HEX[idx],
        piece: PLAYER_PIECES[idx],
        position:     0,
        money:        startingCash,
        properties:   [],   // owned space IDs
        houses:       {},   // { spaceId: 0-4 }
        hotels:       {},   // { spaceId: true }
        mortgaged:    [],
        inJail:       false,
        jailTurns:    0,
        jailFreeCards:0,
        bankrupt:     false,
    };
}

// ── 6. GAME STATE ─────────────────────────────
let players      = [];
let turnIdx      = 0;
let doublesRolled= 0;
let phase        = "idle"; // idle | roll | moving | landed | build | gameover
let diceVal      = [1,1];
let gameLog      = [];

// Bank supply — real Monopoly has exactly 32 houses and 12 hotels.
let bankHouses   = 32;
let bankHotels   = 12;

// Pending trade (for hotseat resolution)
let pendingTrade = null;

// ── 7. HELPERS ────────────────────────────────
function getOwner(spaceId) {
    return players.find(p => !p.bankrupt && p.properties.includes(spaceId)) || null;
}
function isMortgaged(spaceId) {
    const o = getOwner(spaceId);
    return o ? o.mortgaged.includes(spaceId) : false;
}
function hasMonopoly(player, group) {
    if (!GROUPS[group]) return false;
    return GROUPS[group].spaces.every(id => player.properties.includes(id));
}
function ownedInGroup(player, group) {
    if (!GROUPS[group]) return 0;
    return GROUPS[group].spaces.filter(id => player.properties.includes(id)).length;
}
function activePlayers() { return players.filter(p => !p.bankrupt); }
function currentPlayer() { return players[turnIdx]; }

function calcRent(spaceId, landingPlayer, diceTotal, forceDouble = false) {
    const space  = BOARD[spaceId];
    const owner  = getOwner(spaceId);
    if (!owner || owner.id === landingPlayer.id) return 0;
    if (isMortgaged(spaceId)) return 0;

    if (space.type === "railroad") {
        const n   = ownedInGroup(owner, "railroad");
        const base= 25 * Math.pow(2, n - 1);
        return forceDouble ? base * 2 : base;
    }
    if (space.type === "utility") {
        const n = ownedInGroup(owner, "utility");
        return diceTotal * (n === 2 ? 10 : 4);
    }
    if (space.type === "property") {
        const houses = owner.houses[spaceId] || 0;
        const hotel  = owner.hotels[spaceId] || false;
        const tier   = hotel ? 5 : houses;
        let   rent   = space.rent[tier];
        // Double base rent when player holds full monopoly but hasn't built yet
        if (tier === 0 && hasMonopoly(owner, space.group)) rent *= 2;
        return rent;
    }
    return 0;
}

// Even-building rule: before adding a house to targetSid (which currently has N),
// every other space in the group must also have >= N houses.
function canBuildEven(player, group, targetSid) {
    if (!GROUPS[group]) return true;
    const current = player.houses[targetSid] || 0;
    return GROUPS[group].spaces.every(sid => {
        if (sid === targetSid) return true;
        return (player.houses[sid] || 0) >= current;
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 8. LOGGING ────────────────────────────────
function log(msg, cls = "") {
    gameLog.unshift({ msg, cls });
    if (gameLog.length > 80) gameLog.pop();
    renderLog();
}
function logP(player, msg, cls = "") {
    log(`<span class="log-who" style="color:${player.hex}">${player.name}:</span> ${msg}`, cls);
}
function renderLog() {
    const el = document.getElementById("log-entries");
    if (!el) return;
    el.innerHTML = gameLog.slice(0, 35).map(e =>
        `<div class="log-entry ${e.cls}">${e.msg}</div>`
    ).join("");
}

// ── 9. RENDERING ──────────────────────────────
function renderAll() {
    renderOwnership();
    renderTokens();
    renderBuildings();
    renderPlayerCards();
    renderActionPanel();
    renderBankSupply();
    renderLog();
}

function renderTokens() {
    const layer = document.getElementById("token-layer");
    if (!layer) return;
    layer.innerHTML = "";

    // Group by position string (jail tokens get special key "10j")
    const byPos = {};
    activePlayers().forEach(p => {
        const key = p.inJail ? "10j" : String(p.position);
        if (!byPos[key]) byPos[key] = [];
        byPos[key].push(p);
    });

    activePlayers().forEach(p => {
        const key  = p.inJail ? "10j" : String(p.position);
        const slot = byPos[key].indexOf(p);
        const sp   = SPACE_POS[p.position];
        const off  = TOKEN_OFFSETS[slot] || { dx:0, dy:0 };

        // Jail visitors cluster in the "just visiting" corner;
        // actual prisoners shift slightly into the jail cell area
        const jailNudge = p.inJail ? { dx: -1.5, dy: -1.5 } : { dx:0, dy:0 };

        const img = document.createElement("img");
        img.className = "token";
        img.id        = `token-p${p.id}`;
        img.src       = p.piece;
        img.alt       = p.name;
        img.style.left= `${sp.x + off.dx + jailNudge.dx}%`;
        img.style.top = `${sp.y + off.dy + jailNudge.dy}%`;
        layer.appendChild(img);
    });
}

function renderOwnership() {
    const layer = document.getElementById("ownership-layer");
    if (!layer) return;
    layer.innerHTML = "";

    players.forEach(p => {
        if (p.bankrupt) return;
        p.properties.forEach(sid => {
            const sp  = SPACE_POS[sid];
            const dot = document.createElement("div");
            dot.className = "ownership-ring";
            dot.style.left       = `${sp.x}%`;
            dot.style.top        = `${sp.y}%`;
            dot.style.background = p.hex;
            dot.dataset.sid      = sid;
            dot.title            = `${BOARD[sid].name} — ${p.name}`;
            // Click to inspect the deed
            dot.addEventListener("click", () => openDeedModal(sid));
            layer.appendChild(dot);
        });
    });
}

function renderBuildings() {
    const layer = document.getElementById("building-layer");
    if (!layer) return;
    layer.innerHTML = "";
    players.forEach(p => {
        if (p.bankrupt) return;
        Object.entries(p.houses).forEach(([sid, n]) => {
            if (!n) return;
            const sp  = SPACE_POS[parseInt(sid)];
            const el  = document.createElement("div");
            el.className  = "build-marker";
            el.style.left = `${sp.x}%`;
            el.style.top  = `${sp.y - 4.5}%`;
            el.textContent= "🏠".repeat(n);
            layer.appendChild(el);
        });
        Object.entries(p.hotels).forEach(([sid, has]) => {
            if (!has) return;
            const sp  = SPACE_POS[parseInt(sid)];
            const el  = document.createElement("div");
            el.className  = "build-marker";
            el.style.left = `${sp.x}%`;
            el.style.top  = `${sp.y - 4.5}%`;
            el.textContent= "🏨";
            layer.appendChild(el);
        });
    });
}

function renderPlayerCards() {
    const panel = document.getElementById("players-panel");
    if (!panel) return;
    panel.innerHTML = "";
    players.forEach((p, idx) => {
        const isActive = idx === turnIdx && !p.bankrupt;
        const card = document.createElement("div");
        card.className = `player-card${isActive ? " active-turn" : ""}${p.bankrupt ? " bankrupt" : ""}`;

        const pips = p.properties.map(sid => {
            const sp  = BOARD[sid];
            const grp = sp.group || sp.type;
            const mort= p.mortgaged.includes(sid) ? " mortgaged" : "";
            return `<div class="prop-pip${mort} gc-${grp}" data-sid="${sid}" title="${sp.name}"></div>`;
        }).join("");

        const statusTxt = p.bankrupt ? "BANKRUPT"
            : p.inJail ? `🔒 JAIL — TURN ${p.jailTurns + 1}/3`
            : isActive ? (doublesRolled ? `⚡ DOUBLES ×${doublesRolled}` : "ACTIVE TURN")
            : "";

        const jailCardTxt = p.jailFreeCards > 0
            ? `🃏 Jail Free ×${p.jailFreeCards}` : "";

        card.innerHTML = `
            <div class="pc-top">
                <div class="pc-dot" style="background:${p.hex}"></div>
                <div class="pc-name">${p.name.toUpperCase()}${p.isAI ? " 🤖" : ""}</div>
                <div class="pc-money${p.money < 150 && !p.bankrupt ? " low" : ""}">$${p.money.toLocaleString()}</div>
            </div>
            <div class="pc-props">${pips}</div>
            ${statusTxt  ? `<div class="pc-status">${statusTxt}</div>` : ""}
            ${jailCardTxt? `<div class="pc-jail-cards">${jailCardTxt}</div>` : ""}
        `;
        panel.appendChild(card);
    });

    // Wire up property pip clicks → deed modal
    panel.querySelectorAll(".prop-pip").forEach(pip => {
        pip.addEventListener("click", () => openDeedModal(parseInt(pip.dataset.sid)));
    });
}

function renderActionPanel() {
    const cp = currentPlayer();
    if (!cp || phase === "gameover") return;

    document.getElementById("cp-dot").style.background = cp.hex;
    document.getElementById("cp-name").textContent     = cp.name.toUpperCase();

    const statusEl = document.getElementById("cp-status");
    const allBtns  = ["roll-btn","bail-btn","card-btn","manage-btn","trade-btn","end-btn"];
    allBtns.forEach(id => document.getElementById(id).classList.add("hidden"));

    const isMyTurn = gameMode === "online" ? cp.id === myId : true;

    if (phase === "roll") {
        if (cp.inJail) {
            statusEl.textContent = "IN JAIL";
            if (isMyTurn && !cp.isAI) {
                document.getElementById("roll-btn").textContent = "🎲 ROLL FOR DOUBLES";
                document.getElementById("roll-btn").classList.remove("hidden");
                document.getElementById("bail-btn").classList.remove("hidden");
                if (cp.jailFreeCards > 0) document.getElementById("card-btn").classList.remove("hidden");
            }
        } else {
            statusEl.textContent = doublesRolled > 0 ? `DOUBLES ×${doublesRolled}` : "";
            if (isMyTurn && !cp.isAI) {
                document.getElementById("roll-btn").textContent = "🎲 ROLL DICE";
                document.getElementById("roll-btn").classList.remove("hidden");
            } else if (cp.isAI) {
                statusEl.textContent = "AI IS THINKING…";
            }
        }
    } else if (phase === "moving" || phase === "landed") {
        statusEl.textContent = phase === "moving" ? "MOVING…" : "RESOLVING…";
    } else if (phase === "build") {
        statusEl.textContent = doublesRolled > 0 ? `DOUBLES — ROLL AGAIN` : "";
        if (isMyTurn && !cp.isAI) {
            if (cp.properties.length > 0)
                document.getElementById("manage-btn").classList.remove("hidden");
            // Trade only available in hotseat/online against another human or any mode with 2+ humans
            if (activePlayers().some(p => p.id !== cp.id && !p.isAI))
                document.getElementById("trade-btn").classList.remove("hidden");
            document.getElementById("end-btn").classList.remove("hidden");
        } else if (cp.isAI) {
            statusEl.textContent = "AI DECIDING…";
        }
    }
}

function renderBankSupply() {
    const h = document.getElementById("bank-h-count");
    const t = document.getElementById("bank-t-count");
    if (h) h.textContent = bankHouses;
    if (t) t.textContent = bankHotels;
}

// ── 10. DEBUG OVERLAY ─────────────────────────
let debugVisible = false;
document.getElementById("board-wrap").addEventListener("dblclick", () => {
    debugVisible = !debugVisible;
    const layer = document.getElementById("debug-layer");
    layer.classList.toggle("hidden", !debugVisible);
    if (debugVisible && layer.children.length === 0) {
        // Draw numbered dots at every computed SPACE_POS
        SPACE_POS.forEach((sp, id) => {
            const dot = document.createElement("div");
            dot.className  = "dbg-dot";
            dot.style.left = `${sp.x}%`;
            dot.style.top  = `${sp.y}%`;
            dot.textContent= id;
            layer.appendChild(dot);
        });
    }
});

// ── 11. DICE ──────────────────────────────────
async function animateDice() {
    const d1 = document.getElementById("die1");
    const d2 = document.getElementById("die2");
    d1.classList.add("rolling");
    d2.classList.add("rolling");
    for (let i = 0; i < 14; i++) {
        d1.src = DICE_FACES[Math.floor(Math.random() * 6)];
        d2.src = DICE_FACES[Math.floor(Math.random() * 6)];
        await sleep(70);
    }
    d1.classList.remove("rolling");
    d2.classList.remove("rolling");
    d1.src = DICE_FACES[diceVal[0] - 1];
    d2.src = DICE_FACES[diceVal[1] - 1];

    const sum = diceVal[0] + diceVal[1];
    const dbl = diceVal[0] === diceVal[1];
    document.getElementById("dice-sum").textContent   = sum;
    document.getElementById("dice-label").textContent = dbl ? `⚡ DOUBLES  (${diceVal[0]}+${diceVal[1]})` : `${diceVal[0]} + ${diceVal[1]}`;
    SystemUI.playSound("click");
}

function rollDiceValues() {
    diceVal = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    return diceVal;
}

// ── 12. MOVEMENT ──────────────────────────────
async function movePlayer(player, steps) {
    for (let i = 0; i < steps; i++) {
        const prev = player.position;
        player.position = (player.position + 1) % 40;
        renderTokens();
        SystemUI.playSound("click");
        // Passing GO (but not landing on it on this step yet)
        if (player.position === 0 && i < steps - 1) {
            player.money += 200;
            logP(player, "passed GO — +$200 ✓", "good");
        }
        await sleep(180);
    }
    // Landing on GO
    if (player.position === 0) {
        player.money += 200;
        logP(player, "landed on GO — +$200 ✓", "good");
    }
    // Bounce landing animation
    const tok = document.getElementById(`token-p${player.id}`);
    if (tok) { tok.classList.add("bounce"); setTimeout(() => tok.classList.remove("bounce"), 500); }
}

// ── 13. TURN ENGINE ───────────────────────────
async function startTurn() {
    phase = "roll";
    renderAll();
    const cp = currentPlayer();
    if (cp.isAI) {
        await sleep(900);
        await aiDoTurn(cp);
    }
}

async function doRoll() {
    const cp = currentPlayer();
    phase = "moving";
    renderActionPanel();

    rollDiceValues();
    const sum = diceVal[0] + diceVal[1];
    const dbl = diceVal[0] === diceVal[1];

    await animateDice();

    // ── Jail logic ─────────────────────────────
    if (cp.inJail) {
        if (dbl) {
            cp.inJail = false; cp.jailTurns = 0;
            doublesRolled = 0; // doubles from jail don't chain
            logP(cp, `rolled doubles — freed from jail!`, "good");
        } else {
            cp.jailTurns++;
            if (cp.jailTurns >= 3) {
                // 3rd failed roll: forced to pay $50
                cp.money -= 50; cp.inJail = false; cp.jailTurns = 0;
                logP(cp, `3rd failed jail roll — paid $50 bail, rolling ${sum}`, "bad");
            } else {
                logP(cp, `rolled ${diceVal[0]}+${diceVal[1]} — still in jail (${cp.jailTurns}/3)`);
                phase = "build"; renderAll();
                if (cp.isAI) await aiEndTurn(cp);
                return;
            }
        }
    } else {
        // ── Not in jail ────────────────────────
        if (dbl) {
            doublesRolled++;
            if (doublesRolled >= 3) {
                logP(cp, "three doubles in a row — sent to jail!", "bad");
                sendToJail(cp);
                phase = "build"; renderAll();
                if (cp.isAI) await aiEndTurn(cp);
                return;
            }
        } else {
            doublesRolled = 0;
        }
    }

    logP(cp, `rolled ${diceVal[0]}+${diceVal[1]} = ${sum}${dbl ? " ⚡ DOUBLES" : ""}`);

    await movePlayer(cp, sum);

    phase = "landed";
    renderAll();
    await landOnSpace(cp, sum);
}

// ── 14. SPACE HANDLERS ────────────────────────
async function landOnSpace(player, diceTotal) {
    const sid   = player.position;
    const space = BOARD[sid];

    logP(player, `landed on <b>${space.name}</b>`);

    switch (space.type) {
        case "go":       /* handled during movement */               break;
        case "jail":     /* just visiting — nothing happens */       break;
        case "parking":  /* house rule: nothing (no free parking jackpot) */ break;
        case "gotojail": await handleGoToJail(player);               break;
        case "tax":      await handleTax(player, space);             break;
        case "chance":   await handleCard(player, diceTotal, "chance"); break;
        case "chest":    await handleCard(player, diceTotal, "chest");  break;
        case "property":
        case "railroad":
        case "utility":  await handlePropertyLand(player, sid, diceTotal, false); break;
    }

    if (!player.inJail && phase !== "gameover") {
        phase = "build";
        renderAll();
        if (player.isAI) await aiEndTurn(player);
    }
}

async function handleGoToJail(player) {
    sendToJail(player);
    logP(player, "⛓️ GO TO JAIL!", "bad");
    await sleep(700);
}

function sendToJail(player) {
    player.position  = 10;
    player.inJail    = true;
    player.jailTurns = 0;
    renderTokens();
    SystemUI.playSound("lose");
}

async function handleTax(player, space) {
    logP(player, `paid ${space.name} — -$${space.amount}`, "bad");
    await chargePlayer(player, space.amount, null);
    renderPlayerCards();
    await sleep(400);
}

async function handleCard(player, diceTotal, type) {
    const deck = type === "chance" ? CHANCE : CHEST;
    const card = deck[type === "chance" ? chanceIdx++ % deck.length : chestIdx++ % deck.length];
    logP(player, `drew ${type === "chance" ? "Chance" : "Community Chest"} card`);
    await showCardModal(type, card);
    await applyCard(player, card, diceTotal);
}

function showCardModal(type, card) {
    return new Promise(resolve => {
        const box     = document.getElementById("card-modal-box");
        const typeLbl = document.getElementById("card-type-lbl");
        const deco    = document.getElementById("card-deco");
        const text    = document.getElementById("card-text");
        const effect  = document.getElementById("card-effect");

        box.className = type === "chance" ? "modal-box card-modal-box card-chance"
                                           : "modal-box card-modal-box card-chest";
        typeLbl.textContent = type === "chance" ? "⚡ CHANCE" : "📦 COMMUNITY CHEST";
        deco.textContent    = type === "chance" ? "?" : "📦";
        text.textContent    = card.text;

        // Show the monetary effect prominently
        if (card.action === "gain")       effect.textContent = `+$${card.amount}`;
        else if (card.action === "lose")  effect.textContent = `-$${card.amount}`;
        else if (card.action === "jail")  effect.textContent = "⛓️ JAIL";
        else if (card.action === "jailfree") effect.textContent = "🃏 CARD KEPT";
        else                              effect.textContent = "";

        document.getElementById("card-modal").classList.remove("hidden");
        const btn = document.getElementById("card-ok-btn");

        const done = () => {
            btn.removeEventListener("click", done);
            document.getElementById("card-modal").classList.add("hidden");
            resolve();
        };
        btn.addEventListener("click", done);
        if (currentPlayer().isAI) setTimeout(done, 1800);
    });
}

async function applyCard(player, card, diceTotal) {
    switch (card.action) {
        case "goto": {
            const oldPos = player.position;
            if (card.passGo && card.target < oldPos) {
                // Passing GO
                player.money += 200;
                logP(player, "passed GO — +$200", "good");
            }
            player.position = card.target;
            renderTokens();
            await sleep(400);
            await landOnSpace(player, diceTotal);
            break;
        }
        case "back3": {
            player.position = (player.position - 3 + 40) % 40;
            renderTokens(); await sleep(400);
            logP(player, `moved back 3 to ${BOARD[player.position].name}`);
            await landOnSpace(player, diceTotal);
            break;
        }
        case "jail":  sendToJail(player);                         break;
        case "gain":
            player.money += card.amount;
            logP(player, `received $${card.amount} from bank`, "good"); break;
        case "lose":
            await chargePlayer(player, card.amount, null);
            logP(player, `paid $${card.amount} to bank`, "bad");        break;
        case "jailfree":
            player.jailFreeCards++;
            logP(player, "received Get Out of Jail Free card 🃏", "good"); break;
        case "payall": {
            for (const other of activePlayers()) {
                if (other.id === player.id) continue;
                await chargePlayer(player, card.amount, other);
            }
            logP(player, `paid each player $${card.amount}`, "bad"); break;
        }
        case "collectall": {
            for (const other of activePlayers()) {
                if (other.id === player.id) continue;
                const pays = Math.min(card.amount, other.money);
                other.money  -= pays;
                player.money += pays;
            }
            logP(player, `collected $${card.amount} from each player`, "good"); break;
        }
        case "nearest_rr": {
            const rrs    = [5, 15, 25, 35];
            // Find the next railroad clockwise from current position
            const target = rrs.find(r => r > player.position) ?? rrs[0];
            if (target <= player.position) { player.money += 200; logP(player, "passed GO — +$200","good"); }
            player.position = target;
            renderTokens(); await sleep(400);
            logP(player, `moved to nearest railroad: ${BOARD[target].name}`);
            await handlePropertyLand(player, target, diceTotal, card.doubleRent || false);
            break;
        }
        case "nearest_util": {
            const utils  = [12, 28];
            const target = utils.find(u => u > player.position) ?? utils[0];
            player.position = target;
            renderTokens(); await sleep(400);
            logP(player, `moved to nearest utility: ${BOARD[target].name}`);
            await handlePropertyLand(player, target, diceTotal, false);
            break;
        }
        case "repairs": {
            let cost = 0;
            player.properties.forEach(sid => {
                cost += (player.houses[sid] || 0) * card.house;
                if (player.hotels[sid]) cost += card.hotel;
            });
            if (cost > 0) {
                await chargePlayer(player, cost, null);
                logP(player, `paid $${cost} in repairs`, "bad");
            }
            break;
        }
    }
    renderAll();
}

// ── 15. PROPERTY LANDING ──────────────────────
async function handlePropertyLand(player, sid, diceTotal, forceDoubleRent) {
    const space = BOARD[sid];
    const owner = getOwner(sid);

    if (!owner) {
        // Unowned — offer to buy
        if (player.money >= space.price) {
            await offerBuy(player, sid);
        } else {
            logP(player, `can't afford ${space.name} ($${space.price}) — goes to auction`);
            await startAuction(sid);
        }
    } else if (owner.id === player.id) {
        logP(player, "owns this property");
    } else if (!isMortgaged(sid)) {
        const rent = calcRent(sid, player, diceTotal, forceDoubleRent);
        await showRentOverlay(rent, owner, space.name);
        logP(player, `paid $${rent} rent to ${owner.name}`, "bad");
        await chargePlayer(player, rent, owner);
        renderAll();
    } else {
        logP(player, `${space.name} is mortgaged — no rent owed`);
    }
}

function showRentOverlay(amount, owner, spaceName) {
    return new Promise(resolve => {
        document.getElementById("rent-amount").textContent    = `$${amount}`;
        document.getElementById("rent-owner-name").textContent= owner.name;
        document.getElementById("rent-space-name").textContent= spaceName;
        document.getElementById("rent-overlay").classList.remove("hidden");

        // Auto-dismiss after 1.8s (long enough to read, not so long it blocks the game)
        setTimeout(() => {
            document.getElementById("rent-overlay").classList.add("hidden");
            resolve();
        }, 1800);
    });
}

// ── 16. BUY / AUCTION ─────────────────────────
function offerBuy(player, sid) {
    return new Promise(resolve => {
        const space = BOARD[sid];
        const hex   = space.group ? GROUP_HEX[space.group]
                    : space.type === "railroad" ? GROUP_HEX.railroad : GROUP_HEX.utility;

        document.getElementById("buy-color-bar").style.background = hex;
        document.getElementById("buy-space-type").textContent =
            space.type === "railroad" ? "RAILROAD"
            : space.type === "utility" ? "UTILITY" : "PROPERTY";
        document.getElementById("buy-name").textContent      = space.name;
        document.getElementById("buy-price-tag").textContent = `$${space.price}`;
        document.getElementById("buy-afford-note").textContent= `Your cash: $${player.money.toLocaleString()}`;

        // Fill rent table — hide house rows for non-color-group properties
        const hasHouses = !!space.rent;
        document.getElementById("br-house-row").style.display = hasHouses ? "" : "none";
        for (let i = 0; i <= 5; i++) {
            const el = document.getElementById(`br-${i}`);
            if (el) el.textContent = hasHouses ? `$${space.rent[i]}` : (i === 0 ? "See rules" : "—");
        }
        const hEl = document.getElementById("br-h");
        if (hEl) hEl.textContent = hasHouses ? `$${space.houseCost}` : "—";

        document.getElementById("buy-modal").classList.remove("hidden");

        const buyBtn  = document.getElementById("btn-buy");
        const passBtn = document.getElementById("btn-pass");

        const cleanup = () => {
            document.getElementById("buy-modal").classList.add("hidden");
            buyBtn.removeEventListener("click",  onBuy);
            passBtn.removeEventListener("click", onPass);
        };

        const onBuy = async () => {
            cleanup();
            player.money -= space.price;
            player.properties.push(sid);
            logP(player, `bought ${space.name} for $${space.price}`, "good");
            SystemUI.playSound("win");
            renderAll();
            resolve();
        };

        const onPass = async () => {
            cleanup();
            logP(player, `passed on ${space.name} — going to auction`);
            await startAuction(sid);
            resolve();
        };

        buyBtn.addEventListener("click",  onBuy);
        passBtn.addEventListener("click", onPass);

        if (player.isAI) {
            setTimeout(() => aiDecideBuy(player, sid) ? onBuy() : onPass(), 700);
        }
    });
}

function startAuction(sid) {
    return new Promise(resolve => {
        const space = BOARD[sid];
        const hex   = space.group ? GROUP_HEX[space.group] : GROUP_HEX.railroad;

        let bid      = 10;
        let leaderId = null; // null = no one has bid yet
        let folded   = [];
        let timeLeft = 15;
        let timer    = null;

        document.getElementById("auction-color-bar").style.background = hex;
        document.getElementById("auction-name").textContent           = space.name;
        document.getElementById("auction-bid-amt").textContent        = `$${bid}`;
        document.getElementById("auction-leader-name").textContent    = "No bid yet";
        document.getElementById("auction-countdown").textContent      = timeLeft;
        document.getElementById("auction-folded-row").textContent     = "";
        document.getElementById("auction-modal").classList.remove("hidden");

        // AI players each bid once upfront
        activePlayers().forEach(p => {
            if (!p.isAI) return;
            const maxWilling = Math.floor(space.price * (aiDifficulty === "hard" ? 0.85 : aiDifficulty === "medium" ? 0.65 : 0.45));
            if (p.money >= bid + 10 && bid <= maxWilling) {
                bid += 10;
                leaderId = p.id;
                document.getElementById("auction-bid-amt").textContent     = `$${bid}`;
                document.getElementById("auction-leader-name").textContent = p.name;
            } else {
                folded.push(p.id);
            }
        });
        updateFoldedDisplay();

        timer = setInterval(() => {
            timeLeft--;
            document.getElementById("auction-countdown").textContent = timeLeft;
            if (timeLeft <= 0) { clearInterval(timer); finish(); }
        }, 1000);

        const bidUp  = document.getElementById("btn-bid-up");
        const bidOut = document.getElementById("btn-bid-out");

        const humanId = players.find(p => !p.isAI)?.id;

        const onBid = () => {
            if (!humanId || folded.includes(humanId)) return;
            const human = players.find(p => p.id === humanId);
            if (!human || human.money < bid + 10) return;
            bid += 10; leaderId = humanId;
            timeLeft = 12; // reset timer on new bid
            document.getElementById("auction-bid-amt").textContent     = `$${bid}`;
            document.getElementById("auction-leader-name").textContent = human.name;
        };

        const onFold = () => {
            if (humanId && !folded.includes(humanId)) {
                folded.push(humanId);
                updateFoldedDisplay();
            }
            const active = activePlayers().filter(p => !folded.includes(p.id));
            if (active.length === 0) { clearInterval(timer); finish(); }
        };

        function updateFoldedDisplay() {
            const names = folded.map(id => players.find(p => p.id === id)?.name).filter(Boolean);
            document.getElementById("auction-folded-row").textContent =
                names.length ? `Folded: ${names.join(", ")}` : "";
        }

        function finish() {
            bidUp.removeEventListener("click", onBid);
            bidOut.removeEventListener("click", onFold);
            document.getElementById("auction-modal").classList.add("hidden");

            if (leaderId !== null) {
                const winner = players.find(p => p.id === leaderId);
                if (winner && winner.money >= bid) {
                    winner.money -= bid;
                    winner.properties.push(sid);
                    logP(winner, `won auction for ${space.name} at $${bid}`, "good");
                    SystemUI.playSound("win");
                }
            } else {
                log(`${space.name} returned to bank — no bids`);
            }
            renderAll();
            resolve();
        }

        bidUp.addEventListener("click", onBid);
        bidOut.addEventListener("click", onFold);
    });
}

// ── 17. PAYING / BANKRUPTCY ───────────────────
async function chargePlayer(player, amount, recipient) {
    if (player.money >= amount) {
        player.money -= amount;
        if (recipient) recipient.money += amount;
        renderPlayerCards();
        return;
    }
    // Try to raise funds by auto-mortgaging cheapest properties
    await raiseFunds(player, amount);

    const actual = Math.min(player.money, amount);
    player.money -= actual;
    if (recipient) recipient.money += actual;

    if (actual < amount) {
        await declareBankrupt(player, recipient);
    }
    renderPlayerCards();
}

async function raiseFunds(player, needed) {
    // Auto-mortgage cheapest unbuilt properties first
    const mortgageable = player.properties
        .filter(sid => !player.mortgaged.includes(sid) && !(player.houses[sid] > 0) && !player.hotels[sid])
        .sort((a, b) => BOARD[a].mortgage - BOARD[b].mortgage);

    for (const sid of mortgageable) {
        if (player.money >= needed) break;
        player.mortgaged.push(sid);
        player.money += BOARD[sid].mortgage;
        logP(player, `auto-mortgaged ${BOARD[sid].name} for $${BOARD[sid].mortgage}`);
    }
}

async function declareBankrupt(player, creditor) {
    player.bankrupt = true;
    logP(player, "is BANKRUPT 💸", "bad");
    SystemUI.playSound("lose");

    if (creditor) {
        player.properties.forEach(sid => creditor.properties.push(sid));
        creditor.money += Math.max(0, player.money);
        // Return buildings to bank
        player.properties.forEach(sid => {
            bankHouses += player.houses[sid] || 0;
            if (player.hotels[sid]) bankHotels++;
        });
        logP(creditor, `received all of ${player.name}'s assets`, "good");
    } else {
        // Return all buildings to bank
        player.properties.forEach(sid => {
            bankHouses += player.houses[sid] || 0;
            if (player.hotels[sid]) bankHotels++;
        });
    }

    player.properties = []; player.houses = {}; player.hotels = {};
    player.mortgaged  = []; player.money  = 0;

    renderAll();
    await sleep(800);

    if (checkWinCondition()) return;

    // If the bankrupt player was the current turn holder, skip to next
    if (turnIdx === player.idx) {
        await endTurn();
    }
}

function checkWinCondition() {
    const alive = activePlayers();
    if (alive.length <= 1) {
        endGame(alive[0] || null);
        return true;
    }
    return false;
}

// ── 18. BUILD / MANAGE MODAL ──────────────────
function openManageModal() {
    const player = currentPlayer();
    const list   = document.getElementById("manage-list");
    list.innerHTML = "";

    // Collect which groups the player has properties in
    const ownedGroups = {};
    player.properties.forEach(sid => {
        const sp  = BOARD[sid];
        const grp = sp.group || sp.type;
        if (!ownedGroups[grp]) ownedGroups[grp] = [];
        ownedGroups[grp].push(sid);
    });

    if (Object.keys(ownedGroups).length === 0) {
        list.innerHTML = `<div style="color:var(--muted);font-size:0.63rem;text-align:center;padding:20px">No properties owned yet.</div>`;
        document.getElementById("manage-modal").classList.remove("hidden");
        return;
    }

    Object.entries(ownedGroups).forEach(([grp, sids]) => {
        const mono  = hasMonopoly(player, grp);
        const color = GROUP_HEX[grp] || "#888";

        const groupEl = document.createElement("div");
        groupEl.className = "mg-group";

        let hdr = `<div class="mg-group-hdr">
            <div class="mg-group-dot" style="background:${color}"></div>
            <div class="mg-group-name">${grp.toUpperCase()}</div>
            ${mono ? '<div class="mg-monopoly-badge">✓ MONOPOLY</div>' : ""}
        </div>`;
        groupEl.innerHTML = hdr;

        sids.forEach(sid => {
            const sp        = BOARD[sid];
            const houses    = player.houses[sid]    || 0;
            const hotel     = player.hotels[sid]    || false;
            const mortgaged = player.mortgaged.includes(sid);
            const houseTxt  = hotel ? "🏨 Hotel" : houses > 0 ? `🏠×${houses}` : "—";

            // Build conditions
            const canBuild  = mono && sp.type === "property" && !mortgaged && !hotel && houses < 4
                && player.money >= sp.houseCost
                && canBuildEven(player, grp, sid)
                && bankHouses > 0;
            const canHotel  = mono && sp.type === "property" && !mortgaged && houses === 4
                && player.money >= sp.houseCost
                && bankHotels > 0;
            const canSell   = houses > 0 || hotel;
            const canMort   = !mortgaged && houses === 0 && !hotel;
            const canUnmort = mortgaged && player.money >= Math.floor(sp.mortgage * 1.1);

            const row = document.createElement("div");
            row.className = "mg-prop";
            row.innerHTML = `
                <div class="mg-prop-name">${sp.name}</div>
                <div class="mg-prop-houses">${houseTxt}</div>
                <div class="mg-btns">
                    ${canBuild  ? `<button class="mg-btn build-btn" data-sid="${sid}">+🏠 $${sp.houseCost}</button>` : ""}
                    ${canHotel  ? `<button class="mg-btn hotel-btn" data-sid="${sid}">+🏨 $${sp.houseCost}</button>` : ""}
                    ${canSell   ? `<button class="mg-btn sell-btn"  data-sid="${sid}">Sell</button>` : ""}
                    ${canMort   ? `<button class="mg-btn mort-btn"  data-sid="${sid}">Mortgage $${sp.mortgage}</button>` : ""}
                    ${canUnmort ? `<button class="mg-btn mort-btn is-mortgaged" data-sid="${sid}">Unmortgage $${Math.floor(sp.mortgage*1.1)}</button>` : ""}
                    ${mortgaged && !canUnmort ? `<span style="font-size:0.54rem;color:var(--muted);padding:0 4px">MORTGAGED</span>` : ""}
                </div>`;
            groupEl.appendChild(row);
        });

        list.appendChild(groupEl);
    });

    // Wire up buttons
    list.querySelectorAll(".build-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const sid = parseInt(btn.dataset.sid);
            const sp  = BOARD[sid];
            const p   = currentPlayer();
            p.money -= sp.houseCost;
            p.houses[sid] = (p.houses[sid] || 0) + 1;
            bankHouses--;
            logP(p, `built a house on ${sp.name}`, "good");
            SystemUI.playSound("win");
            openManageModal(); renderAll();
        });
    });

    list.querySelectorAll(".hotel-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const sid = parseInt(btn.dataset.sid);
            const sp  = BOARD[sid];
            const p   = currentPlayer();
            // Return the 4 houses to the bank, deduct hotel cost
            bankHouses += 4; bankHotels--;
            delete p.houses[sid];
            p.hotels[sid] = true;
            p.money -= sp.houseCost;
            logP(p, `built a hotel on ${sp.name}`, "good");
            SystemUI.playSound("win");
            openManageModal(); renderAll();
        });
    });

    list.querySelectorAll(".sell-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const sid = parseInt(btn.dataset.sid);
            const sp  = BOARD[sid];
            const p   = currentPlayer();
            if (p.hotels[sid]) {
                p.hotels[sid] = false; bankHotels++;
                p.houses[sid] = 4;     // hotel → 4 houses
                // Sell one of those houses
                p.houses[sid]--; bankHouses++;
                p.money += Math.floor(sp.houseCost / 2);
                logP(p, `sold hotel on ${sp.name} → 3 houses`);
            } else if ((p.houses[sid] || 0) > 0) {
                p.houses[sid]--; bankHouses++;
                if (p.houses[sid] === 0) delete p.houses[sid];
                p.money += Math.floor(sp.houseCost / 2);
                logP(p, `sold a house on ${sp.name}`);
            }
            openManageModal(); renderAll();
        });
    });

    list.querySelectorAll(".mort-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const sid = parseInt(btn.dataset.sid);
            const sp  = BOARD[sid];
            const p   = currentPlayer();
            if (p.mortgaged.includes(sid)) {
                const cost = Math.floor(sp.mortgage * 1.1);
                p.mortgaged = p.mortgaged.filter(s => s !== sid);
                p.money -= cost;
                logP(p, `unmortgaged ${sp.name} for $${cost}`);
            } else {
                p.mortgaged.push(sid);
                p.money += sp.mortgage;
                logP(p, `mortgaged ${sp.name} for $${sp.mortgage}`);
            }
            openManageModal(); renderAll();
        });
    });

    document.getElementById("manage-modal").classList.remove("hidden");
}

// ── 19. PROPERTY DEED MODAL ───────────────────
function openDeedModal(sid) {
    const space = BOARD[sid];
    const owner = getOwner(sid);
    const hex   = space.group ? GROUP_HEX[space.group] : GROUP_HEX[space.type] || "#888";

    document.getElementById("deed-color-bar").style.background = hex;
    document.getElementById("deed-type-lbl").textContent =
        space.type === "railroad" ? "RAILROAD DEED"
        : space.type === "utility" ? "UTILITY DEED" : "TITLE DEED";
    document.getElementById("deed-name").textContent  = space.name;
    document.getElementById("deed-owner").textContent = owner ? owner.name : "Bank";
    document.getElementById("deed-owner").style.color = owner ? owner.hex : "var(--muted)";

    const hasTiers = !!space.rent;
    document.getElementById("dr-house-row").style.display = hasTiers ? "" : "none";
    for (let i = 0; i <= 5; i++) {
        const el = document.getElementById(`dr-${i}`);
        if (el) el.textContent = hasTiers ? `$${space.rent[i]}` : (i === 0 ? "Varies" : "—");
    }
    const hEl = document.getElementById("dr-h");
    if (hEl) hEl.textContent = hasTiers ? `$${space.houseCost}` : "—";

    // Status line — mortgage / current buildings
    let status = "";
    if (owner) {
        if (owner.mortgaged.includes(sid)) status = "⚠️ MORTGAGED";
        else if (owner.hotels[sid])        status = "🏨 Hotel";
        else if ((owner.houses[sid] || 0) > 0) status = `🏠 ${"House".repeat(owner.houses[sid])} ×${owner.houses[sid]}`;
        else if (hasMonopoly(owner, space.group)) status = "✓ Monopoly (rent ×2)";
    }
    document.getElementById("deed-status").textContent = status;

    document.getElementById("deed-modal").classList.remove("hidden");
}

document.getElementById("deed-close-btn").addEventListener("click", () => {
    document.getElementById("deed-modal").classList.add("hidden");
});

// ── 20. TRADE SYSTEM ──────────────────────────
/*
 * In hotseat mode: both players share the screen, so the trade system
 * shows a two-step dialog — proposer configures the offer, then we
 * "hand the screen to" the target player to accept/reject.
 *
 * In AI mode: AI always auto-evaluates and responds.
 */
let tradeState = { targetId: null, offerSids: [], wantSids: [] };

function openTradeModal() {
    const cp = currentPlayer();
    tradeState = { targetId: null, offerSids: [], wantSids: [] };

    // Populate target player pills
    const pills = document.getElementById("trade-target-pills");
    pills.innerHTML = "";
    activePlayers().filter(p => p.id !== cp.id).forEach(p => {
        const btn = document.createElement("button");
        btn.className   = "trade-target-pill";
        btn.dataset.id  = p.id;
        btn.style.borderColor = p.hex;
        btn.textContent = p.name.toUpperCase();
        btn.addEventListener("click", () => {
            pills.querySelectorAll(".trade-target-pill").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            tradeState.targetId = p.id;
            populateTradeCols(cp, p);
        });
        pills.appendChild(btn);
    });

    // Pre-select the first available target
    const firstTarget = activePlayers().find(p => p.id !== cp.id);
    if (firstTarget) {
        pills.firstChild?.click();
    }

    document.getElementById("trade-offer-cash").value = 0;
    document.getElementById("trade-want-cash").value  = 0;
    document.getElementById("trade-modal").classList.remove("hidden");
}

function populateTradeCols(proposer, target) {
    tradeState.offerSids = [];
    tradeState.wantSids  = [];

    const offerDiv = document.getElementById("trade-offer-props");
    const wantDiv  = document.getElementById("trade-want-props");
    offerDiv.innerHTML = "";
    wantDiv.innerHTML  = "";

    const makePropBtn = (sid, side) => {
        const sp  = BOARD[sid];
        const hex = sp.group ? GROUP_HEX[sp.group] : GROUP_HEX[sp.type] || "#888";
        const btn = document.createElement("button");
        btn.className = "trade-prop-btn";
        btn.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${hex};display:inline-block;flex-shrink:0"></span>${sp.name}`;
        btn.addEventListener("click", () => {
            btn.classList.toggle("selected");
            if (btn.classList.contains("selected")) {
                if (side === "offer") tradeState.offerSids.push(sid);
                else                  tradeState.wantSids.push(sid);
            } else {
                if (side === "offer") tradeState.offerSids = tradeState.offerSids.filter(s => s !== sid);
                else                  tradeState.wantSids  = tradeState.wantSids.filter(s => s !== sid);
            }
        });
        return btn;
    };

    proposer.properties.forEach(sid => offerDiv.appendChild(makePropBtn(sid, "offer")));
    target.properties.forEach(sid   => wantDiv.appendChild(makePropBtn(sid, "want")));

    if (proposer.properties.length === 0)
        offerDiv.innerHTML = `<div style="color:var(--muted);font-size:0.6rem;padding:4px">No properties to offer</div>`;
    if (target.properties.length === 0)
        wantDiv.innerHTML  = `<div style="color:var(--muted);font-size:0.6rem;padding:4px">Target has no properties</div>`;
}

document.getElementById("trade-send-btn").addEventListener("click", () => {
    const cp     = currentPlayer();
    const target = players.find(p => p.id === tradeState.targetId);
    if (!target) { log("Select a trade partner first.", "bad"); return; }

    const offerCash = parseInt(document.getElementById("trade-offer-cash").value) || 0;
    const wantCash  = parseInt(document.getElementById("trade-want-cash").value)  || 0;

    if (offerCash > cp.money) {
        log("You don't have enough cash to offer that.", "bad"); return;
    }

    document.getElementById("trade-modal").classList.add("hidden");

    if (target.isAI) {
        // AI evaluates: accept if the deal is roughly fair in their favour
        const offerVal = tradeState.offerSids.reduce((s, id) => s + (BOARD[id].price || 0), offerCash);
        const wantVal  = tradeState.wantSids.reduce((s, id)  => s + (BOARD[id].price || 0), wantCash);
        const aiAccepts= offerVal >= wantVal * (aiDifficulty === "easy" ? 0.7 : aiDifficulty === "medium" ? 0.9 : 1.05);
        if (aiAccepts) {
            executeTrade(cp, target, tradeState.offerSids, tradeState.wantSids, offerCash, wantCash);
            log(`${target.name} accepted the trade!`, "good");
        } else {
            log(`${target.name} rejected the trade.`, "bad");
        }
        return;
    }

    // Hotseat: show response modal to the target player
    pendingTrade = { proposer: cp, target, offerSids: [...tradeState.offerSids], wantSids: [...tradeState.wantSids], offerCash, wantCash };
    showTradeResponseModal(pendingTrade);
});

document.getElementById("trade-cancel-btn").addEventListener("click", () => {
    document.getElementById("trade-modal").classList.add("hidden");
});

function showTradeResponseModal(trade) {
    const offerPropNames = trade.offerSids.map(s => BOARD[s].name).join(", ") || "—";
    const wantPropNames  = trade.wantSids.map(s => BOARD[s].name).join(", ")  || "—";

    document.getElementById("trade-resp-from").innerHTML =
        `<span style="color:${trade.proposer.hex};font-weight:700">${trade.proposer.name}</span> offers a trade to you`;

    document.getElementById("trade-resp-summary").innerHTML =
        `<b>They offer:</b><br>${offerPropNames}${trade.offerCash > 0 ? ` + $${trade.offerCash}` : ""}<br><br>` +
        `<b>They want:</b><br>${wantPropNames}${trade.wantCash > 0 ? ` + $${trade.wantCash}` : ""}`;

    document.getElementById("trade-response-modal").classList.remove("hidden");
}

document.getElementById("trade-accept-btn").addEventListener("click", () => {
    document.getElementById("trade-response-modal").classList.add("hidden");
    if (!pendingTrade) return;
    const { proposer, target, offerSids, wantSids, offerCash, wantCash } = pendingTrade;
    executeTrade(proposer, target, offerSids, wantSids, offerCash, wantCash);
    log(`${target.name} accepted the trade!`, "good");
    pendingTrade = null;
});

document.getElementById("trade-reject-btn").addEventListener("click", () => {
    document.getElementById("trade-response-modal").classList.add("hidden");
    if (pendingTrade) {
        log(`${pendingTrade.target.name} rejected the trade.`, "bad");
        pendingTrade = null;
    }
});

function executeTrade(proposer, target, offerSids, wantSids, offerCash, wantCash) {
    offerSids.forEach(sid => {
        proposer.properties = proposer.properties.filter(s => s !== sid);
        target.properties.push(sid);
        // Clear buildings — trades transfer bare property
        delete proposer.houses[sid]; delete proposer.hotels[sid];
        proposer.mortgaged = proposer.mortgaged.filter(s => s !== sid);
    });
    wantSids.forEach(sid => {
        target.properties = target.properties.filter(s => s !== sid);
        proposer.properties.push(sid);
        delete target.houses[sid]; delete target.hotels[sid];
        target.mortgaged = target.mortgaged.filter(s => s !== sid);
    });
    proposer.money -= offerCash; target.money  += offerCash;
    target.money   -= wantCash;  proposer.money += wantCash;

    const offPropTxt = offerSids.map(s => BOARD[s].name).join(", ") || "cash only";
    logP(proposer, `traded ${offPropTxt}${offerCash ? ` +$${offerCash}` : ""} → ${target.name}`, "highlight");
    SystemUI.playSound("win");
    renderAll();
}

// ── 21. AI LOGIC ──────────────────────────────
function aiDecideBuy(player, sid) {
    const space = BOARD[sid];
    if (player.money < space.price) return false;
    const chance = aiDifficulty === "easy" ? 0.75 : 1.0; // easy AI skips ~25%
    return Math.random() < chance;
}

async function aiDoTurn(player) {
    // Jail: pay bail or use card if we've been here at least 1 turn
    if (player.inJail) {
        if (player.jailFreeCards > 0) {
            player.jailFreeCards--;
            player.inJail = false; player.jailTurns = 0;
            logP(player, "used Get Out of Jail Free card", "good");
        } else if (player.money >= 50 && (player.jailTurns >= 1 || aiDifficulty === "hard")) {
            player.money -= 50;
            player.inJail = false; player.jailTurns = 0;
            logP(player, "paid $50 bail");
        }
        // Otherwise try to roll doubles
    }
    await doRoll();
}

async function aiEndTurn(player) {
    // Build houses when holding monopoly (medium/hard AI only)
    if (aiDifficulty !== "easy") {
        outer:
        for (const [group, g] of Object.entries(GROUPS)) {
            if (!hasMonopoly(player, group)) continue;
            if (group === "railroad" || group === "utility") continue;
            for (const sid of g.spaces) {
                if (player.mortgaged.includes(sid)) continue;
                if (player.hotels[sid]) continue;
                const houses = player.houses[sid] || 0;
                if (houses < 4 && bankHouses > 0
                    && player.money >= BOARD[sid].houseCost * 1.5
                    && canBuildEven(player, group, sid)) {
                    player.houses[sid] = houses + 1;
                    player.money -= BOARD[sid].houseCost;
                    bankHouses--;
                    logP(player, `built a house on ${BOARD[sid].name}`);
                }
            }
        }
    }
    await sleep(500);
    await endTurn();
}

// ── 22. TURN FLOW ─────────────────────────────
async function endTurn() {
    const cp = currentPlayer();

    // Doubles let the same player roll again
    if (doublesRolled > 0 && !cp.inJail && !cp.bankrupt) {
        logP(cp, "rolled doubles — gets another turn!");
        phase = "roll"; renderAll();
        if (cp.isAI) { await sleep(700); await aiDoTurn(cp); }
        return;
    }

    doublesRolled = 0;

    // Find the next non-bankrupt player
    let next = (turnIdx + 1) % players.length;
    let guard = 0;
    while (players[next].bankrupt && guard++ < players.length) {
        next = (next + 1) % players.length;
    }
    turnIdx = next;

    if (gameMode === "online") pushOnlineState();

    await sleep(280);
    await startTurn();
}

// ── 23. GAME OVER ─────────────────────────────
function endGame(winner) {
    phase = "gameover";
    SystemUI.playSound(winner ? "win" : "lose");

    document.getElementById("go-emoji").textContent   = winner ? "🏆" : "🤝";
    document.getElementById("go-title").textContent   = winner ? `${winner.name.toUpperCase()} WINS!` : "GAME OVER";
    document.getElementById("go-subtitle").textContent= winner ? "Last player standing!" : "All players bankrupt.";

    document.getElementById("go-stats").innerHTML = players.map(p =>
        `${p.bankrupt ? "💀" : "✓"} ${p.name}: $${p.money.toLocaleString()} · ${p.properties.length} props`
    ).join("<br>");

    document.getElementById("gameover-modal").classList.remove("hidden");
}

// ── 24. START GAME ────────────────────────────
function startGame() {
    phase = "idle"; doublesRolled = 0; turnIdx = 0;
    gameLog = []; chanceIdx = 0; chestIdx = 0;
    bankHouses = 32; bankHotels = 12;
    pendingTrade = null;

    const total = gameMode === "online" ? 2 : playerCount;
    players = [];

    if (gameMode === "ai") {
        players.push(createPlayer(0, p1Name, false));
        for (let i = 1; i < total; i++) players.push(createPlayer(i, `AI ${i}`, true));
    } else if (gameMode === "hotseat") {
        for (let i = 0; i < total; i++) {
            const name = i === 0 ? p1Name : `Player ${i + 1}`;
            players.push(createPlayer(i, name, false));
        }
    } else {
        // Online: P1 = self, P2 = opponent
        players.push(createPlayer(0, p1Name, false));
        players.push(createPlayer(1, "Opponent", false));
    }

    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("loading-screen").classList.add("hidden");
    document.getElementById("game-area").classList.remove("hidden");

    renderAll();
    log(`🎲 GAME STARTED — ${players.map(p=>p.name).join(" vs ")}`);

    startTurn();
}

// ── 25. ONLINE MULTIPLAYER ────────────────────
SystemUI.v2Lobby.setup({
    onHost: () => {
        currentRoomId = Math.random().toString(36).substring(2,6).toUpperCase();
        isHost = true; myId = 1; chatStarted = false;
        seats = [
            { type:"human", name:SystemUI.getPlayerName() },
            { type:"ai",    name:"Waiting for opponent…" }
        ];
        window.dbSet(window.dbRef(window.db, `mono_rooms/${currentRoomId}`), {
            status:"waiting", p1Name, seats
        }).then(() => {
            SystemUI.v2Lobby.showRoomPhase(currentRoomId, true);
            listenToOnlineRoom();
        });
    },
    onJoin: (code) => {
        window.dbGet(window.dbChild(window.dbRef(window.db), `mono_rooms/${code}`))
            .then(snap => {
                if (snap.exists() && snap.val().status === "waiting") {
                    currentRoomId = code; isHost = false; myId = 2; chatStarted = false;
                    const data = snap.val();
                    const updSeats = data.seats ? [...data.seats]
                        : [{type:"human",name:data.p1Name||"P1"},{type:"ai",name:"Slot 2"}];
                    updSeats[1] = { type:"human", name:SystemUI.getPlayerName() };
                    window.dbUpdate(window.dbRef(window.db, `mono_rooms/${code}`), {
                        p2Name: p1Name, seats: updSeats
                    });
                    SystemUI.v2Lobby.showRoomPhase(code, false);
                    listenToOnlineRoom();
                } else {
                    SystemUI.v2Lobby.showError("ROOM NOT FOUND OR ALREADY STARTED");
                }
            });
    },
    onLeave: () => {
        gameMode = "ai";
        const el = document.getElementById("sys-mono-mode");
        if (el) el.value = "ai";
        localStorage.setItem("mono_mode", "ai");
        SystemUI.stopChat(); chatStarted = false;
    },
    onStart: () => {
        window.dbUpdate(window.dbRef(window.db, `mono_rooms/${currentRoomId}`), { status:"playing" });
    },
    onClose: () => {
        if (gameMode === "online" && phase === "idle") {
            gameMode = "ai";
            const el = document.getElementById("sys-mono-mode");
            if (el) el.value = "ai";
            localStorage.setItem("mono_mode", "ai");
        }
    }
});

function listenToOnlineRoom() {
    let started = false;
    window.dbOnValue(window.dbRef(window.db, `mono_rooms/${currentRoomId}`), snap => {
        const data = snap.val();
        if (!data) return;
        if (data.seats) { seats = data.seats; SystemUI.v2Lobby.renderSeats(seats); }
        if (data.status === "playing" && !started) {
            started = true;
            SystemUI.v2Lobby.hide();
            if (!chatStarted) {
                chatStarted = true;
                SystemUI.playSound("win");
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }
            if (isHost) {
                if (players[1]) players[1].name = data.p2Name || "Opponent";
                startGame();
            } else {
                document.getElementById("start-screen").classList.add("hidden");
                document.getElementById("loading-screen").classList.remove("hidden");
                document.getElementById("loading-text").textContent = "WAITING FOR HOST…";
            }
            return;
        }
        if (started && data.gameState) syncOnlineState(data.gameState);
    });
}

function pushOnlineState() {
    if (!currentRoomId) return;
    window.dbUpdate(window.dbRef(window.db, `mono_rooms/${currentRoomId}`), {
        gameState: JSON.stringify({ players, turnIdx, doublesRolled, phase, diceVal, chanceIdx, chestIdx, bankHouses, bankHotels })
    });
}

function syncOnlineState(raw) {
    try {
        const s = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (s.turnIdx !== undefined && players[s.turnIdx]?.id !== myId) {
            players = s.players; turnIdx = s.turnIdx; doublesRolled = s.doublesRolled;
            phase = s.phase; diceVal = s.diceVal; chanceIdx = s.chanceIdx; chestIdx = s.chestIdx;
            bankHouses = s.bankHouses; bankHotels = s.bankHotels;
            renderAll();
        }
    } catch(e) { console.error("Sync error:", e); }
}

// ── 26. EVENT LISTENERS ───────────────────────
document.getElementById("roll-btn").addEventListener("click", async () => {
    if (phase !== "roll") return;
    const cp = currentPlayer();
    if (cp.isAI) return;
    if (gameMode === "online" && cp.id !== myId) return;
    document.getElementById("roll-btn").disabled = true;
    await doRoll();
    document.getElementById("roll-btn").disabled = false;
});

document.getElementById("bail-btn").addEventListener("click", async () => {
    const cp = currentPlayer();
    if (!cp.inJail || cp.isAI) return;
    if (cp.money < 50) { log("Not enough cash to pay bail!", "bad"); return; }
    cp.money -= 50; cp.inJail = false; cp.jailTurns = 0;
    logP(cp, "paid $50 bail — freed from jail!", "good");
    document.getElementById("bail-btn").classList.add("hidden");
    document.getElementById("card-btn").classList.add("hidden");
    await doRoll();
});

document.getElementById("card-btn").addEventListener("click", async () => {
    const cp = currentPlayer();
    if (!cp.inJail || cp.jailFreeCards < 1 || cp.isAI) return;
    cp.jailFreeCards--; cp.inJail = false; cp.jailTurns = 0;
    logP(cp, "used Get Out of Jail Free card!", "good");
    document.getElementById("bail-btn").classList.add("hidden");
    document.getElementById("card-btn").classList.add("hidden");
    await doRoll();
});

document.getElementById("manage-btn").addEventListener("click", openManageModal);
document.getElementById("manage-close-btn").addEventListener("click", () => {
    document.getElementById("manage-modal").classList.add("hidden");
});

document.getElementById("trade-btn").addEventListener("click", openTradeModal);

document.getElementById("end-btn").addEventListener("click", async () => {
    if (phase !== "build") return;
    const cp = currentPlayer();
    if (cp.isAI) return;
    if (gameMode === "online" && cp.id !== myId) return;
    await endTurn();
});

document.getElementById("btn-play-again").addEventListener("click", () => {
    document.getElementById("gameover-modal").classList.add("hidden");
    document.getElementById("game-area").classList.add("hidden");
    document.getElementById("start-screen").classList.remove("hidden");
});

// ── 27. START-SCREEN WIRING ───────────────────
document.getElementById("start-btn").addEventListener("click", () => {
    if (gameMode === "online") { SystemUI.v2Lobby.show(); return; }
    startGame();
});

document.getElementById("start-settings").addEventListener("click", e => {
    const chip = e.target.closest(".ss-chip");
    if (!chip) return;
    const group = chip.dataset.group;
    const val   = chip.dataset.val;

    document.querySelectorAll(`.ss-chip[data-group="${group}"]`).forEach(c => c.classList.remove("active"));
    chip.classList.add("active");

    if      (group === "count")   { playerCount  = parseInt(val); localStorage.setItem("mono_pcount", val); }
    else if (group === "ai-diff") { aiDifficulty = val;           localStorage.setItem("mono_ai_diff", val); }
    else if (group === "cash")    { startingCash = parseInt(val); localStorage.setItem("mono_cash", val); }
});

// Show/hide AI row based on mode (runs once on load)
setTimeout(() => {
    const aiRow = document.getElementById("ss-ai-row");
    if (aiRow) aiRow.style.display = gameMode === "ai" ? "" : "none";
}, 15);