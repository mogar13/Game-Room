// ==========================================
// BACKGAMMON PRO — bg_app.js (V2 Engine + Elite AI)
// Dynamic Seat Array & Heuristic Sequence Brain
// ==========================================

// ── 1. INITIALIZE OS & STATE ────────────────
let gameMode = "ai"; 
localStorage.setItem("bg_mode", "ai"); 

let aiDifficulty = localStorage.getItem("bg_diff") || "normal";

SystemUI.init({
    gameName: "BACKGAMMON PRO",
    rules: "Move all checkers to your home board to bear them off. Tap a checker to select, tap a highlighted spot to move. Hit single checkers to send them to the bar!",
    hudDropdowns: [
        { id: "sys-bg-mode", options: [{value:"ai", label:"🤖 vs AI"}, {value:"online", label:"🌐 Online"}] },
        { id: "sys-bg-diff", options: [{value:"normal", label:"Normal AI"}, {value:"hard", label:"Hard AI"}] }
    ]
});

// Delay to sync OS dropdowns
setTimeout(() => {
    const modeEl = document.getElementById("sys-bg-mode");
    const diffEl = document.getElementById("sys-bg-diff");
    if(modeEl) modeEl.value = gameMode;
    if(diffEl) diffEl.value = aiDifficulty;
}, 10);

const sfxDiceShake = new Audio('../../system/audio/dice-shake-2.ogg');
const sfxDiceThrow = new Audio('../../system/audio/dice-throw-2.ogg');
const sfxChip = new Audio('../../system/audio/chip-lay-1.ogg');
const sfxWin = new Audio('../../system/audio/win.ogg');

function playFastSound(audioObj) {
    if (SystemUI.isMuted) return;
    audioObj.pause(); 
    audioObj.currentTime = 0;
    audioObj.play().catch(e => {});
}

function showToast(title, message) {
  const titleEl = document.getElementById("modal-title");
  const msgEl = document.getElementById("modal-message");
  if (!titleEl || !msgEl) return;
  titleEl.innerText = title;
  msgEl.innerText = message;
  const overlay = document.getElementById("toast-modal");
  overlay.classList.remove("hidden");
  setTimeout(() => overlay.classList.add("hidden"), 3000);
}

// ── 2. V2 MULTIPLAYER LOBBY & SYNC ──────────
let currentRoomId = null;
let isHost = true;
let myColor = 'white';
let chatStarted = false;
let seats = [];
let myId = 1;
let roomListener = null;
let onlineBuyInPaid = false;
let aiRollPending = false;

document.getElementById("sys-bg-mode").addEventListener("change", (e) => {
    gameMode = e.target.value;
    localStorage.setItem("bg_mode", gameMode);
    document.getElementById("sys-modal").classList.add("sys-hidden");
    
    if (gameMode === "online") {
        SystemUI.v2Lobby.show();
    } else {
        SystemUI.v2Lobby.hide();
        SystemUI.stopChat();
        chatStarted = false;
        myId = 1;
        isHost = true;
        if (roomListener) { roomListener(); roomListener = null; }
        // Tear down hosted room / joined seat so it can't ghost in Firebase
        if (window.SystemMatch) SystemMatch.cleanup();
        resetGame();
    }
});

document.getElementById("sys-bg-diff").addEventListener("change", (e) => {
    aiDifficulty = e.target.value;
    localStorage.setItem("bg_diff", aiDifficulty);
});

// V2 Lobby Setup (via SystemMatch)
SystemMatch.setup({
    gameId:   "backgammon",
    roomPath: "bg_rooms",
    autoShow: false,
    buildSeats: () => [
        { type: "human", name: SystemUI.getPlayerName() },
        { type: "ai",    name: "AI (" + aiDifficulty + ")" }
    ],
    extraRoomFields: () => {
        setupBoardState();
        return {
            players:     1,
            board:       board,
            bar:         bar,
            off:         off,
            currentTurn: 'white',
            activeDice:  []
        };
    },
    onHost: (roomId) => {
        currentRoomId = roomId;
        isHost = true; myId = 1; myColor = 'white'; chatStarted = false;
        onlineBuyInPaid = false;
        seats = SystemMatch.getSeats();
        listenToRoom();
    },
    onJoin: (roomId) => {
        currentRoomId = roomId;
        isHost = false; myId = 2; myColor = 'black'; chatStarted = false;
        onlineBuyInPaid = false;
        seats = SystemMatch.getSeats();
        // Backgammon auto-starts on join.
        if (window.db && window.dbUpdate) {
            window.dbUpdate(window.dbRef(window.db, 'bg_rooms/' + roomId), { status: "playing" });
        }
        listenToRoom();
    },
    onLeave: () => {
        gameMode = "ai";
        document.getElementById("sys-bg-mode").value = "ai";
        localStorage.setItem("bg_mode", "ai");
        myId = 1; isHost = true;
        chatStarted = false;
        if (roomListener) { roomListener(); roomListener = null; }
        resetGame();
    },
    onStart: () => {
        if (currentRoomId && window.db) {
            window.dbUpdate(window.dbRef(window.db, 'bg_rooms/' + currentRoomId), { status: "playing" });
        }
    }
});

