// =============================================
// RISK — risk_app.js
// The Game Shack | Casino OS
// Modes: vs AI | Hotseat | Online
// =============================================

// ── 1. OS INIT ────────────────────────────────
let gameMode    = localStorage.getItem("risk_mode") || "ai";
let chatStarted = false;
let currentRoomId = null;
let myId    = 1;
let isHost  = false;
let myPlayerIndex = 0;

SystemUI.init({
    gameName: "RISK",
    rules: "Conquer the world! Draft troops, attack neighbouring territories, trade cards for reinforcements. Eliminate all opponents to achieve global domination.",
    hudDropdowns: [
        {
            id: "sys-risk-mode",
            options: [
                { value: "ai",      label: "🤖 vs AI"  },
                { value: "hotseat", label: "👥 Hotseat" },
                { value: "online",  label: "🌐 Online"  }
            ]
        }
    ]
});

setTimeout(() => { gameMode = document.getElementById("sys-risk-mode").value; }, 10);

document.getElementById("sys-risk-mode").addEventListener("change", e => {
    gameMode = e.target.value;
    localStorage.setItem("risk_mode", gameMode);
    document.getElementById("sys-modal").classList.add("sys-hidden");
    if (gameMode === "online") {
        document.getElementById("multiplayer-lobby").classList.remove("hidden");
    } else {
        document.getElementById("multiplayer-lobby").classList.add("hidden");
        SystemUI.stopChat();
        chatStarted = false;
    }
});

// ── 2. PLAYER COLOURS ────────────────────────
const PLAYER_COLORS = ["#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6","#1abc9c"];
const PLAYER_NAMES  = ["Red","Blue","Green","Yellow","Purple","Teal"];

// ── 3. CONTINENT DATA ────────────────────────
/*
 * Continent bonus troops awarded when a player owns ALL territories in it.
 * This is checked at the start of each player's draft phase.
 */
const CONTINENTS = {
    northAmerica: { name: "North America", bonus: 5, territories: [
        "alaska","northwest_territory","greenland","alberta","ontario","quebec",
        "western_us","eastern_us","central_america"
    ]},
    southAmerica: { name: "South America", bonus: 2, territories: [
        "venezuela","peru","brazil","argentina"
    ]},
    europe: { name: "Europe", bonus: 5, territories: [
        "iceland","great_britain","western_europe","northern_europe",
        "scandinavia","ukraine","southern_europe"
    ]},
    africa: { name: "Africa", bonus: 3, territories: [
        "north_africa","egypt","east_africa","congo","south_africa","madagascar"
    ]},
    asia: { name: "Asia", bonus: 7, territories: [
        "ural","siberia","yakutsk","kamchatka","irkutsk","mongolia","china",
        "afghanistan","middle_east","india","southeast_asia","japan"
    ]},
    australia: { name: "Australia", bonus: 2, territories: [
        "indonesia","new_guinea","western_australia","eastern_australia"
    ]}
};

// ── 4. TERRITORY DATA ────────────────────────
/*
 * 42 territories. Each entry:
 *   id:         matches SVG <path> id attribute
 *   name:       display name
 *   continent:  continent key
 *   cx, cy:     centroid as % of SVG viewBox (for troop counter placement)
 *   adj:        adjacency list (ids of connected territories)
 *
 * Centroid percentages are relative to the Wikimedia Risk SVG viewBox
 * which is approximately 1015 × 585 px.
 */
const TERRITORIES = [
    // ── NORTH AMERICA ──────────────────────────
    { id:"alaska",             name:"Alaska",             continent:"northAmerica", cx:5.5,  cy:14,   adj:["northwest_territory","alberta","kamchatka"] },
    { id:"northwest_territory",name:"NW Territory",       continent:"northAmerica", cx:15,   cy:12,   adj:["alaska","alberta","ontario","greenland"] },
    { id:"greenland",          name:"Greenland",           continent:"northAmerica", cx:33,   cy:5,    adj:["northwest_territory","ontario","quebec","iceland"] },
    { id:"alberta",            name:"Alberta",             continent:"northAmerica", cx:13,   cy:21,   adj:["alaska","northwest_territory","ontario","western_us"] },
    { id:"ontario",            name:"Ontario",             continent:"northAmerica", cx:21,   cy:21,   adj:["northwest_territory","alberta","greenland","quebec","western_us","eastern_us"] },
    { id:"quebec",             name:"Quebec",              continent:"northAmerica", cx:28,   cy:19,   adj:["ontario","greenland","eastern_us"] },
    { id:"western_us",         name:"Western US",          continent:"northAmerica", cx:14,   cy:30,   adj:["alberta","ontario","eastern_us","central_america"] },
    { id:"eastern_us",         name:"Eastern US",          continent:"northAmerica", cx:22,   cy:30,   adj:["ontario","quebec","western_us","central_america"] },
    { id:"central_america",    name:"Central America",     continent:"northAmerica", cx:17,   cy:39,   adj:["western_us","eastern_us","venezuela"] },

    // ── SOUTH AMERICA ──────────────────────────
    { id:"venezuela",          name:"Venezuela",           continent:"southAmerica", cx:25,   cy:47,   adj:["central_america","peru","brazil"] },
    { id:"peru",               name:"Peru",                continent:"southAmerica", cx:24,   cy:57,   adj:["venezuela","brazil","argentina"] },
    { id:"brazil",             name:"Brazil",              continent:"southAmerica", cx:31,   cy:57,   adj:["venezuela","peru","argentina","north_africa"] },
    { id:"argentina",          name:"Argentina",           continent:"southAmerica", cx:26,   cy:68,   adj:["peru","brazil"] },

    // ── EUROPE ─────────────────────────────────
    { id:"iceland",            name:"Iceland",             continent:"europe",       cx:44,   cy:10,   adj:["greenland","great_britain","scandinavia"] },
    { id:"great_britain",      name:"Great Britain",       continent:"europe",       cx:45,   cy:20,   adj:["iceland","western_europe","northern_europe","scandinavia"] },
    { id:"western_europe",     name:"W. Europe",           continent:"europe",       cx:46,   cy:30,   adj:["great_britain","northern_europe","southern_europe","north_africa"] },
    { id:"northern_europe",    name:"N. Europe",           continent:"europe",       cx:52,   cy:22,   adj:["great_britain","western_europe","southern_europe","ukraine","scandinavia"] },
    { id:"scandinavia",        name:"Scandinavia",         continent:"europe",       cx:53,   cy:12,   adj:["iceland","great_britain","northern_europe","ukraine"] },
    { id:"ukraine",            name:"Ukraine",             continent:"europe",       cx:60,   cy:20,   adj:["northern_europe","scandinavia","southern_europe","middle_east","afghanistan","ural"] },
    { id:"southern_europe",    name:"S. Europe",           continent:"europe",       cx:53,   cy:31,   adj:["western_europe","northern_europe","ukraine","middle_east","egypt","north_africa"] },

    // ── AFRICA ─────────────────────────────────
    { id:"north_africa",       name:"N. Africa",           continent:"africa",       cx:49,   cy:47,   adj:["western_europe","southern_europe","brazil","egypt","east_africa","congo"] },
    { id:"egypt",              name:"Egypt",               continent:"africa",       cx:57,   cy:41,   adj:["southern_europe","north_africa","east_africa","middle_east"] },
    { id:"east_africa",        name:"E. Africa",           continent:"africa",       cx:60,   cy:53,   adj:["egypt","north_africa","congo","south_africa","madagascar","middle_east"] },
    { id:"congo",              name:"Congo",               continent:"africa",       cx:55,   cy:60,   adj:["north_africa","east_africa","south_africa"] },
    { id:"south_africa",       name:"S. Africa",           continent:"africa",       cx:56,   cy:70,   adj:["congo","east_africa","madagascar"] },
    { id:"madagascar",         name:"Madagascar",          continent:"africa",       cx:64,   cy:67,   adj:["east_africa","south_africa"] },

    // ── ASIA ───────────────────────────────────
    { id:"ural",               name:"Ural",                continent:"asia",         cx:68,   cy:15,   adj:["ukraine","siberia","afghanistan","china"] },
    { id:"siberia",            name:"Siberia",             continent:"asia",         cx:76,   cy:10,   adj:["ural","yakutsk","irkutsk","mongolia","china"] },
    { id:"yakutsk",            name:"Yakutsk",             continent:"asia",         cx:84,   cy:8,    adj:["siberia","kamchatka","irkutsk"] },
    { id:"kamchatka",          name:"Kamchatka",           continent:"asia",         cx:92,   cy:11,   adj:["yakutsk","irkutsk","mongolia","japan","alaska"] },
    { id:"irkutsk",            name:"Irkutsk",             continent:"asia",         cx:82,   cy:18,   adj:["siberia","yakutsk","kamchatka","mongolia"] },
    { id:"mongolia",           name:"Mongolia",            continent:"asia",         cx:82,   cy:27,   adj:["siberia","irkutsk","kamchatka","china","japan"] },
    { id:"china",              name:"China",               continent:"asia",         cx:78,   cy:34,   adj:["ural","siberia","mongolia","afghanistan","india","southeast_asia"] },
    { id:"afghanistan",        name:"Afghanistan",         continent:"asia",         cx:68,   cy:29,   adj:["ukraine","ural","china","india","middle_east"] },
    { id:"middle_east",        name:"Middle East",         continent:"asia",         cx:63,   cy:37,   adj:["ukraine","southern_europe","egypt","east_africa","afghanistan","india"] },
    { id:"india",              name:"India",               continent:"asia",         cx:73,   cy:43,   adj:["middle_east","afghanistan","china","southeast_asia"] },
    { id:"southeast_asia",     name:"SE Asia",             continent:"asia",         cx:82,   cy:47,   adj:["china","india","indonesia"] },
    { id:"japan",              name:"Japan",               continent:"asia",         cx:91,   cy:27,   adj:["mongolia","kamchatka"] },

    // ── AUSTRALIA ──────────────────────────────
    { id:"indonesia",          name:"Indonesia",           continent:"australia",    cx:82,   cy:57,   adj:["southeast_asia","new_guinea","western_australia"] },
    { id:"new_guinea",         name:"New Guinea",          continent:"australia",    cx:90,   cy:56,   adj:["indonesia","western_australia","eastern_australia"] },
    { id:"western_australia",  name:"W. Australia",        continent:"australia",    cx:84,   cy:67,   adj:["indonesia","new_guinea","eastern_australia"] },
    { id:"eastern_australia",  name:"E. Australia",        continent:"australia",    cx:91,   cy:67,   adj:["new_guinea","western_australia"] }
];

