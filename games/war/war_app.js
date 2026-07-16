// =============================================
// WAR — war_app.js
// The Game Shack | Casino OS
// =============================================

SystemUI.init({
    gameName: "WAR",
    rules: `Flip cards simultaneously — the highest card wins the round and takes both cards. A tie triggers WAR: each player places 3 face-down cards, then flips one more. The highest card wins all cards on the table. The player who collects all 52 cards wins the game and the pot!`,
    hudDropdowns: [
        {
            id: "sys-war-mode",
            options: [
                { value: "ai",     label: "🤖 vs AI"   },
                { value: "online", label: "🌐 Online"  }
            ]
        }
    ]
});

// ── STATE ──────────────────────────────────────
let gameMode    = "ai";
let chatStarted = false;
let currentRoomId    = null;  // tracked locally — SystemMatch clears its copy before onLeave fires
let iAmJoiner        = false;
let joinerPaid       = false; // joiner has paid the synced bet for the current game
let onlineResultDone = false; // joiner has recorded the result/payout for the current game
let playerDeck  = [];
let oppDeck     = [];
let warPile     = [];
let currentBet  = 0;
let isGameOver  = true;
let isFlipping  = false;
let inWar       = false;
let roundNumber = 0;

const SUITS = ["Spades", "Hearts", "Diamonds", "Clubs"];
const RANKS = [
    { name: "2",  value: 2  }, { name: "3",  value: 3  }, { name: "4",  value: 4  },
    { name: "5",  value: 5  }, { name: "6",  value: 6  }, { name: "7",  value: 7  },
    { name: "8",  value: 8  }, { name: "9",  value: 9  }, { name: "10", value: 10 },
    { name: "J",  value: 11 }, { name: "Q",  value: 12 }, { name: "K",  value: 13 },
    { name: "A",  value: 14 },
];

// ── DECK ───────────────────────────────────────
function buildDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ suit, name: rank.name, value: rank.value });
        }
    }
    return deck;
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function getCardImage(card) {
    return `../../system/images/cards/standard/card${card.suit}${card.name}.png`;
}

// ── BETTING ────────────────────────────────────
SystemUI.setupBetting("os-betting-rack", {
    onBet: (val) => {
        if (!isGameOver) return;
        if (currentBet + val > SystemUI.money) {
            showToast("Not Enough Cash", "You don't have enough for that bet.");
            return;
        }
        if (currentBet === 0) SystemUI.playSound('chipTable');
        else SystemUI.playSound('chipStack');
        currentBet += val;
        updateBetUI();
    },
    onClear: () => {
        if (!isGameOver) return;
        currentBet = 0;
        updateBetUI();
    }
});

function updateBetUI() {
    SystemUI.updateBetDisplay(currentBet);
    SystemUI.enableBetting(isGameOver);
    const dealBtn = document.getElementById("deal-btn");
    const minBet = 5;
    if (currentBet < minBet) {
        dealBtn.disabled = true;
        dealBtn.textContent = `FLIP (Min $${minBet})`;
    } else {
        dealBtn.disabled = false;
        dealBtn.textContent = `START GAME — BET $${currentBet}`;
    }
    const potDisplay = document.getElementById("table-pot-display");
    if (currentBet > 0) {
        potDisplay.textContent = `POT: $${currentBet * 2}`;
        potDisplay.classList.remove("hidden");
        SystemUI.renderTableStacks(currentBet, "table-bet-chips");
    } else {
        potDisplay.classList.add("hidden");
        SystemUI.renderTableStacks(0, "table-bet-chips");
    }
}