function listenToRoom() {
    let onlineGameStarted = false;
    if (roomListener) roomListener();
    roomListener = window.dbOnValue(window.dbRef(window.db, 'bg_rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if(!data) {
            // Host deleted the room — free the joiner instead of freezing.
            if (gameMode === "online" && !isHost) {
                if (roomListener) { roomListener(); roomListener = null; }
                SystemMatch.setSeats([]); // room is gone — skip the ghost seat write
                SystemMatch.cleanup();
                chatStarted = false;
                SystemUI.v2Lobby.hide();
                showToast("Host Left", "The host left the game. Returning to AI mode.");
                gameMode = "ai";
                document.getElementById("sys-bg-mode").value = "ai";
                localStorage.setItem("bg_mode", "ai");
                myId = 1; isHost = true; myColor = 'white';
                resetGame();
            }
            return;
        }

        seats = data.seats || [];
        SystemUI.v2Lobby.renderSeats(seats);

        // Joiner left mid-game — host flips the empty seat to AI so the
        // drop-in AI driver in syncGameState keeps the match alive.
        if (isHost && onlineGameStarted && currentPhase === "playing" &&
            seats[1] && seats[1].type === "open") {
            seats[1] = { type: "ai", name: "AI (takeover)" };
            window.dbUpdate(window.dbRef(window.db, 'bg_rooms/' + currentRoomId), { seats: seats });
            showToast("Opponent Left", "The AI will take over their checkers.");
        }

        // Rematch: host resets the room to 'waiting' after a finish — re-arm
        // the start gate and the buy-in so the next round charges again.
        if (data.status === "waiting" && onlineGameStarted) {
            onlineGameStarted = false;
            onlineBuyInPaid = false;
        }

        if (data.status === "finished" && data.winner) {
            if (currentPhase === "playing") handleOnlineFinish(data);
            return;
        }

        if (data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true;
            SystemUI.v2Lobby.hide();
            if (!chatStarted) {
                chatStarted = true;
                SystemUI.playSound('win');
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }
            // Charge the buy-in once per online match (mirrors the AI-mode
            // idle-branch deduction so the winner's BUY_IN*2 payout isn't minted).
            if (!onlineBuyInPaid) {
                onlineBuyInPaid = true;
                SystemUI.money -= BUY_IN;
                SystemUI.updateMoneyDisplay();
                if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("backgammon");
            }
            currentPhase = "playing";
            document.getElementById("roll-btn").innerText = "ROLL DICE";
        }
        syncGameState(data);
    });
}

function pushGameState() {
    if (gameMode !== "online") return;
    window.dbUpdate(window.dbRef(window.db, 'bg_rooms/' + currentRoomId), {
        board: board,
        bar: bar,
        off: off,
        currentTurn: currentTurn,
        activeDice: activeDice,
        d1: document.getElementById("die-1").innerHTML,
        d2: document.getElementById("die-2").innerHTML,
        seats: seats
    });
}

