// =============================================
// CHESS PRO · chess_app.js  v5.1 (Upgraded AI)
// Dynamic Seat Array & Enhanced Minimax Brain
// =============================================

// ── 1. CASINO OS INIT ────────────────────────
let gameMode = "ai"; 
localStorage.setItem("chess_mode", "ai"); 

let aiDiff   = localStorage.getItem("chess_diff") || "medium";
let pendingDiffChange = null;   
let chatStarted = false;
let currentRoomId = null;
let myId = 1;
let isHost = true;

let p1Name = "PLAYER 1";
let p2Name = "PLAYER 2";

SystemUI.init({
    gameName: "CHESS PRO",
    rules: "Classic chess. Move pieces to control the board — checkmate the king to win! Castling, en passant, and pawn promotion fully supported. Drag pieces or click to select then click to place.",
    hudDropdowns: [
        {
            id: "sys-chess-mode",
            options: [
                { value: "ai",     label: "🤖 vs AI"  },
                { value: "local",  label: "👥 Hotseat" },
                { value: "online", label: "🌐 Online"  }
            ]
        },
        {
            id: "sys-chess-diff",
            options: [
                { value: "easy",   label: "Easy"   },
                { value: "medium", label: "Medium" },
                { value: "hard",   label: "Hard"   }
            ]
        }
    ]
});

setTimeout(() => {
    const modeEl = document.getElementById("sys-chess-mode");
    const diffEl = document.getElementById("sys-chess-diff");
    if (modeEl) modeEl.value = gameMode;
    if (diffEl) diffEl.value = aiDiff;
    syncDiffVisibility();
    newGame();
}, 10);

document.getElementById("sys-chess-mode").addEventListener("change", e => {
    gameMode = e.target.value;
    localStorage.setItem("chess_mode", gameMode);
    document.getElementById("sys-modal").classList.add("sys-hidden");
    syncDiffVisibility();
    
    if (gameMode === "online") {
        SystemUI.v2Lobby.show();
    } else {
        SystemUI.v2Lobby.hide();
        SystemUI.stopChat();
        chatStarted = false;
        
        myId = 1; 
        isHost = true; 
        newGame();
    }
});

document.getElementById("sys-chess-diff").addEventListener("change", e => {
    const newDiff = e.target.value;
    if (newDiff === aiDiff) return;
    const diffLabels = { easy: "EASY", medium: "MEDIUM", hard: "HARD" };

    if (gameStatus !== "playing" && gameStatus !== "check") {
        aiDiff = newDiff;
        localStorage.setItem("chess_diff", aiDiff);
        showDiffToast(`DIFFICULTY: ${diffLabels[aiDiff]}`, false);
    } else {
        pendingDiffChange = newDiff;
        showDiffToast(`DIFFICULTY → ${diffLabels[newDiff]}\nTakes effect next game`, true);
    }
});

document.getElementById("sys-reset-game-btn").addEventListener("click", () => {
    if (confirm("Start a new game?")) {
        if (pendingDiffChange) {
            aiDiff = pendingDiffChange;
            localStorage.setItem("chess_diff", aiDiff);
            pendingDiffChange = null;
        }
        newGame();
        document.getElementById("sys-modal").classList.add("sys-hidden");
    }
});

function syncDiffVisibility() {
    const wrap = document.getElementById("sys-chess-diff")?.closest(".hud-dropdown-wrap") ||
                 document.getElementById("sys-chess-diff")?.parentElement;
    if (wrap) wrap.style.display = gameMode === "ai" ? "" : "none";
}

// ── 2. AUDIO & ASSETS ────────────────────────

const sfxPlace = new Audio('../../system/audio/chip-lay-3.ogg');
const sfxClick = new Audio('../../system/audio/click1.mp3');
const sfxWin   = new Audio('../../system/audio/win.ogg');
const sfxLose  = new Audio('../../system/audio/lose.ogg');
const sfxTie   = new Audio('../../system/audio/tie.ogg');

function playSFX(audioObj) {
    if (SystemUI.isMuted) return;
    audioObj.pause();
    audioObj.currentTime = 0;
    audioObj.play().catch(e => {});
}

// Map custom PNG filenames
const GLYPHS = {
    wK:'white-king.png', wQ:'white-queen.png', wR:'white-rook.png', wB:'white-bishop.png', wN:'white-knight.png', wP:'white-pawn.png',
    bK:'black-king.png', bQ:'black-queen.png', bR:'black-rook.png', bB:'black-bishop.png', bN:'black-knight.png', bP:'black-pawn.png'
};

// Text versions purely for the History Panel notation
const GLYPHS_TXT = {
    wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
    bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟'
};

const PIECE_NAMES = { K:'King', Q:'Queen', R:'Rook', B:'Bishop', N:'Knight', P:'Pawn' };
const MAT = { K:20000, Q:900, R:500, B:330, N:320, P:100 };

// ── 3. STATE ──────────────────────

const INIT = [
    {t:'R',c:'b'},{t:'N',c:'b'},{t:'B',c:'b'},{t:'Q',c:'b'},{t:'K',c:'b'},{t:'B',c:'b'},{t:'N',c:'b'},{t:'R',c:'b'},
    {t:'P',c:'b'},{t:'P',c:'b'},{t:'P',c:'b'},{t:'P',c:'b'},{t:'P',c:'b'},{t:'P',c:'b'},{t:'P',c:'b'},{t:'P',c:'b'},
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    {t:'P',c:'w'},{t:'P',c:'w'},{t:'P',c:'w'},{t:'P',c:'w'},{t:'P',c:'w'},{t:'P',c:'w'},{t:'P',c:'w'},{t:'P',c:'w'},
    {t:'R',c:'w'},{t:'N',c:'w'},{t:'B',c:'w'},{t:'Q',c:'w'},{t:'K',c:'w'},{t:'B',c:'w'},{t:'N',c:'w'},{t:'R',c:'w'}
];