// ── MODE SWITCHER ──────────────────────────────
setTimeout(() => {
    const modeEl = document.getElementById("sys-war-mode");
    if (modeEl) {
        modeEl.value = gameMode;
        modeEl.addEventListener("change", e => {
            gameMode = e.target.value;
            document.getElementById("sys-modal").classList.add("sys-hidden");
            if (gameMode === "online") {
                SystemMatch.setup({
                    gameId:   "war",
                    roomPath: "war_rooms",
                    onHost: (roomId) => {
                        currentRoomId = roomId;
                        iAmJoiner = false;
                        joinerPaid = false;
                        onlineResultDone = false;
                        listenToRoom(roomId);
                    },
                    onJoin: (roomId) => {
                        currentRoomId = roomId;
                        iAmJoiner = true;
                        joinerPaid = false;
                        onlineResultDone = false;
                        listenToRoom(roomId);
                    },
                    onLeave: () => {
                        // Joiner leaving mid-game: flag the room so the host isn't stuck
                        // waiting on joinerReady forever.
                        if (iAmJoiner && currentRoomId && !isGameOver && window.db && window.dbUpdate) {
                            try { window.dbUpdate(window.dbRef(window.db, `war_rooms/${currentRoomId}`), { status: "abandoned" }); } catch (e) {}
                        }
                        // Refund a live bet (host paid at deal, joiner via joinerPaid).
                        if (!isGameOver && currentBet > 0 && (!iAmJoiner || joinerPaid)) {
                            SystemUI.money += currentBet;
                            SystemUI.updateMoneyDisplay();
                        }
                        currentRoomId = null;
                        joinerPaid = false;
                        onlineResultDone = false;
                        gameMode = "ai";
                        modeEl.value = "ai";
                        chatStarted = false;
                        resetToLobby();
                    },
                    onStart: () => {},
                    onClose: () => {}
                });
            } else {
                SystemUI.v2Lobby.hide();
                SystemUI.stopChat();
                chatStarted = false;
                resetToLobby();
            }
        });
    }
}, 10);

function resetToLobby() {
    isGameOver  = true;
    currentBet  = 0;
    playerDeck  = [];
    oppDeck     = [];
    warPile     = [];
    roundNumber = 0;
    inWar       = false;
    document.getElementById("gameover-controls").classList.add("hidden");
    document.getElementById("playing-controls").classList.add("hidden");
    document.getElementById("betting-controls").classList.remove("hidden");
    hideResultBanner();
    hideWarPile();
    resetFlipCards();
    renderCardStacks();
    updateCountBadges();
    setStatus("PLACE YOUR BET");
    updateBetUI();
}


document.getElementById("deal-btn").addEventListener("click", () => {
    if (currentBet < 5) return;
    if (gameMode === "online" && !SystemMatch.isHost()) return;
    SystemUI.money -= currentBet;
    SystemUI.updateMoneyDisplay();
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("war");

    isGameOver  = false;
    isFlipping  = false;
    inWar       = false;
    roundNumber = 0;
    warPile     = [];

    const deck = shuffle(buildDeck());
    playerDeck  = deck.slice(0, 26);
    oppDeck     = deck.slice(26, 52);

    document.getElementById("betting-controls").classList.add("hidden");
    document.getElementById("playing-controls").classList.remove("hidden");
    document.getElementById("gameover-controls").classList.add("hidden");

    setStatus("FLIP TO BATTLE!");
    hideResultBanner();
    hideWarPile();
    renderCardStacks();
    updateCountBadges();
    resetFlipCards();

    SystemUI.playSound('shuffle');

    if (gameMode === "online") pushHostState(null);
});

// ── FLIP ───────────────────────────────────────
document.getElementById("flip-btn").addEventListener("click", () => {
    if (isFlipping || isGameOver) return;
    if (playerDeck.length === 0 || oppDeck.length === 0) { endGame(); return; }

    if (gameMode === "online") {
        if (SystemMatch.isHost()) {
            doFlip();
        } else {
            // Joiner signals ready to flip
            const roomId = SystemMatch.getRoomId();
            if (roomId) {
                window.dbUpdate(window.dbRef(window.db, `war_rooms/${roomId}`), { joinerReady: true });
                document.getElementById("flip-btn").disabled = true;
                setStatus("WAITING FOR HOST…");
            }
        }
    } else {
        doFlip();
    }
});