// Both clients land here off the 'finished' room write — each announces and
// records only its own outcome, then resets. currentPhase guards re-entry.
function handleOnlineFinish(data) {
    currentPhase = "idle";
    board = data.board || board;
    bar = data.bar || { white: 0, black: 0 };
    off = data.off || off;
    activeDice = [];
    selectedIndex = null;
    validMoves = [];
    renderBoard();

    const iWon = data.winner === myColor;
    SystemUI.playSound(iWon ? 'win' : 'lose');
    showToast(`${String(data.winner).toUpperCase()} WINS!`, `They bore off all 15 checkers.`);
    if (iWon) { SystemUI.money += (BUY_IN * 2); SystemUI.updateMoneyDisplay(); }

    // 2.0 STATS INTEGRATION - Wrapped for safety
    if (typeof SystemStats !== 'undefined') {
        if (iWon) SystemStats.recordWin("backgammon", BUY_IN * 2);
        else SystemStats.recordLoss("backgammon");
    }

    setTimeout(() => {
        resetGame();
        if (gameMode === "online") {
            // Rematch-lite: host resets the room to 'waiting' (fresh board),
            // both clients return to the lobby; START begins a new round.
            if (isHost && currentRoomId && window.db) {
                window.dbUpdate(window.dbRef(window.db, 'bg_rooms/' + currentRoomId), {
                    board: board, bar: bar, off: off,
                    currentTurn: 'white', activeDice: [], d1: "", d2: "",
                    status: "waiting", winner: null
                });
            }
            SystemUI.v2Lobby.show();
        }
    }, 1200);
}

function syncGameState(data) {
    board = data.board || board;
    bar = data.bar || {white:0, black:0};
    off = data.off || {white:0, black:0};
    currentTurn = data.currentTurn || 'white';
    activeDice = data.activeDice || [];
    
    // Accept empty-string dice too, so a cleared roll clears the display.
    if (data.d1 !== undefined) document.getElementById("die-1").innerHTML = data.d1 || "";
    if (data.d2 !== undefined) document.getElementById("die-2").innerHTML = data.d2 || "";
    
    updateTurnIndicator(); 
    renderBoard();

    // V2 DROP-IN AI: If host, drive any AI seat whose turn it is.
    if (isHost && currentPhase === "playing") {
        const currentSeatIdx = currentTurn === 'white' ? 0 : 1;
        if (seats[currentSeatIdx] && seats[currentSeatIdx].type === 'ai') {
            if (activeDice.length > 0) {
                setTimeout(aiLogicLoop, 800);
            } else if (!aiRollPending) {
                // AI's turn but no dice rolled yet — nothing else will roll for it online.
                aiRollPending = true;
                setTimeout(() => { aiRollPending = false; handleRoll(); }, 800);
            }
        }
    }
}

// ── 3. BOARD STATE & ECONOMY ────────────────
const BUY_IN = 50;
let currentPhase = "idle"; 
let board = Array(24).fill(null).map(() => ({ count: 0, color: null }));
let bar = { white: 0, black: 0 };
let off = { white: 0, black: 0 };
let currentTurn = 'white';
let activeDice = [];
let selectedIndex = null; 
let validMoves = []; 

let turnSnapshot = null;
let lastMovedTo = null; 

document.getElementById("roll-btn").addEventListener("click", () => {
    if (currentPhase === "idle") {
        // Online matches start/charge via the room status flip, never the idle
        // buy-in branch — otherwise the host burns a buy-in into a finished room.
        if (gameMode === "online") { showToast("Online", "Start a new match from the lobby."); return; }
        if (SystemUI.money < BUY_IN) { showToast("Error", "Not enough cash!"); return; }
        SystemUI.money -= BUY_IN;
        SystemUI.updateMoneyDisplay();
        
        // 2.0 STATS INTEGRATION - Wrapped for safety
        if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("backgammon");
        
        startGameUI();
    } else {
        if (gameMode === "online" && currentTurn !== myColor) return;
        handleRoll();
    }
});

document.getElementById("undo-btn")?.addEventListener("click", () => {
    if (!turnSnapshot || gameMode === "online" || currentPhase !== "playing") return;
    
    SystemUI.playSound('click');
    board = JSON.parse(JSON.stringify(turnSnapshot.board));
    bar = { ...turnSnapshot.bar };
    off = { ...turnSnapshot.off };
    activeDice = [...turnSnapshot.activeDice];
    
    selectedIndex = null;
    validMoves = [];
    lastMovedTo = null;
    
    updateTurnIndicator();
    renderBoard();
});