// Build quick lookup map
const TERR_MAP = {};
TERRITORIES.forEach(t => TERR_MAP[t.id] = t);

// ── 5. CARD TYPES ────────────────────────────
const CARD_TYPES = ["infantry","cavalry","artillery"];
const CARD_ICONS = { infantry:"🪖", cavalry:"🐴", artillery:"💣", wild:"⭐" };

// Trade-in values (escalating): index = number of sets traded so far
const TRADE_VALUES = [4, 6, 8, 10, 12, 15];
// After index 5, every additional set = previous + 5

function tradeValue(setsTraded) {
    if (setsTraded < TRADE_VALUES.length) return TRADE_VALUES[setsTraded];
    return TRADE_VALUES[TRADE_VALUES.length - 1] + (setsTraded - TRADE_VALUES.length + 1) * 5;
}

// ── 6. GAME STATE ────────────────────────────
let numPlayers    = 4;
let setupMode     = "random"; // "random" | "manual"
let players       = [];       // { name, color, territories:Set, cards:[], setsTraded, isAI, eliminated }
let territories   = {};       // territoryId → { owner: playerIdx, troops: n }
let currentTurn   = 0;
let gamePhase     = "idle";   // idle|setup|draft|attack|fortify
let setupRemaining= 0;        // troops left to place during manual setup
let draftRemaining= 0;
let cardDeck      = [];
let setsTraded    = 0;        // global counter for escalating card values

// Attack state
let attackFrom    = null;
let attackTo      = null;
let atkDice       = 3;
let defDice       = 2;

// Fortify state
let fortifyFrom   = null;
let fortifyTo     = null;

// SVG element reference
let svgEl         = null;
let svgViewBox    = { w: 1015, h: 585 };
let mapRect       = null;

// ── 7. WORLD MAP + TERRITORY OVERLAY ────────
/*
 * TWO-LAYER ARCHITECTURE:
 *
 * Layer 1 — #world-map-bg (BlankMap-World.svg):
 *   Loaded via fetch() from ../../system/images/BlankMap-World.svg (same-origin,
 *   works on Netlify). Styled dark: olive land, navy ocean. pointer-events: none.
 *   Falls back gracefully if file missing — game works either way.
 *
 * Layer 2 — #svg-container (Territory overlay SVG):
 *   Built synchronously. One <rect> per Risk territory, semi-transparent.
 *   Unowned: continent tint at 0.6 opacity. Owned: player colour at 0.45 opacity.
 *   World map geography shows through the coloured ownership overlays.
 *   All click/hover events handled here.
 *
 * Troop counters (#troop-layer) float above both.
 */

const VB_W = 1000, VB_H = 560;

// Territory rectangle positions [x, y, width, height] in the 1000×560 viewBox
const LAYOUT = {
    // North America
    alaska:              [5,   10,  85,  65],
    northwest_territory: [93,  10,  90,  65],
    greenland:           [186, 5,   95,  75],
    alberta:             [5,   78,  85,  80],
    ontario:             [93,  78,  100, 80],
    quebec:              [196, 78,  85,  80],
    western_us:          [5,   161, 115, 80],
    eastern_us:          [123, 161, 110, 80],
    central_america:     [45,  244, 100, 55],
    // South America
    venezuela:           [55,  302, 90,  80],
    peru:                [55,  385, 90,  80],
    brazil:              [148, 302, 82,  163],
    argentina:           [78,  468, 92,  70],
    // Europe
    iceland:             [358, 5,   72,  55],
    scandinavia:         [433, 5,   78,  75],
    ukraine:             [514, 8,   72,  112],
    great_britain:       [353, 63,  77,  65],
    northern_europe:     [433, 83,  78,  65],
    western_europe:      [353, 131, 77,  85],
    southern_europe:     [433, 151, 78,  65],
    // Africa
    north_africa:        [353, 228, 102, 93],
    egypt:               [458, 228, 92,  84],
    east_africa:         [458, 315, 92,  98],
    congo:               [353, 324, 102, 88],
    south_africa:        [368, 415, 96,  88],
    madagascar:          [467, 412, 72,  82],
    // Asia
    ural:                [589, 8,   82,  90],
    siberia:             [674, 8,   90,  80],
    yakutsk:             [767, 8,   82,  75],
    kamchatka:           [852, 8,   88,  85],
    irkutsk:             [767, 86,  82,  80],
    mongolia:            [767, 169, 88,  80],
    china:               [674, 91,  90,  158],
    afghanistan:         [589, 101, 82,  95],
    middle_east:         [551, 228, 88,  90],
    india:               [674, 252, 92,  108],
    southeast_asia:      [769, 253, 95,  118],
    japan:               [868, 93,  82,  80],
    // Australia
    indonesia:           [767, 384, 100, 78],
    new_guinea:          [870, 378, 104, 73],
    western_australia:   [767, 465, 100, 78],
    eastern_australia:   [870, 454, 104, 90],
};

// Continent tint for unowned territory overlays
const CONT_TINT = {
    northAmerica: "#2a4020",
    southAmerica: "#3a2e18",
    europe:       "#1e2e40",
    africa:       "#3a3018",
    asia:         "#28203a",
    australia:    "#183838",
};

// Compute territory centroids from LAYOUT and write back into TERRITORIES
TERRITORIES.forEach(t => {
    const r = LAYOUT[t.id];
    if (!r) return;
    t.cx = ((r[0] + r[2] / 2) / VB_W) * 100;
    t.cy = ((r[1] + r[3] / 2) / VB_H) * 100;
});

// ── Load world map background (fire-and-forget) ──
function loadWorldMapBackground() {
    fetch('../../system/images/BlankMap-World.svg')
        .then(r => {
            if (!r.ok) throw new Error('not found');
            return r.text();
        })
        .then(text => {
            const bg = document.getElementById('world-map-bg');
            bg.innerHTML = text;
            const bgSvg = bg.querySelector('svg');
            if (!bgSvg) return;

            bgSvg.style.cssText = 'width:100%;height:100%;display:block;position:absolute;inset:0;';

            // Remove internal <style> that fights our colours
            bgSvg.querySelectorAll('style').forEach(s => s.remove());

            // Ocean
            const oceanEl = bgSvg.getElementById('ocean');
            if (oceanEl) {
                oceanEl.style.fill   = '#192840';
                oceanEl.style.stroke = 'none';
            }

            // All country paths → dark olive military
            bgSvg.querySelectorAll('[id]').forEach(el => {
                if (el.id === 'ocean' || el.tagName === 'svg') return;
                if (el.tagName === 'path' || el.tagName === 'g') {
                    el.style.fill        = '#2b3a18';
                    el.style.stroke      = '#1a2410';
                    el.style.strokeWidth = '0.4px';
                    el.style.pointerEvents = 'none';
                }
            });
        })
        .catch(() => {
            // Silently fall back — territory overlay is still fully visible
        });
}

