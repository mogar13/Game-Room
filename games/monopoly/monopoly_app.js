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
let stateSeq     = 0;     // Monotonic state counter — wall clocks aren't comparable across machines
let gameOverHandled = false; // Guards double stat-recording / double gameover modals
let onlineGameStarted = false;
let roomListener = null;  // Unsubscribe handles — leaked listeners kept firing after leave/re-host
let auctionActionListener = null;
let tradeRespListener = null;

let p1Name = SystemUI.getPlayerName();
let p1ColorIdx = 0;

const tradeStyleFix = document.createElement('style');
tradeStyleFix.innerHTML = `
    #trade-offer-props, #trade-want-props { max-height: 30vh; overflow-y: auto; padding-right: 5px; }
    #trade-resp-summary { max-height: 45vh; overflow-y: auto; padding-right: 5px; }
`;
document.head.appendChild(tradeStyleFix);

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
        
        if (gameMode === "online") {
            document.getElementById("start-settings").style.display = "none";
            document.getElementById("start-btn").style.display = "none";
        }
        
        modeEl.addEventListener("change", e => {
            gameMode = e.target.value;
            localStorage.setItem("mono_mode", gameMode);
            document.getElementById("sys-modal").classList.add("sys-hidden");
            if (gameMode === "online") {
                document.getElementById("start-settings").style.display = "none";
                document.getElementById("start-btn").style.display = "none";
                SystemUI.v2Lobby.show();
            } else {
                document.getElementById("start-settings").style.display = "";
                document.getElementById("start-btn").style.display = "";
                SystemUI.v2Lobby.hide();
                // Tear down hosted room / joined seat so it can't ghost in Firebase
                if (window.SystemMatch) SystemMatch.cleanup();
                SystemUI.stopChat();
                chatStarted = false;
            }
            const aiRow = document.getElementById("ss-ai-row");
            if (aiRow) aiRow.style.display = gameMode === "ai" ? "" : "none";
        });
    }
}, 10);

// ── 2. BOARD DATA ─────────────────────────────
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

// ── 3. SPACE POSITIONS (Updated for CSS Grid 1.4/1/1.4 Ratio) ──
/*
 * Exact percentage mapping for the 11.8fr CSS Grid layout.
 */
const SPACE_POS = (() => {
    const pos = new Array(40);
    const start = 94.0678; 
    const end = 5.9322;    
    const edges = [83.898, 75.423, 66.949, 58.474, 50.0, 41.525, 33.05, 24.576, 16.101];

    pos[0] = { x: start, y: start };
    for (let i = 1; i <= 9; i++) pos[i] = { x: edges[i - 1], y: start };
    pos[10] = { x: end, y: start };

    for (let i = 11; i <= 19; i++) pos[i] = { x: end, y: edges[i - 11] };
    pos[20] = { x: end, y: end };

    for (let i = 21; i <= 29; i++) pos[i] = { x: 100 - edges[i - 21], y: end };
    pos[30] = { x: start, y: end };

    for (let i = 31; i <= 39; i++) pos[i] = { x: start, y: 100 - edges[i - 31] };
    
    return pos;
})();

const TOKEN_OFFSETS = [
    { dx: -2.0, dy: -2.0 }, { dx: 2.0, dy: -2.0 },
    { dx: -2.0, dy: 2.0 },  { dx: 2.0, dy: 2.0 },
];

const sfxDieShuffle = new Audio('../../system/audio/dieShuffle1.ogg');
const sfxDiceThrow = new Audio('../../system/audio/dice-throw-2.ogg');
const sfxCardSlide = new Audio('../../system/audio/card-slide-6.ogg');

// ── 4. CARD DECKS ─────────────────────────────
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
    "../../system/images/pieces/iso-pieces/PawnsA2.png",
    "../../system/images/pieces/iso-pieces/PawnsA5.png",
    "../../system/images/pieces/iso-pieces/PawnsA4.png",
    "../../system/images/pieces/iso-pieces/PawnsA3.png",
];
const DICE_FACES = [
    "../../system/images/dice/dieWhite_border1.png",
    "../../system/images/dice/dieWhite_border2.png",
    "../../system/images/dice/dieWhite_border3.png",
    "../../system/images/dice/dieWhite_border4.png",
    "../../system/images/dice/dieWhite_border5.png",
    "../../system/images/dice/dieWhite_border6.png",
];

const GROUP_HEX = {
    brown:"#8B4513", lightblue:"#87CEEB", pink:"#FF69B4", orange:"#FFA500",
    red:"#E53935", yellow:"#FDD835", green:"#2E7D32", darkblue:"#1565C0",
    railroad:"#666", utility:"#888"
};

function createPlayer(idx, name, isAI, colorIdx) {
    const ci = (colorIdx !== undefined) ? colorIdx : idx;
    return {
        id: idx + 1, idx, name, isAI,
        color: PLAYER_COLORS[ci],
        hex:   PLAYER_HEX[ci],
        piece: PLAYER_PIECES[ci],
        position:     0,
        money:        startingCash,
        properties:   [],
        houses:       {},
        hotels:       {},
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
let phase        = "idle"; 
let diceVal      = [1,1];
let gameLog      = [];
let bankHouses   = 32;
let bankHotels   = 12;
let pendingTrade = null;
let aiLastTradeTurn = {};

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
        if (tier === 0 && hasMonopoly(owner, space.group)) rent *= 2;
        return rent;
    }
    return 0;
}

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
    renderOwnershipOnBoard();
    renderTokens();
    renderBuildings();
    renderPlayerCards();
    renderActionPanel();
    renderBankSupply();
    renderLog();
    renderCardPiles();
}

function renderTokens() {
    const layer = document.getElementById("token-layer");
    if (!layer) return;
    layer.innerHTML = "";

    const byPos = {};
    activePlayers().forEach(p => {
        const key = p.inJail ? "10j" : String(p.position);
        if (!byPos[key]) byPos[key] = [];
        byPos[key].push(p);
    });

    activePlayers().forEach(p => {
        const key   = p.inJail ? "10j" : String(p.position);
        const group = byPos[key];
        const slot  = group.indexOf(p);
        const count = group.length;
        const sp    = SPACE_POS[p.position];

        let off = { dx: 0, dy: 0 };
        if (count === 2) {
            if (slot === 0) off = { dx: -1.5, dy: 0 };
            if (slot === 1) off = { dx: 1.5, dy: 0 };
        } else if (count === 3) {
            if (slot === 0) off = { dx: 0, dy: -1.5 };
            if (slot === 1) off = { dx: -1.5, dy: 1.5 };
            if (slot === 2) off = { dx: 1.5, dy: 1.5 };
        } else if (count >= 4) {
            if (slot === 0) off = { dx: -1.5, dy: -1.5 };
            if (slot === 1) off = { dx: 1.5, dy: -1.5 };
            if (slot === 2) off = { dx: -1.5, dy: 1.5 };
            if (slot === 3) off = { dx: 1.5, dy: 1.5 };
        }

        let spaceNudge = { dx: 0, dy: 0 };
        if (p.position === 10) {
            if (p.inJail) {
                spaceNudge = { dx: 2.0, dy: -2.0 };
            } else {
                spaceNudge = { dx: -2.5, dy: 2.5 };
            }
        }

        const img = document.createElement("img");
        img.className = "token";
        img.id        = `token-p${p.id}`;
        img.src       = p.piece;
        img.alt       = p.name;
        img.style.left= `${sp.x + off.dx + spaceNudge.dx}%`;
        img.style.top = `${sp.y + off.dy + spaceNudge.dy}%`;
        layer.appendChild(img);
    });
}

function renderOwnershipOnBoard() {
    document.querySelectorAll('.color-bar[data-sid]').forEach(bar => {
        const sid = parseInt(bar.dataset.sid);
        const space = BOARD[sid];
        if (!space || !space.group) return;
        const owner = getOwner(sid);
        if (!owner) {
            bar.style.background = '';
            bar.style.opacity = '';
            bar.classList.remove('color-bar-monopoly');
        } else if (owner.mortgaged.includes(sid)) {
            bar.style.background = owner.hex;
            bar.style.opacity = '0.35';
            bar.classList.remove('color-bar-monopoly');
        } else {
            bar.style.background = owner.hex;
            bar.style.opacity = '';
            if (hasMonopoly(owner, space.group)) {
                bar.classList.add('color-bar-monopoly');
            } else {
                bar.classList.remove('color-bar-monopoly');
            }
        }
    });

    document.querySelectorAll('.color-bar[data-sid]').forEach(bar => {
        const sid = parseInt(bar.dataset.sid);
        const spaceEl = bar.closest('.space');
        if (!spaceEl) return;
        const owner = getOwner(sid);
        if (owner) {
            spaceEl.style.cursor = 'pointer';
            spaceEl.onclick = (e) => { e.stopPropagation(); openDeedModal(sid); };
        } else {
            spaceEl.style.cursor = '';
            spaceEl.onclick = null;
        }
    });
}