function setupBoardState() {
    board = Array(24).fill(null).map(() => ({ count: 0, color: null }));
    board[0]  = { count: 2, color: 'white' }; board[11] = { count: 5, color: 'white' };
    board[16] = { count: 3, color: 'white' }; board[18] = { count: 5, color: 'white' };
    board[23] = { count: 2, color: 'black' }; board[12] = { count: 5, color: 'black' };
    board[7]  = { count: 3, color: 'black' }; board[5]  = { count: 5, color: 'black' };
    
    bar = { white: 0, black: 0 };
    off = { white: 0, black: 0 };
    currentTurn = 'white';
    activeDice = [];
    turnSnapshot = null;
    lastMovedTo = null;
    if (document.getElementById("undo-btn")) document.getElementById("undo-btn").classList.add("hidden");
}

function startGameUI() {
    currentPhase = "playing";
    document.getElementById("roll-btn").innerText = "ROLL DICE";
    if (gameMode !== "online") {
        myColor = 'white'; 
        setupBoardState();
    }
    updateTurnIndicator();
    renderBoard();
}

function resetGame() {
    currentPhase = "idle";
    document.getElementById("roll-btn").innerText = `START GAME ($${BUY_IN} Buy-In)`;
    document.getElementById("turn-indicator").innerText = "Waiting to start...";
    document.getElementById("die-1").innerHTML = "";
    document.getElementById("die-2").innerHTML = "";
    if (document.getElementById("undo-btn")) document.getElementById("undo-btn").classList.add("hidden");
    setupBoardState();
    renderBoard();
}

// ── 4. DICE LOGIC ───────────────────────────
function handleRoll() {
    if (activeDice.length > 0) return;
    
    playFastSound(sfxDiceShake);
    document.getElementById("roll-btn").disabled = true;
    if (document.getElementById("undo-btn")) document.getElementById("undo-btn").classList.add("hidden");
    document.getElementById("turn-indicator").innerText = "Rolling...";

    setTimeout(() => {
        playFastSound(sfxDiceThrow);
        let d1 = Math.floor(Math.random() * 6) + 1;
        let d2 = Math.floor(Math.random() * 6) + 1;
        
        activeDice = (d1 === d2) ? [d1, d1, d1, d1] : [d1, d2];
        lastMovedTo = null; 
        
        turnSnapshot = {
            board: JSON.parse(JSON.stringify(board)),
            bar: { ...bar },
            off: { ...off },
            activeDice: [...activeDice]
        };
        
        document.getElementById("die-1").innerHTML = `<img src="../../system/images/dice/dieWhite_border${d1}.png" style="width:100%; height:100%;">`;
        document.getElementById("die-2").innerHTML = `<img src="../../system/images/dice/dieWhite_border${d2}.png" style="width:100%; height:100%;">`;
        
        pushGameState();
        updateTurnIndicator();
        
        if (bar[currentTurn] > 0) {
            selectedIndex = 'bar';
            calculateValidTargets();
            if (validMoves.length === 0) {
                showToast("Blocked", "No valid moves from the bar.");
                setTimeout(() => endTurn(), 2000);
                return;
            }
        }
        
        if (gameMode === "ai" && currentTurn === 'black' && activeDice.length > 0) {
            setTimeout(aiLogicLoop, 800);
        }

    }, 400); 
}

// ── 5. THE BAR, BEARING OFF, & MOVEMENT ─────
function canBearOff(color) {
    if (bar[color] > 0) return false;
    let requiredQuad = color === 'white' ? [18, 23] : [0, 5];
    for (let i = 0; i < 24; i++) {
        if (board[i].color === color && board[i].count > 0) {
            if (i < requiredQuad[0] || i > requiredQuad[1]) return false;
        }
    }
    return true;
}

function handleInteraction(targetIndex) { 
    if (currentPhase !== "playing" || activeDice.length === 0) return;
    if (gameMode === "online" && currentTurn !== myColor) return;
    if (gameMode === "ai" && currentTurn === 'black') return; 

    let moveObj = validMoves.find(m => m.target === targetIndex);
    if (moveObj) {
        executeMove(selectedIndex, targetIndex, moveObj.dieUsed);
        return;
    }

    if (targetIndex === 'bar') {
        if (bar[currentTurn] > 0) {
            selectedIndex = 'bar';
            calculateValidTargets();
            renderBoard();
        }
    } else if (typeof targetIndex === 'number') {
        if (bar[currentTurn] > 0) return; 

        if (board[targetIndex].color === currentTurn && board[targetIndex].count > 0) {
            selectedIndex = targetIndex;
            calculateValidTargets();
            playFastSound(sfxChip);
            renderBoard();
        } else {
            selectedIndex = null;
            validMoves = [];
            renderBoard();
        }
    }
}