// ── Build territory overlay SVG (synchronous) ──
function buildTerritoryOverlay() {
    const ns  = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
    svg.style.cssText = 'width:100%;height:100%;display:block;position:absolute;inset:0;';

    // Fallback ocean background (only visible if world map not loaded)
    const ocean = document.createElementNS(ns, 'rect');
    ocean.setAttribute('x', '0'); ocean.setAttribute('y', '0');
    ocean.setAttribute('width', VB_W); ocean.setAttribute('height', VB_H);
    ocean.setAttribute('fill', '#192840');
    ocean.setAttribute('pointer-events', 'none');
    svg.appendChild(ocean);

    // Continent watermark labels
    const contLabels = [
        { text: 'N. AMERICA', x: 130, y: 295 },
        { text: 'S. AMERICA', x: 120, y: 545 },
        { text: 'EUROPE',     x: 435, y: 215 },
        { text: 'AFRICA',     x: 420, y: 530 },
        { text: 'ASIA',       x: 740, y: 360 },
        { text: 'AUSTRALIA',  x: 845, y: 550 },
    ];
    contLabels.forEach(({ text, x, y }) => {
        const t = document.createElementNS(ns, 'text');
        t.setAttribute('x', x); t.setAttribute('y', y);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('font-family', 'Special Elite, cursive');
        t.setAttribute('font-size', '10');
        t.setAttribute('fill', 'rgba(200,185,120,0.14)');
        t.setAttribute('letter-spacing', '1.5');
        t.setAttribute('pointer-events', 'none');
        t.textContent = text;
        svg.appendChild(t);
    });

    // Adjacency lines (behind rects)
    const drawn = new Set();
    TERRITORIES.forEach(t => {
        const r1 = LAYOUT[t.id];
        if (!r1) return;
        const cx1 = r1[0] + r1[2] / 2, cy1 = r1[1] + r1[3] / 2;
        t.adj.forEach(adjId => {
            const key = [t.id, adjId].sort().join('|');
            if (drawn.has(key)) return;
            drawn.add(key);
            const r2 = LAYOUT[adjId];
            if (!r2) return;
            const cx2 = r2[0] + r2[2] / 2, cy2 = r2[1] + r2[3] / 2;
            const dist = Math.hypot(cx2 - cx1, cy2 - cy1);
            const line = document.createElementNS(ns, 'line');
            line.setAttribute('x1', cx1); line.setAttribute('y1', cy1);
            line.setAttribute('x2', cx2); line.setAttribute('y2', cy2);
            line.setAttribute('stroke', 'rgba(200,180,100,0.15)');
            line.setAttribute('stroke-width', '0.7');
            if (dist > 280) line.setAttribute('stroke-dasharray', '4 4');
            line.setAttribute('pointer-events', 'none');
            svg.appendChild(line);
        });
    });

    // Territory rects
    TERRITORIES.forEach(t => {
        const r = LAYOUT[t.id];
        if (!r) return;
        const [x, y, w, h] = r;
        const baseFill = CONT_TINT[t.continent] || '#2a2a1a';

        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('id',           t.id);
        rect.setAttribute('x',            x + 1);
        rect.setAttribute('y',            y + 1);
        rect.setAttribute('width',        w - 2);
        rect.setAttribute('height',       h - 2);
        rect.setAttribute('rx',           '4');
        rect.setAttribute('fill',         baseFill);
        rect.setAttribute('fill-opacity', '0.6');
        rect.setAttribute('stroke',       'rgba(0,0,0,0.45)');
        rect.setAttribute('stroke-width', '0.8');
        rect.style.cursor     = 'pointer';
        rect.style.transition = 'filter 0.12s, fill-opacity 0.12s';
        svg.appendChild(rect);

        // Territory name
        const label = document.createElementNS(ns, 'text');
        label.setAttribute('x', x + w / 2);
        label.setAttribute('y', y + h / 2 + 3);
        label.setAttribute('text-anchor',    'middle');
        label.setAttribute('font-family',    'Share Tech Mono, monospace');
        label.setAttribute('font-size',      w < 72 ? '5.5' : '6.5');
        label.setAttribute('fill',           'rgba(230,210,150,0.7)');
        label.setAttribute('pointer-events', 'none');
        label.setAttribute('letter-spacing', '0.2');
        const words = t.name.split(' ');
        if (words.length > 1 && w > 62) {
            const mid = Math.ceil(words.length / 2);
            const l1 = document.createElementNS(ns, 'tspan');
            l1.setAttribute('x', x + w / 2); l1.setAttribute('dy', '-4');
            l1.textContent = words.slice(0, mid).join(' ');
            const l2 = document.createElementNS(ns, 'tspan');
            l2.setAttribute('x', x + w / 2); l2.setAttribute('dy', '9');
            l2.textContent = words.slice(mid).join(' ');
            label.appendChild(l1);
            label.appendChild(l2);
        } else {
            label.textContent = t.name;
        }
        svg.appendChild(label);
    });

    const container = document.getElementById('svg-container');
    container.innerHTML = '';
    container.appendChild(svg);
    svgEl = svg;

    TERRITORIES.forEach(t => {
        const el = svgEl.getElementById(t.id);
        if (!el) return;
        el.addEventListener('click',      ()  => onTerritoryClick(t.id));
        el.addEventListener('mouseenter', (e) => showTooltip(t.id, e));
        el.addEventListener('mouseleave', hideTooltip);
        // Touch support
        el.addEventListener('touchend', (e) => {
            e.preventDefault();
            onTerritoryClick(t.id);
        }, { passive: false });
    });

    updateMapRect();
    window.addEventListener('resize', () => {
        updateMapRect();
        updateAllTroopCounters();
    });
}

function updateMapRect() {
    const mapArea = document.getElementById("map-area");
    mapRect = mapArea.getBoundingClientRect();
}

// ── 8. TERRITORY VISUAL UPDATES ──────────────
function getTerritoryPath(id) {
    return svgEl ? svgEl.getElementById(id) : null;
}

function updateTerritoryColor(id) {
    const path = getTerritoryPath(id);
    if (!path) return;
    const state   = territories[id];
    if (!state) return;
    const contId  = TERR_MAP[id]?.continent;
    const tint    = CONT_TINT[contId] || '#2a2a1a';

    if (state.owner >= 0) {
        const color = players[state.owner].color;
        path.style.fill         = color;
        path.style.fillOpacity  = '0.48';
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', '1.5');
        path.style.strokeOpacity = '0.75';
    } else {
        path.style.fill         = tint;
        path.style.fillOpacity  = '0.6';
        path.setAttribute('stroke', 'rgba(0,0,0,0.45)');
        path.setAttribute('stroke-width', '0.8');
        path.style.strokeOpacity = '1';
    }
}

function updateAllColors() {
    TERRITORIES.forEach(t => updateTerritoryColor(t.id));
}

function setPathClass(id, cls, active) {
    const path = getTerritoryPath(id);
    if (!path) return;
    if (active) path.classList.add(cls);
    else         path.classList.remove(cls);
}

function clearAllPathClasses() {
    TERRITORIES.forEach(t => {
        const path = getTerritoryPath(t.id);
        if (!path) return;
        path.classList.remove("selected-from","selected-to","valid-target","reachable");
        updateTerritoryColor(t.id); // restore fill after class removal
    });
}

// ── 9. TROOP COUNTERS ────────────────────────
function getTroopCounterEl(id) {
    return document.getElementById(`troop-${id}`);
}

function updateTroopCounter(id) {
    const state = territories[id];
    const tDef  = TERR_MAP[id];
    if (!state || !tDef || !svgEl) return;

    let el = getTroopCounterEl(id);
    if (!el) {
        el = document.createElement("div");
        el.className = "troop-counter";
        el.id        = `troop-${id}`;
        document.getElementById("troop-layer").appendChild(el);
    }

    el.textContent      = state.troops;
    el.style.background = state.owner >= 0 ? players[state.owner].color : "#4a5530";

    // Use the SVG element's actual rendered bounding rect
    // (accounts for aspect-ratio letterboxing inside the container)
    const svgRect = svgEl.getBoundingClientRect();
    if (!svgRect.width || !mapRect) return;

    const mapAreaEl = document.getElementById("map-area");
    const areaRect  = mapAreaEl.getBoundingClientRect();

    const x = svgRect.left - areaRect.left + (tDef.cx / 100) * svgRect.width;
    const y = svgRect.top  - areaRect.top  + (tDef.cy / 100) * svgRect.height;

    el.style.left = x + "px";
    el.style.top  = y + "px";
}

function updateAllTroopCounters() {
    TERRITORIES.forEach(t => updateTroopCounter(t.id));
}

function pulseCounter(id) {
    const el = getTroopCounterEl(id);
    if (!el) return;
    el.classList.remove("pulse");
    void el.offsetWidth;
    el.classList.add("pulse");
    setTimeout(() => el.classList.remove("pulse"), 500);
}

// ── 10. TOOLTIP ──────────────────────────────
function showTooltip(id, e) {
    const state = territories[id];
    const tDef  = TERR_MAP[id];
    if (!state || !tDef) return;
    const owner = state.owner >= 0 ? players[state.owner].name : "Unowned";
    const tip   = document.getElementById("territory-tooltip");
    tip.textContent = `${tDef.name}  ·  ${owner}  ·  ${state.troops} troops`;
    tip.classList.remove("hidden");
    tip.style.left = (e.clientX - mapRect.left + 12) + "px";
    tip.style.top  = (e.clientY - mapRect.top  - 30) + "px";
}

function hideTooltip() {
    document.getElementById("territory-tooltip").classList.add("hidden");
}

// ── 11. GAME INIT ────────────────────────────
const INITIAL_TROOPS = { 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 };

function initGame(count, setup) {
    numPlayers = count;
    setupMode  = setup;
    players    = [];
    territories = {};
    cardDeck   = [];
    setsTraded = 0;
    currentTurn = 0;
    attackFrom = attackTo = fortifyFrom = fortifyTo = null;

    // Build players
    for (let i = 0; i < count; i++) {
        const isHuman = (gameMode === "hotseat") ? true
                      : (gameMode === "online")  ? (i === myPlayerIndex)
                      : (i === 0);
        players.push({
            name:        i === 0 ? SystemUI.getPlayerName() : (gameMode === "hotseat" ? `Player ${i+1}` : PLAYER_NAMES[i]),
            color:       PLAYER_COLORS[i],
            territories: new Set(),
            cards:       [],
            setsTraded:  0,
            isAI:        !isHuman,
            eliminated:  false,
            conqueredThisTurn: false
        });
    }

    // Init territory state
    TERRITORIES.forEach(t => {
        territories[t.id] = { owner: -1, troops: 0 };
    });

    // Build card deck (one per territory + 2 wilds)
    const types = ["infantry","cavalry","artillery"];
    TERRITORIES.forEach((t, i) => {
        cardDeck.push({ territory: t.id, type: types[i % 3] });
    });
    cardDeck.push({ territory: null, type: "wild" });
    cardDeck.push({ territory: null, type: "wild" });
    shuffleArr(cardDeck);

    if (setupMode === "random") {
        randomSetup();
        gamePhase = "draft";
        startDraftPhase();
    } else {
        gamePhase = "setup";
        setupRemaining = INITIAL_TROOPS[numPlayers];
        startManualSetup();
    }

    document.getElementById("start-screen").classList.add("hidden");
    updateAllColors();
    renderRoster();
    updatePhaseUI();
    // RAF ensures browser has painted before getBoundingClientRect() is called
    requestAnimationFrame(() => {
        updateMapRect();
        updateAllTroopCounters();
    });
}

