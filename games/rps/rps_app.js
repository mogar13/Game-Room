// ============================================================
// RPS ARENA — rps_app.js
// The Game Shack | Casino OS
// Modes: vs CPU (betting + streak) | Online (v2Lobby, simultaneous)
// ============================================================

// ── 1. OS INIT & STATE ───────────────────────────────────────
let gameMode = "ai";
let myId     = 1;
let isHost   = false;
let chatStarted  = false;
let currentRoomId = null;
let seats    = [];
let roomListener = null;

// Online-round tracking — prevents the same result being shown twice on the
// client side. Reset on every host/join so a new room's round 1 still shows.
let lastSeenResultRound = 0;
let revealTimer = null;

let p1Name = (typeof SystemUI.getPlayerName === "function") ? SystemUI.getPlayerName() : "You";
let p2Name = "CPU";

// AI-mode state
let winStreak  = parseInt(localStorage.getItem("rps_streak")) || 0;
let currentBet = 0;
let isAnimating = false;

// Online-mode state — null means "not chosen this round yet"
let myOnlineChoice = null;

SystemUI.init({
    gameName: "RPS ARENA",
    rules: `
        <ul style="text-align:left;line-height:1.7;font-size:0.95rem;margin-bottom:20px;color:#ddd;padding-left:20px;">
            <li><strong>The Basics:</strong> Rock crushes Scissors. Scissors cut Paper. Paper covers Rock.</li>
            <li><strong>vs CPU — Payouts:</strong> Win pays 1:1 (double your bet). Ties return your bet.</li>
            <li><strong>Online:</strong> Both players choose simultaneously — no peeking! First to see both choices wins the round.</li>
        </ul>
    `,
    hudDropdowns: [
        {
            id: "sys-rps-mode",
            options: [
                { value: "ai",     label: "🤖 vs CPU"  },
                { value: "online", label: "🌐 Online"   }
            ]
        }
    ]
});

// ── 2. DOM SHORTCUTS ─────────────────────────────────────────
const playerImg    = document.getElementById("player-img");
const cpuImg       = document.getElementById("cpu-img");
const playerBox    = document.getElementById("player-hand");
const cpuBox       = document.getElementById("cpu-hand");
const statusText   = document.getElementById("status-text");
const resultOverlay = document.getElementById("result-overlay");
const oppLockedOverlay = document.getElementById("opp-locked-overlay");
const oppStatusEl  = document.getElementById("opp-status");
const waitingMsg   = document.getElementById("waiting-msg");

// ── 3. STARTUP ───────────────────────────────────────────────
// Boot instantly instead of waiting for Firebase so the local game works offline
setTimeout(initRPS, 150);

function initRPS() {
    const modeEl = document.getElementById("sys-rps-mode");
    if (modeEl) {
        modeEl.value = gameMode;
        modeEl.addEventListener("change", e => {
            gameMode = e.target.value;
            // Close the settings modal if open
            const sys = document.getElementById("sys-modal");
            if (sys) sys.classList.add("sys-hidden");

            if (gameMode === "online") {
                SystemUI.v2Lobby.show();
                enterOnlineUI();
            } else {
                SystemUI.v2Lobby.hide();
                SystemUI.stopChat();
                chatStarted = false;
                if (roomListener) { roomListener(); roomListener = null; }
                // Tear down hosted room / joined seat so it can't ghost in Firebase
                if (window.SystemMatch) SystemMatch.cleanup();
                enterAIUI();
            }
        });
    }

    // Set up betting rack using Casino OS globally defined method
    SystemUI.setupBetting("os-betting-rack", {
        onBet: val => {
            // Block betting if animating, or if playing online and a choice is already locked in
            if (isAnimating || (gameMode === "online" && myOnlineChoice !== null)) return;
            if (SystemUI.money >= val) {
                SystemUI.money -= val;
                currentBet += val;
                resultOverlay.classList.add("hidden"); // Hides the "PLACE BET" text once they start betting
                refreshAIUI();
            } else {
                alert("Not enough cash!");
            }
        },
        onClear: () => {
            if (isAnimating || (gameMode === "online" && myOnlineChoice !== null)) return;
            SystemUI.money += currentBet;
            currentBet = 0;
            refreshAIUI();
        }
    });

    enterAIUI();  // default mode on load
    refreshAIUI();
}