function renderOwnership() {
    const layer = document.getElementById("ownership-layer");
    if (!layer) return;
    layer.innerHTML = "";

    players.forEach(p => {
        if (p.bankrupt) return;
        p.properties.forEach(sid => {
            const space = BOARD[sid];
            if (space.type !== "railroad" && space.type !== "utility") return;
            const sp  = SPACE_POS[sid];
            const dot = document.createElement("div");
            dot.className = "ownership-ring";

            let finalX = sp.x;
            let finalY = sp.y;
            if (sid >= 1 && sid <= 9) finalY = 85.5;
            else if (sid >= 11 && sid <= 19) finalX = 14.5;
            else if (sid >= 21 && sid <= 29) finalY = 14.5;
            else if (sid >= 31 && sid <= 39) finalX = 85.5;

            dot.style.left        = `${finalX}%`;
            dot.style.top         = `${finalY}%`;
            dot.style.borderRadius = "4px";
            dot.style.width       = "4.5%";
            dot.style.height      = "4.5%";
            dot.style.background  = p.hex;
            dot.dataset.sid       = sid;
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
            el.style.top  = `${sp.y - 4.2}%`;
            el.textContent= "🏠".repeat(n);
            layer.appendChild(el);
        });
        Object.entries(p.hotels).forEach(([sid, has]) => {
            if (!has) return;
            const sp  = SPACE_POS[parseInt(sid)];
            const el  = document.createElement("div");
            el.className  = "build-marker";
            el.style.left = `${sp.x}%`;
            el.style.top  = `${sp.y - 4.2}%`;
            el.textContent= "🏨";
            layer.appendChild(el);
        });
    });
}