function shuffleArr(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ── 12. RANDOM SETUP ─────────────────────────
function randomSetup() {
    const troopsEach = INITIAL_TROOPS[numPlayers] || 30;
    const ids = shuffleArr(TERRITORIES.map(t => t.id));

    // Distribute territories round-robin
    ids.forEach((id, i) => {
        const owner = i % numPlayers;
        territories[id].owner  = owner;
        territories[id].troops = 1;
        players[owner].territories.add(id);
    });

    // Distribute remaining troops evenly
    players.forEach((p, pIdx) => {
        let extra = troopsEach - p.territories.size;
        while (extra > 0) {
            // Add one troop to a random owned territory
            const ownedArr = [...p.territories];
            const pick     = ownedArr[Math.floor(Math.random() * ownedArr.length)];
            territories[pick].troops++;
            extra--;
        }
    });
}

// ── 13. MANUAL SETUP ─────────────────────────
function startManualSetup() {
    setupRemaining = INITIAL_TROOPS[numPlayers];
    setPhaseLabel("SETUP", `Place ${setupRemaining} troops`);
    updateTurnDisplay();
    document.getElementById("draft-block").classList.remove("hidden");
    document.getElementById("draft-count").textContent = setupRemaining;

    if (players[currentTurn].isAI) setTimeout(aiSetupTurn, 1200);
}

function aiSetupTurn() {
    if (gamePhase !== "setup" || !players[currentTurn].isAI) return;
    // Place remaining troops on random owned territories (or all territories if none owned yet)
    const owned = [...players[currentTurn].territories];
    const pool  = owned.length > 0 ? owned : TERRITORIES.map(t => t.id).filter(id => territories[id].owner === -1);
    if (pool.length === 0) { nextSetupTurn(); return; }

    const id = pool[Math.floor(Math.random() * pool.length)];
    placeSetupTroop(id, currentTurn);
}

function placeSetupTroop(id, playerIdx) {
    const t = territories[id];
    if (t.owner === -1) {
        // Claim unowned territory
        t.owner = playerIdx;
        t.troops = 1;
        players[playerIdx].territories.add(id);
    } else if (t.owner === playerIdx) {
        t.troops++;
    } else { return; } // can't place on opponent's territory during setup

    updateTerritoryColor(id);
    updateTroopCounter(id);
    pulseCounter(id);

    setupRemaining--;
    document.getElementById("draft-count").textContent = setupRemaining;

    if (setupRemaining <= 0) {
        // All placed — check if all territories claimed
        const unclaimed = TERRITORIES.filter(t => territories[t.id].owner === -1);
        if (unclaimed.length > 0) {
            // Give unclaimed to random players
            unclaimed.forEach(terr => {
                const rand = Math.floor(Math.random() * numPlayers);
                territories[terr.id].owner = rand;
                territories[terr.id].troops = 1;
                players[rand].territories.add(terr.id);
                updateTerritoryColor(terr.id);
                updateTroopCounter(terr.id);
            });
        }
        gamePhase = "draft";
        startDraftPhase();
        return;
    }

    nextSetupTurn();
}

function nextSetupTurn() {
    currentTurn = (currentTurn + 1) % numPlayers;
    updateTurnDisplay();
    if (players[currentTurn].isAI) setTimeout(aiSetupTurn, 400);
}

// ── 14. DRAFT PHASE ──────────────────────────
/*
 * Troop calculation:
 * - Base: max(3, floor(territories_owned / 3))
 * - Continent bonuses: +bonus for each fully-owned continent
 * - Card trade bonus: added on top if cards are traded this turn
 */
function calcDraftTroops(playerIdx) {
    const p      = players[playerIdx];
    let   base   = Math.max(3, Math.floor(p.territories.size / 3));

    // Continent bonuses
    Object.values(CONTINENTS).forEach(cont => {
        const ownsAll = cont.territories.every(id => territories[id].owner === playerIdx);
        if (ownsAll) base += cont.bonus;
    });

    return base;
}

function startDraftPhase() {
    gamePhase      = "draft";
    draftRemaining = calcDraftTroops(currentTurn);

    const p = players[currentTurn];
    setPhaseLabel("DRAFT", p.isAI ? `${p.name} thinking...` : "Place reinforcements");
    updateTurnDisplay();
    clearAllPathClasses();
    showTurnToast(currentTurn);
    addLog(`🎯 ${p.name}'s turn — +${draftRemaining} troops`, p.color);

    document.getElementById("draft-block").classList.remove("hidden");
    document.getElementById("draft-count").textContent = draftRemaining;
    document.getElementById("attack-block").classList.add("hidden");
    document.getElementById("fortify-block").classList.add("hidden");
    document.getElementById("btn-end-attack").classList.add("hidden");
    document.getElementById("btn-end-turn").classList.add("hidden");
    document.getElementById("dice-result").classList.add("hidden");

    // Show card trade button if player has 5+ cards
    const hand = players[currentTurn].cards;
    document.getElementById("btn-trade-cards").classList.toggle("hidden", hand.length < 3);

    renderRoster();

    if (gameMode === "online") pushGameState();

    if (players[currentTurn].isAI) setTimeout(aiDraftPhase, 800);
}

// ── 15. ATTACK PHASE ─────────────────────────
function startAttackPhase() {
    gamePhase  = "attack";
    attackFrom = attackTo = null;

    const p = players[currentTurn];
    setPhaseLabel("ATTACK", p.isAI ? `${p.name} attacking...` : "Select territory");
    document.getElementById("draft-block").classList.add("hidden");
    document.getElementById("attack-block").classList.remove("hidden");
    document.getElementById("btn-end-attack").classList.remove("hidden");
    document.getElementById("btn-trade-cards").classList.add("hidden");

    clearAllPathClasses();
    if (gameMode === "online") pushGameState();
}

// ── 16. FORTIFY PHASE ────────────────────────
function startFortifyPhase() {
    gamePhase  = "fortify";
    fortifyFrom = fortifyTo = null;

    setPhaseLabel("FORTIFY", "Move troops once");
    document.getElementById("attack-block").classList.add("hidden");
    document.getElementById("fortify-block").classList.remove("hidden");
    document.getElementById("btn-end-attack").classList.add("hidden");
    document.getElementById("btn-end-turn").classList.remove("hidden");

    clearAllPathClasses();
    if (gameMode === "online") pushGameState();

    if (players[currentTurn].isAI) setTimeout(aiFortify, 700);
}

// ── 17. TERRITORY CLICK HANDLER ──────────────
function onTerritoryClick(id) {
    const t    = territories[id];
    const mine = t.owner === currentTurn;
    const me   = players[currentTurn];

    if (!isMyTurn()) return;

    if (gamePhase === "setup") {
        placeSetupTroop(id, currentTurn);
        return;
    }

    if (gamePhase === "draft") {
        if (!mine || draftRemaining <= 0) return;
        territories[id].troops++;
        draftRemaining--;
        document.getElementById("draft-count").textContent = draftRemaining;
        updateTroopCounter(id);
        pulseCounter(id);
        if (draftRemaining === 0) {
            document.getElementById("draft-block").classList.add("hidden");
            startAttackPhase();
        }
        if (gameMode === "online") pushGameState();
        return;
    }

    if (gamePhase === "attack") {
        if (mine && t.troops > 1) {
            // Select attacking territory
            clearAllPathClasses();
            attackFrom = id;
            attackTo   = null;
            setPathClass(id, "selected-from", true);
            document.getElementById("atk-from-name").textContent = TERR_MAP[id].name;
            document.getElementById("atk-to-name").textContent   = "—";

            // Highlight valid targets (adjacent enemy territories)
            TERR_MAP[id].adj.forEach(adjId => {
                if (territories[adjId].owner !== currentTurn) {
                    setPathClass(adjId, "valid-target", true);
                }
            });
        } else if (attackFrom && !mine) {
            // Select target — must be adjacent
            const adj = TERR_MAP[attackFrom].adj;
            if (!adj.includes(id)) return;
            attackTo = id;
            setPathClass(id, "selected-to", true);
            document.getElementById("atk-to-name").textContent = TERR_MAP[id].name;
            openAttackModal();
        }
        return;
    }

    if (gamePhase === "fortify") {
        if (mine && !fortifyFrom) {
            // Pick source (must have >1 troops)
            if (t.troops <= 1) return;
            fortifyFrom = id;
            setPathClass(id, "selected-from", true);
            document.getElementById("fort-from-name").textContent = TERR_MAP[id].name;

            // Highlight reachable own territories (connected through own territories)
            const reachable = getReachableOwnTerritories(id, currentTurn);
            reachable.forEach(rid => {
                if (rid !== id) setPathClass(rid, "reachable", true);
            });
        } else if (fortifyFrom && mine && id !== fortifyFrom) {
            // Pick destination (must be reachable through own territories)
            const reachable = getReachableOwnTerritories(fortifyFrom, currentTurn);
            if (!reachable.has(id)) return;
            fortifyTo = id;
            setPathClass(id, "selected-to", true);
            document.getElementById("fort-to-name").textContent = TERR_MAP[id].name;
            openFortifyModal();
        }
        return;
    }
}

// BFS through own territories to find all reachable connected territories
function getReachableOwnTerritories(startId, playerIdx) {
    const visited = new Set([startId]);
    const queue   = [startId];
    while (queue.length > 0) {
        const cur = queue.shift();
        TERR_MAP[cur].adj.forEach(adjId => {
            if (!visited.has(adjId) && territories[adjId].owner === playerIdx) {
                visited.add(adjId);
                queue.push(adjId);
            }
        });
    }
    return visited;
}

// ── 18. COMBAT SYSTEM ────────────────────────
/*
 * RISK COMBAT RULES:
 *
 * Attacker rolls up to 3 dice (limited by troops - 1, max 3).
 * Defender rolls up to 2 dice (limited by troops, max 2).
 *
 * Compare pairs from highest to lowest:
 *   Highest atk vs highest def → higher wins; tie → defender wins
 *   2nd atk vs 2nd def (if both rolled 2+) → same rule
 *
 * Each comparison results in one casualty (loser loses 1 troop).
 * Maximum 2 casualties per roll (one per comparison pair).
 */
function rollCombat(atkDiceCount, defDiceCount) {
    const atkRolls = Array.from({length: atkDiceCount}, () => Math.ceil(Math.random() * 6)).sort((a,b) => b-a);
    const defRolls = Array.from({length: defDiceCount}, () => Math.ceil(Math.random() * 6)).sort((a,b) => b-a);

    let atkLoss = 0, defLoss = 0;
    const pairs = Math.min(atkRolls.length, defRolls.length);

    const comparisons = [];
    for (let i = 0; i < pairs; i++) {
        const atkWin = atkRolls[i] > defRolls[i]; // ties go to defender
        if (atkWin) defLoss++;
        else        atkLoss++;
        comparisons.push({ atk: atkRolls[i], def: defRolls[i], atkWin });
    }

    return { atkRolls, defRolls, atkLoss, defLoss, comparisons };
}

function openAttackModal() {
    const atkTroops = territories[attackFrom].troops;
    const defTroops = territories[attackTo].troops;

    // Max dice attacker can use = min(troops-1, 3)
    const maxAtk = Math.min(atkTroops - 1, 3);
    const maxDef = Math.min(defTroops, 2);

    // Update dice pickers
    document.querySelectorAll("#atk-dice-picker .dice-opt").forEach(btn => {
        const d = parseInt(btn.dataset.dice);
        btn.disabled = d > maxAtk;
        btn.classList.toggle("active", d === Math.min(atkDice, maxAtk));
    });
    document.querySelectorAll("#def-dice-picker .dice-opt").forEach(btn => {
        const d = parseInt(btn.dataset.dice);
        btn.disabled = d > maxDef;
        btn.classList.toggle("active", d === Math.min(defDice, maxDef));
    });

    atkDice = Math.min(atkDice, maxAtk);
    defDice = Math.min(defDice, maxDef);

    document.getElementById("atk-summary").textContent =
        `${TERR_MAP[attackFrom].name} (${atkTroops}) → ${TERR_MAP[attackTo].name} (${defTroops})`;

    document.getElementById("attack-modal").classList.remove("hidden");
}

function executeAttack() {
    document.getElementById("attack-modal").classList.add("hidden");

    const result = rollCombat(atkDice, defDice);
    showDiceResult(result);

    // Apply losses
    territories[attackFrom].troops -= result.atkLoss;
    territories[attackTo].troops  -= result.defLoss;

    updateTroopCounter(attackFrom);
    updateTroopCounter(attackTo);
    pulseCounter(attackFrom);
    pulseCounter(attackTo);

    const atkOwner = territories[attackFrom].owner;
    const defOwner = territories[attackTo].owner;

    addLog(`⚔️ ${TERR_MAP[attackFrom].name}→${TERR_MAP[attackTo].name}: -${result.atkLoss}⚔-${result.defLoss}🛡`, players[atkOwner]?.color);

    const conquered = territories[attackTo].troops <= 0;

    if (conquered) {
        // Transfer territory ownership
        players[defOwner].territories.delete(attackTo);

        if (players[defOwner].territories.size === 0) {
            players[atkOwner].cards.push(...players[defOwner].cards);
            players[defOwner].cards      = [];
            players[defOwner].eliminated = true;
            addLog(`💀 ${players[defOwner].name} eliminated! Cards taken.`, players[defOwner].color);
        }

        territories[attackTo].owner  = atkOwner;
        territories[attackTo].troops = 0;
        players[atkOwner].territories.add(attackTo);
        updateTerritoryColor(attackTo);
        addLog(`🏴 ${players[atkOwner].name} captured ${TERR_MAP[attackTo].name}!`, players[atkOwner].color);
    }

    renderRoster();
    checkWinCondition();
    if (gamePhase === "gameover") return;

    if (conquered) {
        showBattleResult(result, true);
        if (players[currentTurn].isAI) {
            const scheduledTurn = currentTurn;
            setTimeout(() => aiAfterBattle(true, scheduledTurn), 1800);
        }
    } else {
        showBattleResult(result, false);
        if (players[currentTurn].isAI) {
            const scheduledTurn = currentTurn;
            setTimeout(() => aiAfterBattle(false, scheduledTurn), 1600);
        }
    }

    if (gameMode === "online") pushGameState();
}

function showDiceResult(result) {
    const atkRow = document.getElementById("dice-atk-row");
    const defRow = document.getElementById("dice-def-row");
    atkRow.innerHTML = "";
    defRow.innerHTML = "";

    result.atkRolls.forEach((d, i) => {
        const pip = document.createElement("div");
        pip.className = `die-pip atk ${result.comparisons[i]?.atkWin ? "win" : "lose"}`;
        pip.textContent = d;
        atkRow.appendChild(pip);
    });

    result.defRolls.forEach((d, i) => {
        const pip = document.createElement("div");
        pip.className = `die-pip def ${result.comparisons[i]?.atkWin ? "lose" : "win"}`;
        pip.textContent = d;
        defRow.appendChild(pip);
    });

    const outcome = result.atkLoss === 0 && result.defLoss > 0 ? "ATTACK SUCCESSFUL" :
                    result.defLoss === 0 ? "DEFENSE HOLDS" : "EXCHANGE";
    const outEl   = document.getElementById("dice-outcome");
    outEl.textContent = outcome;
    outEl.style.color = result.atkLoss === 0 ? "#2ecc71" : result.defLoss === 0 ? "#e74c3c" : "#f39c12";
    document.getElementById("dice-result").classList.remove("hidden");
    SystemUI.playSound('click');
}

let troopMoveMin = 1;
let troopMoveMax = 1;
let troopMoveVal = 1;

function showBattleResult(result, conquered) {
    const modal = document.getElementById("battle-result-modal");
    const title = document.getElementById("battle-result-title");

    // Dice display
    const disp = document.getElementById("battle-dice-display");
    disp.innerHTML = "";
    result.atkRolls.forEach((d, i) => {
        const pip = document.createElement("div");
        pip.className = `die-pip atk ${result.comparisons[i]?.atkWin ? "win" : "lose"}`;
        pip.textContent = d;
        disp.appendChild(pip);
    });
    const sep = document.createElement("div");
    sep.style.cssText = "color:var(--muted);font-size:0.8rem;padding:0 6px;align-self:center";
    sep.textContent = "vs";
    disp.appendChild(sep);
    result.defRolls.forEach((d, i) => {
        const pip = document.createElement("div");
        pip.className = `die-pip def ${result.comparisons[i]?.atkWin ? "lose" : "win"}`;
        pip.textContent = d;
        disp.appendChild(pip);
    });

    document.getElementById("battle-losses").innerHTML =
        `Attacker lost: <b>${result.atkLoss}</b> · Defender lost: <b>${result.defLoss}</b>`;

    const wonDiv = document.getElementById("battle-territory-won");

    if (conquered) {
        title.textContent = "🏴 TERRITORY CONQUERED!";
        wonDiv.classList.remove("hidden");
        document.getElementById("battle-territory-msg").textContent =
            `${TERR_MAP[attackTo].name} captured!`;

        troopMoveMin = atkDice;                              // must move at least as many as dice used
        troopMoveMax = territories[attackFrom].troops - 1;  // must leave 1 behind
        troopMoveVal = troopMoveMin;

        document.getElementById("troop-move-count").textContent = troopMoveVal;
        document.getElementById("troop-move-minus").disabled = troopMoveVal <= troopMoveMin;
        document.getElementById("troop-move-plus").disabled  = troopMoveVal >= troopMoveMax;

        document.getElementById("battle-result-ok").textContent = "OCCUPY";
    } else {
        title.textContent = conquered ? "🏴 CONQUERED!" : "⚔️ BATTLE RESULT";
        wonDiv.classList.add("hidden");
        document.getElementById("battle-result-ok").textContent = "CONTINUE";
    }

    modal.classList.remove("hidden");
}

// Troop move +/- buttons
document.getElementById("troop-move-minus").addEventListener("click", () => {
    if (troopMoveVal > troopMoveMin) {
        troopMoveVal--;
        document.getElementById("troop-move-count").textContent = troopMoveVal;
        document.getElementById("troop-move-minus").disabled = troopMoveVal <= troopMoveMin;
        document.getElementById("troop-move-plus").disabled  = troopMoveVal >= troopMoveMax;
    }
});
document.getElementById("troop-move-plus").addEventListener("click", () => {
    if (troopMoveVal < troopMoveMax) {
        troopMoveVal++;
        document.getElementById("troop-move-count").textContent = troopMoveVal;
        document.getElementById("troop-move-minus").disabled = troopMoveVal <= troopMoveMin;
        document.getElementById("troop-move-plus").disabled  = troopMoveVal >= troopMoveMax;
    }
});

document.getElementById("battle-result-ok").addEventListener("click", () => {
    // AI handles its own results via aiAfterBattle()
    if (players[currentTurn]?.isAI) return;

    document.getElementById("battle-result-modal").classList.add("hidden");

    // Move troops if conquered
    if (territories[attackTo]?.owner === currentTurn && territories[attackTo].troops === 0) {
        territories[attackTo].troops = troopMoveVal;
        territories[attackFrom].troops -= troopMoveVal;

        updateTroopCounter(attackFrom);
        updateTroopCounter(attackTo);

        // Draw a card if first conquest this turn
        if (!players[currentTurn].conqueredThisTurn) {
            players[currentTurn].conqueredThisTurn = true;
            drawCard(currentTurn);
        }
    }

    // Check if must trade cards (5+ cards forces trade)
    if (players[currentTurn].cards.length >= 5 && isMyTurn()) {
        openCardModal(true);
    }

    attackFrom = attackTo = null;
    clearAllPathClasses();
    document.getElementById("atk-from-name").textContent = "—";
    document.getElementById("atk-to-name").textContent   = "—";

    if (gameMode === "online") pushGameState();
});

// ── 19. CARD SYSTEM ──────────────────────────
/*
 * TRADE SET RULES:
 * Valid sets of 3 cards:
 *   - 3 of the same type (3 infantry, 3 cavalry, or 3 artillery)
 *   - One of each type (1 infantry + 1 cavalry + 1 artillery)
 *   - Any above set with a wild card substituting one card
 *
 * Bonus: if any card in the traded set matches a territory you own,
 *        you place 2 extra troops on that territory.
 *
 * Trade values increase with each set traded globally (escalating).
 */
function drawCard(playerIdx) {
    if (cardDeck.length === 0) return;
    players[playerIdx].cards.push(cardDeck.pop());
}

function getValidTradeSets(cards) {
    const sets = [];
    const n    = cards.length;

    // Check all combinations of 3 from hand
    for (let i = 0; i < n - 2; i++) {
        for (let j = i + 1; j < n - 1; j++) {
            for (let k = j + 1; k < n; k++) {
                const combo = [cards[i], cards[j], cards[k]];
                if (isValidSet(combo)) {
                    sets.push({ indices: [i, j, k], cards: combo });
                }
            }
        }
    }
    return sets;
}

function isValidSet(combo) {
    const types = combo.map(c => c.type === "wild" ? null : c.type);
    const nonWild = types.filter(Boolean);
    const wilds   = types.length - nonWild.length;

    if (wilds === 3) return true; // 3 wilds

    // 3 of same type (wilds fill in)
    const typeGroups = {};
    nonWild.forEach(t => typeGroups[t] = (typeGroups[t] || 0) + 1);

    // Check if any type has enough + wilds to make 3
    for (const [type, count] of Object.entries(typeGroups)) {
        if (count + wilds >= 3) return true;
    }

    // One of each (wilds fill missing types)
    const uniqueTypes = new Set(nonWild);
    if (uniqueTypes.size + wilds >= 3 && uniqueTypes.size <= 3) return true;

    return false;
}

function openCardModal(forced = false) {
    const hand = players[currentTurn].cards;
    const sub  = forced
        ? `You have ${hand.length} cards — must trade!`
        : "Trade 3 cards for bonus troops";

    document.getElementById("card-modal-sub").textContent = sub;
    document.getElementById("card-modal-trade").disabled = true;

    // Render hand
    const handEl = document.getElementById("card-hand-display");
    handEl.innerHTML = "";
    hand.forEach((card, i) => {
        const el = document.createElement("div");
        el.className = "risk-card";
        el.dataset.idx = i;
        el.innerHTML = `
            <span class="card-type-icon">${CARD_ICONS[card.type]}</span>
            <span class="card-type-label">${card.type}</span>
            <span class="card-terr-name">${card.territory ? TERR_MAP[card.territory]?.name || "" : "Wild"}</span>
        `;
        el.addEventListener("click", () => { el.classList.toggle("selected"); checkCardSelection(); });
        handEl.appendChild(el);
    });

    // Show valid sets
    const setsEl = document.getElementById("card-sets-list");
    setsEl.innerHTML = "";
    const validSets = getValidTradeSets(hand);
    validSets.forEach((set, i) => {
        const btn = document.createElement("button");
        btn.className   = "pick-btn";
        btn.textContent = `Set ${i+1}: ${set.cards.map(c => CARD_ICONS[c.type]).join(" ")} → +${tradeValue(setsTraded)} troops`;
        btn.addEventListener("click", () => {
            // Auto-select these cards
            handEl.querySelectorAll(".risk-card").forEach(el => el.classList.remove("selected"));
            set.indices.forEach(idx => {
                handEl.querySelector(`.risk-card[data-idx="${idx}"]`)?.classList.add("selected");
            });
            checkCardSelection();
        });
        setsEl.appendChild(btn);
    });

    document.getElementById("card-modal").classList.remove("hidden");
}

function checkCardSelection() {
    const selected = document.querySelectorAll(".risk-card.selected");
    if (selected.length !== 3) {
        document.getElementById("card-modal-trade").disabled = true;
        document.getElementById("card-trade-bonus").classList.add("hidden");
        return;
    }
    const indices = [...selected].map(el => parseInt(el.dataset.idx));
    const combo   = indices.map(i => players[currentTurn].cards[i]);

    if (isValidSet(combo)) {
        const val = tradeValue(setsTraded);
        document.getElementById("card-bonus-val").textContent = val;
        document.getElementById("card-trade-bonus").classList.remove("hidden");
        document.getElementById("card-modal-trade").disabled = false;
    } else {
        document.getElementById("card-modal-trade").disabled = true;
        document.getElementById("card-trade-bonus").classList.add("hidden");
    }
}

document.getElementById("card-modal-trade").addEventListener("click", () => {
    const selected = document.querySelectorAll(".risk-card.selected");
    if (selected.length !== 3) return;

    const indices = [...selected].map(el => parseInt(el.dataset.idx)).sort((a,b) => b-a);
    const traded  = indices.map(i => players[currentTurn].cards[i]);
    const bonus   = tradeValue(setsTraded);
    setsTraded++;

    // Remove traded cards from hand (reverse order to preserve indices)
    indices.forEach(i => players[currentTurn].cards.splice(i, 1));

    // Return to deck
    cardDeck.unshift(...traded);

    // Grant bonus troops
    draftRemaining += bonus;

    // Territory bonus: if any traded card matches owned territory, +2 there
    traded.forEach(card => {
        if (card.territory && players[currentTurn].territories.has(card.territory)) {
            territories[card.territory].troops += 2;
            updateTroopCounter(card.territory);
            pulseCounter(card.territory);
        }
    });

    document.getElementById("card-modal").classList.add("hidden");
    document.getElementById("draft-block").classList.remove("hidden");
    document.getElementById("draft-count").textContent = draftRemaining;

    SystemUI.playSound('win');
    if (gameMode === "online") pushGameState();
});

document.getElementById("card-modal-cancel").addEventListener("click", () =>
    document.getElementById("card-modal").classList.add("hidden"));

// ── 20. FORTIFY MODAL ────────────────────────
let fortifyMax = 0, fortifyVal = 0;

function openFortifyModal() {
    fortifyMax = territories[fortifyFrom].troops - 1;
    fortifyVal = 1;

    document.getElementById("fortify-summary").textContent =
        `${TERR_MAP[fortifyFrom].name} → ${TERR_MAP[fortifyTo].name}`;
    document.getElementById("fort-count").textContent = fortifyVal;
    document.getElementById("fort-minus").disabled    = fortifyVal <= 1;
    document.getElementById("fort-plus").disabled     = fortifyVal >= fortifyMax;

    document.getElementById("fortify-modal").classList.remove("hidden");
}

document.getElementById("fort-minus").addEventListener("click", () => {
    if (fortifyVal > 1) {
        fortifyVal--;
        document.getElementById("fort-count").textContent = fortifyVal;
        document.getElementById("fort-minus").disabled    = fortifyVal <= 1;
        document.getElementById("fort-plus").disabled     = fortifyVal >= fortifyMax;
    }
});
document.getElementById("fort-plus").addEventListener("click", () => {
    if (fortifyVal < fortifyMax) {
        fortifyVal++;
        document.getElementById("fort-count").textContent = fortifyVal;
        document.getElementById("fort-minus").disabled    = fortifyVal <= 1;
        document.getElementById("fort-plus").disabled     = fortifyVal >= fortifyMax;
    }
});

document.getElementById("fortify-confirm").addEventListener("click", () => {
    territories[fortifyFrom].troops -= fortifyVal;
    territories[fortifyTo].troops   += fortifyVal;
    updateTroopCounter(fortifyFrom);
    updateTroopCounter(fortifyTo);
    pulseCounter(fortifyTo);

    document.getElementById("fortify-modal").classList.add("hidden");
    fortifyFrom = fortifyTo = null;
    clearAllPathClasses();

    if (gameMode === "online") pushGameState();
    endTurn();
});

document.getElementById("fortify-cancel").addEventListener("click", () => {
    document.getElementById("fortify-modal").classList.add("hidden");
    fortifyFrom = fortifyTo = null;
    clearAllPathClasses();
});

// ── 21. TURN MANAGEMENT ──────────────────────
function isMyTurn() {
    if (gameMode === "online")  return currentTurn === myPlayerIndex;
    if (gameMode === "hotseat") return true;
    return !players[currentTurn].isAI;
}

function endTurn() {
    clearAllPathClasses();
    attackFrom = attackTo = fortifyFrom = fortifyTo = null;
    document.getElementById("attack-block").classList.add("hidden");
    document.getElementById("fortify-block").classList.add("hidden");
    document.getElementById("btn-end-attack").classList.add("hidden");
    document.getElementById("btn-end-turn").classList.add("hidden");
    players[currentTurn].conqueredThisTurn = false;

    // Advance to next non-eliminated player
    let next = (currentTurn + 1) % numPlayers;
    while (players[next].eliminated) {
        next = (next + 1) % numPlayers;
        if (next === currentTurn) break;
    }
    currentTurn = next;

    startDraftPhase();
}

// ── 22. WIN CONDITION ────────────────────────
function checkWinCondition() {
    // Win = own all 42 territories
    for (let i = 0; i < numPlayers; i++) {
        if (!players[i].eliminated && players[i].territories.size === 42) {
            endGame(i);
            return;
        }
    }
    // Also win if all opponents eliminated
    const alive = players.filter(p => !p.eliminated);
    if (alive.length === 1) endGame(players.indexOf(alive[0]));
}

function endGame(winnerIdx) {
    gamePhase = "gameover";
    const winner = players[winnerIdx];
    document.getElementById("game-over-emoji").textContent = winnerIdx === myPlayerIndex ? "🏆" : "🌍";
    document.getElementById("game-over-title").textContent = "WORLD DOMINATION!";
    document.getElementById("game-over-msg").textContent   =
        `${winner.name} has conquered the world!\n${winner.territories.size} territories — ${winner.cards.length} cards`;
    document.getElementById("game-over-modal").classList.remove("hidden");
    SystemUI.playSound(winnerIdx === myPlayerIndex ? 'win' : 'lose');

    if (gameMode === "online") {
        window.dbUpdate(window.dbRef(window.db, 'risk_rooms/' + currentRoomId), {
            status: "finished", winner: winnerIdx
        });
    }
}

// ── 23. AI BRAIN ─────────────────────────────
/*
 * AI strategy:
 *
 * DRAFT:  Reinforce border territories — those adjacent to enemy territories.
 *         If close to completing a continent, concentrate there.
 *
 * ATTACK: Attack when odds favour (>2× troops vs defender).
 *         Prioritise targets that complete a continent.
 *         Stop attacking when no favourable targets remain.
 *
 * FORTIFY: Move troops from interior (no enemy neighbours) to borders.
 *
 * CARDS:  Trade immediately if 5+ cards, or if a valid set and ≥5 territories lost this turn.
 */
let aiTimeout = null;

function aiDraftPhase() {
    if (gamePhase !== "draft" || !players[currentTurn].isAI) return;

    // Trade cards if 5+ or has a valid set and needs troops
    const hand = players[currentTurn].cards;
    if (hand.length >= 5 || (hand.length >= 3 && getValidTradeSets(hand).length > 0 && draftRemaining < 3)) {
        const sets = getValidTradeSets(hand);
        if (sets.length > 0) {
            const set  = sets[0];
            const bonus = tradeValue(setsTraded);
            setsTraded++;
            const indices = set.indices.sort((a,b) => b-a);
            const traded  = indices.map(i => players[currentTurn].cards[i]);
            indices.forEach(i => players[currentTurn].cards.splice(i, 1));
            cardDeck.unshift(...traded);
            draftRemaining += bonus;
            traded.forEach(card => {
                if (card.territory && players[currentTurn].territories.has(card.territory)) {
                    territories[card.territory].troops += 2;
                    updateTroopCounter(card.territory);
                }
            });
        }
    }

    // Place troops — prefer borders, then continent-completing territories
    const owned  = [...players[currentTurn].territories];
    const borders = owned.filter(id =>
        TERR_MAP[id].adj.some(adjId => territories[adjId].owner !== currentTurn));

    const targets = borders.length > 0 ? borders : owned;

    // Score each territory: prefer those with enemy neighbours and fewer troops
    const scored = targets.map(id => {
        const enemyAdj = TERR_MAP[id].adj.filter(a => territories[a].owner !== currentTurn && territories[a].owner !== -1).length;
        return { id, score: enemyAdj * 3 - territories[id].troops };
    }).sort((a,b) => b.score - a.score);

    const placementQueue = [];
    let remaining = draftRemaining;
    while (remaining > 0) {
        const pick = scored[Math.floor(Math.random() * Math.min(scored.length, 3))];
        if (!pick) break;
        placementQueue.push(pick.id);
        remaining--;
    }

    // Place with delay per troop for visual effect (slower = more readable)
    let i = 0;
    const placeNext = () => {
        if (i >= placementQueue.length) {
            aiTimeout = setTimeout(() => {
                startAttackPhase();
                aiAttackPhase();
            }, 2200);
            return;
        }
        const id = placementQueue[i++];
        territories[id].troops++;
        draftRemaining--;
        document.getElementById("draft-count").textContent = draftRemaining;
        updateTroopCounter(id);
        pulseCounter(id);
        if (draftRemaining === 0) document.getElementById("draft-block").classList.add("hidden");
        aiTimeout = setTimeout(placeNext, 320);
    };
    aiTimeout = setTimeout(placeNext, 1400);
}

function aiAttackPhase() {
    if (gamePhase !== "attack" || !players[currentTurn].isAI) return;

    // Find best attack target
    const attacks = [];
    players[currentTurn].territories.forEach(fromId => {
        if (territories[fromId].troops < 2) return;
        TERR_MAP[fromId].adj.forEach(toId => {
            if (territories[toId].owner === currentTurn) return;
            if (territories[toId].owner === -1) return;
            const odds = territories[fromId].troops / (territories[toId].troops + 1);
            attacks.push({ fromId, toId, odds });
        });
    });

    // Only attack if odds >= 1.5
    const viable = attacks.filter(a => a.odds >= 1.5).sort((a,b) => b.odds - a.odds);
    if (viable.length === 0) {
        aiTimeout = setTimeout(() => {
            startFortifyPhase();
        }, 1800);
        return;
    }

    const pick  = viable[0];
    const atkT  = territories[pick.fromId];
    const defT  = territories[pick.toId];
    const aMaxD = Math.min(atkT.troops - 1, 3);
    const dMaxD = Math.min(defT.troops, 2);

    attackFrom = pick.fromId;
    attackTo   = pick.toId;
    atkDice    = aMaxD;
    defDice    = dMaxD;

    setPathClass(attackFrom, "selected-from", true);
    setPathClass(attackTo,   "selected-to",   true);
    document.getElementById("atk-from-name").textContent = TERR_MAP[attackFrom].name;
    document.getElementById("atk-to-name").textContent   = TERR_MAP[attackTo].name;

    aiTimeout = setTimeout(() => {
        executeAttack();
        // Continuation handled by aiAfterBattle() called from executeAttack
    }, 2000);
}

function aiFortify() {
    if (gamePhase !== "fortify" || !players[currentTurn].isAI) return;

    // Move from interior territory to border
    const owned = [...players[currentTurn].territories];
    const interior = owned.filter(id =>
        !TERR_MAP[id].adj.some(a => territories[a].owner !== currentTurn) &&
        territories[id].troops > 1
    );
    const borders = owned.filter(id =>
        TERR_MAP[id].adj.some(a => territories[a].owner !== currentTurn)
    );

    if (interior.length > 0 && borders.length > 0) {
        const from = interior[Math.floor(Math.random() * interior.length)];
        const reachable = getReachableOwnTerritories(from, currentTurn);
        const reachBorders = borders.filter(id => reachable.has(id));

        if (reachBorders.length > 0) {
            const to    = reachBorders[Math.floor(Math.random() * reachBorders.length)];
            const move  = territories[from].troops - 1;
            territories[from].troops -= move;
            territories[to].troops   += move;
            updateTroopCounter(from);
            updateTroopCounter(to);
            pulseCounter(to);
        }
    }

    aiTimeout = setTimeout(endTurn, 2000);
}

// ── AI BATTLE AUTO-HANDLER ───────────────────
/*
 * Called automatically after AI executeAttack resolves.
 * Handles: modal dismiss, troop move, card draw, 5+ card force-trade,
 * and deciding whether to attack again or move to fortify.
 */
function aiAfterBattle(conquered, turnAtSchedule) {
    // Guard: if current turn changed since scheduling (shouldn't happen but safety net)
    if (gamePhase === "gameover") return;
    if (currentTurn !== turnAtSchedule) return; // stale callback, another turn began

    document.getElementById("battle-result-modal").classList.add("hidden");

    if (conquered) {
        // Auto-move troops: use 75% of available, min = atkDice (clamped to troops-1)
        const from = attackFrom;
        const to   = attackTo;
        if (from && to && territories[to] && territories[to].owner === currentTurn && territories[to].troops === 0) {
            const available = territories[from] ? territories[from].troops - 1 : 0;
            const minMove   = Math.min(atkDice || 1, Math.max(available, 0));
            const moveCount = Math.min(available, Math.max(minMove, Math.floor(available * 0.75)));
            const finalMove = Math.max(moveCount, 1); // always move at least 1
            if (available >= 1) {
                territories[to].troops   = finalMove;
                territories[from].troops -= finalMove;
                updateTroopCounter(from);
                updateTroopCounter(to);
            }

            if (!players[currentTurn].conqueredThisTurn) {
                players[currentTurn].conqueredThisTurn = true;
                drawCard(currentTurn);
                addLog(`🃏 ${players[currentTurn].name} drew a card`, players[currentTurn].color);
            }

            // Forced card trade
            aiForceTradeCards();
        }
    }

    attackFrom = attackTo = null;
    clearAllPathClasses();
    document.getElementById("atk-from-name").textContent = "—";
    document.getElementById("atk-to-name").textContent   = "—";

    if (gamePhase !== "attack") return;

    const p = players[currentTurn];
    if (!p || p.eliminated) {
        startFortifyPhase();
        return;
    }

    // Continue attacking if we have viable targets
    const hasTargets = [...p.territories].some(fromId =>
        territories[fromId].troops >= 2 &&
        TERR_MAP[fromId].adj.some(toId =>
            territories[toId].owner !== currentTurn &&
            territories[toId].owner !== -1 &&
            territories[fromId].troops / (territories[toId].troops + 1) >= 1.5
        )
    );

    if (hasTargets) {
        aiTimeout = setTimeout(aiAttackPhase, 900);
    } else {
        aiTimeout = setTimeout(() => startFortifyPhase(), 1600);
    }
}

// Force-trade any 5+ card situations for AI (silent, no modal)
function aiForceTradeCards() {
    const hand = players[currentTurn].cards;
    let loopGuard = 0;
    while (hand.length >= 5 && loopGuard++ < 10) {
        const sets = getValidTradeSets(hand);
        if (!sets.length) break;
        const set    = sets[0];
        const bonus  = tradeValue(setsTraded);
        setsTraded++;
        const idxs   = set.indices.sort((a, b) => b - a);
        const traded = idxs.map(i => hand[i]);
        idxs.forEach(i => hand.splice(i, 1));
        cardDeck.unshift(...traded);
        draftRemaining += bonus; // will be used next draft phase
    }
}

// ── 24. ACTIVITY LOG + TOASTS ─────────────────
function addLog(text, color) {
    const log = document.getElementById("log-entries");
    if (!log) return;
    const el = document.createElement("div");
    el.className = "log-entry";
    el.textContent = text;
    if (color) el.style.borderLeftColor = color;
    log.insertBefore(el, log.firstChild);
    // Keep last 30 entries
    while (log.children.length > 30) log.removeChild(log.lastChild);
}

function showTurnToast(playerIdx) {
    const p     = players[playerIdx];
    const toast = document.getElementById("turn-toast");
    if (!toast) return;
    toast.textContent = `${p.name.toUpperCase()}'S TURN`;
    toast.style.borderColor = p.color;
    toast.style.color       = p.color;
    toast.classList.remove("hidden", "toast-out");
    // Clear any pending hide
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
        toast.classList.add("toast-out");
        setTimeout(() => toast.classList.add("hidden"), 600);
    }, 2200);
}