const PST = {
    P:[ 0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0 ],
    N:[-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
    B:[-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
    R:[ 0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0 ],
    Q:[-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
    K:[-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]
};

let board = [];
let turn = "white";
let selected = null;
let legalCache = [];
let cr = {};
let ept = null;
let lastMove = null;
let capW = [], capB = [];
let gameStatus = "playing";
let halfClock = 0;
let promoP = null;
let aiWorking = false;
let playerColor = "white";
let animating = false;

// Move counter & History
let moveCounts = { white: 0, black: 0 };
let moveHistory = [];  

// ── 4. BOARD HELPERS ──────────────────────────
const R = i => Math.floor(i / 8);
const C = i => i % 8;
const SQ = (r, c) => r * 8 + c;
const ok = (r, c) => r >= 0 && r <= 7 && c >= 0 && c <= 7;
const opp = c => c === 'w' ? 'b' : 'w';
const CC = c => c === 'w' ? 'white' : 'black';
function d2b(i) { return playerColor === 'black' ? 63 - i : i; }
function b2d(sq) { return playerColor === 'black' ? 63 - sq : sq; }

const FILES = ['a','b','c','d','e','f','g','h'];
function sqName(sq) { return FILES[C(sq)] + (8 - R(sq)); }

// ── 5. MOVE GENERATION ───────────────────────

function pseudoMoves(sq, b, cRight, eptSq) {
    const p = b[sq]; if (!p) return [];
    const r = R(sq), c = C(sq), isW = p.c === 'w';
    const moves = [];

    if (p.t === 'P') {
        const dir = isW ? -1 : 1, sr = isW ? 6 : 1;
        const f1 = SQ(r + dir, c);
        if (ok(r + dir, c) && !b[f1]) {
            moves.push(f1);
            if (r === sr) { const f2 = SQ(r + dir*2, c); if (!b[f2]) moves.push(f2); }
        }
        for (const dc of [-1, 1]) {
            if (!ok(r + dir, c + dc)) continue;
            const cap = SQ(r + dir, c + dc);
            if ((b[cap] && b[cap].c !== p.c) || cap === eptSq) moves.push(cap);
        }
        return moves;
    }

    const DIRS = {
        N:[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]],
        K:[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],
        B:[[-1,-1],[-1,1],[1,-1],[1,1]],
        R:[[-1,0],[1,0],[0,-1],[0,1]],
        Q:[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]
    };
    const slide = p.t === 'B' || p.t === 'R' || p.t === 'Q';
    for (const [dr, dc] of DIRS[p.t]) {
        let nr = r + dr, nc = c + dc;
        do {
            if (!ok(nr, nc)) break;
            const dest = SQ(nr, nc);
            if (b[dest]) { if (b[dest].c !== p.c) moves.push(dest); break; }
            moves.push(dest);
            nr += dr; nc += dc;
        } while (slide);
    }

    if (p.t === 'K') {
        if (isW) {
            if (cRight.wK && !b[61] && !b[62]) moves.push(62);
            if (cRight.wQ && !b[57] && !b[58] && !b[59]) moves.push(58);
        } else {
            if (cRight.bK && !b[5]  && !b[6])  moves.push(6);
            if (cRight.bQ && !b[1]  && !b[2]  && !b[3])  moves.push(2);
        }
    }
    return moves;
}

function inCheck(color, b) {
    const kc = color === 'white' ? 'w' : 'b', oc = opp(kc);
    const ks = b.findIndex(p => p && p.t === 'K' && p.c === kc);
    if (ks === -1) return true;
    const kr = R(ks), kC = C(ks);
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr = kr+dr, nc = kC+dc;
        if (ok(nr,nc)) { const p=b[SQ(nr,nc)]; if(p&&p.c===oc&&p.t==='N') return true; }
    }
    const pawnDr = color === 'white' ? -1 : 1;
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        let nr=kr+dr, nc=kC+dc, dist=0;
        while (ok(nr,nc)) {
            dist++;
            const p = b[SQ(nr,nc)];
            if (p) {
                if (p.c===oc) {
                    const diag=dr!==0&&dc!==0, orth=dr===0||dc===0;
                    if (diag&&(p.t==='B'||p.t==='Q')) return true;
                    if (orth&&(p.t==='R'||p.t==='Q')) return true;
                    if (dist===1&&p.t==='K') return true;
                    if (dist===1&&p.t==='P'&&diag&&dr===pawnDr) return true;
                }
                break;
            }
            nr+=dr; nc+=dc;
        }
    }
    return false;
}

function applyMove(from, to, b, cRight, eptSq, promo='Q') {
    const nb=[...b], nc={...cRight};
    let ne=null;
    const p = nb[from];
    if (p.t==='P'&&to===eptSq) nb[to+(p.c==='w'?8:-8)]=null;
    if (p.t==='K'&&Math.abs(to-from)===2) {
        if(to>from){ nb[to-1]=nb[to+1]; nb[to+1]=null; }
        else       { nb[to+1]=nb[to-2]; nb[to-2]=null; }
    }
    if (p.t==='P'&&Math.abs(to-from)===16) ne=(from+to)/2;
    let mp={...p};
    if (p.t==='P'&&(R(to)===0||R(to)===7)) mp.t=promo;
    nb[to]=mp; nb[from]=null;
    if(p.t==='K'){ if(p.c==='w'){nc.wK=false;nc.wQ=false;}else{nc.bK=false;nc.bQ=false;} }
    if(p.t==='R'){ if(from===63)nc.wK=false; if(from===56)nc.wQ=false; if(from===7)nc.bK=false; if(from===0)nc.bQ=false; }
    if(to===63)nc.wK=false; if(to===56)nc.wQ=false; if(to===7)nc.bK=false; if(to===0)nc.bQ=false;
    return {board:nb, cr:nc, ept:ne};
}