async function doFlip() {
    isFlipping = true;
    inWar = false;
    document.getElementById("flip-btn").disabled = true;
    document.getElementById("war-btn-action").classList.add("hidden");
    hideResultBanner();
    roundNumber++;

    const pCard = playerDeck.shift();
    const oCard = oppDeck.shift();

    SystemUI.playSound('card');
    setStatus("FLIPPING…");

    // Show both cards face down first
    showCardFaceDown("player-flip-card");
    showCardFaceDown("opp-flip-card");

    await sleep(300);
    SystemUI.playSound('card');

    // Flip both face up
    flipCardFaceUp("player-flip-card", pCard);
    flipCardFaceUp("opp-flip-card", oCard);

    await sleep(600);

    // Resolve round
    if (pCard.value > oCard.value) {
        // Player wins
        const wonCount = 2 + warPile.length; // capture before the pile is cleared
        playerDeck.push(pCard, oCard, ...warPile);
        warPile = [];
        showResult("win", `YOU WIN THE ROUND! +${wonCount} cards`);
        markCardResult("player-flip-card", true);
        markCardResult("opp-flip-card", false);
        SystemUI.playSound('win');
    } else if (oCard.value > pCard.value) {
        // Opponent wins
        oppDeck.push(oCard, pCard, ...warPile);
        warPile = [];
        showResult("lose", `OPPONENT WINS THE ROUND`);
        markCardResult("opp-flip-card", true);
        markCardResult("player-flip-card", false);
        SystemUI.playSound('lose');
    } else {
        // WAR
        warPile.push(pCard, oCard);
        showResult("war", "⚔️ WAR! ⚔️");
        setStatus("TIE — DECLARE WAR!");
        SystemUI.playSound('shuffle');
    }

    updateCountBadges();
    renderCardStacks();

    await sleep(800);

    if (pCard.value === oCard.value) {
        // Handle war
        handleWar();
    } else {
        // Check win condition
        if (playerDeck.length === 0 || oppDeck.length === 0) {
            await sleep(600);
            endGame();
            return;
        }
        setStatus("NEXT ROUND");
        document.getElementById("flip-btn").disabled = false;
        isFlipping = false;
    }
    if (gameMode === "online" && SystemMatch.isHost()) {
        pushHostState({ pCard, oCard });
    }
}

function handleWar() {
    // Check if either player has enough cards for war (need at least 4: 3 face-down + 1 flip)
    if (playerDeck.length < 4 && oppDeck.length < 4) {
        // Both out — sudden death with remaining cards
        warSuddenDeath();
        return;
    }
    if (playerDeck.length < 4) {
        // Player runs out during war
        oppDeck.push(...warPile, ...playerDeck, ...oppDeck);
        playerDeck = [];
        warPile = [];
        endGame();
        return;
    }
    if (oppDeck.length < 4) {
        // Opponent runs out during war
        playerDeck.push(...warPile, ...oppDeck, ...playerDeck);
        oppDeck = [];
        warPile = [];
        endGame();
        return;
    }

    // Take 3 face-down war cards from each
    const pWarCards = playerDeck.splice(0, 3);
    const oWarCards = oppDeck.splice(0, 3);
    warPile.push(...pWarCards, ...oWarCards);

    showWarPile(warPile.length);
    setStatus(`WAR! ${warPile.length} CARDS AT STAKE`);
    document.getElementById("flip-btn").disabled = false;
    isFlipping = false;
    inWar = true;
    updateCountBadges();
    renderCardStacks();
    if (gameMode === "online" && SystemMatch.isHost()) pushHostState(null);
}

function warSuddenDeath() {
    // Use remaining cards as-is
    const pCard = playerDeck.shift();
    const oCard = oppDeck.shift();
    if (!pCard || !oCard) {
        endGame();
        return;
    }
    warPile.push(pCard, oCard);
    if (pCard.value > oCard.value) {
        playerDeck.push(...warPile);
    } else if (oCard.value > pCard.value) {
        oppDeck.push(...warPile);
    } else {
        // another tie with no cards — split the war pile
        const half = Math.floor(warPile.length / 2);
        playerDeck.push(...warPile.slice(0, half));
        oppDeck.push(...warPile.slice(half));
    }
    warPile = [];
    endGame();
}