function calculateValidTargets() {
    validMoves = [];
    if (selectedIndex === null) return;

    let dir = currentTurn === 'white' ? 1 : -1;
    let uniqueDice = [...new Set(activeDice)]; 

    uniqueDice.forEach(die => {
        let target = null;
        if (selectedIndex === 'bar') {
            target = currentTurn === 'white' ? die - 1 : 24 - die;
        } else {
            target = selectedIndex + (die * dir);
        }

        if (target >= 0 && target <= 23) {
            if (board[target].count <= 1 || board[target].color === currentTurn) {
                validMoves.push({ target: target, dieUsed: die });
            }
        } 
        else if (selectedIndex !== 'bar' && canBearOff(currentTurn)) {
            let distToOff = currentTurn === 'white' ? 24 - selectedIndex : selectedIndex + 1;
            if (die === distToOff) {
                validMoves.push({ target: 'off', dieUsed: die });
            } else if (die > distToOff) {
                let isFurthestBack = true;
                let checkStart = currentTurn === 'white' ? 18 : 5;
                let checkEnd = currentTurn === 'white' ? selectedIndex - 1 : selectedIndex + 1;
                if (currentTurn === 'white') {
                    for(let i=checkStart; i<=checkEnd; i++) if(board[i].color==='white') isFurthestBack = false;
                } else {
                    for(let i=checkStart; i>=checkEnd; i--) if(board[i].color==='black') isFurthestBack = false;
                }
                if (isFurthestBack) validMoves.push({ target: 'off', dieUsed: die });
            }
        }
    });
}

function executeMove(fromIdx, toIdx, dieUsed) {
    if (fromIdx === 'bar') bar[currentTurn]--;
    else {
        board[fromIdx].count--;
        if (board[fromIdx].count === 0) board[fromIdx].color = null;
    }

    if (toIdx === 'off') {
        off[currentTurn]++;
        playFastSound(sfxWin);
        lastMovedTo = 'off';
    } else {
        if (board[toIdx].count === 1 && board[toIdx].color !== currentTurn) {
            bar[board[toIdx].color]++; 
            board[toIdx].count = 0;
            playFastSound(sfxChip);
        }
        board[toIdx].count++;
        board[toIdx].color = currentTurn;
        playFastSound(sfxChip);
        lastMovedTo = toIdx; 
    }

    activeDice.splice(activeDice.indexOf(dieUsed), 1);
    selectedIndex = null;
    validMoves = [];
    
    pushGameState();
    renderBoard();

    if (off[currentTurn] === 15) {
        if (gameMode === "online") {
            // Push the finished state — both clients (including this one)
            // announce and record via handleOnlineFinish in the listener.
            window.dbUpdate(window.dbRef(window.db, 'bg_rooms/' + currentRoomId), {
                board: board,
                bar: bar,
                off: off,
                activeDice: [],
                currentTurn: currentTurn,
                status: "finished",
                winner: currentTurn
            });
            return;
        }
        setTimeout(() => {
            let isMyWin = (currentTurn === myColor);
            if (gameMode === "ai" && currentTurn === "black") isMyWin = false;
            if (gameMode === "ai" && currentTurn === "white") isMyWin = true;

            SystemUI.playSound(isMyWin ? 'win' : 'lose');
            showToast(`${currentTurn.toUpperCase()} WINS!`, `They bore off all 15 checkers.`);
            // AI mode charges the buy-in on start, so a win must pay it back out.
            if (isMyWin) { SystemUI.money += (BUY_IN * 2); SystemUI.updateMoneyDisplay(); }

            // 2.0 STATS INTEGRATION - Wrapped for safety
            if (typeof SystemStats !== 'undefined') {
                if (isMyWin) SystemStats.recordWin("backgammon", BUY_IN * 2);
                else SystemStats.recordLoss("backgammon");
            }
            
            resetGame();
        }, 600);
        return;
    }

    if (activeDice.length === 0) {
        endTurn();
    } else {
        let hasMove = false;
        let pieces = [];
        if (bar[currentTurn] > 0) pieces.push('bar');
        else {
            for(let i=0; i<24; i++) if(board[i].color === currentTurn) pieces.push(i);
        }
        for (let p of pieces) {
            selectedIndex = p;
            calculateValidTargets();
            if (validMoves.length > 0) { hasMove = true; break; }
        }
        selectedIndex = null;
        validMoves = [];
        renderBoard(); 
        if (!hasMove) {
            document.getElementById("turn-indicator").innerText = "NO VALID MOVES.";
            setTimeout(() => endTurn(), 1500);
        } else {
            updateTurnIndicator();
            if (gameMode === "ai" && currentTurn === 'black') setTimeout(aiLogicLoop, 800);
        }
    }
}