function legalMoves(sq, b, cRight, eptSq) {
    const p=b[sq]; if(!p) return [];
    const color=CC(p.c);
    const legal=[];
    for (const to of pseudoMoves(sq,b,cRight,eptSq)) {
        if(p.t==='K'&&Math.abs(to-sq)===2) {
            if(inCheck(color,b)) continue;
            const pass=(to>sq)?sq+1:sq-1;
            const {board:mid}=applyMove(sq,pass,b,cRight,eptSq);
            if(inCheck(color,mid)) continue;
        }
        const {board:nb}=applyMove(sq,to,b,cRight,eptSq);
        if(!inCheck(color,nb)) legal.push(to);
    }
    return legal;
}

function allLegalMoves(color, b, cRight, eptSq) {
    const c=color==='white'?'w':'b', moves=[];
    for(let sq=0;sq<64;sq++) {
        if(b[sq]&&b[sq].c===c)
            for(const to of legalMoves(sq,b,cRight,eptSq)) moves.push({from:sq,to});
    }
    return moves;
}

function toReadable(from, to, promo, boardBefore, crBefore, eptBefore, boardAfter, newStatus) {
    const p = boardBefore[from];
    if (!p) return '?';

    if (p.t === 'K' && Math.abs(to - from) === 2) {
        return to > from ? 'Castle Kingside' : 'Castle Queenside';
    }

    const isCapture = !!boardBefore[to] || (p.t === 'P' && to === eptBefore);
    const glyph    = GLYPHS_TXT[p.c + p.t]; 
    const fromSq   = sqName(from);
    const toSq     = sqName(to);
    const sep      = isCapture ? ' x ' : ' → ';

    let text = glyph + ' ' + fromSq + sep + toSq;

    if (promo && p.t === 'P' && (R(to) === 0 || R(to) === 7)) {
        text += '=' + GLYPHS_TXT[p.c + promo];
    }

    if (newStatus === 'checkmate') text += ' ✔';
    else if (newStatus === 'check') text += ' +';

    return text;
}

// ── 6. TIMERS (ACCURATE DELTA FIX) ────────────

let timers = { white: 0, black: 0 };
let timerInterval = null;
let lastTimerTick = Date.now();

function startTimerFor(color) {
    clearInterval(timerInterval);
    lastTimerTick = Date.now();
    
    timerInterval = setInterval(() => {
        const now = Date.now();
        const delta = Math.floor((now - lastTimerTick) / 1000);
        if (delta > 0) {
            timers[color] += delta;
            lastTimerTick += delta * 1000;
            renderTimer(color);
        }
    }, 200); 
    
    document.getElementById("timer-box-white").classList.toggle("active", color === "white");
    document.getElementById("timer-box-black").classList.toggle("active", color === "black");
}

function stopTimers() {
    clearInterval(timerInterval);
    document.getElementById("timer-box-white").classList.remove("active");
    document.getElementById("timer-box-black").classList.remove("active");
}

function renderTimer(color) {
    const t = timers[color];
    const m = Math.floor(t / 60), s = t % 60;
    const str = m + ':' + (s < 10 ? '0' : '') + s;
    document.getElementById(`timer-${color}`).textContent = str;
}

function resetTimers() {
    timers = { white: 0, black: 0 };
    renderTimer('white'); renderTimer('black');
    stopTimers();
}

function bumpMoveCount(color) {
    moveCounts[color]++;
    const id = color === 'white' ? 'moves-white' : 'moves-black';
    document.getElementById(id).textContent = moveCounts[color] + ' move' + (moveCounts[color] !== 1 ? 's' : '');
}

function resetMoveCounts() {
    moveCounts = { white: 0, black: 0 };
    document.getElementById("moves-white").textContent = "0 moves";
    document.getElementById("moves-black").textContent = "0 moves";
}

function pushHistory(san, color) {
    moveHistory.push({ san, color });
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById("history-list");
    list.innerHTML = "";
    const lastIdx = moveHistory.length - 1;

    for (let i = 0; i < moveHistory.length; i += 2) {
        const moveNum = Math.floor(i / 2) + 1;
        const wEntry = moveHistory[i];
        const bEntry = moveHistory[i + 1];

        const row = document.createElement("div");
        row.className = "hist-row";

        const numEl = document.createElement("span");
        numEl.className = "hist-num";
        numEl.textContent = moveNum + ".";
        row.appendChild(numEl);

        const wEl = document.createElement("span");
        wEl.className = "hist-w" + (i === lastIdx ? " latest" : "");
        wEl.textContent = wEntry ? wEntry.san : "—";
        row.appendChild(wEl);

        const bEl = document.createElement("span");
        bEl.className = "hist-b" + (bEntry && i + 1 === lastIdx ? " latest" : "");
        bEl.textContent = bEntry ? bEntry.san : "";
        row.appendChild(bEl);

        list.appendChild(row);
    }
    list.scrollTop = list.scrollHeight;
}

function resetHistory() {
    moveHistory = [];
    document.getElementById("history-list").innerHTML = "";
}

// ── 9. NOTIFICATIONS ──────────────────────────

let diffToastTimer = null;
function showDiffToast(msg, isPending) {
    const el = document.getElementById("diff-toast");
    document.getElementById("diff-toast-text").innerHTML = msg.replace('\n', '<br>');
    el.classList.remove("hidden");
    el.classList.add("show");
    clearTimeout(diffToastTimer);
    diffToastTimer = setTimeout(() => {
        el.classList.remove("show");
        setTimeout(() => el.classList.add("hidden"), 350);
    }, 3200);
}

let checkBannerTimer = null;
function flashCheckBanner(text) {
    const el = document.getElementById("check-banner");
    document.getElementById("check-banner-text").textContent = text;
    el.classList.remove("hidden");
    el.classList.add("show");
    clearTimeout(checkBannerTimer);
    checkBannerTimer = setTimeout(() => {
        el.classList.remove("show");
        setTimeout(() => el.classList.add("hidden"), 300);
    }, 1600);
}