function renderCardPiles() {
    const chance = document.getElementById("chance-pile");
    const chest = document.getElementById("chest-pile");
    if (chance) chance.innerHTML = `<div class="card-pile-inner chance-inner"><div class="pile-icon">?</div><div class="pile-text">CHANCE</div></div>`;
    if (chest) chest.innerHTML = `<div class="card-pile-inner chest-inner"><div class="pile-icon">📦</div><div class="pile-text">COMMUNITY<br>CHEST</div></div>`;
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
            if (activePlayers().some(p => p.id !== cp.id))
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

// ── 11. DICE ──────────────────────────────────
async function animateDice() {
    const d1 = document.getElementById("die1");
    const d2 = document.getElementById("die2");
    sfxDieShuffle.play().catch(e=>{});
    d1.classList.add("rolling");
    d2.classList.add("rolling");
    for (let i = 0; i < 14; i++) {
        d1.src = DICE_FACES[Math.floor(Math.random() * 6)];
        d2.src = DICE_FACES[Math.floor(Math.random() * 6)];
        await sleep(75);
    }
    d1.classList.remove("rolling");
    d2.classList.remove("rolling");
    d1.src = DICE_FACES[diceVal[0] - 1];
    d2.src = DICE_FACES[diceVal[1] - 1];

    const sum = diceVal[0] + diceVal[1];
    const dbl = diceVal[0] === diceVal[1];
    document.getElementById("dice-sum").textContent   = sum;
    document.getElementById("dice-label").textContent = dbl ? `⚡ DOUBLES  (${diceVal[0]}+${diceVal[1]})` : `${diceVal[0]} + ${diceVal[1]}`;
    sfxDiceThrow.play().catch(e=>{});
}

function rollDiceValues() {
    diceVal = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    return diceVal;
}

// ── 12. MOVEMENT ──────────────────────────────
async function movePlayer(player, steps) {
    for (let i = 0; i < steps; i++) {
        player.position = (player.position + 1) % 40;
        renderTokens();
        new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
        const tok = document.getElementById(`token-p${player.id}`);
        if (tok) {
            tok.classList.remove("hop");
            void tok.offsetWidth;
            tok.classList.add("hop");
            setTimeout(() => tok.classList.remove("hop"), 320);
        }
        if (player.position === 0 && i < steps - 1) {
            player.money += 200;
            logP(player, "passed GO — +$200 ✓", "good");
        }
        await sleep(380); 
    }
    if (player.position === 0) {
        player.money += 200;
        logP(player, "landed on GO — +$200 ✓", "good");
    }
    const tok = document.getElementById(`token-p${player.id}`);
    if (tok) { tok.classList.add("bounce"); setTimeout(() => tok.classList.remove("bounce"), 500); }
}

// ── 13. TURN ENGINE ───────────────────────────
async function startTurn() {
    phase = "roll";
    const cp = currentPlayer();
    if (!cp.isAI) doublesRolled = 0;
    renderAll();
    
    if (gameMode === "online") pushOnlineState();

    if (cp.isAI) {
        await sleep(1800); 
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

    if (gameMode === "online") pushOnlineState();

    await animateDice();

    if (cp.inJail) {
        if (dbl) {
            cp.inJail = false; cp.jailTurns = 0;
            doublesRolled = 0;
            logP(cp, `rolled doubles — freed from jail!`, "good");
        } else {
            cp.jailTurns++;
            if (cp.jailTurns >= 3) {
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

async function landOnSpace(player, diceTotal) {
    const sid   = player.position;
    const space = BOARD[sid];
    logP(player, `landed on <b>${space.name}</b>`);

    switch (space.type) {
        case "gotojail": await handleGoToJail(player);               break;
        case "tax":      await handleTax(player, space);             break;
        case "chance":   await handleCard(player, diceTotal, "chance"); break;
        case "chest":    await handleCard(player, diceTotal, "chest");  break;
        case "property":
        case "railroad":
        case "utility":  await handlePropertyLand(player, sid, diceTotal, false); break;
    }

    if (phase !== "gameover") {
        phase = "build";
        renderAll();
        if (gameMode === "online") pushOnlineState();
        if (player.isAI) await aiEndTurn(player);
    }
}

async function handleGoToJail(player) {
    sendToJail(player);
    logP(player, "⛓️ GO TO JAIL!", "bad");
    await sleep(1000);
}

function sendToJail(player) {
    player.position  = 10;
    player.inJail    = true;
    player.jailTurns = 0;
    renderTokens();
    new Audio('../../system/audio/defeat.mp3').play().catch(e=>{});
}

async function handleTax(player, space) {
    logP(player, `paid ${space.name} — -$${space.amount}`, "bad");
    await chargePlayer(player, space.amount, null);
    renderPlayerCards();
    await sleep(800);
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
        sfxCardSlide.play().catch(e=>{});
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

        if (card.action === "gain")       effect.textContent = `+$${card.amount}`;
        else if (card.action === "lose")  effect.textContent = `-$${card.amount}`;
        else if (card.action === "jail")  effect.textContent = "⛓️ JAIL";
        else if (card.action === "jailfree") effect.textContent = "🃏 CARD KEPT";
        else                              effect.textContent = "";

        if (!currentPlayer().isAI) document.getElementById("card-modal").classList.remove("hidden");
        const btn = document.getElementById("card-ok-btn");

        const done = () => {
            btn.removeEventListener("click", done);
            document.getElementById("card-modal").classList.add("hidden");
            resolve();
        };
        btn.addEventListener("click", done);
        if (currentPlayer().isAI) setTimeout(done, 2500);
    });
}

async function applyCard(player, card, diceTotal) {
    switch (card.action) {
        case "goto": {
            const oldPos = player.position;
            if (card.passGo && card.target < oldPos) {
                player.money += 200;
                logP(player, "passed GO — +$200", "good");
            }
            player.position = card.target;
            renderTokens();
            await sleep(800);
            await landOnSpace(player, diceTotal);
            break;
        }
        case "back3": {
            player.position = (player.position - 3 + 40) % 40;
            renderTokens(); await sleep(800);
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
            const target = rrs.find(r => r > player.position) ?? rrs[0];
            if (target <= player.position) { player.money += 200; logP(player, "passed GO — +$200","good"); }
            player.position = target;
            renderTokens(); await sleep(800);
            logP(player, `moved to nearest railroad: ${BOARD[target].name}`);
            await handlePropertyLand(player, target, diceTotal, card.doubleRent || false);
            break;
        }
        case "nearest_util": {
            const utils  = [12, 28];
            const target = utils.find(u => u > player.position) ?? utils[0];
            player.position = target;
            renderTokens(); await sleep(800);
            logP(player, `moved to nearest utility: ${BOARD[target].name}`);
            handlePropertyLand(player, target, diceTotal, false);
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

async function handlePropertyLand(player, sid, diceTotal, forceDoubleRent) {
    const space = BOARD[sid];
    const owner = getOwner(sid);

    if (!owner) {
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
        setTimeout(() => {
            document.getElementById("rent-overlay").classList.add("hidden");
            resolve();
        }, 2200);
    });
}

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

        const hasHouses = !!space.rent;
        document.getElementById("br-house-row").style.display = hasHouses ? "" : "none";
        for (let i = 0; i <= 5; i++) {
            const el = document.getElementById(`br-${i}`);
            if (el) el.textContent = hasHouses ? `$${space.rent[i]}` : (i === 0 ? "See rules" : "—");
        }
        const hEl = document.getElementById("br-h");
        if (hEl) hEl.textContent = hasHouses ? `$${space.houseCost}` : "—";

        if (!player.isAI) document.getElementById("buy-modal").classList.remove("hidden");
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
            new Audio('../../system/audio/victory.mp3').play().catch(e=>{});
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
            setTimeout(() => aiDecideBuy(player, sid) ? onBuy() : onPass(), 1500);
        }
    });
}

function startAuction(sid) {
    return new Promise(resolve => {
        const space = BOARD[sid];
        const hex   = space.group ? GROUP_HEX[space.group] : GROUP_HEX.railroad;

        let bid      = 10;
        let leaderId = null;
        let folded   = [];
        let timeLeft = 15;
        let timer    = null;

        document.getElementById("auction-color-bar").style.background = hex;
        document.getElementById("auction-name").textContent           = space.name;
        document.getElementById("auction-bid-amt").textContent        = `$${bid}`;
        document.getElementById("auction-leader-name").textContent    = "No bid yet";
        document.getElementById("auction-countdown").textContent      = timeLeft;
        document.getElementById("auction-folded-row").textContent     = "";
        
        window._currentAuctionOnBid = null;
        window._currentAuctionOnFold = null;

        // Referee rule: the client whose player triggered the auction runs it —
        // but when the current player is an AI no client matches its id, so the
        // HOST referees. (Without this the countdown never started and the
        // modal hung forever on every client.)
        const isAuctionHost = gameMode !== "online" ||
            (currentPlayer().isAI ? isHost : currentPlayer().id === myId);

        document.getElementById("auction-modal").classList.remove("hidden");

        if (isAuctionHost) {
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
                if (gameMode === "online") {
                    window.onlineAuctionState = { active: true, sid, bid, leaderId, folded, timeLeft, ts: Date.now() };
                    pushOnlineState();
                }
                if (timeLeft <= 0) { clearInterval(timer); finish(); }
            }, 1000);
        } else {
            window._auctionResolve = resolve; 
        }

        const bidUp  = document.getElementById("btn-bid-up");
        const bidOut = document.getElementById("btn-bid-out");
        const humanId = players.find(p => !p.isAI)?.id;

        const onBid = (forcedBidderId) => {
            const bId = typeof forcedBidderId === 'number' ? forcedBidderId : humanId;
            if (!bId || folded.includes(bId)) return;
            const human = players.find(p => p.id === bId);
            if (!human || human.money < bid + 10) return;
            bid += 10; leaderId = bId;
            timeLeft = 12;
            document.getElementById("auction-bid-amt").textContent     = `$${bid}`;
            document.getElementById("auction-leader-name").textContent = human.name;
        };

        const onFold = (forcedFolderId) => {
            const fId = typeof forcedFolderId === 'number' ? forcedFolderId : humanId;
            if (fId && !folded.includes(fId)) {
                folded.push(fId);
                updateFoldedDisplay();
            }
            const active = activePlayers().filter(p => !folded.includes(p.id));
            if (active.length === 0 && isAuctionHost) { clearInterval(timer); finish(); }
        };

        window._currentAuctionOnBid = onBid;
        window._currentAuctionOnFold = onFold;

        function updateFoldedDisplay() {
            const names = folded.map(id => players.find(p => p.id === id)?.name).filter(Boolean);
            document.getElementById("auction-folded-row").textContent =
                names.length ? `Folded: ${names.join(", ")}` : "";
        }

        function finish() {
            window._currentAuctionOnBid = null;
            window._currentAuctionOnFold = null;
            bidUp.removeEventListener("click", onBid);
            bidOut.removeEventListener("click", onFold);
            document.getElementById("auction-modal").classList.add("hidden");
            if (gameMode === "online" && isAuctionHost) {
                window.onlineAuctionState = { active: false, ts: Date.now() + 50 };
                pushOnlineState();
            }
            if (leaderId !== null) {
                const winner = players.find(p => p.id === leaderId);
                if (winner && winner.money >= bid) {
                    winner.money -= bid;
                    winner.properties.push(sid);
                    logP(winner, `won auction for ${space.name} at $${bid}`, "good");
                    new Audio('../../system/audio/victory.mp3').play().catch(e=>{});
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

async function chargePlayer(player, amount, recipient) {
    if (player.money >= amount) {
        player.money -= amount;
        if (recipient) recipient.money += amount;
        renderPlayerCards();
        return;
    }
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
    new Audio('../../system/audio/defeat.mp3').play().catch(e=>{});

    if (creditor) {
        player.properties.forEach(sid => creditor.properties.push(sid));
        creditor.money += Math.max(0, player.money);
        player.properties.forEach(sid => {
            bankHouses += player.houses[sid] || 0;
            if (player.hotels[sid]) bankHotels++;
        });
    } else {
        player.properties.forEach(sid => {
            bankHouses += player.houses[sid] || 0;
            if (player.hotels[sid]) bankHotels++;
        });
    }

    player.properties = []; player.houses = {}; player.hotels = {};
    player.mortgaged  = []; player.money  = 0;
    renderAll();
    // Sync the bankruptcy itself — the early return below skipped every
    // later push, so the other clients never saw it.
    if (gameMode === "online") pushOnlineState();
    await sleep(1000);
    if (checkWinCondition()) return;
    if (turnIdx === player.idx) { await endTurn(); }
}

function checkWinCondition() {
    const alive = activePlayers();
    if (alive.length <= 1) {
        endGame(alive[0] || null);
        return true;
    }
    return false;
}

function openManageModal() {
    const player = currentPlayer();
    const list   = document.getElementById("manage-list");
    list.innerHTML = "";

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

    list.querySelectorAll(".build-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const sid = parseInt(btn.dataset.sid);
            const sp  = BOARD[sid];
            const p   = currentPlayer();
            p.money -= sp.houseCost;
            p.houses[sid] = (p.houses[sid] || 0) + 1;
            bankHouses--;
            logP(p, `built a house on ${sp.name}`, "good");
            new Audio('../../system/audio/victory.mp3').play().catch(e=>{});
            openManageModal(); renderAll();
        });
    });

    list.querySelectorAll(".hotel-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const sid = parseInt(btn.dataset.sid);
            const sp  = BOARD[sid];
            const p   = currentPlayer();
            bankHouses += 4; bankHotels--;
            delete p.houses[sid];
            p.hotels[sid] = true;
            p.money -= sp.houseCost;
            logP(p, `built a hotel on ${sp.name}`, "good");
            new Audio('../../system/audio/victory.mp3').play().catch(e=>{});
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
                p.houses[sid] = 4;
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

    let status = "";
    if (owner) {
        if (owner.mortgaged.includes(sid)) status = "⚠️ MORTGAGED";
        else if (owner.hotels[sid])        status = "🏨 Hotel";
        else if ((owner.houses[sid] || 0) > 0) status = `🏠 ×${owner.houses[sid]}`;
        else if (hasMonopoly(owner, space.group)) status = "✓ Monopoly (rent ×2)";
    }
    document.getElementById("deed-status").textContent = status;
    document.getElementById("deed-modal").classList.remove("hidden");
}

document.getElementById("deed-close-btn").addEventListener("click", () => {
    document.getElementById("deed-modal").classList.add("hidden");
});

async function endTurn() {
    const cp = currentPlayer();
    if (doublesRolled > 0 && !cp.inJail && !cp.bankrupt) {
        logP(cp, "rolled doubles — gets another turn!");
        phase = "roll"; renderAll();
        if (gameMode === "online") pushOnlineState();
        if (cp.isAI) { await sleep(1500); await aiDoTurn(cp); }
        return;
    }
    doublesRolled = 0;
    let next = (turnIdx + 1) % players.length;
    let guard = 0;
    while (players[next].bankrupt && guard++ < players.length) {
        next = (next + 1) % players.length;
    }
    if (next === turnIdx && players[next].bankrupt) return;
    turnIdx = next;
    
    if (gameMode === "online") pushOnlineState();

    await sleep(500);
    await startTurn();
}

function endGame(winner, fromSync = false) {
    phase = "gameover";
    if (gameOverHandled) return; // announce + record stats only once
    gameOverHandled = true;
    new Audio('../../system/audio/victory.mp3').play().catch(e=>{});
    document.getElementById("go-emoji").textContent   = winner ? "🏆" : "🤝";
    document.getElementById("go-title").textContent   = winner ? `${winner.name.toUpperCase()} WINS!` : "GAME OVER";
    document.getElementById("go-stats").innerHTML = players.map(p =>
        `${p.bankrupt ? "💀" : "✓"} ${p.name}: $${p.money.toLocaleString()}`
    ).join("<br>");
    document.getElementById("gameover-modal").classList.remove("hidden");

    // AUDIT: Tracking final game result
    if (typeof SystemStats !== 'undefined' && winner) {
        if (winner.id === myId) { // myId is 1 in local modes, our seat id online
            SystemStats.recordWin("monopoly", winner.money);
        } else {
            SystemStats.recordLoss("monopoly");
        }
    }

    // Broadcast the final state — endGame used to be local-only, so the other
    // clients never learned the game was over.
    if (gameMode === "online" && !fromSync) pushOnlineState();
}

async function aiDoTurn(player) {
    if (gameMode === "online" && !isHost) return;
    if (player.inJail) {
        if (player.jailFreeCards > 0) {
            player.jailFreeCards--;
            player.inJail = false; player.jailTurns = 0;
            logP(player, "used Get Out of Jail Free card", "good");
        } else if (player.money >= 150 && (player.jailTurns >= 1 || aiDifficulty === "hard")) {
            player.money -= 50;
            player.inJail = false; player.jailTurns = 0;
            logP(player, "paid $50 bail");
        }
    }
    await doRoll();
}

async function aiEndTurn(player) {
    if (gameMode === "online" && !isHost) return;
    if (aiDifficulty !== "easy") {
        for (const [group, g] of Object.entries(GROUPS)) {
            if (!hasMonopoly(player, group)) continue;
            if (group === "railroad" || group === "utility") continue;
            for (const sid of g.spaces) {
                if (player.mortgaged.includes(sid)) continue;
                if (player.hotels[sid]) continue;
                const houses = player.houses[sid] || 0;
                if (houses === 4 && bankHotels > 0
                    && player.money >= BOARD[sid].houseCost * 1.8) {
                    delete player.houses[sid];
                    player.hotels[sid] = true;
                    player.money -= BOARD[sid].houseCost;
                    bankHouses += 4;
                    bankHotels--;
                    logP(player, `built a hotel on ${BOARD[sid].name}`);
                } else if (houses < 4 && bankHouses > 0
                    && player.money >= BOARD[sid].houseCost * 1.8
                    && canBuildEven(player, group, sid)) {
                    player.houses[sid] = houses + 1;
                    player.money -= BOARD[sid].houseCost;
                    bankHouses--;
                    logP(player, `built a house on ${BOARD[sid].name}`);
                }
            }
        }
    }
    await sleep(1200);
    const proposal = aiConsiderTrade(player);
    if (proposal) {
        aiLastTradeTurn[player.id] = turnIdx;
        const { target, offerSids, wantSids, offerCash, wantCash } = proposal;
        const offerNames = offerSids.map(s => BOARD[s].name).join(", ") || ("$" + offerCash);
        const wantNames  = wantSids.map(s => BOARD[s].name).join(", ");
        logP(player, `proposes trade: ${offerNames}${offerSids.length && offerCash ? " + $" + offerCash : ""} for ${wantNames}`);
        await sleep(600);
        if (target.isAI) {
            const accepted = aiEvaluateTrade(target, offerSids, wantSids, offerCash, wantCash);
            if (accepted) {
                executeTrade(player, target, offerSids, wantSids, offerCash, wantCash);
                log(`${target.name} accepted the trade!`, "good");
            } else {
                log(`${target.name} rejected the trade.`, "bad");
            }
        } else {
            await new Promise(resolve => {
                pendingTrade = { proposer: player, target, offerSids: [...offerSids], wantSids: [...wantSids], offerCash, wantCash, onResolve: resolve };
                showTradeResponseModal(pendingTrade);
            });
        }
    }
    await endTurn();
}

function aiConsiderTrade(player) {
    const lastTrade = aiLastTradeTurn[player.id] || -99;
    if (turnIdx - lastTrade < 3) return null;
    const others = activePlayers().filter(p => p.id !== player.id && p.properties.length > 0);
    if (others.length === 0) return null;
    if (aiDifficulty === "easy") {
        if (Math.random() > 0.25) return null;
        if (player.properties.length === 0) return null;
        const target   = others[Math.floor(Math.random() * others.length)];
        const offerSid = player.properties[Math.floor(Math.random() * player.properties.length)];
        const wantSid  = target.properties[Math.floor(Math.random() * target.properties.length)];
        if (offerSid === undefined || wantSid === undefined) return null;
        const offerPrice = BOARD[offerSid].price || 0;
        const wantPrice  = BOARD[wantSid].price  || 0;
        const offerCash  = wantPrice > offerPrice ? Math.min(wantPrice - offerPrice, Math.floor(player.money * 0.2)) : 0;
        return { target, offerSids: [offerSid], wantSids: [wantSid], offerCash: Math.floor(offerCash), wantCash: 0 };
    }
    for (const [group, g] of Object.entries(GROUPS)) {
        if (group === "railroad" || group === "utility") continue;
        const aiOwns  = g.spaces.filter(sid => player.properties.includes(sid));
        const missing = g.spaces.filter(sid => !player.properties.includes(sid));
        if (aiOwns.length === 0 || missing.length !== 1) continue;
        const neededSid   = missing[0];
        const neededOwner = getOwner(neededSid);
        if (!neededOwner || neededOwner.id === player.id) continue;
        const neededPrice = BOARD[neededSid].price || 0;
        const fairOffer   = Math.floor(neededPrice * (aiDifficulty === "hard" ? 1.6 : 1.3));
        if (player.money < fairOffer) continue;
        let offerSids = [];
        const offerCash = Math.min(fairOffer, Math.floor(player.money * 0.5));
        if (aiDifficulty === "hard" && offerCash < fairOffer) {
            const sweetener = player.properties.find(sid => {
                const grp = BOARD[sid].group;
                if (!grp || !GROUPS[grp]) return false;
                return GROUPS[grp].spaces.some(s => neededOwner.properties.includes(s));
            });
            if (sweetener) offerSids = [sweetener];
        }
        return { target: neededOwner, offerSids, wantSids: [neededSid], offerCash, wantCash: 0 };
    }
    if (aiDifficulty === "hard") {
        for (const other of others) {
            if (other.isAI) continue;
            for (const [group, g] of Object.entries(GROUPS)) {
                if (group === "railroad" || group === "utility") continue;
                if (!hasMonopoly(other, group)) continue;
                const cheapestSid = g.spaces.slice().sort((a, b) => (BOARD[a].price || 0) - (BOARD[b].price || 0))[0];
                if (cheapestSid === undefined) continue;
                if (other.hotels[cheapestSid] || (other.houses[cheapestSid] || 0) > 0) continue;
                const offerCash = Math.min(Math.floor((BOARD[cheapestSid].price || 0) * 1.5), Math.floor(player.money * 0.4));
                if (offerCash <= 0 || player.money < offerCash) continue;
                return { target: other, offerSids: [], wantSids: [cheapestSid], offerCash, wantCash: 0 };
            }
        }
    }
    return null;
}

function aiEvaluateTrade(target, offerSids, wantSids, offerCash, wantCash) {
    const offerVal = offerSids.reduce((s, id) => s + ((BOARD[id] && BOARD[id].price) || 0), offerCash);
    const wantVal  = wantSids.reduce((s, id)  => s + ((BOARD[id] && BOARD[id].price) || 0), wantCash);
    const completesTargetMonopoly = wantSids.some(sid => {
        const grp = BOARD[sid] && BOARD[sid].group;
        if (!grp || !GROUPS[grp]) return false;
        return GROUPS[grp].spaces.filter(s => target.properties.includes(s) && s !== sid).length === GROUPS[grp].size - 1;
    });
    const completesProposerMonopoly = offerSids.some(sid => {
        const grp = BOARD[sid] && BOARD[sid].group;
        if (!grp || !GROUPS[grp]) return false;
        const proposer = players.find(p => p.properties.includes(sid));
        return proposer && GROUPS[grp].spaces.filter(s => proposer.properties.includes(s) && s !== sid).length === GROUPS[grp].size - 1;
    });
    if (aiDifficulty === "easy") return offerVal >= wantVal * 0.6;
    if (aiDifficulty === "medium") {
        const threshold     = completesTargetMonopoly   ? 0.7  : 0.9;
        const penalisedWant = completesProposerMonopoly ? wantVal * 1.4 : wantVal;
        return offerVal >= penalisedWant * threshold;
    }
    const monopolyBonus   = completesTargetMonopoly   ? 0.75 : 1.0;
    const monopolyPenalty = completesProposerMonopoly ? 1.6  : 1.0;
    return offerVal >= wantVal * 0.95 * monopolyBonus * monopolyPenalty;
}

function aiDecideBuy(player, sid) {
    const space = BOARD[sid];
    if (player.money < space.price) return false;
    const chance = aiDifficulty === "easy" ? 0.75 : 1.0;
    return Math.random() < chance;
}

function startGame() {
    // AUDIT: Tracking game start
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("monopoly");

    phase = "idle"; doublesRolled = 0; turnIdx = 0;
    gameOverHandled = false;
    gameLog = []; chanceIdx = 0; chestIdx = 0;
    bankHouses = 32; bankHotels = 12;
    aiLastTradeTurn = {};
    const total = playerCount;
    players = [];
    if (gameMode === "online") {
        const aiColorIdxs = [0,1,2,3].filter(i => i !== p1ColorIdx);
        for (let i = 0; i < seats.length; i++) {
            const isBot = seats[i].type === "ai";
            const colorIdx = i === 0 ? p1ColorIdx : aiColorIdxs[i-1];
            players.push(createPlayer(i, seats[i].name, isBot, colorIdx));
        }
    } else if (gameMode === "ai") {
        players.push(createPlayer(0, p1Name, false, p1ColorIdx));
        const aiColorIdxs = [0,1,2,3].filter(i => i !== p1ColorIdx);
        for (let i = 1; i < total; i++) players.push(createPlayer(i, `AI ${i}`, true, aiColorIdxs[i-1]));
    } else {
        for (let i = 0; i < total; i++) {
            const colorIdx = i === 0 ? p1ColorIdx : [0,1,2,3].filter(c => c !== p1ColorIdx)[i-1];
            players.push(createPlayer(i, i === 0 ? p1Name : `Player ${i + 1}`, false, colorIdx));
        }
    }
    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("game-area").classList.remove("hidden");
    renderAll();
    
    if (gameMode === "online" && isHost) pushOnlineState();
    
    startTurn();
}

document.getElementById("roll-btn").addEventListener("click", async () => {
    if (phase !== "roll") return;
    document.getElementById("roll-btn").disabled = true;
    await doRoll();
    document.getElementById("roll-btn").disabled = false;
});

document.getElementById("end-btn").addEventListener("click", async () => {
    if (phase !== "build") return;
    await endTurn();
});

document.getElementById("start-btn").addEventListener("click", startGame);

document.getElementById("start-settings").addEventListener("click", e => {
    const chip = e.target.closest(".ss-chip");
    const colorChip = e.target.closest(".ss-color-chip");
    if (colorChip) {
        document.querySelectorAll(".ss-color-chip").forEach(c => c.classList.remove("active"));
        colorChip.classList.add("active");
        p1ColorIdx = parseInt(colorChip.dataset.colorIdx);
        return;
    }
    if (!chip) return;
    const group = chip.dataset.group;
    const val   = chip.dataset.val;
    document.querySelectorAll(`.ss-chip[data-group="${group}"]`).forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    if (group === "count") playerCount = parseInt(val);
    else if (group === "ai-diff") aiDifficulty = val;
    else if (group === "cash") startingCash = parseInt(val);
});

// ── 28. SAVE / LOAD LOGIC ─────────────────────
document.getElementById("btn-save-game")?.addEventListener("click", () => {
    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    if (gameMode === "online") {
        alert("Online games are saved automatically to the server.");
        return;
    }
    const saveData = {
        players, turnIdx, doublesRolled, phase, diceVal, gameLog,
        bankHouses, bankHotels, chanceIdx, chestIdx,
        gameMode, aiDifficulty, playerCount, startingCash
    };
    localStorage.setItem("monopoly_save_state", JSON.stringify(saveData));
    log("SYSTEM: Game state saved locally.", "highlight");
});

document.getElementById("btn-load-game")?.addEventListener("click", () => {
    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    if (gameMode === "online") {
        alert("Cannot load local saves in online mode.");
        return;
    }
    const saved = localStorage.getItem("monopoly_save_state");
    if (!saved) {
        alert("No saved game found!");
        return;
    }
    try {
        const data = JSON.parse(saved);
        players = data.players;
        turnIdx = data.turnIdx;
        doublesRolled = data.doublesRolled;
        phase = data.phase;
        diceVal = data.diceVal;
        gameLog = data.gameLog || [];
        bankHouses = data.bankHouses;
        bankHotels = data.bankHotels;
        chanceIdx = data.chanceIdx;
        chestIdx = data.chestIdx;
        gameMode = data.gameMode;
        aiDifficulty = data.aiDifficulty;
        playerCount = data.playerCount;
        startingCash = data.startingCash;

        document.getElementById("start-screen").classList.add("hidden");
        document.getElementById("game-area").classList.remove("hidden");

        renderAll();
        if (phase === "moving" || phase === "landed") phase = "roll";
        
        log("SYSTEM: Game state loaded.", "highlight");
        if (phase === "roll") startTurn();
    } catch (e) {
        alert("Error loading game.");
        console.error(e);
    }
});

// ── 29. TRADING SYSTEM ──
let tradeState = { targetId: null, offerSids: [], wantSids: [] };

function openTradeModal() {
    const cp = currentPlayer();
    tradeState = { targetId: null, offerSids: [], wantSids: [] };

    const pills = document.getElementById("trade-target-pills");
    if (!pills) return;
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

    const firstTarget = activePlayers().find(p => p.id !== cp.id);
    if (firstTarget) pills.firstChild?.click();

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
}

document.getElementById("trade-send-btn")?.addEventListener("click", () => {
    // Use pendingTrade.proposer if we're in a counter flow, otherwise currentPlayer
    const cp     = (pendingTrade && pendingTrade.proposer) ? pendingTrade.proposer : currentPlayer();
    const onResolve = pendingTrade ? pendingTrade.onResolve : null;
    pendingTrade = null;

    const target = players.find(p => p.id === tradeState.targetId);
    if (!target) return;

    const offerCash = parseInt(document.getElementById("trade-offer-cash").value) || 0;
    const wantCash  = parseInt(document.getElementById("trade-want-cash").value)  || 0;

    if (offerCash > cp.money) return;

    document.getElementById("trade-modal").classList.add("hidden");

    if (target.isAI) {
        const aiAccepts = aiEvaluateTrade(target, tradeState.offerSids, tradeState.wantSids, offerCash, wantCash);
        if (aiAccepts) {
            executeTrade(cp, target, tradeState.offerSids, tradeState.wantSids, offerCash, wantCash);
            log(`${target.name} accepted the trade!`, "good");
        } else {
            log(`${target.name} rejected the trade.`, "bad");
        }
        if (onResolve) onResolve();
        return;
    }

    if (gameMode === "online" && !target.isAI) {
        window.onlineTradeSignal = { proposerId: cp.id, targetId: target.id, offerSids: tradeState.offerSids, wantSids: tradeState.wantSids, offerCash, wantCash, ts: Date.now() };
        pushOnlineState();
        document.getElementById("loading-screen").classList.remove("hidden");
        document.getElementById("loading-text").textContent = "WAITING FOR RESPONSE...";
    } else {
        pendingTrade = { proposer: cp, target, offerSids: [...tradeState.offerSids], wantSids: [...tradeState.wantSids], offerCash, wantCash, onResolve };
        showTradeResponseModal(pendingTrade);
    }
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

// Online: the responder must NOT push full game state — it runs on the
// non-turn-holder with a stale copy of players/turnIdx/phase/diceVal and
// desyncs everyone. It only records the decision; the proposer's client
// applies the trade authoritatively and pushes the resulting state.
function sendTradeDecision(status, trade) {
    window.dbUpdate(window.dbRef(window.db, `mono_rooms/${currentRoomId}/trade_response`), {
        status,
        tradeTs: trade.signalTs || 0,
        responderId: myId,
        ts: Date.now()
    });
    if (status === "accept") log("Trade accepted — waiting for sync…", "good");
    else log("Trade rejected.", "bad");
}

document.getElementById("trade-accept-btn")?.addEventListener("click", () => {
    document.getElementById("trade-response-modal").classList.add("hidden");
    if (!pendingTrade) return;
    const { proposer, target, offerSids, wantSids, offerCash, wantCash, onResolve } = pendingTrade;

    if (gameMode === "online" && proposer && proposer.id !== myId) {
        sendTradeDecision("accept", pendingTrade);
        pendingTrade = null;
        return;
    }

    executeTrade(proposer, target, offerSids, wantSids, offerCash, wantCash);
    log(`${target.name} accepted the trade!`, "good");
    pendingTrade = null;
    if (onResolve) onResolve();
});

document.getElementById("trade-reject-btn")?.addEventListener("click", () => {
    document.getElementById("trade-response-modal").classList.add("hidden");
    if (pendingTrade) {
        const onResolve = pendingTrade.onResolve;

        if (gameMode === "online" && pendingTrade.proposer && pendingTrade.proposer.id !== myId) {
            sendTradeDecision("reject", pendingTrade);
            pendingTrade = null;
            return;
        }

        log(`${pendingTrade.target.name} rejected the trade.`, "bad");
        pendingTrade = null;
        if (onResolve) onResolve();
    }
});

document.getElementById("trade-counter-btn")?.addEventListener("click", () => {
    document.getElementById("trade-response-modal").classList.add("hidden");
    if (!pendingTrade) return;

    const { proposer, target, offerSids, wantSids, offerCash, wantCash, onResolve } = pendingTrade;
    log(`${target.name} counters the trade offer.`);

    // Open trade modal with flipped terms — target becomes proposer, proposer becomes target
    tradeState = { targetId: proposer.id, offerSids: [...wantSids], wantSids: [...offerSids] };

    // Pre-fill the trade modal UI
    const offerDiv = document.getElementById("trade-offer-props");
    const wantDiv  = document.getElementById("trade-want-props");
    offerDiv.innerHTML = "";
    wantDiv.innerHTML  = "";

    const makePropBtn = (sid, side) => {
        const sp  = BOARD[sid];
        const hex = sp.group ? GROUP_HEX[sp.group] : GROUP_HEX[sp.type] || "#888";
        const btn = document.createElement("button");
        btn.className = "trade-prop-btn selected";
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

    // target is now the counter-proposer — they offer what was originally wanted, want what was originally offered
    // Also show all their other properties so they can adjust
    target.properties.forEach(sid => {
        const btn = makePropBtn(sid, "offer");
        if (!tradeState.offerSids.includes(sid)) btn.classList.remove("selected");
        offerDiv.appendChild(btn);
    });
    proposer.properties.forEach(sid => {
        const btn = makePropBtn(sid, "want");
        if (!tradeState.wantSids.includes(sid)) btn.classList.remove("selected");
        wantDiv.appendChild(btn);
    });

    // Pre-fill cash fields flipped
    document.getElementById("trade-offer-cash").value = wantCash || 0;
    document.getElementById("trade-want-cash").value  = offerCash || 0;

    // Wire the target pills to show the original proposer
    const pills = document.getElementById("trade-target-pills");
    pills.innerHTML = "";
    const btn = document.createElement("button");
    btn.className = "trade-target-pill active";
    btn.dataset.id = proposer.id;
    btn.style.borderColor = proposer.hex;
    btn.textContent = proposer.name.toUpperCase();
    pills.appendChild(btn);

    // Store onResolve so if the counter goes to an AI, the AI turn can resume after
    pendingTrade = { proposer: target, target: proposer, offerSids: [...tradeState.offerSids], wantSids: [...tradeState.wantSids], offerCash: wantCash || 0, wantCash: offerCash || 0, onResolve };

    document.getElementById("trade-modal").classList.remove("hidden");
});

function executeTrade(proposer, target, offerSids, wantSids, offerCash, wantCash) {
    offerSids.forEach(sid => {
        proposer.properties = proposer.properties.filter(s => s !== sid);
        target.properties.push(sid);
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
    renderAll();
}

document.getElementById("trade-btn")?.addEventListener("click", openTradeModal);
document.getElementById("trade-cancel-btn")?.addEventListener("click", () => {
    document.getElementById("trade-modal").classList.add("hidden");
});

// ── MISSING EVENT LISTENERS ───────────────
document.getElementById("bail-btn").addEventListener("click", async () => {
    const cp = currentPlayer();
    if (!cp.inJail || cp.isAI) return;
    if (cp.money < 50) { log("Not enough money to pay bail!", "bad"); return; }
    cp.money -= 50;
    cp.inJail = false; cp.jailTurns = 0;
    logP(cp, "paid $50 bail and is free!", "good");
    document.getElementById("bail-btn").classList.add("hidden");
    document.getElementById("card-btn").classList.add("hidden");
    await doRoll();
});

document.getElementById("card-btn").addEventListener("click", async () => {
    const cp = currentPlayer();
    if (!cp.inJail || cp.jailFreeCards < 1 || cp.isAI) return;
    cp.jailFreeCards--;
    cp.inJail = false; cp.jailTurns = 0;
    logP(cp, "used Get Out of Jail Free card!", "good");
    document.getElementById("bail-btn").classList.add("hidden");
    document.getElementById("card-btn").classList.add("hidden");
    await doRoll();
});

document.getElementById("manage-btn").addEventListener("click", () => {
    openManageModal();
});

document.getElementById("manage-close-btn").addEventListener("click", () => {
    document.getElementById("manage-modal").classList.add("hidden");
});

document.getElementById("deed-close-btn").addEventListener("click", () => {
    document.getElementById("deed-modal").classList.add("hidden");
});

document.getElementById("btn-play-again").addEventListener("click", () => {
    document.getElementById("gameover-modal").classList.add("hidden");
    document.getElementById("game-area").classList.add("hidden");
    document.getElementById("start-screen").classList.remove("hidden");
});

// ── v2LOBBY / ONLINE MULTIPLAYER ──────────

function updateLobbyPreview() {
    const slots = [];
    const hexMap = ["#DC143C","#1a7fd4","#27ae60","#f39c12"];
    const aiColorIdxs = [0, 1, 2, 3].filter(i => i !== p1ColorIdx);
    
    slots.push({ type: "host", name: SystemUI.getPlayerName(), color: hexMap[p1ColorIdx] });
    
    for (let i = 1; i < playerCount; i++) {
        slots.push({ type: "ai", name: "AI " + i, color: hexMap[aiColorIdxs[i-1]] });
    }
    
    SystemUI.v2Lobby.updatePreview(slots);
}

SystemMatch.setup({
    gameId:   "monopoly",
    roomPath: "mono_rooms",
    autoShow: false,
    getSeatCount: () => playerCount,
    buildSeats: (count) => {
        const out = [{ type: "human", name: SystemUI.getPlayerName() }];
        for (let i = 1; i < count; i++) out.push({ type: "ai", name: "AI " + i });
        return out;
    },
    settingsConfig: [
        {
            id: "lobby-count",
            label: "PLAYERS",
            type: "select",
            default: playerCount,
            options: [
                { value: 2, label: "2" },
                { value: 3, label: "3" },
                { value: 4, label: "4" }
            ]
        },
        {
            id: "lobby-ai-diff",
            label: "AI LEVEL",
            type: "select",
            default: aiDifficulty,
            options: [
                { value: "easy", label: "EASY" },
                { value: "medium", label: "MEDIUM" },
                { value: "hard", label: "HARD" }
            ]
        },
        {
            id: "lobby-cash",
            label: "STARTING CASH",
            type: "select",
            default: startingCash,
            options: [
                { value: 1500, label: "$1,500 STANDARD" },
                { value: 2000, label: "$2,000 RICH" }
            ]
        },
        {
            id: "lobby-color",
            label: "YOUR COLOR",
            type: "color",
            default: p1ColorIdx,
            options: [
                { value: 0, label: "Red", color: "#DC143C" },
                { value: 1, label: "Blue", color: "#1a7fd4" },
                { value: 2, label: "Green", color: "#27ae60" },
                { value: 3, label: "Yellow", color: "#f39c12" }
            ]
        }
    ],
    onSettingsRendered: () => updateLobbyPreview(),
    onSettingChange: (key, val) => {
        if (key === "lobby-count") {
            playerCount = parseInt(val);
            localStorage.setItem("mono_pcount", val);
            document.querySelectorAll('.ss-chip[data-group="count"]').forEach(c => c.classList.toggle('active', c.dataset.val == val));
            if (isHost && currentRoomId) {
                SystemMatch.resizeSeats(playerCount);
                seats = SystemMatch.getSeats();
            }
        } else if (key === "lobby-ai-diff") {
            aiDifficulty = val;
            localStorage.setItem("mono_ai_diff", val);
            document.querySelectorAll('.ss-chip[data-group="ai-diff"]').forEach(c => c.classList.toggle('active', c.dataset.val == val));
        } else if (key === "lobby-cash") {
            startingCash = parseInt(val);
            localStorage.setItem("mono_cash", val);
            document.querySelectorAll('.ss-chip[data-group="cash"]').forEach(c => c.classList.toggle('active', c.dataset.val == val));
        } else if (key === "lobby-color") {
            p1ColorIdx = parseInt(val);
            document.querySelectorAll("#ss-color-pills .ss-color-chip").forEach(c => {
                c.classList.toggle('active', parseInt(c.dataset.colorIdx) === p1ColorIdx);
            });
        }
        updateLobbyPreview();
    },
    onHost: (roomId) => {
        currentRoomId = roomId;
        isHost = true; myId = 1; chatStarted = false;
        stateSeq = 0; lastSyncTime = 0; lastPushTime = 0; gameOverHandled = false;
        window.onlineTradeSignal = null; window.onlineTradeResponse = null;
        window.onlineAuctionState = null;
        window.lastTradeSignalTs = 0; window.lastTradeRespTs = 0;
        window.lastAuctionStateTs = 0; window.lastAuctionActionTs = 0;
        seats = SystemMatch.getSeats();
        listenToOnlineRoom();
    },
    onJoin: (roomId) => {
        currentRoomId = roomId;
        isHost = false; chatStarted = false;
        stateSeq = 0; lastSyncTime = 0; lastPushTime = 0; gameOverHandled = false;
        window.onlineTradeSignal = null; window.onlineTradeResponse = null;
        window.onlineAuctionState = null;
        window.lastTradeSignalTs = 0; window.lastTradeRespTs = 0;
        window.lastAuctionStateTs = 0; window.lastAuctionActionTs = 0;
        myId = SystemMatch.getMyId();
        seats = SystemMatch.getSeats();
        listenToOnlineRoom();
    },
    onLeave: () => {
        detachRoomListeners();
        gameMode = "ai";
        document.getElementById("sys-mono-mode").value = "ai";
        localStorage.setItem("mono_mode", "ai");
        chatStarted = false;
        currentRoomId = null;
        onlineGameStarted = false;
        stateSeq = 0; lastSyncTime = 0; lastPushTime = 0;
        isHost = false; myId = 1;
    },
    onStart: () => {
        if (currentRoomId && window.db) {
            window.dbUpdate(window.dbRef(window.db, `mono_rooms/${currentRoomId}`), { status: "playing" });
        }
    },
    onClose: () => {
        if (gameMode === "online" && phase === "idle") {
            gameMode = "ai";
            document.getElementById("sys-mono-mode").value = "ai";
            localStorage.setItem("mono_mode", "ai");
            document.getElementById("start-settings").style.display = "";
            document.getElementById("start-btn").style.display = "";
            const aiRow = document.getElementById("ss-ai-row");
            if (aiRow) aiRow.style.display = "";
        }
    }
});

function detachRoomListeners() {
    if (roomListener)          { try { roomListener(); }          catch (e) {} roomListener = null; }
    if (auctionActionListener) { try { auctionActionListener(); } catch (e) {} auctionActionListener = null; }
    if (tradeRespListener)     { try { tradeRespListener(); }     catch (e) {} tradeRespListener = null; }
}

function listenToOnlineRoom() {
    onlineGameStarted = false;
    detachRoomListeners(); // guard against duplicate listeners on re-host
    roomListener = window.dbOnValue(window.dbRef(window.db, `mono_rooms/${currentRoomId}`), snap => {
        const data = snap.val();
        if (!data) {
            // Room node deleted = the host left. Don't leave guests frozen.
            if (!isHost && currentRoomId && !gameOverHandled) exitOnlineToLocal("Host left the game");
            return;
        }

        // A guest closed their tab mid-game.
        if (data.status === "abandoned") {
            if (onlineGameStarted && !gameOverHandled) {
                exitOnlineToLocal(`${data.abandonedBy || "A player"} left the game`);
            }
            return;
        }

        if (data.seats) { 
            seats = data.seats; 
            SystemUI.v2Lobby.renderSeats(seats); 
            
            if (players && players.length > 0) {
                let changed = false;
                seats.forEach((seat, idx) => {
                    if (players[idx]) {
                        if (players[idx].name !== seat.name || players[idx].isAI !== (seat.type === "ai")) {
                            players[idx].name = seat.name;
                            players[idx].isAI = (seat.type === "ai");
                            changed = true;
                        }
                    }
                });
                if (changed && phase !== "idle") renderAll();
            }
        }

        if (data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true;
            SystemUI.v2Lobby.hide();
            if (!chatStarted) {
                chatStarted = true;
                SystemUI.playSound("win");
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }
            if (isHost) {
                startGame();
            } else {
                document.getElementById("start-screen").classList.add("hidden");
                if (data.gameState) {
                    syncOnlineState(data.gameState);
                } else {
                    document.getElementById("loading-screen").classList.remove("hidden");
                    document.getElementById("loading-text").textContent = "WAITING FOR HOST…";
                }
            }
            return;
        }
        if (onlineGameStarted && data.gameState) syncOnlineState(data.gameState);
    });

    auctionActionListener = window.dbOnValue(window.dbRef(window.db, `mono_rooms/${currentRoomId}/auction_action`), snap => {
        const action = snap.val();
        if (!action || !window._currentAuctionOnBid) return;
        if (action.ts <= (window.lastAuctionActionTs || 0)) return;
        window.lastAuctionActionTs = action.ts;

        if (action.type === 'bid') window._currentAuctionOnBid(action.pid);
        if (action.type === 'fold') window._currentAuctionOnFold(action.pid);
    });

    // Trade decisions arrive on a dedicated node (not inside full game state):
    // the proposer applies the trade authoritatively and pushes the result.
    tradeRespListener = window.dbOnValue(window.dbRef(window.db, `mono_rooms/${currentRoomId}/trade_response`), snap => {
        const resp = snap.val();
        if (!resp || !resp.ts) return;
        if (resp.ts <= (window.lastTradeRespTs || 0)) return;
        window.lastTradeRespTs = resp.ts;
        if (resp.responderId === myId) return; // own echo

        const sig = window.onlineTradeSignal;
        if (!sig || sig.proposerId !== myId || resp.tradeTs !== sig.ts) return;

        document.getElementById("loading-screen").classList.add("hidden");
        const proposer = players.find(p => p.id === sig.proposerId);
        const target   = players.find(p => p.id === sig.targetId);
        if (resp.status === "accept" && proposer && target) {
            executeTrade(proposer, target, sig.offerSids || [], sig.wantSids || [], sig.offerCash || 0, sig.wantCash || 0);
            log(`${target.name} accepted the trade!`, "good");
        } else {
            log(`${target ? target.name : "Opponent"} rejected the trade.`, "bad");
        }
        window.onlineTradeSignal = null; // resolved — don't re-broadcast the offer
        pushOnlineState();
    });
}

let lastPushTime = 0;
function pushOnlineState() {
    if (!currentRoomId) return;
    const now = Date.now();
    lastPushTime = now;
    stateSeq++;
    window.dbUpdate(window.dbRef(window.db, `mono_rooms/${currentRoomId}`), {
        gameState: JSON.stringify({
            players, turnIdx, doublesRolled, phase, diceVal,
            chanceIdx, chestIdx, bankHouses, bankHotels,
            gameLog,
            onlineTradeSignal: window.onlineTradeSignal || null,
            onlineTradeResponse: window.onlineTradeResponse || null,
            onlineAuctionState: window.onlineAuctionState || null,
            ts: now, seq: stateSeq, pusher: myId
        })
    });
}

let lastSyncTime = 0;
function syncOnlineState(stateJson) {
    try {
        const s = typeof stateJson === "string" ? JSON.parse(stateJson) : stateJson;
        
        if (!s.ts) return;
        // Order by monotonic seq — every client pushes state and comparing
        // wall clocks dropped packets from whichever machine's clock ran
        // behind, freezing that player (and re-applied stale echoes replayed
        // the dice animation twice). Equal seq must be ACCEPTED (only < is
        // stale) since multiple writers can race.
        if (s.seq) {
            if (s.seq < stateSeq) return;
            stateSeq = s.seq;
        } else if (s.ts <= lastSyncTime) return;
        // Skip our own echoes
        if (s.pusher === myId) { lastSyncTime = s.ts; return; }

        lastSyncTime = s.ts;

        document.getElementById("loading-screen").classList.add("hidden");
        document.getElementById("game-area").classList.remove("hidden");
        
        let oldPhase = phase;
        
        players = s.players; 
        turnIdx = s.turnIdx; 
        doublesRolled = s.doublesRolled;
        phase = s.phase; 
        diceVal = s.diceVal;
        chanceIdx = s.chanceIdx; 
        chestIdx = s.chestIdx;
        bankHouses = s.bankHouses; 
        bankHotels = s.bankHotels;
        if (s.gameLog) { gameLog = s.gameLog; renderLog(); }
        
        renderAll();

        if (oldPhase !== "moving" && phase === "moving") {
            const cp = players[turnIdx];
            const sum = diceVal[0] + diceVal[1];
            animateDice().then(() => movePlayer(cp, sum));
        }

        if (isHost && players[turnIdx] && players[turnIdx].isAI && phase === "roll") {
            setTimeout(() => aiDoTurn(players[turnIdx]), 1500);
        }

        // Remote game over — announce the winner + record stats exactly once.
        if (phase === "gameover" && !gameOverHandled) {
            const alive = activePlayers();
            endGame(alive.length === 1 ? alive[0] : null, true);
        }

        if (s.onlineTradeSignal && s.onlineTradeSignal.ts > (window.lastTradeSignalTs || 0)) {
            window.lastTradeSignalTs = s.onlineTradeSignal.ts;
            if (s.onlineTradeSignal.targetId === myId) {
                const proposer = players.find(p => p.id === s.onlineTradeSignal.proposerId);
                const target = players.find(p => p.id === s.onlineTradeSignal.targetId);
                pendingTrade = {
                    proposer, target,
                    offerSids: s.onlineTradeSignal.offerSids, wantSids: s.onlineTradeSignal.wantSids,
                    offerCash: s.onlineTradeSignal.offerCash, wantCash: s.onlineTradeSignal.wantCash,
                    signalTs: s.onlineTradeSignal.ts,
                    onResolve: null
                };
                showTradeResponseModal(pendingTrade);
            }
        }

        if (s.onlineTradeResponse && s.onlineTradeResponse.ts > (window.lastTradeRespTs || 0)) {
            window.lastTradeRespTs = s.onlineTradeResponse.ts;
            document.getElementById("loading-screen").classList.add("hidden");
            if (s.onlineTradeResponse.status === "accept") log("Trade accepted!", "good");
            if (s.onlineTradeResponse.status === "reject") log("Trade rejected.", "bad");
        }

        if (s.onlineAuctionState && s.onlineAuctionState.ts > (window.lastAuctionStateTs || 0)) {
            window.lastAuctionStateTs = s.onlineAuctionState.ts;
            if (!window._currentAuctionOnBid) { 
                if (!s.onlineAuctionState.active) {
                    document.getElementById("auction-modal").classList.add("hidden");
                } else {
                    const state = s.onlineAuctionState;
                    const space = BOARD[state.sid];
                    const hex   = space.group ? GROUP_HEX[space.group] : GROUP_HEX.railroad;
                    document.getElementById("auction-color-bar").style.background = hex;
                    document.getElementById("auction-name").textContent           = space.name;
                    document.getElementById("auction-bid-amt").textContent        = `$${state.bid}`;
                    const leader = players.find(p => p.id === state.leaderId);
                    document.getElementById("auction-leader-name").textContent    = leader ? leader.name : "No bid yet";
                    document.getElementById("auction-countdown").textContent      = state.timeLeft;
                    const names = state.folded.map(id => players.find(p => p.id === id)?.name).filter(Boolean);
                    document.getElementById("auction-folded-row").textContent     = names.length ? `Folded: ${names.join(", ")}` : "";
                    document.getElementById("auction-modal").classList.remove("hidden");
                }
            }
        }

    } catch (e) { console.error("Sync error:", e); }
}

// ── LEAVE / DISCONNECT RECOVERY ───────────────
function exitOnlineToLocal(msg) {
    detachRoomListeners();
    SystemUI.stopChat(); chatStarted = false;
    currentRoomId = null;
    onlineGameStarted = false;
    stateSeq = 0; lastSyncTime = 0; lastPushTime = 0;
    gameOverHandled = false;
    window.onlineTradeSignal = null; window.onlineTradeResponse = null;
    window.onlineAuctionState = null;
    isHost = false; myId = 1;
    gameMode = "ai";
    phase = "idle";
    const modeEl = document.getElementById("sys-mono-mode");
    if (modeEl) modeEl.value = "ai";
    localStorage.setItem("mono_mode", "ai");
    SystemUI.v2Lobby.hide();
    document.getElementById("loading-screen").classList.add("hidden");
    document.getElementById("game-area").classList.add("hidden");
    document.getElementById("start-screen").classList.remove("hidden");
    document.getElementById("start-settings").style.display = "";
    document.getElementById("start-btn").style.display = "";
    if (msg) {
        document.getElementById("go-emoji").textContent = "🚪";
        document.getElementById("go-title").textContent = "GAME OVER";
        document.getElementById("go-stats").innerHTML = msg;
        document.getElementById("gameover-modal").classList.remove("hidden");
    }
}

window.addEventListener("beforeunload", () => {
    if (!currentRoomId || gameMode !== "online" || !window.db) return;
    try {
        if (isHost) {
            window.dbSet(window.dbRef(window.db, `mono_rooms/${currentRoomId}`), null);
        } else if (onlineGameStarted && !gameOverHandled) {
            // Guest closed the tab mid-game — flag it so nobody waits on a ghost.
            window.dbUpdate(window.dbRef(window.db, `mono_rooms/${currentRoomId}`), {
                status: "abandoned", abandonedBy: SystemUI.getPlayerName()
            });
        }
    } catch (e) {}
});

document.getElementById("btn-bid-up")?.addEventListener("click", () => {
    if (gameMode === "online" && !window._currentAuctionOnBid) {
        window.dbUpdate(window.dbRef(window.db, `mono_rooms/${currentRoomId}/auction_action`), { type: 'bid', pid: myId, ts: Date.now() });
    }
});
document.getElementById("btn-bid-out")?.addEventListener("click", () => {
    if (gameMode === "online" && !window._currentAuctionOnFold) {
        window.dbUpdate(window.dbRef(window.db, `mono_rooms/${currentRoomId}/auction_action`), { type: 'fold', pid: myId, ts: Date.now() });
    }
});