// ── END GAME ───────────────────────────────────
function endGame() {
    isGameOver = true;
    isFlipping = false;
    inWar = false;

    document.getElementById("playing-controls").classList.add("hidden");
    document.getElementById("gameover-controls").classList.remove("hidden");
    document.getElementById("flip-btn").disabled = false;
    document.getElementById("war-btn-action").classList.add("hidden");

    hideWarPile();

    if (playerDeck.length > oppDeck.length) {
        // Player wins
        const winAmount = currentBet * 2;
        SystemUI.money += winAmount;
        SystemUI.updateMoneyDisplay();
        SystemUI.playSound('win');
        if (typeof SystemStats !== 'undefined') SystemStats.recordWin("war", winAmount);
        showToast("YOU WIN THE WAR! 🏆", `Collected all the cards! Won $${winAmount}!`, false);
        showResult("win", `YOU WIN — $${winAmount}!`);
        setStatus("VICTORY!");
    } else {
        // Opponent wins
        SystemUI.playSound('lose');
        if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("war");
        showToast("OPPONENT WINS", `You ran out of cards. Lost $${currentBet}.`, false);
        showResult("lose", `OPPONENT WINS`);
        setStatus("DEFEAT");
    }

    updateCountBadges();
    renderCardStacks();
    if (gameMode === "online" && SystemMatch.isHost()) pushHostState(null);
}
document.getElementById("play-again-btn").addEventListener("click", () => {
    isGameOver  = true;
    currentBet  = 0;
    playerDeck  = [];
    oppDeck     = [];
    warPile     = [];
    roundNumber = 0;
    inWar       = false;

    document.getElementById("gameover-controls").classList.add("hidden");
    document.getElementById("betting-controls").classList.remove("hidden");
    document.getElementById("playing-controls").classList.add("hidden");

    hideResultBanner();
    hideWarPile();
    resetFlipCards();
    renderCardStacks();
    updateCountBadges();
    setStatus("PLACE YOUR BET");
    updateBetUI();
});

// ── RENDER HELPERS ─────────────────────────────
function renderCardStacks() {
    const pStack = document.getElementById("player-card-stack");
    const oStack = document.getElementById("opp-card-stack");
    pStack.className = "card-stack" + (playerDeck.length === 0 ? " empty" : "");
    oStack.className = "card-stack" + (oppDeck.length === 0 ? " empty" : "");
}

function updateCountBadges() {
    document.getElementById("player-count").textContent = playerDeck.length;
    document.getElementById("opp-count").textContent    = oppDeck.length;
}

function showCardFaceDown(id) {
    const el = document.getElementById(id);
    el.classList.remove("hidden", "flipped", "winner", "loser");
}

function flipCardFaceUp(id, card) {
    const el = document.getElementById(id);
    const front = el.querySelector(".flip-card-front");
    front.innerHTML = `<img src="${getCardImage(card)}" alt="${card.name} of ${card.suit}">`;
    el.classList.add("flipped");
}

function markCardResult(id, isWinner) {
    const el = document.getElementById(id);
    el.classList.add(isWinner ? "winner" : "loser");
}

function resetFlipCards() {
    ["player-flip-card", "opp-flip-card"].forEach(id => {
        const el = document.getElementById(id);
        el.classList.add("hidden");
        el.classList.remove("flipped", "winner", "loser");
        el.querySelector(".flip-card-front").innerHTML = "";
    });
}

function setStatus(text) {
    document.getElementById("battle-status").textContent = text;
}

function showResult(type, text) {
    const el = document.getElementById("result-banner");
    el.className = `${type}`;
    el.textContent = text;
    el.classList.remove("hidden");
}

function hideResultBanner() {
    document.getElementById("result-banner").classList.add("hidden");
}

function showWarPile(count) {
    const el = document.getElementById("war-pile-display");
    document.getElementById("war-pile-count").textContent = count;
    el.classList.remove("hidden");
}

function hideWarPile() {
    document.getElementById("war-pile-display").classList.add("hidden");
}