function showInvalidMove(reason) {
    const el = document.getElementById("status-text");
    el.textContent = reason;
    el.style.color = "#e87070";
    const audio = new Audio('../../system/audio/switch4.ogg');
    audio.volume = 0.4;
    audio.play().catch(() => {});
    setTimeout(() => {
        el.style.color = "";
        updateStatus();
    }, 1500);
}

// ── 10. GAME FLOW ─────────────────────────────

function newGame() {
    if (gameMode === "online" && myId === 2) {
        showInvalidMove("ONLY HOST CAN RESTART");
        return;
    }

    board = INIT.map(p => p ? {...p} : null);
    turn = "white";
    selected = null; legalCache = [];
    cr = {wK:true, wQ:true, bK:true, bQ:true};
    ept = null; lastMove = null;
    capW = []; capB = [];
    gameStatus = "playing";
    halfClock = 0; promoP = null; aiWorking = false; animating = false;
    playerColor = (gameMode === "online" && myId === 2) ? "black" : "white";

    if (pendingDiffChange) {
        aiDiff = pendingDiffChange;
        localStorage.setItem("chess_diff", aiDiff);
        pendingDiffChange = null;
    }

    resetTimers();
    resetMoveCounts();
    resetHistory();

    buildBoard();
    renderBoard();
    updateStatus();
    hidePromo();
    document.getElementById("game-over-modal").classList.add("hidden");
    document.getElementById("cap-white").innerHTML = "";
    document.getElementById("cap-black").innerHTML = "";
    document.getElementById("adv-white").textContent = "";
    document.getElementById("adv-black").textContent = "";
    updateLabels();
    updateNames();
    
    document.getElementById("btn-new-game").style.display = "";
    document.getElementById("btn-play-again").style.display = "";

    startTimerFor("white");
    
    // AUDIT: Safely track play count via OS 2.0
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("chess");
    
    if (gameMode === "online" && isHost) {
        pushState(); 
    }
}

// ── 11. CLICK & DRAG HANDLERS ────────────────

function handleClick(sq) {
    if (gameStatus === "checkmate" || gameStatus === "stalemate" || gameStatus === "draw50") return;
    if (promoP || animating) return;
    if (aiWorking && gameMode === "ai") return;
    if (gameMode === "online") {
        const mc = myId === 1 ? "white" : "black";
        if (turn !== mc) { showInvalidMove("NOT YOUR TURN"); return; }
        playerColor = mc;
    }

    const turnC = turn === "white" ? "w" : "b";
    const piece = board[sq];

    if (selected === null) {
        if (!piece) return;
        if (piece.c !== turnC) { showInvalidMove("WRONG COLOR"); return; }
        if (gameMode === "ai" && turn !== playerColor) return;
        
        playSFX(sfxClick); 
        selected = sq;
        legalCache = legalMoves(sq, board, cr, ept);
        if (legalCache.length === 0) {
            showInvalidMove(`${PIECE_NAMES[piece.t]} HAS NO LEGAL MOVES`);
            selected = null;
        }
        renderBoard();

    } else if (sq === selected) {
        selected = null; legalCache = []; renderBoard();

    } else if (legalCache.includes(sq)) {
        doMove(selected, sq);

    } else if (piece && piece.c === turnC) {
        if (gameMode === "ai" && turn !== playerColor) return;
        
        playSFX(sfxClick); 
        selected = sq;
        legalCache = legalMoves(sq, board, cr, ept);
        if (legalCache.length === 0) {
            showInvalidMove(`${PIECE_NAMES[piece.t]} HAS NO LEGAL MOVES`);
            selected = null;
        }
        renderBoard();

    } else {
        if (selected !== null) showInvalidMove("ILLEGAL MOVE");
        selected = null; legalCache = []; renderBoard();
    }
}

let dragSrc = null;
let isDragging = false;

function setupDragHandlers(sqEl, di) {
    sqEl.addEventListener("dragstart", e => e.preventDefault());

    sqEl.addEventListener("mousedown", e => {
        const sq = d2b(di);
        const piece = board[sq];
        if (!piece) return;
        const turnC = turn === "white" ? "w" : "b";
        if (piece.c !== turnC) return;
        if (gameMode === "ai" && turn !== playerColor) return;
        if (gameMode === "online" && turn !== (myId === 1 ? "white" : "black")) return;
        if (aiWorking || animating || promoP) return;
        
        if (selected !== sq) {
            playSFX(sfxClick);
            selected = sq;
            legalCache = legalMoves(sq, board, cr, ept);
            renderBoard();
        }
        dragSrc = sq;
    });

    sqEl.addEventListener("touchstart", e => {
        const sq = d2b(di);
        const piece = board[sq];
        if (!piece) return;
        const turnC = turn === "white" ? "w" : "b";
        if (piece.c !== turnC) return;
        if (gameMode === "ai" && turn !== playerColor) return;
        if (gameMode === "online" && turn !== (myId === 1 ? "white" : "black")) return;
        if (aiWorking || animating || promoP) return;
        
        e.preventDefault();
        dragSrc = sq;
        if (selected !== sq) {
            playSFX(sfxClick);
            selected = sq;
            legalCache = legalMoves(sq, board, cr, ept);
            renderBoard();
        }
    }, { passive: false });
}

document.addEventListener("mousemove", () => { if (dragSrc !== null) isDragging = true; });

document.addEventListener("mouseup", e => {
    if (dragSrc === null) return;
    if (!isDragging) { dragSrc = null; return; }
    isDragging = false;
    const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
    const sqEl = dropTarget?.closest('.sq');
    if (sqEl) {
        const di = parseInt(sqEl.dataset.di);
        if (!isNaN(di)) {
            const destSq = d2b(di);
            if (legalCache.includes(destSq)) {
                doMove(dragSrc, destSq);
                dragSrc = null;
                return;
            }
        }
    }
    dragSrc = null;
});

document.addEventListener("touchmove", () => { if (dragSrc !== null) isDragging = true; }, { passive: true });