// ── 4. MODE LAYOUT HELPERS ───────────────────────────────────
function enterAIUI() {
    document.getElementById("streak-counter").style.display   = "";
    document.getElementById("online-scoreboard").style.display = "none";
    document.getElementById("os-betting-rack").style.display  = "";
    oppStatusEl.classList.add("hidden");
    waitingMsg.classList.add("hidden");
    oppLockedOverlay.classList.add("hidden");
    document.getElementById("opp-label").innerText = "CPU";
    cpuImg.src = "../../system/images/icons/rock.png";
    resultOverlay.classList.add("hidden");
    // CPU image faces down (rotated in CSS); player image faces up
    cpuImg.style.opacity = "1";
    
    if (currentBet === 0) {
        statusText.innerText = "PLACE BET";
        resultOverlay.classList.remove("hidden");
    }
    
    refreshAIUI();
}

function enterOnlineUI() {
    document.getElementById("streak-counter").style.display    = "none";
    document.getElementById("online-scoreboard").style.display = "";
    document.getElementById("os-betting-rack").style.display   = ""; // Now enabled for Online!
    waitingMsg.classList.add("hidden");
    oppLockedOverlay.classList.add("hidden");
    resultOverlay.classList.add("hidden");
    playerImg.src = "../../system/images/icons/rock.png";
    cpuImg.src    = "../../system/images/icons/rock.png";
    myOnlineChoice = null;
    
    if (currentBet === 0) {
        statusText.innerText = "PLACE BET";
        resultOverlay.classList.remove("hidden");
    }
    
    refreshAIUI();
}

// ── 5. AI MODE ───────────────────────────────────────────────
document.getElementById("sys-reset-game-btn")?.addEventListener("click", () => {
    if (confirm("Reset your RPS win streak?")) {
        localStorage.removeItem("rps_streak");
        window.location.reload();
    }
});

function refreshAIUI() {
    if (typeof SystemUI.updateMoneyDisplay === "function") {
        SystemUI.updateMoneyDisplay();
    }
    if (typeof SystemUI.updateBetDisplay === "function") {
        SystemUI.updateBetDisplay(currentBet);
    }
    
    document.getElementById("streak-val").innerText = winStreak;
    
    // Buttons enabled only when a bet is placed and no animation is running
    document.querySelectorAll(".choice-btn").forEach(b => {
        if (gameMode === "online") {
            b.disabled = (currentBet === 0 || isAnimating || myOnlineChoice !== null);
        } else {
            b.disabled = (currentBet === 0 || isAnimating);
        }
    });
}

function startAIThrow(choice) {
    // AUDIT: Tracking game start
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("rps");

    isAnimating = true;
    resultOverlay.classList.add("hidden");

    // Both hands show rock during the "shake" animation
    playerImg.src = "../../system/images/icons/rock.png";
    cpuImg.src    = "../../system/images/icons/rock.png";

    playerBox.classList.add("shaking");
    cpuBox.classList.add("shaking");
    refreshAIUI();

    setTimeout(() => {
        playerBox.classList.remove("shaking");
        cpuBox.classList.remove("shaking");
        resolveAIRound(choice);
    }, 1500);
}

function resolveAIRound(playerChoice) {
    const options   = ["rock", "paper", "scissors"];
    const cpuChoice = options[Math.floor(Math.random() * 3)];

    playerImg.src = `../../system/images/icons/${playerChoice}.png`;
    cpuImg.src    = `../../system/images/icons/${cpuChoice}.png`;

    if (playerChoice === cpuChoice) {
        statusText.innerText = "TIE! 🤝";
        SystemUI.playSound("tie");
        SystemUI.money += currentBet; // push — bet returned
        // Streak resets on a tie is a common house rule; keep it
        winStreak = 0;
    } else if (beats(playerChoice, cpuChoice)) {
        statusText.innerText = "YOU WIN! 🎉";
        SystemUI.playSound("win");
        SystemUI.money += currentBet * 2;
        winStreak++;
        // AUDIT: Tracking win
        if (typeof SystemStats !== 'undefined') SystemStats.recordWin("rps", currentBet * 2);
    } else {
        statusText.innerText = "CPU WINS! 💀";
        SystemUI.playSound("lose");
        winStreak = 0;
        // AUDIT: Tracking loss
        if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("rps");
    }

    resultOverlay.classList.remove("hidden");
    currentBet  = 0;
    isAnimating = false;

    localStorage.setItem("rps_streak", winStreak);
    refreshAIUI();

    // Reset the board to default after the result has been shown
    // Leaves the text visible as a prompt for the user to place their next bet
    setTimeout(() => {
        if (gameMode === "ai" && currentBet === 0 && !isAnimating) {
            statusText.innerText = "PLACE BET";
            playerImg.src = "../../system/images/icons/rock.png";
            cpuImg.src    = "../../system/images/icons/rock.png";
        }
    }, 2200);
}