function setPhaseLabel(phase, sub) {
    document.getElementById("phase-label").textContent = phase;
    document.getElementById("phase-sub").textContent   = sub || "";
}

function updateTurnDisplay() {
    const p = players[currentTurn];
    document.getElementById("cp-dot").style.background = p.color;
    document.getElementById("cp-name").textContent     = p.name + (p.isAI ? " (AI)" : "");
}

function updatePhaseUI() {
    updateTurnDisplay();
}

function renderRoster() {
    const list = document.getElementById("player-roster");
    list.innerHTML = "";
    players.forEach((p, i) => {
        const row = document.createElement("div");
        row.className = "roster-row" +
            (i === currentTurn ? " active-turn" : "") +
            (p.eliminated ? " eliminated" : "");

        const contBonus = Object.values(CONTINENTS)
            .filter(c => c.territories.every(id => territories[id].owner === i))
            .reduce((sum, c) => sum + c.bonus, 0);

        row.innerHTML = `
            <div class="roster-dot" style="background:${p.color}"></div>
            <div class="roster-name${i === myPlayerIndex ? " is-me" : ""}">${p.name}</div>
            <div class="roster-terrs">${p.territories.size}🌍${p.cards.length > 0 ? ` ${p.cards.length}🃏` : ""}${contBonus > 0 ? ` +${contBonus}` : ""}</div>
        `;
        list.appendChild(row);
    });
}