document.addEventListener("touchend", e => {
    if (dragSrc === null) return;
    if (!isDragging) { dragSrc = null; return; }
    isDragging = false;
    const touch = e.changedTouches[0];
    const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
    const sqEl = dropTarget?.closest('.sq');
    if (sqEl) {
        const di = parseInt(sqEl.dataset.di);
        if (!isNaN(di)) {
            const destSq = d2b(di);
            if (legalCache.includes(destSq)) {
                doMove(dragSrc, destSq);
                dragSrc = null;
                return;
            }
        }
    }
    dragSrc = null;
});

// ── 13. MOVE EXECUTION ────────────────────────

function doMove(from, to, promo) {
    const p = board[from];
    const myC = p.c === 'w' ? 'white' : 'black';
    const promoPiece = p.t === 'P' && (R(to) === 0 || R(to) === 7);
    const needInput = promoPiece && !promo &&
        (gameMode === "local" ||
         (gameMode === "ai" && myC === playerColor) ||
         (gameMode === "online" && myC === (myId === 1 ? "white" : "black")));

    if (needInput) {
        promoP = {from, to};
        selected = null; legalCache = [];
        renderBoard();
        showPromo(p.c);
        return;
    }
    animateAndFinish(from, to, promo || 'Q');
}

function animateAndFinish(from, to, promo) {
    const p = board[from];
    if (!p) { finishMove(from, to, promo); return; }

    animating = true;
    const boardEl = document.getElementById("chess-board");
    const fromEl = boardEl.children[b2d(from)];
    const toEl   = boardEl.children[b2d(to)];

    if (!fromEl || !toEl) { animating = false; finishMove(from, to, promo); return; }

    const fromRect = fromEl.getBoundingClientRect();
    const toRect   = toEl.getBoundingClientRect();

    const ghost = document.createElement("div");
    ghost.className = `piece piece-ghost`;
    ghost.style.backgroundImage = `url('../../system/images/pieces/chess-pieces/${GLYPHS[p.c + p.t]}')`;
    ghost.style.cssText += `
        left: ${fromRect.left}px;
        top: ${fromRect.top}px;
        width: ${fromRect.width}px;
        height: ${fromRect.height}px;
    `;
    document.body.appendChild(ghost);

    const srcPiece = fromEl.querySelector('.piece');
    if (srcPiece) srcPiece.style.opacity = '0';

    requestAnimationFrame(() => requestAnimationFrame(() => {
        ghost.style.left = toRect.left + 'px';
        ghost.style.top  = toRect.top  + 'px';
    }));

    setTimeout(() => {
        ghost.remove();
        if (srcPiece) srcPiece.style.opacity = '';
        animating = false;
        finishMove(from, to, promo);
    }, 200);
}

function finishMove(from, to, promo) {
    const p = board[from];
    const captured = board[to];
    const crBefore = {...cr};
    const eptBefore = ept;
    const boardBefore = [...board];

    if (captured) (p.c==='w'?capW:capB).push({...captured});
    if (p.t==='P'&&to===ept) {
        const ep=board[to+(p.c==='w'?8:-8)];
        if(ep)(p.c==='w'?capW:capB).push({...ep});
    }

    if (p.t==='P'||captured) halfClock=0; else halfClock++;

    const result = applyMove(from, to, board, cr, ept, promo);
    board = result.board;
    cr = result.cr;
    ept = result.ept;
    lastMove = {from, to};
    turn = turn === "white" ? "black" : "white";
    selected = null; legalCache = []; promoP = null;

    playSFX(sfxPlace);

    const mover = turn === "white" ? "black" : "white";  
    bumpMoveCount(mover);
    startTimerFor(turn);

    if (halfClock >= 100) { gameStatus = "draw50"; }
    else checkGameStatus();

    const readable = toReadable(from, to, promo, boardBefore, crBefore, eptBefore, board, gameStatus);
    pushHistory(readable, mover);

    renderBoard();
    updateStatus();
    updateCaptures();

    if (gameStatus === "check") {
        const who = turn === "white" ? "WHITE" : "BLACK";
        flashCheckBanner(`⚠ ${who} IS IN CHECK!`);
    }

    if (gameMode === "online") { 
        pushState(); 
        
        // V2 DROP-IN AI: If I am the Host, check if the next seat is an AI and trigger it!
        if (isHost && (gameStatus === "playing" || gameStatus === "check")) {
            const currentSeatIdx = turn === "white" ? 0 : 1;
            if (seats[currentSeatIdx] && seats[currentSeatIdx].type === "ai" && !aiWorking) {
                aiWorking = true;
                document.getElementById("status-text").textContent = "AI IS THINKING…";
                setTimeout(doAI, 350);
            }
        }
        
        return; 
    }

    if (gameMode === "ai" && turn !== playerColor &&
        (gameStatus === "playing" || gameStatus === "check")) {
        aiWorking = true;
        document.getElementById("status-text").textContent = "AI IS THINKING…";
        setTimeout(doAI, 350);
    }
}

function checkGameStatus() {
    const moves = allLegalMoves(turn, board, cr, ept);
    if (moves.length === 0) {
        gameStatus = inCheck(turn, board) ? "checkmate" : "stalemate";
    } else {
        gameStatus = inCheck(turn, board) ? "check" : "playing";
    }
}

// ── 14. AI (Upgraded Brain) ───────────────────

function evalBoard(b) {
    let score = 0;
    for (let i = 0; i < 64; i++) {
        const p = b[i]; if (!p) continue;
        const val = MAT[p.t];
        const pstI = p.c==='w' ? i : (7-R(i))*8+C(i);
        const pos = PST[p.t] ? (PST[p.t][pstI]||0) : 0;
        if (p.c==='w') score += val+pos; else score -= val+pos;
    }
    return score;
}