function endTurn() {
    activeDice = [];
    currentTurn = currentTurn === 'white' ? 'black' : 'white';
    document.getElementById("die-1").innerHTML = "";
    document.getElementById("die-2").innerHTML = "";
    turnSnapshot = null;
    lastMovedTo = null;
    updateTurnIndicator();
    pushGameState();
    if (gameMode === "ai" && currentTurn === 'black') setTimeout(handleRoll, 1000);
}

function updateTurnIndicator() {
    const ind = document.getElementById("turn-indicator");
    const undoBtn = document.getElementById("undo-btn");
    const rollBtn = document.getElementById("roll-btn");
    if (currentPhase !== "playing") return;

    if (activeDice.length > 0) {
        ind.innerText = `${currentTurn.toUpperCase()}'S TURN | MOVES: ${activeDice.length}`;
        rollBtn.disabled = true; 
        if (gameMode !== "online" && currentTurn === 'white' && turnSnapshot && activeDice.length < turnSnapshot.activeDice.length) {
            if (undoBtn) undoBtn.classList.remove("hidden");
        } else {
            if (undoBtn) undoBtn.classList.add("hidden");
        }
    } else {
        ind.innerText = `${currentTurn.toUpperCase()}'S TURN TO ROLL`;
        if (undoBtn) undoBtn.classList.add("hidden");
        if (gameMode === "online" && currentTurn !== myColor) rollBtn.disabled = true;
        else if (gameMode === "ai" && currentTurn === "black") rollBtn.disabled = true;
        else rollBtn.disabled = false;
    }
}

// ── 6. UPGRADED AI ENGINE ───────────────────
function evaluatePosition(simBoard, simBar, simOff) {
    let score = 0;
    const aiColor = 'black';
    const plColor = 'white';

    // 1. Bearing off is best
    score += simOff[aiColor] * 50;
    score -= simOff[plColor] * 50;

    // 2. Bar is terrible
    score -= simBar[aiColor] * 30;
    score += simBar[plColor] * 30;

    // 3. Anchors (2+ pieces) are good for defense and blocking
    // 4. Blots (1 piece) are dangerous
    for (let i = 0; i < 24; i++) {
        if (simBoard[i].color === aiColor) {
            if (simBoard[i].count >= 2) score += 5; 
            else score -= 15; // Penalty for exposed blot
        } else if (simBoard[i].color === plColor) {
            if (simBoard[i].count >= 2) score -= 5;
            else score += 15; // Reward for enemy blot
        }
    }

    // 5. Proximity to home (Black moves toward index 0)
    for (let i = 0; i < 24; i++) {
        if (simBoard[i].color === aiColor) {
            score += (24 - i) * 0.5;
        }
    }

    return score;
}

function aiLogicLoop() {
    if (currentPhase !== "playing" || currentTurn !== 'black' || activeDice.length === 0) return;
    
    let allValidMoves = [];
    let pieces = bar['black'] > 0 ? ['bar'] : board.map((pt, i) => pt.color === 'black' ? i : null).filter(i => i !== null);
    
    pieces.forEach(p => {
        selectedIndex = p;
        calculateValidTargets();
        validMoves.forEach(m => {
            allValidMoves.push({ from: p, to: m.target, dieUsed: m.dieUsed });
        });
    });
    
    selectedIndex = null;
    validMoves = [];
    
    if (allValidMoves.length === 0) { setTimeout(endTurn, 1000); return; }

    let bestMove = allValidMoves[0];
    
    if (aiDifficulty === "hard") {
        let bestScore = -Infinity;
        allValidMoves.forEach(m => {
            // Simulate the resulting state for this single move
            const simBoard = JSON.parse(JSON.stringify(board));
            const simBar = { ...bar };
            const simOff = { ...off };
            
            // Apply simulated move
            if (m.from === 'bar') simBar['black']--;
            else {
                simBoard[m.from].count--;
                if (simBoard[m.from].count === 0) simBoard[m.from].color = null;
            }
            if (m.to === 'off') simOff['black']++;
            else {
                if (simBoard[m.to].count === 1 && simBoard[m.to].color === 'white') {
                    simBar['white']++; simBoard[m.to].count = 0;
                }
                simBoard[m.to].count++;
                simBoard[m.to].color = 'black';
            }

            let score = evaluatePosition(simBoard, simBar, simOff);
            if (score > bestScore) {
                bestScore = score;
                bestMove = m;
            }
        });
    } else {
        // Normal AI selects a valid move with basic preference
        allValidMoves.sort(() => Math.random() - 0.5);
        bestMove = allValidMoves.find(m => m.to === 'off') || allValidMoves.find(m => typeof m.to === 'number' && board[m.to].color === 'white') || allValidMoves[0];
    }
    
    executeMove(bestMove.from, bestMove.to, bestMove.dieUsed);
}