// ── 6. CHOICE BUTTON HANDLER ─────────────────────────────────
document.querySelectorAll(".choice-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        if (gameMode === "ai") {
            if (currentBet === 0 || isAnimating) return;
            startAIThrow(btn.id);
        } else {
            // Online mode: once per round and only if they placed a bet
            if (myOnlineChoice !== null || currentBet === 0) return;
            lockInOnlineChoice(btn.id);
        }
    });
});

// ── 7. ONLINE MULTIPLAYER ────────────────────────────────────
//
// Architecture note: RPS is *simultaneous*, not turn-based. Both players write
// their choice to Firebase independently. The HOST watches for both choices to
// appear, then computes result, updates scores, and transitions to "revealing".
// After the reveal animation plays, Host transitions back to "choosing" and clears choices.
//
// Firebase room structure:
//   rps_rooms/{id}/
//     status:        "waiting" | "choosing" | "revealing"
//     seats:         [{type,name}, {type,name}]
//     round:         number          (increments each round)
//     p1Choice:      "" | "rock" | "paper" | "scissors"
//     p2Choice:      "" | "rock" | "paper" | "scissors"
//     scores:        { p1: 0, p2: 0, ties: 0 }
//     lastResult:    { p1Choice, p2Choice, winner, round }

SystemMatch.setup({
    gameId:   "rps",
    roomPath: "rps_rooms",
    autoShow: false,
    buildSeats: () => [
        { type: "human", name: p1Name || "Player 1" },
        { type: "ai",    name: "Waiting for opponent…" }
    ],
    extraRoomFields: () => ({
        p1Name:   p1Name || "Player 1",
        round:    1,
        p1Choice: "",
        p2Choice: "",
        scores:   { p1: 0, p2: 0, ties: 0 }
    }),
    onHost: (roomId) => {
        currentRoomId = roomId;
        isHost = true; myId = 1; chatStarted = false;
        lastSeenResultRound = 0;   // fresh room — rounds restart at 1
        clearTimeout(revealTimer); // stale round-reset timer must not hit this room
        seats = SystemMatch.getSeats();
        listenToRoom();
    },
    onJoin: (roomId) => {
        currentRoomId = roomId;
        isHost = false; myId = 2; chatStarted = false;
        lastSeenResultRound = 0;   // fresh room — rounds restart at 1
        clearTimeout(revealTimer);
        seats = SystemMatch.getSeats();
        const guestName = p1Name || "Player 2";
        if (window.db && window.dbUpdate) {
            window.dbUpdate(window.dbRef(window.db, "rps_rooms/" + roomId), { p2Name: guestName });
        }
        listenToRoom();
    },

    onLeave: () => {
        if (currentBet > 0) {
            SystemUI.money += currentBet;
            currentBet = 0;
        }
        gameMode = "ai";
        if (roomListener) { roomListener(); roomListener = null; }
        clearTimeout(revealTimer); // don't let a pending round-reset write into a dead room
        chatStarted = false;
        enterAIUI();
        refreshAIUI();
    },

    onStart: () => {
        if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("rps");
        if (currentRoomId && window.db) {
            window.dbUpdate(window.dbRef(window.db, "rps_rooms/" + currentRoomId), { status: "choosing" })
                .catch(err => console.error("Start game failed:", err));
        }
    },

    onClose: () => {
        if (gameMode === "online") {
            if (currentBet > 0) {
                SystemUI.money += currentBet;
                currentBet = 0;
            }
            gameMode = "ai";
            const el = document.getElementById("sys-rps-mode");
            if (el) el.value = "ai";
            enterAIUI();
            refreshAIUI();
        }
    }
});