// MVV-LVA move ordering to speed up Alpha-Beta
function getOrderedMoves(color, b, cR, ep) {
    const moves = allLegalMoves(color, b, cR, ep);
    return moves.map(m => {
        let score = 0;
        const pFrom = b[m.from];
        const pTo = b[m.to];
        // Most Valuable Victim - Least Valuable Aggressor
        if (pTo) score = 10 * MAT[pTo.t] - MAT[pFrom.t];
        // Bonus for check
        const r = applyMove(m.from, m.to, b, cR, ep);
        if (inCheck(opp(pFrom.c), r.board)) score += 50;
        return { ...m, score };
    }).sort((a,b) => b.score - a.score);
}

function minimax(b, cR, ep, depth, alpha, beta, maxing) {
    if (depth === 0) return evalBoard(b);
    const color = maxing ? "white" : "black";
    const moves = getOrderedMoves(color, b, cR, ep);
    
    if (moves.length === 0) {
        if (inCheck(color,b)) return maxing ? -100000+depth*10 : 100000-depth*10;
        return 0;
    }

    if (maxing) {
        let best = -Infinity;
        for (const m of moves) {
            const r = applyMove(m.from,m.to,b,cR,ep);
            best = Math.max(best, minimax(r.board,r.cr,r.ept,depth-1,alpha,beta,false));
            alpha = Math.max(alpha,best);
            if (beta<=alpha) break;
        }
        return best;
    } else {
        let best = Infinity;
        for (const m of moves) {
            const r = applyMove(m.from,m.to,b,cR,ep);
            best = Math.min(best, minimax(r.board,r.cr,r.ept,depth-1,alpha,beta,true));
            beta = Math.min(beta,best);
            if (beta<=alpha) break;
        }
        return best;
    }
}

function doAI() {
    if (gameStatus!=="playing"&&gameStatus!=="check") { aiWorking=false; return; }
    const moves = getOrderedMoves(turn, board, cr, ept);
    if (!moves.length) { aiWorking=false; return; }

    let best = null;
    if (aiDiff === "easy") {
        best = moves[Math.floor(Math.random()*moves.length)];
    } else {
        const depth = aiDiff==="hard" ? 4 : 3; // Upgraded Depth (Ordering allows this speed)
        const maxing = turn==="white";
        let bestVal = maxing ? -Infinity : Infinity;
        
        for (const mv of moves) {
            const r = applyMove(mv.from,mv.to,board,cr,ept);
            const val = minimax(r.board,r.cr,r.ept,depth-1,-Infinity,Infinity,!maxing);
            if (maxing?val>bestVal:val<bestVal) { bestVal=val; best=mv; }
        }
    }
    aiWorking = false;
    if (best) animateAndFinish(best.from, best.to, 'Q');
}

// ── 15. RENDERING ─────────────────────────────

function buildBoard() {
    const el = document.getElementById("chess-board");
    el.innerHTML = "";
    for (let di = 0; di < 64; di++) {
        const sq = document.createElement("div");
        sq.className = "sq";
        sq.dataset.di = di;
        sq.addEventListener("click", function() { handleClick(d2b(parseInt(this.dataset.di))); });
        setupDragHandlers(sq, di);
        el.appendChild(sq);
    }
}

function buildLabels() {
    const flip = playerColor === 'black';
    const files = flip ? 'hgfedcba' : 'abcdefgh';
    const ranks = flip ? '12345678' : '87654321';
    document.querySelectorAll('.flbl').forEach((el,i) => { el.textContent = files[i]; });
    document.querySelectorAll('.rlbl').forEach((el,i) => { el.textContent = ranks[i]; });
}

function updateLabels() { buildLabels(); }

function updateNames() {
    const pn = (SystemUI.getPlayerName ? SystemUI.getPlayerName() : "YOU") || "YOU";
    let on = gameMode==="ai" ? "AI" : (gameMode==="local" ? "P2" : "OPPONENT");
    
    if (gameMode === "online") {
        document.getElementById("player-name").textContent = p1Name.substring(0,8).toUpperCase();
        document.getElementById("opp-name").textContent = p2Name ? p2Name.substring(0,8).toUpperCase() : "OPPONENT";
    } else {
        document.getElementById("player-name").textContent = pn.substring(0,8).toUpperCase();
        document.getElementById("opp-name").textContent = on;
    }
}

function renderBoard() {
    const wK = board.findIndex(p=>p&&p.t==='K'&&p.c==='w');
    const bK = board.findIndex(p=>p&&p.t==='K'&&p.c==='b');

    document.querySelectorAll(".sq").forEach((el, di) => {
        const sq = d2b(di);
        const r = R(sq), c = C(sq);
        const isLight = (r+c)%2===0;

        el.className = "sq " + (isLight?"lt":"dk");

        const piece = board[sq];
        const turnC = turn==="white"?"w":"b";
        if (piece && piece.c===turnC && !aiWorking && !animating) el.classList.add("draggable");

        if (lastMove && (sq===lastMove.from||sq===lastMove.to))
            el.classList.add(isLight?"last-lt":"last-dk");
        if (sq===selected) el.classList.add("sel");
        if (legalCache.includes(sq) && piece) el.classList.add("cap-hint");

        if (gameStatus==="check"||gameStatus==="checkmate") {
            if ((turn==="white"&&sq===wK)||(turn==="black"&&sq===bK))
                el.classList.add("in-check");
        }

        el.innerHTML = "";
        
        if (piece) {
            const pEl = document.createElement("div");
            pEl.className = `piece`;
            pEl.style.backgroundImage = `url('../../system/images/pieces/chess-pieces/${GLYPHS[piece.c + piece.t]}')`;
            el.appendChild(pEl);
        }
        
        if (legalCache.includes(sq) && !piece) {
            const dot = document.createElement("div");
            dot.className = "move-dot";
            el.appendChild(dot);
        }
    });

    const pip = document.getElementById("turn-pip");
    pip.className = "turn-pip " + (turn==="white"?"w":"b");
}