// ── 7. VISUAL RENDER ENGINE ─────────────────
function renderBoard() {
    const topL = document.getElementById("top-left"); const topR = document.getElementById("top-right");
    const botL = document.getElementById("bottom-left"); const botR = document.getElementById("bottom-right");
    if(!topL) return;
    topL.innerHTML = ''; topR.innerHTML = ''; botL.innerHTML = ''; botR.innerHTML = '';

    const createPoint = (index) => {
        const pt = document.createElement("div");
        pt.className = `point ${index % 2 === 0 ? 'light' : 'dark'}`;
        if (selectedIndex === index) pt.classList.add("selected");
        if (validMoves.find(m => m.target === index)) pt.classList.add("valid-target");
        pt.onclick = () => handleInteraction(index);

        for (let c = 0; c < board[index].count; c++) {
            const chk = document.createElement("div");
            chk.className = `checker ${board[index].color}`;
            if (selectedIndex === index && c === board[index].count - 1) chk.classList.add("lifted");
            if (lastMovedTo === index && c === board[index].count - 1) chk.classList.add("just-moved");
            pt.appendChild(chk);
        }
        return pt;
    };

    for (let i = 12; i <= 17; i++) topL.appendChild(createPoint(i));
    for (let i = 18; i <= 23; i++) topR.appendChild(createPoint(i));
    for (let i = 11; i >= 6; i--) botL.appendChild(createPoint(i));
    for (let i = 5; i >= 0; i--) botR.appendChild(createPoint(i));

    const bWhite = document.getElementById("bar-white"); const bBlack = document.getElementById("bar-black");
    bWhite.innerHTML = ''; bBlack.innerHTML = '';
    if (selectedIndex === 'bar' && currentTurn === 'white') bWhite.classList.add("selected");
    else bWhite.classList.remove("selected");
    if (selectedIndex === 'bar' && currentTurn === 'black') bBlack.classList.add("selected");
    else bBlack.classList.remove("selected");
    bWhite.onclick = () => handleInteraction('bar');
    bBlack.onclick = () => handleInteraction('bar');

    for(let i=0; i<bar.white; i++) {
        let cls = "checker white";
        if (selectedIndex === 'bar' && currentTurn === 'white' && i === bar.white - 1) cls += " lifted";
        bWhite.innerHTML += `<div class="${cls}"></div>`;
    }
    for(let i=0; i<bar.black; i++) {
        let cls = "checker black";
        if (selectedIndex === 'bar' && currentTurn === 'black' && i === bar.black - 1) cls += " lifted";
        bBlack.innerHTML += `<div class="${cls}"></div>`;
    }

    const oWhite = document.getElementById("off-white"); const oBlack = document.getElementById("off-black");
    oWhite.className = "off-zone" + (validMoves.find(m => m.target === 'off' && currentTurn==='white') ? " valid-target" : "");
    oBlack.className = "off-zone" + (validMoves.find(m => m.target === 'off' && currentTurn==='black') ? " valid-target" : "");
    oWhite.onclick = () => { if(currentTurn==='white') handleInteraction('off'); };
    oBlack.onclick = () => { if(currentTurn==='black') handleInteraction('off'); };
    oWhite.innerHTML = `<div class="off-label">WHITE</div><div class="off-count white-txt">${off.white} / 15</div>`;
    oBlack.innerHTML = `<div class="off-label">BLACK</div><div class="off-count black-txt">${off.black} / 15</div>`;
}

// Kickstart
setupBoardState();
renderBoard();