// ── 25. BUTTON WIRING ────────────────────────
// Attack modal
document.querySelectorAll("#atk-dice-picker .dice-opt").forEach(btn => {
    btn.addEventListener("click", () => {
        if (btn.disabled) return;
        document.querySelectorAll("#atk-dice-picker .dice-opt").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        atkDice = parseInt(btn.dataset.dice);
    });
});
document.querySelectorAll("#def-dice-picker .dice-opt").forEach(btn => {
    btn.addEventListener("click", () => {
        if (btn.disabled) return;
        document.querySelectorAll("#def-dice-picker .dice-opt").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        defDice = parseInt(btn.dataset.dice);
    });
});
document.getElementById("atk-modal-roll").addEventListener("click", executeAttack);
document.getElementById("atk-modal-cancel").addEventListener("click", () => {
    document.getElementById("attack-modal").classList.add("hidden");
    attackFrom = attackTo = null;
    clearAllPathClasses();
});
document.getElementById("atk-cancel-btn").addEventListener("click", () => {
    attackFrom = attackTo = null;
    clearAllPathClasses();
    document.getElementById("atk-from-name").textContent = "—";
    document.getElementById("atk-to-name").textContent   = "—";
});
document.getElementById("fort-cancel-btn").addEventListener("click", () => {
    fortifyFrom = fortifyTo = null;
    clearAllPathClasses();
    document.getElementById("fort-from-name").textContent = "—";
    document.getElementById("fort-to-name").textContent   = "—";
});
document.getElementById("btn-end-attack").addEventListener("click", () => {
    if (!isMyTurn()) return;
    clearAllPathClasses();
    attackFrom = attackTo = null;
    startFortifyPhase();
});
document.getElementById("btn-end-turn").addEventListener("click", () => {
    if (!isMyTurn()) return;
    clearAllPathClasses();
    fortifyFrom = fortifyTo = null;
    endTurn();
});
document.getElementById("btn-trade-cards").addEventListener("click", () => {
    if (!isMyTurn()) return;
    openCardModal(false);
});