function updateStatus() {
    const el = document.getElementById("status-text");
    const pip = document.getElementById("turn-pip");
    pip.className = "turn-pip " + (turn==="white"?"w":"b");
    el.style.color = "";

    switch (gameStatus) {
        case "playing":
        case "check": {
            const isCheck = gameStatus==="check";
            if (gameMode==="ai") {
                if (turn===playerColor)
                    el.textContent = isCheck ? "⚠ CHECK — YOUR TURN" : "YOUR TURN";
                else el.textContent = "AI IS THINKING…";
            } else if (gameMode==="online") {
                const mc = myId===1?"white":"black";
                if (turn===mc)
                    el.textContent = isCheck ? "⚠ CHECK — YOUR TURN" : "YOUR TURN";
                else el.textContent = "OPPONENT'S TURN";
            } else {
                const who = turn==="white"?"WHITE":"BLACK";
                el.textContent = isCheck ? `⚠ CHECK — ${who}'S TURN` : `${who}'S TURN`;
            }
            break;
        }
        case "checkmate": {
            const winner = turn==="white"?"Black":"White";
            el.textContent = `♛ CHECKMATE — ${winner.toUpperCase()} WINS`;
            stopTimers();
            showResult(winner, "Checkmate");
            break;
        }
        case "stalemate":
            el.textContent = "STALEMATE — DRAW";
            stopTimers();
            showResult(null, "Stalemate");
            break;
        case "draw50":
            el.textContent = "50-MOVE RULE — DRAW";
            stopTimers();
            showResult(null, "50-move rule");
            break;
    }
}

function updateCaptures() {
    const sort = a => [...a].sort((x,y)=>MAT[y.t]-MAT[x.t]);
    
    document.getElementById("cap-white").innerHTML = sort(capW).map(p=>`<img src="../../system/images/pieces/chess-pieces/${GLYPHS[p.c+p.t]}" style="width:16px;height:16px;margin-right:2px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));">`).join('');
    document.getElementById("cap-black").innerHTML = sort(capB).map(p=>`<img src="../../system/images/pieces/chess-pieces/${GLYPHS[p.c+p.t]}" style="width:16px;height:16px;margin-right:2px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));">`).join('');
    
    const wMat = capW.reduce((s,p)=>s+MAT[p.t],0);
    const bMat = capB.reduce((s,p)=>s+MAT[p.t],0);
    const diff = wMat - bMat;
    document.getElementById("adv-white").textContent = diff>0 ? `+${diff}` : "";
    document.getElementById("adv-black").textContent = diff<0 ? `+${-diff}` : "";
}

function showResult(winner, reason) {
    setTimeout(() => {
        const iWon = winner && ((winner==="White"&&playerColor==="white")||(winner==="Black"&&playerColor==="black")||gameMode==="local");

        document.getElementById("result-emoji").textContent = !winner?"🤝":(gameMode==="ai"?(iWon?"🏆":"💀"):"♛");
        document.getElementById("game-over-title").textContent = !winner?"DRAW":(gameMode==="ai"?(iWon?"YOU WIN!":"AI WINS!"):`${winner.toUpperCase()} WINS!`);
        document.getElementById("game-over-msg").textContent = reason || (winner ? "Checkmate" : "No legal moves");

        const totalMoves = moveHistory.length;
        const wTime = timers.white, bTime = timers.black;
        const fmt = t => `${Math.floor(t/60)}:${(t%60)<10?'0':''}${t%60}`;
        document.getElementById("result-stats").innerHTML =
            `${totalMoves} total moves<br>` +
            `White: ${moveCounts.white} moves · ${fmt(wTime)}<br>` +
            `Black: ${moveCounts.black} moves · ${fmt(bTime)}`;

        if (!winner) playSFX(sfxTie);
        else if (iWon || gameMode==="local") playSFX(sfxWin);
        else playSFX(sfxLose);

        // AUDIT: Safely track wins/losses via OS 2.0
        if (typeof SystemStats !== 'undefined' && winner && gameMode !== "local") {
            if (iWon) SystemStats.recordWin("chess", 0);
            else SystemStats.recordLoss("chess");
        }

        document.getElementById("game-over-modal").classList.remove("hidden");
    }, 900);
}

function showPromo(color) {
    const el = document.getElementById("promo-overlay");
    const ch = document.getElementById("promo-choices");
    ch.innerHTML = "";
    ['Q','R','B','N'].forEach(t => {
        const btn = document.createElement("button");
        btn.className = "promo-btn";
        btn.innerHTML = `<div style="width:80%; height:80%; background-image:url('../../system/images/pieces/chess-pieces/${GLYPHS[color+t]}'); background-size:contain; background-position:center; background-repeat:no-repeat;"></div>`;
        btn.addEventListener("click", () => {
            hidePromo();
            const {from, to} = promoP;
            promoP = null;
            animateAndFinish(from, to, t);
        });
        ch.appendChild(btn);
    });
    el.classList.remove("hidden");
}

function hidePromo() {
    document.getElementById("promo-overlay").classList.add("hidden");
}

// ── 16. BUTTON LISTENERS ─────────────────────
document.getElementById("btn-new-game").addEventListener("click", newGame);
document.getElementById("btn-play-again").addEventListener("click", () => {
    document.getElementById("game-over-modal").classList.add("hidden");
    newGame();
});

// ── 17. NATIVE CASINO OS LOBBY & SYNC ────────
let seats = [];