function listenToRoom() {
    roomListener = window.dbOnValue(
        window.dbRef(window.db, "rps_rooms/" + currentRoomId),
        snap => {
            const data = snap.val();
            if (!data) {
                // Room node removed — the host quit. Don't freeze the joiner.
                if (currentRoomId && !isHost) handleOpponentGone("HOST LEFT THE GAME");
                return;
            }
            if (data.status === "abandoned") {
                // Joiner closed their tab mid-game
                if (currentRoomId && isHost) handleOpponentGone("OPPONENT LEFT THE GAME");
                return;
            }

            seats = data.seats || [];
            SystemUI.v2Lobby.renderSeats(seats);

            // Hide lobby and start chat if we move into active gameplay
            if (data.status === "choosing" || data.status === "revealing") {
                SystemUI.v2Lobby.hide();
                if (!chatStarted) {
                    chatStarted = true;
                    SystemUI.playSound("win");
                    SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
                }

                // Update opponent label with their real name
                p2Name = (myId === 1 ? seats[1]?.name : seats[0]?.name) || "Opponent";
                document.getElementById("opp-label").innerText = p2Name;
                document.getElementById("score-opp-name").innerText = p2Name.toUpperCase();
                document.getElementById("score-my-name").innerText = (p1Name || "You").toUpperCase();
            }

            if (data.status === "choosing") {
                // HOST resolution: both choices present AND this round is unresolved
                if (data.p1Choice && data.p2Choice && isHost) {
                    resolveOnlineRound(data);
                    return; // don't render while writing resolution
                }
                renderChoosingState(data);
            } else if (data.status === "revealing") {
                // Show round result (deduplicated by round number so animation doesn't repeat)
                if (data.lastResult && data.lastResult.round > lastSeenResultRound) {
                    lastSeenResultRound = data.lastResult.round;
                    showOnlineResult(data.lastResult, data);
                }
            }
        }
    );
}

// The opponent vanished — refund any locked-in bet, clean up, and drop back
// to vs-CPU mode with a notice (mirrors the refund in onLeave/onClose).
function handleOpponentGone(message) {
    if (roomListener) { roomListener(); roomListener = null; }
    clearTimeout(revealTimer);
    if (window.SystemMatch) {
        // Room is already gone when the host left — blank the seats first so
        // cleanup() doesn't write a ghost seat-release into a deleted room.
        if (!isHost) SystemMatch.setSeats([]);
        SystemMatch.cleanup(); // host: removes room node; both: stops chat
    }
    currentRoomId = null;
    chatStarted = false;
    if (currentBet > 0) {
        SystemUI.money += currentBet; // refund the locked-in bet
        currentBet = 0;
    }
    myOnlineChoice = null;
    isAnimating = false;
    lastSeenResultRound = 0;
    isHost = false; myId = 1;
    gameMode = "ai";
    const modeEl = document.getElementById("sys-rps-mode");
    if (modeEl) modeEl.value = "ai";
    SystemUI.v2Lobby.hide();
    enterAIUI();
    refreshAIUI();
    statusText.innerText = message;
    resultOverlay.classList.remove("hidden");
    setTimeout(() => {
        if (gameMode === "ai" && currentBet === 0 && !isAnimating) {
            statusText.innerText = "PLACE BET";
        }
    }, 2500);
}

// Joiner closing the tab mid-game flags the room abandoned so the host's
// listener can react. (Host tab-close removal is handled by SystemMatch.)
window.addEventListener("beforeunload", () => {
    if (gameMode === "online" && currentRoomId && !isHost && chatStarted && window.db && window.dbUpdate) {
        try { window.dbUpdate(window.dbRef(window.db, "rps_rooms/" + currentRoomId), { status: "abandoned" }); } catch (e) {}
    }
});

function lockInOnlineChoice(choice) {
    myOnlineChoice = choice;

    // Animate the "shake" — hide actual choice during throw
    playerImg.src = "../../system/images/icons/rock.png";
    playerBox.classList.add("shaking");

    // Disable buttons so you can't change your mind
    document.querySelectorAll(".choice-btn").forEach(b => b.disabled = true);

    setTimeout(() => {
        playerBox.classList.remove("shaking");
        // Reveal OUR choice immediately locally (opponent's stays hidden until reveal state)
        playerImg.src = `../../system/images/icons/${choice}.png`;
        waitingMsg.classList.remove("hidden");
    }, 600);

    // Write our choice to Firebase
    const field = myId === 1 ? "p1Choice" : "p2Choice";
    window.dbUpdate(window.dbRef(window.db, "rps_rooms/" + currentRoomId), {
        [field]: choice
    });
}

// Called only by the host when both choices are in — writes the resolution to trigger 'revealing' state
function resolveOnlineRound(data) {
    const p1c = data.p1Choice;
    const p2c = data.p2Choice;
    const scores = Object.assign({ p1: 0, p2: 0, ties: 0 }, data.scores);

    let winner;
    if (p1c === p2c) {
        winner = "tie"; scores.ties++;
    } else if (beats(p1c, p2c)) {
        winner = "p1";  scores.p1++;
    } else {
        winner = "p2";  scores.p2++;
    }

    // Switch to revealing state. We don't wipe the choices yet, we let clients animate.
    window.dbUpdate(window.dbRef(window.db, "rps_rooms/" + currentRoomId), {
        status: "revealing",
        scores,
        lastResult: { p1Choice: p1c, p2Choice: p2c, winner, round: data.round || 1 }
    });
}