// ── TOAST ──────────────────────────────────────
let toastTimer;
function showToast(title, message) {
    document.getElementById("modal-title").textContent   = title;
    document.getElementById("modal-message").textContent = message;
    const overlay = document.getElementById("toast-modal");
    overlay.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => overlay.classList.add("hidden"), 3500);
}

document.getElementById("toast-modal").addEventListener("click", function() {
    if (!this.classList.contains("hidden")) {
        clearTimeout(toastTimer);
        this.classList.add("hidden");
    }
});

// ── UTIL ───────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── ONLINE: PUSH / APPLY / LISTEN ──────────────
function pushHostState(lastFlip) {
    const roomId = SystemMatch.getRoomId();
    if (!roomId) return;
    window.dbUpdate(window.dbRef(window.db, `war_rooms/${roomId}`), {
        gameState: JSON.stringify({
            playerDeck, oppDeck, warPile,
            isGameOver, roundNumber, inWar,
            bet: currentBet,
            lastFlip: lastFlip || null
        }),
        joinerReady: false
    });
}

function applyHostState(stateJson) {
    try {
        const s = typeof stateJson === "string" ? JSON.parse(stateJson) : stateJson;
        // The host pushes ITS perspective — swap the decks for the joiner so
        // "playerDeck" is always the local player's own deck.
        playerDeck  = s.oppDeck     || [];
        oppDeck     = s.playerDeck  || [];
        warPile     = s.warPile     || [];
        isGameOver  = s.isGameOver;
        roundNumber = s.roundNumber || 0;
        inWar       = s.inWar       || false;
        if (typeof s.bet === "number" && s.bet > 0) currentBet = s.bet;

        if (!isGameOver) onlineResultDone = false;

        // Joiner economy: pay the (synced) bet once per game, when the host deals.
        if (!isGameOver && !joinerPaid) {
            joinerPaid = true;
            SystemUI.money -= currentBet;
            SystemUI.updateMoneyDisplay();
            if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("war");
        }

        // Show game area if game has started
        if (!isGameOver || roundNumber > 0) {
            document.getElementById("betting-controls").classList.add("hidden");
            document.getElementById("playing-controls").classList.remove("hidden");
            document.getElementById("gameover-controls").classList.add("hidden");
        }

        if (isGameOver && roundNumber > 0) {
            document.getElementById("playing-controls").classList.add("hidden");
            document.getElementById("gameover-controls").classList.remove("hidden");
        }

        // Show the last flipped cards if present.
        // lastFlip.pCard is the HOST's card, lastFlip.oCard is OURS (the joiner's).
        if (s.lastFlip && s.lastFlip.pCard && s.lastFlip.oCard) {
            showCardFaceDown("player-flip-card");
            showCardFaceDown("opp-flip-card");
            flipCardFaceUp("player-flip-card", s.lastFlip.oCard); // our card in our slot
            flipCardFaceUp("opp-flip-card", s.lastFlip.pCard);    // host's card opposite
            if (s.lastFlip.oCard.value > s.lastFlip.pCard.value) {
                markCardResult("player-flip-card", true); // joiner won the round
                markCardResult("opp-flip-card", false);
                showResult("win", "YOU WIN THE ROUND!");
            } else if (s.lastFlip.pCard.value > s.lastFlip.oCard.value) {
                markCardResult("player-flip-card", false);
                markCardResult("opp-flip-card", true);
                showResult("lose", "OPPONENT WINS THE ROUND");
            } else {
                showResult("war", "⚔️ WAR! ⚔️");
            }
        }

        if (inWar) showWarPile(warPile.length);
        else hideWarPile();

        if (isGameOver && roundNumber > 0 && !onlineResultDone) {
            onlineResultDone = true; // guard: repeated onValue snapshots must not re-pay/re-record
            joinerPaid = false;      // ready for the next deal
            // After the swap above, playerDeck is OUR deck — we win when we hold more cards.
            // (Same test as the host's endGame, so exactly one side can win.)
            if (playerDeck.length > oppDeck.length) {
                const winAmount = currentBet * 2;
                SystemUI.money += winAmount;
                SystemUI.updateMoneyDisplay();
                SystemUI.playSound('win');
                if (typeof SystemStats !== 'undefined') SystemStats.recordWin("war", winAmount);
                showResult("win", `YOU WIN — $${winAmount}!`);
                setStatus("VICTORY!");
            } else {
                SystemUI.playSound('lose');
                if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("war");
                showResult("lose", "OPPONENT WINS");
                setStatus("DEFEAT");
            }
        }

        renderCardStacks();
        updateCountBadges();

        if (!isGameOver) {
            setStatus(inWar ? `WAR! ${warPile.length} CARDS AT STAKE` : "NEXT ROUND");
            document.getElementById("flip-btn").disabled = false;
            isFlipping = false;
        }
    } catch(e) { console.error("War sync error:", e); }
}