SystemMatch.setup({
    gameId:   "chess",
    roomPath: "chess_rooms",
    autoShow: false,
    buildSeats: () => [
        { type: "human", name: SystemUI.getPlayerName() },
        { type: "ai",    name: "AI (" + aiDiff + ")" }
    ],
    extraRoomFields: () => ({
        board: serB(INIT.map(p => p ? {...p} : null)),
        turn: "white",
        cr: {wK:true, wQ:true, bK:true, bQ:true},
        ept: -1,
        lastMove: null,
        capW: [], capB: [],
        moveHistory: "[]",
        moveCounts: {white: 0, black: 0}
    }),
    onHost: (roomId) => {
        currentRoomId = roomId;
        isHost = true; myId = 1; playerColor = "white"; chatStarted = false;
        seats = SystemMatch.getSeats();
        listenToRoom();
    },
    onJoin: (roomId) => {
        currentRoomId = roomId;
        isHost = false; myId = 2; playerColor = "black"; chatStarted = false;
        seats = SystemMatch.getSeats();
        listenToRoom();
    },
    onLeave: () => {
        gameMode = "ai";
        document.getElementById("sys-chess-mode").value = "ai";
        localStorage.setItem("chess_mode", "ai");
        syncDiffVisibility();
        myId = 1;
        isHost = true;
        chatStarted = false;
        newGame();
    },
    onStart: () => {
        if (currentRoomId && window.db) {
            window.dbUpdate(window.dbRef(window.db, 'chess_rooms/' + currentRoomId), { status: "playing" });
        }
    },
    onClose: () => {
        if (gameMode === "online" && gameStatus !== "playing") {
            gameMode = "ai";
            document.getElementById("sys-chess-mode").value = "ai";
            localStorage.setItem("chess_mode", "ai");
            syncDiffVisibility();
            myId = 1;
            isHost = true;
            newGame();
        }
    }
});

function listenToRoom() {
    let onlineGameStarted=false;
    window.dbOnValue(window.dbRef(window.db,'chess_rooms/'+currentRoomId), snap=>{
        const data=snap.val(); if(!data) return;
        
        seats = data.seats || [];
        SystemUI.v2Lobby.renderSeats(seats);

        if(data.status==="playing"&&!onlineGameStarted){
            onlineGameStarted=true;
            SystemUI.v2Lobby.hide();
            if(!chatStarted){ chatStarted=true; SystemUI.playSound('win'); SystemUI.startChat(currentRoomId,SystemUI.getPlayerName()); }
            startOnline(data); return;
        }
        if(!data.status || data.status==="waiting") return;
        syncOnline(data);
    });
}

function serB(b) { return b.map(p=>p?p.t+p.c:''); }

function desB(arr) {
    const a=Array.isArray(arr)?arr:Object.values(arr||{});
    return a.map(s=>(s&&s.length>=2)?{t:s[0],c:s[1]}:null);
}

function startOnline(data) {
    p1Name = seats[0] ? seats[0].name : "WHITE";
    p2Name = seats[1] ? seats[1].name : "BLACK";
    
    board=desB(data.board); turn=data.turn||"white";
    cr=data.cr||{wK:true,wQ:true,bK:true,bQ:true};
    ept=data.ept===-1?null:(data.ept||null); lastMove=data.lastMove||null;
    
    capW=desB(data.capW||[]).filter(p=>p); 
    capB=desB(data.capB||[]).filter(p=>p);
    
    moveHistory = data.moveHistory ? JSON.parse(data.moveHistory) : [];
    moveCounts = data.moveCounts || {white:0, black:0};

    gameStatus="playing"; selected=null; legalCache=[];
    halfClock=0; promoP=null; animating=false;
    
    resetTimers();
    buildBoard(); updateLabels(); updateNames();
    
    renderBoard(); updateStatus(); updateCaptures(); hidePromo();
    renderHistory();
    
    if (myId === 2) {
        document.getElementById("btn-new-game").style.display = "none";
        document.getElementById("btn-play-again").style.display = "none";
    }

    startTimerFor(turn);
}

function syncOnline(data) {
    p1Name = seats[0] ? seats[0].name : "WHITE";
    p2Name = seats[1] ? seats[1].name : "BLACK";

    board=desB(data.board); turn=data.turn||"white";
    cr=data.cr||{wK:true,wQ:true,bK:true,bQ:true};
    ept=data.ept===-1?null:(data.ept||null); lastMove=data.lastMove||null;
    
    capW=desB(data.capW||[]).filter(p=>p); 
    capB=desB(data.capB||[]).filter(p=>p);
    
    moveHistory = data.moveHistory ? JSON.parse(data.moveHistory) : [];
    moveCounts = data.moveCounts || {white:0, black:0};
    
    selected=null; legalCache=[];
    
    if (!lastMove) {
        resetTimers();
        hidePromo();
        document.getElementById("game-over-modal").classList.add("hidden");
        gameStatus = "playing";
    } else {
        checkGameStatus();
    }
    
    updateNames();
    renderHistory();
    document.getElementById("moves-white").textContent = moveCounts.white + ' move' + (moveCounts.white !== 1 ? 's' : '');
    document.getElementById("moves-black").textContent = moveCounts.black + ' move' + (moveCounts.black !== 1 ? 's' : '');
    
    renderBoard(); updateStatus(); updateCaptures();
    
    if(gameStatus==="check"){
        const who=turn==="white"?"WHITE":"BLACK";
        flashCheckBanner(`⚠ ${who} IS IN CHECK!`);
    }
    if(gameStatus==="playing"||gameStatus==="check") {
        startTimerFor(turn);
        
        // V2 DROP-IN AI: If a sync happens and it's an AI turn, host takes over!
        if (isHost) {
            const currentSeatIdx = turn === "white" ? 0 : 1;
            if (seats[currentSeatIdx] && seats[currentSeatIdx].type === "ai" && !aiWorking) {
                aiWorking = true;
                document.getElementById("status-text").textContent = "AI IS THINKING…";
                setTimeout(doAI, 350);
            }
        }
    }
}

function pushState() {
    window.dbUpdate(window.dbRef(window.db,'chess_rooms/'+currentRoomId),{
        board:serB(board), turn, cr,
        ept:ept===null?-1:ept,
        lastMove:lastMove||null,
        status:(gameStatus==="checkmate"||gameStatus==="stalemate")?gameStatus:"playing",
        capW: serB(capW),
        capB: serB(capB),
        moveHistory: JSON.stringify(moveHistory),
        moveCounts: moveCounts,
        seats: seats
    });
}

// ── 18. BOOT ──────────────────────────────────
buildBoard();