function renderChoosingState(data) {
    // Update the scoreboard at the top
    if (data.scores) {
        const s = data.scores;
        document.getElementById("score-my-wins").innerText  = myId === 1 ? s.p1 : s.p2;
        document.getElementById("score-opp-wins").innerText = myId === 1 ? s.p2 : s.p1;
        document.getElementById("score-ties").innerText     = s.ties;
    }

    const myField  = myId === 1 ? data.p1Choice : data.p2Choice;
    const oppField = myId === 1 ? data.p2Choice : data.p1Choice;

    // Both choices cleared → new round starting
    if (!myField) {
        myOnlineChoice = null;
        oppLockedOverlay.classList.add("hidden");
        oppStatusEl.classList.add("hidden");
        waitingMsg.classList.add("hidden");
        playerImg.src = "../../system/images/icons/rock.png";
        cpuImg.src    = "../../system/images/icons/rock.png";
        
        // Show "PLACE BET" overlay if they haven't bet yet
        if (currentBet === 0) {
            statusText.innerText = "PLACE BET";
            resultOverlay.classList.remove("hidden");
        } else {
            resultOverlay.classList.add("hidden");
        }
        
        refreshAIUI();
    } else {
        // Edge case: I refreshed the page and I already have a choice in the DB for this round
        myOnlineChoice = myField;
        waitingMsg.classList.remove("hidden");
        playerImg.src = `../../system/images/icons/${myField}.png`;
        refreshAIUI();
    }

    // Opponent has locked in but we don't know their choice yet
    if (oppField) {
        oppLockedOverlay.classList.remove("hidden");
        oppStatusEl.classList.remove("hidden");
        oppStatusEl.innerText = "✅ Locked in!";
    }
}

function showOnlineResult(result, data) {
    const myChoice  = myId === 1 ? result.p1Choice : result.p2Choice;
    const oppChoice = myId === 1 ? result.p2Choice : result.p1Choice;

    document.querySelectorAll(".choice-btn").forEach(b => b.disabled = true);
    waitingMsg.classList.add("hidden");

    // Animate both hands shaking to the reveal
    cpuBox.classList.add("shaking");
    playerBox.classList.add("shaking");

    setTimeout(() => {
        cpuBox.classList.remove("shaking");
        playerBox.classList.remove("shaking");
        playerImg.src = `../../system/images/icons/${myChoice}.png`;
        cpuImg.src    = `../../system/images/icons/${oppChoice}.png`;
        oppLockedOverlay.classList.add("hidden");
        oppStatusEl.classList.add("hidden");

        if (result.winner === "tie") {
            statusText.innerText = "TIE! 🤝";
            SystemUI.playSound("tie");
            SystemUI.money += currentBet; // Push — return bet
        } else if (
            (result.winner === "p1" && myId === 1) ||
            (result.winner === "p2" && myId === 2)
        ) {
            statusText.innerText = "YOU WIN! 🎉";
            SystemUI.playSound("win");
            SystemUI.money += currentBet * 2; // Win
            // AUDIT: Tracking win
            if (typeof SystemStats !== 'undefined') SystemStats.recordWin("rps", currentBet * 2);
        } else {
            statusText.innerText = "THEY WIN! 💀";
            SystemUI.playSound("lose");
            // Bet is lost (was already deducted on placement)
            // AUDIT: Tracking loss
            if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("rps");
        }

        resultOverlay.classList.remove("hidden");
        currentBet = 0;
        refreshAIUI();

        // The Host waits for the result to show, then resets the DB for the next round
        if (isHost) {
            clearTimeout(revealTimer);
            revealTimer = setTimeout(() => {
                window.dbUpdate(window.dbRef(window.db, "rps_rooms/" + currentRoomId), {
                    status: "choosing",
                    p1Choice: "",
                    p2Choice: "",
                    round: (data.round || 1) + 1
                });
            }, 3000);
        }

    }, 600);
}

// ── 8. UTILITY ───────────────────────────────────────────────
// Returns true if `a` beats `b` in standard RPS rules
function beats(a, b) {
    return (a === "rock"     && b === "scissors") ||
           (a === "paper"    && b === "rock")     ||
           (a === "scissors" && b === "paper");
}