// Exit online mode back to local play (host left / opponent abandoned).
function exitOnlineToLocal(hostGone) {
    // Refund a live bet (host paid at deal, joiner via joinerPaid).
    if (!isGameOver && currentBet > 0 && (SystemMatch.isHost() || joinerPaid)) {
        SystemUI.money += currentBet;
        SystemUI.updateMoneyDisplay();
    }
    if (hostGone) SystemMatch._roomId = null; // node already deleted — stop cleanup() writing a ghost room
    SystemMatch.cleanup(); // detaches listener, removes room if host, stops chat
    currentRoomId = null;
    iAmJoiner = false;
    joinerPaid = false;
    onlineResultDone = false;
    gameMode = "ai";
    const modeEl = document.getElementById("sys-war-mode");
    if (modeEl) modeEl.value = "ai";
    if (SystemUI.v2Lobby) SystemUI.v2Lobby.hide();
    chatStarted = false;
    resetToLobby();
}

// Joiner closing the tab mid-game: tell the host instead of leaving it stuck on joinerReady.
window.addEventListener("beforeunload", () => {
    if (gameMode === "online" && iAmJoiner && currentRoomId && !isGameOver && window.db && window.dbUpdate) {
        try { window.dbUpdate(window.dbRef(window.db, `war_rooms/${currentRoomId}`), { status: "abandoned" }); } catch (e) {}
    }
});

function listenToRoom(roomId) {
    let gameStarted = false;
    const unsubFn = window.dbOnValue(window.dbRef(window.db, `war_rooms/${roomId}`), snap => {
        const data = snap.val();
        if (!data) {
            // Host left — SystemMatch deletes the room node. Don't leave the joiner frozen.
            if (!SystemMatch.isHost()) {
                showToast("Host Left", "The host closed the room.");
                exitOnlineToLocal(true);
            }
            return;
        }
        if (data.status === "abandoned") {
            if (SystemMatch.isHost()) {
                showToast("Opponent Left", "Your opponent abandoned the match.");
                exitOnlineToLocal(false);
            }
            return;
        }

        if (data.seats) {
            SystemMatch.setSeats(data.seats);
            SystemUI.v2Lobby.renderSeats(data.seats);
        }

        if (data.status === "playing" && !gameStarted) {
            gameStarted = true;
            SystemUI.v2Lobby.hide();
            if (!chatStarted) {
                chatStarted = true;
                SystemUI.startChat(roomId, SystemUI.getPlayerName());
            }
            if (!SystemMatch.isHost()) {
                setStatus("WAITING FOR HOST TO DEAL…");
                document.getElementById("betting-controls").classList.add("hidden");
                document.getElementById("playing-controls").classList.remove("hidden");
                document.getElementById("flip-btn").disabled = true;
                renderCardStacks();
                updateCountBadges();
            }
        }

        // Host sees joinerReady — process the flip
        if (data.joinerReady && SystemMatch.isHost() && !isFlipping && !isGameOver) {
            doFlip();
        }

        // Joiner mirrors host state
        if (data.gameState && !SystemMatch.isHost()) {
            applyHostState(data.gameState);
        }
    });
    SystemMatch.setListener(unsubFn);
}

// ── INIT ───────────────────────────────────────
updateBetUI();
renderCardStacks();
updateCountBadges();
setStatus("PLACE YOUR BET");