document.querySelectorAll(".count-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".count-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        numPlayers = parseInt(btn.dataset.count);
    });
});
document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        setupMode = btn.dataset.setup;
    });
});

document.getElementById("start-btn").addEventListener("click", () => {
    if (gameMode === "online" && !isHost) return;
    document.getElementById("start-btn").disabled = true;

    // Build territory interaction layer (synchronous, instant)
    buildTerritoryOverlay();
    // Load world map backdrop (async, fire-and-forget — game works without it)
    loadWorldMapBackground();

    const countBtn = document.querySelector(".count-btn.active");
    const count    = countBtn ? parseInt(countBtn.dataset.count) : 4;
    const setup    = document.querySelector(".mode-btn.active")?.dataset.setup || "random";
    initGame(count, setup);
});

document.getElementById("btn-play-again").addEventListener("click", () => {
    document.getElementById("game-over-modal").classList.add("hidden");
    // Clear troop counters from previous game
    document.getElementById("troop-layer").innerHTML = "";
    document.getElementById("log-entries").innerHTML  = "";
    document.getElementById("start-screen").classList.remove("hidden");
    document.getElementById("start-btn").disabled    = false;
    document.getElementById("start-btn").textContent = "DEPLOY FORCES";
});

window.addEventListener("resize", () => {
    if (svgEl) updateAllTroopCounters();
});

// ── AI WATCHDOG ───────────────────────────────
// Every 5 seconds: if it's an AI's turn and aiTimeout is null,
// kick-start the AI. Catches any edge case where the loop silently died.
setInterval(() => {
    if (gamePhase === "gameover" || gamePhase === "idle") return;
    if (!players[currentTurn]?.isAI) return;
    if (aiTimeout !== null) return; // already scheduled

    console.warn('[Risk Watchdog] AI stuck — kicking', gamePhase, currentTurn);
    if      (gamePhase === "draft")   setTimeout(aiDraftPhase,   500);
    else if (gamePhase === "attack")  setTimeout(aiAttackPhase,  500);
    else if (gamePhase === "fortify") setTimeout(aiFortify,      500);
}, 5000);

// ── 26. FIREBASE ONLINE ──────────────────────
const lobbyUI = document.getElementById("multiplayer-lobby");

function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

document.getElementById("btn-create-room").addEventListener("click", () => {
    SystemUI.playSound('click');
    currentRoomId = generateRoomCode();
    isHost = true; myId = 1; myPlayerIndex = 0; chatStarted = false;
    window.dbSet(window.dbRef(window.db, 'risk_rooms/' + currentRoomId), {
        status: "waiting", players: 1, hostName: SystemUI.getPlayerName()
    }).then(() => {
        document.getElementById("room-code-display").classList.remove("hidden");
        document.getElementById("host-room-id").innerText = currentRoomId;
        document.getElementById("btn-create-room").disabled = true;
        listenToRoom();
    });
});

document.getElementById("btn-join-room").addEventListener("click", () => {
    SystemUI.playSound('click');
    const code = document.getElementById("join-room-input").value.toUpperCase().trim();
    window.dbGet(window.dbChild(window.dbRef(window.db), `risk_rooms/${code}`)).then(snapshot => {
        if (snapshot.exists()) {
            const data        = snapshot.val();
            const playerCount = data.players || 1;
            currentRoomId     = code;
            isHost            = false;
            myId              = playerCount + 1;
            myPlayerIndex     = playerCount;
            chatStarted       = false;
            window.dbUpdate(window.dbRef(window.db, 'risk_rooms/' + currentRoomId), {
                players: myId,
                [`p${myId}Name`]: SystemUI.getPlayerName(),
                status: "playing"
            });
            lobbyUI.classList.add("hidden");
            listenToRoom();
        } else {
            document.getElementById("lobby-error-msg").textContent = "Room not found.";
        }
    });
});

function listenToRoom() {
    let onlineGameStarted = false;
    window.dbOnValue(window.dbRef(window.db, 'risk_rooms/' + currentRoomId), snapshot => {
        const data = snapshot.val();
        if (!data) return;
        if (data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true;
            lobbyUI.classList.add("hidden");
            if (!chatStarted) {
                chatStarted = true;
                SystemUI.playSound('win');
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }
            if (!isHost) {
                document.getElementById("start-btn").textContent = "Waiting for host...";
                document.getElementById("start-btn").disabled    = true;
            }
            return;
        }
        if (onlineGameStarted) syncFromFirebase(data);
    });
}

function pushGameState() {
    if (gameMode !== "online" || !currentRoomId) return;
    // Serialize territories and players (convert Set to Array)
    const serializedPlayers = players.map(p => ({
        ...p,
        territories: [...p.territories]
    }));
    window.dbUpdate(window.dbRef(window.db, 'risk_rooms/' + currentRoomId), {
        gameState: JSON.stringify({ territories, players: serializedPlayers, currentTurn, gamePhase, setsTraded }),
        status: gamePhase === "gameover" ? "finished" : "playing"
    });
}

function syncFromFirebase(data) {
    if (!data?.gameState) return;
    try {
        const state = JSON.parse(data.gameState);
        territories  = state.territories;
        setsTraded   = state.setsTraded || 0;
        currentTurn  = state.currentTurn;
        gamePhase    = state.gamePhase;
        // Restore Set from Array
        players = state.players.map(p => ({ ...p, territories: new Set(p.territories) }));

        updateAllColors();
        updateAllTroopCounters();
        renderRoster();
        updateTurnDisplay();
        setPhaseLabel(gamePhase.toUpperCase(), "");

        if (gamePhase === "draft" && isMyTurn()) startDraftPhase();
        if (gamePhase === "gameover") endGame(data.winner ?? 0);
    } catch (e) { console.error("Sync error:", e); }
}

document.getElementById("lobby-close-btn").addEventListener("click", () => lobbyUI.classList.add("hidden"));
document.getElementById("btn-cancel-lobby").addEventListener("click", () => {
    gameMode = "ai";
    document.getElementById("sys-risk-mode").value = "ai";
    localStorage.setItem("risk_mode", "ai");
    lobbyUI.classList.add("hidden");
    SystemUI.stopChat(); chatStarted = false;
});