// =============================================
// FAMILY FEUD — feud_app.js
// The Game Shack | Casino OS (V2 Engine)
// Modes: vs AI | Hotseat | Online
// =============================================

// ── 1. OS INIT ────────────────────────────────
// Force AI mode on boot to prevent ghost online deadlocks
let gameMode = "ai";
localStorage.setItem("feud_mode", "ai"); 

let totalRounds = parseInt(localStorage.getItem("feud_rounds") || "3");
let aiDifficulty = localStorage.getItem("feud_diff") || "normal";

let chatStarted = false;
let currentRoomId = null;
let myId = 1;
let isHost = true; 
let seats = [];
let roomListener = null;

let lastPushTime = 0;
let lastSyncTime = 0;

let p1Name = "TEAM 1"; // Host
let p2Name = "TEAM 2"; // Guest / AI

SystemUI.init({
    gameName: "FAMILY FEUD",
    rules: "Buzz in to win the face-off! Guess the top survey answers to score points. 3 strikes and your opponent gets a chance to steal everything!",
    hudDropdowns: [
        {
            id: "sys-feud-mode",
            options: [
                { value: "ai",      label: "🤖 vs AI"   },
                { value: "hotseat", label: "👥 Hotseat"  },
                { value: "online",  label: "🌐 Online"   }
            ]
        }
    ]
});

// ==========================================
// 1.5 V2 MULTIPLAYER LOBBY
// ==========================================

function updateLobbyPreview() {
    const slots = [
        { type: "host", name: SystemUI.getPlayerName(), color: "#e53030" }, 
        { type: "ai", name: "AI (" + aiDifficulty + ")", color: "#1e41a8" } 
    ];
    SystemUI.v2Lobby.updatePreview(slots);
}

SystemMatch.setup({
    gameId:   "family-feud",
    roomPath: "feud_rooms",
    autoShow: false,
    buildSeats: () => [
        { type: "human", name: SystemUI.getPlayerName() },
        { type: "ai",    name: "AI (" + aiDifficulty + ")" }
    ],
    extraRoomFields: () => ({ ts: Date.now() }),
    settingsConfig: [
        {
            id: "lobby-rounds",
            label: "ROUNDS",
            type: "select",
            default: totalRounds,
            options: [
                { value: 3, label: "3 ROUNDS" },
                { value: 5, label: "5 ROUNDS" },
                { value: 7, label: "7 ROUNDS" }
            ]
        },
        {
            id: "lobby-ai-diff",
            label: "AI LEVEL",
            type: "select",
            default: aiDifficulty,
            options: [
                { value: "easy",   label: "EASY" },
                { value: "normal", label: "NORMAL" },
                { value: "hard",   label: "HARD" }
            ]
        }
    ],
    onSettingsRendered: () => updateLobbyPreview(),
    onSettingChange: (key, val) => {
        if (key === "lobby-rounds") {
            totalRounds = parseInt(val);
            localStorage.setItem("feud_rounds", val);
        } else if (key === "lobby-ai-diff") {
            aiDifficulty = val;
            localStorage.setItem("feud_diff", val);
        }
        updateLobbyPreview();
    },
    onHost: (roomId) => {
        currentRoomId = roomId;
        isHost = true; myId = 1; chatStarted = false;
        seats = SystemMatch.getSeats();
        listenToRoom();
    },
    onJoin: (roomId) => {
        currentRoomId = roomId;
        isHost = false; myId = 2; chatStarted = false;
        seats = SystemMatch.getSeats();
        listenToRoom();
    },
    onLeave: () => {
        gameMode = "ai";
        const modeEl = document.getElementById("sys-feud-mode");
        if (modeEl) modeEl.value = "ai";
        localStorage.setItem("feud_mode", "ai");
        chatStarted = false;
        myId = 1; isHost = true;
        if (roomListener) { roomListener(); roomListener = null; }
        resetGame();
        toggleGameVisibility(true);
    },
    onStart: () => {
        if (currentRoomId && window.db) {
            window.dbUpdate(window.dbRef(window.db, 'feud_rooms/' + currentRoomId), { status: "playing", ts: Date.now() });
        }
    },
    onClose: () => {
        if (gameMode === "online" && gamePhase === "idle") {
            gameMode = "ai";
            const modeEl = document.getElementById("sys-feud-mode");
            if (modeEl) modeEl.value = "ai";
            localStorage.setItem("feud_mode", "ai");
            myId = 1; isHost = true;
            toggleGameVisibility(true);
        }
    }
});

function toggleGameVisibility(show) {
    const ids = ["scoreboard", "status-row", "question-wrap", "answer-board", "start-btn"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = show ? "" : "none";
    });
}

setTimeout(() => {
    const modeEl = document.getElementById("sys-feud-mode");

    if (modeEl) {
        modeEl.value = gameMode;
        
        if (gameMode === "online") {
            toggleGameVisibility(false);
        }
        
        modeEl.addEventListener("change", e => {
            gameMode = e.target.value;
            localStorage.setItem("feud_mode", gameMode);
            document.getElementById("sys-modal")?.classList.add("sys-hidden");
            
            syncDiffVisibility();
            if (gameMode === "online") {
                toggleGameVisibility(false);
                SystemUI.v2Lobby.show();
            } else {
                toggleGameVisibility(true);
                SystemUI.v2Lobby.hide();
                SystemUI.stopChat();
                chatStarted = false;
                myId = 1; isHost = true;
                if(roomListener) { roomListener(); roomListener = null; }
                p1Name = SystemUI.getPlayerName();
                p2Name = "AI";
                updateNames();
                resetGame();
            }
        });
    }

    // Wire Splash Screen "Opponent" Buttons
    document.querySelectorAll(".opp-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
            const mode = btn.dataset.mode;
            gameMode = mode;
            localStorage.setItem("feud_mode", mode);
            if (modeEl) modeEl.value = mode;
            document.querySelectorAll(".opp-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            syncDiffVisibility();
            if (mode === "online") {
                toggleGameVisibility(false);
                SystemUI.v2Lobby.show();
            } else {
                toggleGameVisibility(true);
                SystemUI.v2Lobby.hide();
            }
        });
    });

    // Wire Local Difficulty Buttons
    document.querySelectorAll(".diff-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
            aiDifficulty = btn.dataset.diff;
            localStorage.setItem("feud_diff", aiDifficulty);
            document.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            updateNames();
        });
    });

    syncDiffVisibility();
    p1Name = SystemUI.getPlayerName();
    updateNames();
    resetGame();
}, 10);

function syncDiffVisibility() {
    const wrap = document.getElementById("sys-feud-diff")?.closest(".hud-dropdown-wrap") ||
                 document.getElementById("sys-feud-diff")?.parentElement;
    if (wrap) wrap.style.display = gameMode === "ai" ? "" : "none";
    const localDiffRow = document.getElementById("difficulty-row");
    if (localDiffRow) localDiffRow.style.display = gameMode === "ai" ? "" : "none";
}

function listenToRoom() {
    let onlineGameStarted = false;
    if(roomListener) roomListener();
    roomListener = window.dbOnValue(window.dbRef(window.db, 'feud_rooms/' + currentRoomId), snapshot => {
        const data = snapshot.val();
        if (!data) return;

        seats = data.seats || [];
        SystemUI.v2Lobby.renderSeats(seats);

        if (data.status === "playing") {
            toggleGameVisibility(true);
            SystemUI.v2Lobby.hide();
            if (!chatStarted) {
                chatStarted = true;
                SystemUI.playSound('win');
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }
            
            // Standardize Teams: Team 1 = Host, Team 2 = Guest
            p1Name = seats[0].name;
            p2Name = seats[1]?.name || "AI";
            updateNames();
            
            if (isHost && !onlineGameStarted) {
                onlineGameStarted = true;
                hideStartBtn(); 
                startGame(); 
            } else {
                onlineGameStarted = true;
                hideStartBtn();
                if (data.gameState) syncFromFirebase(data.gameState);
            }
        }
        
        // BUZZ REFEREE LOGIC (HOST ONLY)
        if (isHost && data.buzzPulse && gamePhase === "faceoff" && !buzzProcessed) {
            handleBuzz(data.buzzPulse.playerId);
        }
    });
}

function onlineBuzz(playerId = myId) {
    if (buzzLocked || gamePhase !== "faceoff" || !window.db) return;
    window.dbUpdate(window.dbRef(window.db, 'feud_rooms/' + currentRoomId), {
        buzzPulse: { playerId: playerId, ts: Date.now() }
    });
}

function pushGameState() {
    if (gameMode !== "online" || !window.db) return;
    const now = Date.now();
    lastPushTime = now;
    window.dbUpdate(window.dbRef(window.db, 'feud_rooms/' + currentRoomId), {
        gameState: JSON.stringify({
            phase:               gamePhase,
            currentRound:        currentRound,
            totalRounds:         totalRounds,
            questionIndex:       currentQuestionIndex,
            activePlayer:        activePlayer,
            faceoffWinner:       faceoffWinner,
            strikes:             strikes,
            boardPoints:         boardPoints,
            revealedAnswers:     roundAnswers.map(a => a.revealed),
            scores:              scores,
            ts:                  now,
            pusher:              myId
        }),
        buzzPulse: null 
    });
}

function syncFromFirebase(stateJson) {
    try {
        const data = typeof stateJson === "string" ? JSON.parse(stateJson) : stateJson;
        if (!data.ts || (data.pusher === myId && data.ts === lastPushTime) || data.ts <= lastSyncTime) return;
        lastSyncTime = data.ts;

        if (data.totalRounds !== undefined) totalRounds = data.totalRounds;

        if (data.questionIndex !== undefined && data.questionIndex !== currentQuestionIndex) {
            currentQuestionIndex = data.questionIndex;
            const q = QUESTIONS[currentQuestionIndex];
            roundAnswers = q.answers.map(a => ({ ...a, revealed: false }));
            setQuestion(q.q);
        }

        if (data.revealedAnswers && roundAnswers.length > 0) {
            data.revealedAnswers.forEach((rev, i) => { if (roundAnswers[i]) roundAnswers[i].revealed = rev; });
        }

        if (data.currentRound !== undefined && data.currentRound !== currentRound) {
            currentRound = data.currentRound;
            setRoundLabel(currentRound);
        }
        
        if (data.strikes    !== undefined) { strikes = data.strikes;       renderStrikes(); }
        if (data.boardPoints!== undefined) { boardPoints = data.boardPoints; setBoardPts(boardPoints); }
        if (data.scores)                   { scores = data.scores;          renderScores(); }
        
        // Must update active player BEFORE phase logic for UI highlighting
        if (data.activePlayer  !== undefined) activePlayer  = data.activePlayer;
        if (data.faceoffWinner !== undefined) faceoffWinner = data.faceoffWinner;

        renderBoard();

        if (data.phase && data.phase !== gamePhase) {
            gamePhase = data.phase;
            switch (gamePhase) {
                case "faceoff":
                    buzzLocked = false; buzzProcessed = false; startFaceoff(); break;
                case "faceoff-answering":
                    hideBuzzZone(); showFaceoffInput(activePlayer); break;
                case "play-or-pass":
                    hideBuzzZone(); goToPlayOrPass(); break;
                case "playing":
                    hideBuzzZone(); startPlaying(); break;
                case "steal":
                    startSteal(); break;
                case "roundover":
                    hideGuessZone(); setPhaseTag(`${getPlayerName(activePlayer).toUpperCase()} WINS THE ROUND!`); break;
                case "gameover":
                    endGame(); break;
            }
        }

        if (isHost && isBotTurn(activePlayer)) {
            if (gamePhase === "playing") scheduleAiGuess(activePlayer);
        }
    } catch (e) { console.error("Sync error:", e); }
}

// ── 2. QUESTION BANK ─────────────────────────
const QUESTIONS = [
    {
        q: "Name something people do on their phone while on the toilet.",
        answers: [
            { text: "Browse social media", pts: 34, aliases: ["social media","instagram","facebook","tiktok","twitter","scroll"] },
            { text: "Play games",           pts: 26, aliases: ["gaming","play a game","mobile games"] },
            { text: "Text someone",         pts: 18, aliases: ["texting","text","send a text","message"] },
            { text: "Watch videos",         pts: 12, aliases: ["youtube","watch youtube","video","stream"] },
            { text: "Read the news",        pts: 10, aliases: ["news","read","check news","articles"] }
        ]
    },
    {
        q: "Name a reason someone might call in sick to work.",
        answers: [
            { text: " Hangover",         pts: 32, aliases: ["drunk","drinking","hung over","party too hard"] },
            { text: "Just tired",       pts: 24, aliases: ["tired","exhausted","fatigue","sleepy","too tired","didn't want to go"] },
            { text: "Actually sick",    pts: 20, aliases: ["sick","ill","flu","cold","fever","cough"] },
            { text: "Mental health day",pts: 14, aliases: ["mental health","stressed","anxiety","depression","burned out"] },
            { text: "Family emergency", pts: 10, aliases: ["family","kids","children","family issue"] }
        ]
    },
    {
        q: "Name something you find in a junk drawer.",
        answers: [
            { text: "Batteries",       pts: 36, aliases: ["battery","AA","AAA"] },
            { text: "Pens and pencils",pts: 28, aliases: ["pen","pencil","pens","pencils","markers","marker"] },
            { text: "Rubber bands",    pts: 16, aliases: ["rubber band","elastics","elastic"] },
            { text: "Scissors",        pts: 12, aliases: ["scissors"] },
            { text: "Tape",            pts: 8,  aliases: ["scotch tape","duct tape","sticky tape"] }
        ]
    },
    {
        q: "Name something you do when you can't sleep.",
        answers: [
            { text: "Watch TV",       pts: 38, aliases: ["television","tv","netflix","streaming","watch shows","watch movies","watch something"] },
            { text: "Check your phone",pts: 24, aliases: ["phone","scroll phone","go on phone","look at phone","use phone"] },
            { text: "Read a book",    pts: 16, aliases: ["read","reading","book","read something"] },
            { text: "Count sheep",    pts: 12, aliases: ["count","sheep"] },
            { text: "Get a snack",    pts: 10, aliases: ["eat","snack","food","eat something","go to the kitchen"] }
        ]
    },
    {
        q: "Name something people lie about on their resume.",
        answers: [
            { text: "Work experience",  pts: 38, aliases: ["experience","years of experience","job experience","past jobs"] },
            { text: "Education",        pts: 28, aliases: ["degree","college","university","school","gpa"] },
            { text: "Skills",           pts: 16, aliases: ["skill","abilities","languages","software"] },
            { text: "References",       pts: 10, aliases: ["reference","referral"] },
            { text: "Job title",        pts: 8,  aliases: ["title","job titles","position","previous title"] }
        ]
    },
    {
        q: "Name something you would do first after winning the lottery.",
        answers: [
            { text: "Quit your job",  pts: 36, aliases: ["quit job","leave work","stop working","retire","quit","walk out"] },
            { text: "Buy a house",    pts: 28, aliases: ["house","home","new house","mansion","property"] },
            { text: "Travel",         pts: 18, aliases: ["vacation","trip","travel the world","go on vacation"] },
            { text: "Pay off debt",   pts: 10, aliases: ["debt","loans","pay bills","mortgage","student loans"] },
            { text: "Buy a car",      pts: 8,  aliases: ["car","new car","sports car","ferrari","lamborghini"] }
        ]
    },
    {
        q: "Name a reason people are late to work.",
        answers: [
            { text: "Traffic",      pts: 42, aliases: ["traffic jam","stuck in traffic","bad traffic"] },
            { text: "Overslept",    pts: 28, aliases: ["slept in","alarm didn't go off","missed alarm","sleep","couldn't wake up"] },
            { text: "Car trouble",  pts: 14, aliases: ["car broke down","flat tire","car problems","car died"] },
            { text: "Kids",         pts: 10, aliases: ["children","kid","school drop off","getting kids ready"] },
            { text: "Bad weather",  pts: 6,  aliases: ["weather","rain","snow","storm"] }
        ]
    },
    {
        q: "Name something you find under the couch cushions.",
        answers: [
            { text: "Coins",      pts: 40, aliases: ["change","money","quarters","pennies","cash","loose change"] },
            { text: "TV remote",  pts: 26, aliases: ["remote","remote control","clicker"] },
            { text: "Food crumbs",pts: 16, aliases: ["crumbs","food","chips","crackers","snacks"] },
            { text: "Socks",      pts: 10, aliases: ["sock"] },
            { text: "Keys",       pts: 8,  aliases: ["key","car keys","house keys"] }
        ]
    },
    {
        q: "Name something people brag about.",
        answers: [
            { text: "Their kids",      pts: 34, aliases: ["children","son","daughter","kid","grandkids"] },
            { text: "Their salary",    pts: 26, aliases: ["money","income","wealth","how much they make","raise","how rich they are"] },
            { text: "Their car",       pts: 18, aliases: ["car","vehicle","truck","sports car"] },
            { text: "Their looks",     pts: 14, aliases: ["appearance","looks","beauty","how they look","body","physique"] },
            { text: "Their job title", pts: 8,  aliases: ["job","work","career","profession","job title","position"] }
        ]
    },
    {
        q: "Name something you do at the beach.",
        answers: [
            { text: "Swim",            pts: 38, aliases: ["swimming","go swimming","swim in the ocean","go in the water"] },
            { text: "Sunbathe",        pts: 28, aliases: ["tan","lay out","get a tan","suntan","lie in the sun","relax in the sun"] },
            { text: "Build a sandcastle",pts: 16, aliases: ["sand castle","play in the sand","build sandcastles"] },
            { text: "Play volleyball", pts: 10, aliases: ["volleyball","beach volleyball"] },
            { text: "Collect shells",  pts: 8,  aliases: ["shells","shell collecting","pick up shells"] }
        ]
    },
    {
        q: "Name something people are afraid of.",
        answers: [
            { text: "Spiders", pts: 34, aliases: ["spider","arachnid"] },
            { text: "Heights", pts: 28, aliases: ["high places","falling","acrophobia","tall buildings"] },
            { text: "Snakes",  pts: 18, aliases: ["snake","serpent"] },
            { text: "The dark",pts: 12, aliases: ["dark","darkness","night","sleeping in the dark"] },
            { text: "Flying",  pts: 8,  aliases: ["planes","airplane","airplanes","air travel","being on a plane"] }
        ]
    },
    {
        q: "Name something kids beg their parents for.",
        answers: [
            { text: "A pet",         pts: 36, aliases: ["pet","dog","cat","puppy","kitten","hamster","fish"] },
            { text: "A phone",       pts: 28, aliases: ["cell phone","iphone","smartphone","mobile phone"] },
            { text: "Candy",         pts: 18, aliases: ["sweets","sugar","chocolate","treats","junk food"] },
            { text: "Money",         pts: 10, aliases: ["cash","allowance","spending money"] },
            { text: "A video game",  pts: 8,  aliases: ["video games","game","console","ps5","xbox","nintendo","switch"] }
        ]
    },
    {
        q: "Name a gift that's always appreciated.",
        answers: [
            { text: "Money or gift cards", pts: 38, aliases: ["money","cash","gift card","gift cards","visa gift card","amazon gift card"] },
            { text: "Food or treats",      pts: 24, aliases: ["food","chocolate","candy","treats","cookies","cake","sweets","basket"] },
            { text: "Flowers",             pts: 18, aliases: ["flower","bouquet","roses"] },
            { text: "Jewelry",             pts: 12, aliases: ["necklace","bracelet","earrings","ring","watch"] },
            { text: "Alcohol",             pts: 8,  aliases: ["wine","beer","liquor","bottle of wine","whiskey","champagne"] }
        ]
    },
    {
        q: "Name something you do while waiting in line.",
        answers: [
            { text: "Check your phone",pts: 44, aliases: ["phone","scroll phone","look at phone","use phone","go on phone","browse phone"] },
            { text: "People watch",    pts: 22, aliases: ["people watching","watch people","look around","observe people"] },
            { text: "Listen to music", pts: 16, aliases: ["music","headphones","earbuds","airpods","listen to podcast","podcast"] },
            { text: "Talk to someone", pts: 10, aliases: ["talk","chat","conversation","talk to a stranger","make conversation"] },
            { text: "Sigh and complain",pts: 8, aliases: ["complain","groan","sigh","moan","grumble","huff"] }
        ]
    },
    {
        q: "Name a reason couples argue.",
        answers: [
            { text: "Money",        pts: 36, aliases: ["finances","spending","bills","debt","financial"] },
            { text: "Chores",       pts: 26, aliases: ["housework","cleaning","dishes","laundry","cooking","not helping"] },
            { text: "Jealousy",     pts: 18, aliases: ["cheating","jealous","trust","infidelity","trust issues"] },
            { text: "Communication",pts: 12, aliases: ["not talking","ignoring","silent treatment","miscommunication"] },
            { text: "In-laws",      pts: 8,  aliases: ["family","parents","mother in law","father in law","his family","her family"] }
        ]
    },
    {
        q: "Name something in your car's glove compartment.",
        answers: [
            { text: "Registration",  pts: 40, aliases: ["car registration","vehicle registration","registration papers","reg"] },
            { text: "Insurance card",pts: 30, aliases: ["insurance","car insurance","proof of insurance"] },
            { text: "Napkins",       pts: 14, aliases: ["napkin","tissues","paper towels","paper"] },
            { text: "User manual",   pts: 10, aliases: ["manual","car manual","owners manual","book","guide"] },
            { text: "Pen",           pts: 6,  aliases: ["pens","pencil","writing utensil"] }
        ]
    },
    {
        q: "Name something that always seems to disappear in the house.",
        answers: [
            { text: "Socks",         pts: 40, aliases: ["sock","matching socks","one sock"] },
            { text: "TV remote",     pts: 24, aliases: ["remote","remote control","clicker","the remote"] },
            { text: "Keys",          pts: 18, aliases: ["key","car keys","house keys","my keys"] },
            { text: "Phone charger", pts: 12, aliases: ["charger","charging cable","cable","phone cable"] },
            { text: "Scissors",      pts: 6,  aliases: ["the scissors","scissor"] }
        ]
    },
    {
        q: "Name something people do to relax after a long day.",
        answers: [
            { text: "Watch TV",          pts: 36, aliases: ["tv","television","netflix","streaming","watch netflix","watch movies","watch shows"] },
            { text: "Take a bath",       pts: 24, aliases: ["bath","shower","hot bath","take a shower","soak in the tub"] },
            { text: "Have a drink",      pts: 18, aliases: ["drink","alcohol","wine","beer","glass of wine","cocktail"] },
            { text: "Eat comfort food",  pts: 12, aliases: ["eat","food","dinner","snack","order food","eat something good"] },
            { text: "Exercise",          pts: 10, aliases: ["work out","workout","gym","run","yoga","go for a walk","walk"] }
        ]
    },
    {
        q: "Name something you always forget to buy at the grocery store.",
        answers: [
            { text: "Milk",        pts: 36, aliases: ["the milk","dairy","got milk"] },
            { text: "Eggs",        pts: 28, aliases: ["egg","a dozen eggs"] },
            { text: "Bread",       pts: 20, aliases: ["loaf of bread","a loaf","white bread"] },
            { text: "Butter",      pts: 10, aliases: ["margarine","spread"] },
            { text: "Toilet paper",pts: 6,  aliases: ["tp","toilet roll","tissue","paper towels","paper"] }
        ]
    },
    {
        q: "Name something people do at a family reunion.",
        answers: [
            { text: "Eat",             pts: 38, aliases: ["food","eat food","barbecue","bbq","cook out","cookout","have a meal","eat together"] },
            { text: "Take photos",     pts: 26, aliases: ["pictures","photos","take pictures","photograph","family photo"] },
            { text: "Play games",      pts: 18, aliases: ["games","activities","play","sports","volleyball"] },
            { text: "Catch up",        pts: 12, aliases: ["talk","chat","gossip","reconnect","socialize","catch up with family"] },
            { text: "Hug each other",  pts: 6,  aliases: ["hugs","hug","greet","embrace"] }
        ]
    }
];

// ── 3. GAME STATE ────────────────────────────
let gamePhase = "idle";
let currentRound = 0;
let currentQuestionIndex = -1;
let usedQuestions = [];
let activePlayer = 1;    
let faceoffWinner = 0;   
let strikes = 0;
let boardPoints = 0;
let scores = { p1: 0, p2: 0 };
let roundAnswers = [];   
let aiTimer = null;
let buzzLocked = false;
let buzzProcessed = false; 

// ── 4. HELPERS ───────────────────────────────
function isMyTurn() {
    if (gameMode === "online")   return activePlayer === myId;
    if (gameMode === "hotseat")  return true;
    return activePlayer === 1;
}

function canIBuzz() {
    if (gameMode === "online")  return true; 
    if (gameMode === "hotseat") return false; 
    return true; 
}

function isBotTurn(playerNum) {
    return (gameMode === "ai" && playerNum === 2) || 
           (gameMode === "online" && isHost && seats[playerNum - 1]?.type === "ai");
}

function getAiStats() {
    if (aiDifficulty === "hard") return { buzzMin: 600, buzzMax: 1500, faceoffAcc: 0.95, guessAcc: 0.90, guessMin: 800, guessMax: 1500, stealAcc: 0.85 };
    if (aiDifficulty === "easy") return { buzzMin: 2000, buzzMax: 3500, faceoffAcc: 0.50, guessAcc: 0.45, guessMin: 2000, guessMax: 3500, stealAcc: 0.35 };
    return { buzzMin: 1200, buzzMax: 3200, faceoffAcc: 0.80, guessAcc: 0.72, guessMin: 1400, guessMax: 2400, stealAcc: 0.65 };
}

function getPlayerName(id) { return id === 1 ? p1Name : p2Name; }
function otherPlayer(id)   { return id === 1 ? 2 : 1; }

function updateNames() {
    const t1 = document.getElementById("t1-name");
    const t2 = document.getElementById("t2-name");
    if(t1) t1.textContent = p1Name.toUpperCase();
    if(t2) t2.textContent = p2Name.toUpperCase();
}

// ── 5. ANSWER MATCHING ───────────────────────
const STOPWORDS = new Set(['a','an','the','to','at','in','on','of','for','and','or','with','is','are','was','my','your','their','its','some','any','all','be','by','from','do','go','get','have','has','give','take','make','use']);

function normalizeText(str) {
    return str.toLowerCase().replace(/['-]/g, ' ').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function getKeywords(str) {
    return normalizeText(str).split(' ').filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function matchAnswer(input, answers) {
    if (!input || !input.trim()) return -1;
    const normInput  = normalizeText(input);
    const inputKeys  = getKeywords(input);
    for (let i = 0; i < answers.length; i++) {
        if (answers[i].revealed) continue;
        const normAns = normalizeText(answers[i].text);
        const ansKeys = getKeywords(answers[i].text);
        if (normInput === normAns) return i;
        if (normAns.length > 3 && (normInput.includes(normAns) || normAns.includes(normInput))) return i;
        if (ansKeys.length > 0 && inputKeys.length > 0) {
            const overlap = inputKeys.filter(k => ansKeys.includes(k));
            if (overlap.length >= Math.min(ansKeys.length, inputKeys.length)) return i;
            if (ansKeys.length === 1 && overlap.length >= 1) return i;
        }
        if (answers[i].aliases) {
            for (const alias of answers[i].aliases) {
                const normAlias = normalizeText(alias);
                if (normInput === normAlias) return i;
                if (normAlias.length > 3 && (normInput.includes(normAlias) || normAlias.includes(normInput))) return i;
            }
        }
    }
    return -1;
}

// ── 6. RENDER ────────────────────────────────
function renderBoard() {
    for (let i = 0; i < 8; i++) {
        const tile    = document.getElementById(`tile-${i}`);
        if (!tile) continue;
        const tileAns = tile.querySelector('.t-ans');
        const tilePts = tile.querySelector('.t-pts');
        const tileNum = tile.querySelector('.t-num');
        if (i < roundAnswers.length) {
            tile.classList.remove('hidden');
            if (tileNum) tileNum.textContent  = i + 1;
            if (tileAns) tileAns.textContent  = roundAnswers[i].text.toUpperCase();
            if (tilePts) tilePts.textContent  = roundAnswers[i].pts;
            tile.classList.toggle('revealed', roundAnswers[i].revealed);
        } else {
            tile.classList.add('hidden');
            tile.classList.remove('revealed');
        }
    }
}

function renderStrikes() {
    for (let i = 0; i < 3; i++) {
        const box = document.getElementById(`s${i + 1}`);
        if (box) {
            box.classList.toggle('active', i < strikes);
            box.textContent = i < strikes ? '✗' : '';
        }
    }
}

function renderScores() {
    const t1pts = document.getElementById("t1-pts");
    const t2pts = document.getElementById("t2-pts");
    if (t1pts) t1pts.textContent = scores.p1;
    if (t2pts) t2pts.textContent = scores.p2;
    
    const team1 = document.getElementById("team1-block");
    const team2 = document.getElementById("team2-block");
    
    // Highlight based on current state (Face-off vs Answering)
    if (gamePhase === "faceoff") {
        if(team1) team1.classList.remove("active");
        if(team2) team2.classList.remove("active");
    } else {
        if(team1) team1.classList.toggle("active", activePlayer === 1);
        if(team2) team2.classList.toggle("active", activePlayer === 2);
    }
}

function setBoardPts(pts) { 
    const el = document.getElementById("board-pts-display");
    if (el) el.textContent = pts > 0 ? pts : "—"; 
}
function setPhaseTag(text)     { const el = document.getElementById("phase-tag"); if(el) el.textContent = text; }
function setQuestion(text)     { const el = document.getElementById("question-text"); if(el) el.textContent = text; }
function setActiveBanner(text) { const el = document.getElementById("active-team-banner"); if(el) el.textContent = text; }
function setRoundLabel(r)      { const el = document.getElementById("round-label"); if(el) el.textContent = `ROUND ${r} OF ${totalRounds}`; }
function showBuzzZone()  { const el = document.getElementById("buzz-zone"); if(el) el.classList.remove("hidden"); }
function hideBuzzZone()  { const el = document.getElementById("buzz-zone"); if(el) el.classList.add("hidden"); }
function showGuessZone() { const el = document.getElementById("guess-zone"); if(el) el.classList.remove("hidden"); }
function hideGuessZone() { const el = document.getElementById("guess-zone"); if(el) el.classList.add("hidden"); }
function showStartBtn()  { const el = document.getElementById("start-btn"); if(el) el.classList.remove("hidden"); }
function hideStartBtn()  { const el = document.getElementById("start-btn"); if(el) el.classList.add("hidden"); }

function showFlash(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1200);
}

function setGuessInputActive(active) {
    const input = document.getElementById("guess-input");
    const btn = document.getElementById("guess-btn");
    if (input) input.disabled = !active;
    if (btn) btn.disabled = !active;
    if (active && input) {
        input.value = "";
        input.focus();
    }
}

// ── 7. GAME FLOW ─────────────────────────────

function resetGame() {
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    gamePhase     = "idle";
    strikes       = 0;
    boardPoints   = 0;
    scores        = { p1: 0, p2: 0 };
    currentRound  = 0;
    usedQuestions = [];
    activePlayer  = 1;
    faceoffWinner = 0;
    buzzLocked    = false;
    buzzProcessed = false;
    roundAnswers  = [];
    renderStrikes();
    renderScores();
    setBoardPts(0);
    setPhaseTag("FACE-OFF");
    setQuestion("Ready to play? Press Start Game!");
    setRoundLabel(1);
    hideBuzzZone();
    hideGuessZone();
    showStartBtn();
    for (let i = 0; i < 8; i++) {
        const t = document.getElementById(`tile-${i}`);
        if (t) {
            t.classList.add('hidden');
            t.classList.remove('revealed');
        }
    }
    const modal = document.getElementById("game-over-modal");
    if (modal) modal.classList.add("hidden");
    const passBtn = document.getElementById("pass-btn");
    if (passBtn) passBtn.classList.add("hidden");
    const stealBtn = document.getElementById("steal-btn");
    if (stealBtn) stealBtn.classList.add("hidden");
    const guessRow = document.getElementById("guess-row");
    if (guessRow) guessRow.classList.remove("hidden");
    updateNames();
}

function startGame() {
    if (gameMode === "online" && !isHost) return;
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("feud");
    currentRound  = 0;
    scores        = { p1: 0, p2: 0 };
    usedQuestions = [];
    renderScores();
    hideStartBtn();
    startNextRound();
}

function startNextRound() {
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    currentRound++;
    strikes      = 0;
    boardPoints  = 0;
    activePlayer = 1;
    faceoffWinner = 0;
    buzzLocked   = false;
    buzzProcessed = false;
    setRoundLabel(currentRound);
    renderStrikes();
    setBoardPts(0);
    renderScores();
    
    if (isHost) {
        let available = QUESTIONS.map((_, i) => i).filter(i => !usedQuestions.includes(i));
        if (available.length === 0) { usedQuestions = []; available = QUESTIONS.map((_, i) => i); }
        currentQuestionIndex = available[Math.floor(Math.random() * available.length)];
        usedQuestions.push(currentQuestionIndex);
    }
    
    const q = QUESTIONS[currentQuestionIndex];
    roundAnswers = q.answers.map(a => ({ ...a, revealed: false }));
    setQuestion(q.q);
    renderBoard();
    startFaceoff();
    if (gameMode === "online") pushGameState();
}

// ── FACE-OFF ─────────────────────────────────
function startFaceoff() {
    gamePhase = "faceoff";
    setPhaseTag("FACE-OFF");
    hideGuessZone();
    const passBtn = document.getElementById("pass-btn");
    if (passBtn) passBtn.classList.add("hidden");
    const stealBtn = document.getElementById("steal-btn");
    if (stealBtn) stealBtn.classList.add("hidden");
    const guessRow = document.getElementById("guess-row");
    if (guessRow) guessRow.classList.remove("hidden");
    buzzLocked = false;
    buzzProcessed = false;
    setupBuzzZone();
    showBuzzZone();
    renderScores();
    if (isBotTurn(2)) {
        const stats = getAiStats();
        const delay = stats.buzzMin + Math.random() * (stats.buzzMax - stats.buzzMin);
        aiTimer = setTimeout(() => {
            if (gamePhase === "faceoff") {
                if (gameMode === "online") onlineBuzz(2); 
                else handleBuzz(2);
            }
        }, delay);
    }
}

function setupBuzzZone() {
    const buzzZone = document.getElementById("buzz-zone");
    if (!buzzZone) return;
    if (gameMode === "hotseat") {
        buzzZone.innerHTML = `
            <div style="display:flex;gap:10px;width:100%;">
                <button id="buzz-btn-p1" style="flex:1;padding:16px;background:linear-gradient(180deg,#f5c518,#c49a14);border:none;border-radius:10px;cursor:pointer;font-family:'Anton',sans-serif;font-size:1rem;letter-spacing:2px;color:#1a0e00;line-height:1.3;">
                    🔔 ${p1Name.toUpperCase()}<br><small style="font-size:0.6rem;opacity:0.7;letter-spacing:3px;">SPACE</small>
                </button>
                <button id="buzz-btn-p2" style="flex:1;padding:16px;background:linear-gradient(180deg,#e53030,#9e1414);border:none;border-radius:10px;cursor:pointer;font-family:'Anton',sans-serif;font-size:1rem;letter-spacing:2px;color:#fff;line-height:1.3;">
                    🔔 ${p2Name.toUpperCase()}<br><small style="font-size:0.6rem;opacity:0.7;letter-spacing:3px;">ENTER</small>
                </button>
            </div>
        `;
        const p1Btn = document.getElementById("buzz-btn-p1");
        const p2Btn = document.getElementById("buzz-btn-p2");
        if(p1Btn) p1Btn.onclick = () => handleBuzz(1);
        if(p2Btn) p2Btn.onclick = () => handleBuzz(2);
    } else {
        buzzZone.innerHTML = `
            <button id="buzz-btn">
                <span class="buzz-icon">🔔</span>
                <span class="buzz-label">BUZZ IN</span>
            </button>
            <div id="buzz-hint">Press <kbd>SPACE</kbd> to buzz in</div>
        `;
        const btn = document.getElementById("buzz-btn");
        if(btn) btn.onclick = () => {
            if (gameMode === "online") { onlineBuzz(myId); return; }
            handleBuzz(1);
        };
    }
}

function handleBuzz(player) {
    if (buzzLocked || gamePhase !== "faceoff") return;
    buzzLocked = true;
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    hideBuzzZone();
    faceoffWinner    = player;
    activePlayer     = player;
    gamePhase        = "faceoff-answering";
    SystemUI.playSound('click');
    if (isBotTurn(player)) {
        setPhaseTag("AI BUZZED IN!");
        setTimeout(() => aiAnswerFaceoff(player), 900);
    } else {
        const name = getPlayerName(player).toUpperCase();
        setPhaseTag(`${name} BUZZED IN!`);
        showFaceoffInput(player);
    }
    renderScores();
    if (gameMode === "online" && isHost) pushGameState();
}

function showFaceoffInput(player) {
    const name    = getPlayerName(player).toUpperCase();
    const canType = (gameMode === "online") ? (player === myId) : true;
    setActiveBanner(`${name} — WHAT'S YOUR ANSWER?`);
    showGuessZone();
    const passBtn = document.getElementById("pass-btn");
    if(passBtn) passBtn.classList.add("hidden");
    const stealBtn = document.getElementById("steal-btn");
    if(stealBtn) stealBtn.classList.add("hidden");
    setGuessInputActive(canType);
    if (!canType) setActiveBanner(`${name} IS ANSWERING...`);
}

function handleFaceoffGuess(input) {
    const matchIdx = matchAnswer(input, roundAnswers);
    if (matchIdx >= 0) {
        roundAnswers[matchIdx].revealed = true;
        boardPoints += roundAnswers[matchIdx].pts;
        setBoardPts(boardPoints);
        renderBoard();
        showFlash("correct-flash");
        SystemUI.playSound('win');
        faceoffWinner = activePlayer;
        goToPlayOrPass();
    } else {
        showFlash("wrong-flash");
        SystemUI.playSound('lose');
        if (activePlayer === faceoffWinner) {
            const other = otherPlayer(faceoffWinner);
            activePlayer = other;
            gamePhase    = "faceoff-answering";
            if (isBotTurn(other)) setTimeout(() => aiAnswerFaceoff(other), 800);
            else showFaceoffInput(other);
        } else {
            activePlayer = faceoffWinner;
            startPlaying();
        }
        if (gameMode === "online" && isHost) pushGameState();
    }
}

// ── PLAY OR PASS ─────────────────────────────
function goToPlayOrPass() {
    gamePhase = "play-or-pass";
    const winnerName = getPlayerName(faceoffWinner).toUpperCase();
    setPhaseTag("PLAY OR PASS?");
    setActiveBanner(`${winnerName} — PLAY OR PASS TO OPPONENT?`);
    showGuessZone();
    const guessRow = document.getElementById("guess-row");
    if(guessRow) guessRow.classList.add("hidden");     
    const passBtn = document.getElementById("pass-btn");
    if(passBtn) {
        passBtn.textContent = "PASS TO OPPONENT";
        passBtn.classList.remove("hidden");
        passBtn.onclick = () => { if (gamePhase === "play-or-pass") choosePass(); };
    }
    const playBtn = document.getElementById("steal-btn");
    if(playBtn) {
        playBtn.textContent  = "PLAY!";
        playBtn.style.cssText = "flex:1;background:linear-gradient(180deg,#22c55e,#16a34a);box-shadow:0 4px 18px rgba(34,197,94,0.4);animation:none;";
        playBtn.classList.remove("hidden");
        playBtn.onclick = () => { if (gamePhase === "play-or-pass") choosePlay(); };
    }
    const canChoose = (gameMode === "online") ? (faceoffWinner === myId) : (gameMode === "hotseat") ? true : (faceoffWinner === 1);
    if(passBtn) passBtn.disabled  = !canChoose;
    if(playBtn) playBtn.disabled = !canChoose;
    if (!canChoose && isBotTurn(faceoffWinner)) {
        setTimeout(() => {
            const remaining = roundAnswers.filter(a => !a.revealed).length;
            (remaining > 2) ? choosePlay() : (Math.random() < 0.35 ? choosePass() : choosePlay());
        }, 1200);
    }
    if (gameMode === "online" && isHost) pushGameState();
}

function choosePlay() {
    activePlayer = faceoffWinner;
    restoreAfterPlayOrPass();
    startPlaying();
    if (gameMode === "online" && isHost) pushGameState();
}

function choosePass() {
    activePlayer = otherPlayer(faceoffWinner);
    restoreAfterPlayOrPass();
    startPlaying();
    if (gameMode === "online" && isHost) pushGameState();
}

function restoreAfterPlayOrPass() {
    const guessRow = document.getElementById("guess-row");
    if(guessRow) guessRow.classList.remove("hidden");
    const passBtn = document.getElementById("pass-btn");
    if(passBtn) {
        passBtn.classList.add("hidden");
        passBtn.disabled = false;
    }
    const stealBtn = document.getElementById("steal-btn");
    if(stealBtn) {
        stealBtn.classList.add("hidden");
        stealBtn.textContent  = "⚡ STEAL!";
        stealBtn.style.cssText = "";
        stealBtn.onclick       = null;
        stealBtn.disabled      = false;
    }
}

// ── PLAYING ──────────────────────────────────
function startPlaying() {
    gamePhase = "playing";
    setPhaseTag("PLAYING");
    const name    = getPlayerName(activePlayer).toUpperCase();
    const canPlay = isMyTurn();
    setActiveBanner(`${name} IS PLAYING`);
    showGuessZone();
    const passBtn = document.getElementById("pass-btn");
    if(passBtn) passBtn.classList.add("hidden");
    const stealBtn = document.getElementById("steal-btn");
    if(stealBtn) stealBtn.classList.add("hidden");
    setGuessInputActive(canPlay);
    if (!canPlay) setActiveBanner(`⏳ ${name} IS GUESSING...`);
    renderScores();
    if (isBotTurn(activePlayer)) {
        setGuessInputActive(false);
        setActiveBanner("🤖 AI IS GUESSING...");
        scheduleAiGuess(activePlayer);
    }
}

function handleGuess(input) {
    if (gamePhase !== "playing" && gamePhase !== "faceoff-answering" && gamePhase !== "steal") return;
    
    // In Online mode, Guest's logic runs locally and then they broadcast the new state
    const matchIdx = matchAnswer(input, roundAnswers);
    if (matchIdx >= 0) {
        roundAnswers[matchIdx].revealed = true;
        boardPoints += roundAnswers[matchIdx].pts;
        setBoardPts(boardPoints);
        renderBoard();
        showFlash("correct-flash");
        SystemUI.playSound('win');
        const inputEl = document.getElementById("guess-input");
        if(inputEl) inputEl.value = "";
        
        const allRevealed = roundAnswers.every(a => a.revealed);
        if (allRevealed) { setTimeout(() => endRound(activePlayer), 800); return; }
        
        if (gameMode === "online") pushGameState();
        if (isBotTurn(activePlayer)) scheduleAiGuess(activePlayer);
    } else {
        strikes++;
        renderStrikes();
        showFlash("wrong-flash");
        showFlash("strike-flash");
        SystemUI.playSound('lose');
        const inputEl = document.getElementById("guess-input");
        if(inputEl) inputEl.value = "";
        
        if (strikes >= 3) { setTimeout(() => startSteal(), 1000); return; }
        
        if (gameMode === "online") pushGameState();
        if (isBotTurn(activePlayer)) scheduleAiGuess(activePlayer);
    }
}

// ── STEAL ─────────────────────────────────────
function startSteal() {
    gamePhase = "steal";
    const stealer     = otherPlayer(activePlayer);
    const stealerName = getPlayerName(stealer).toUpperCase();
    setPhaseTag("STEAL!");
    setActiveBanner(`${stealerName} — ONE GUESS TO STEAL!`);
    showGuessZone();
    const passBtn = document.getElementById("pass-btn");
    if(passBtn) passBtn.classList.add("hidden");
    const stealBtn = document.getElementById("steal-btn");
    if(stealBtn) stealBtn.classList.add("hidden");
    const canSteal = (gameMode === "online") ? (stealer === myId) : (gameMode === "hotseat") ? true : (stealer === 1);
    setGuessInputActive(canSteal);
    if (!canSteal) setActiveBanner(`🤖 AI ATTEMPTING STEAL...`);
    renderScores();
    if (gameMode === "online" && isHost) pushGameState();
    if (isBotTurn(stealer)) {
        setGuessInputActive(false);
        const stats = getAiStats();
        aiTimer = setTimeout(() => {
            const unrevealed = roundAnswers.filter(a => !a.revealed);
            if (unrevealed.length > 0 && Math.random() < stats.stealAcc) {
                const sorted = [...unrevealed].sort((a, b) => b.pts - a.pts);
                handleStealGuess(sorted[0].text, stealer);
            } else handleStealGuess("_no_match_", stealer);
        }, stats.guessMin + Math.random() * (stats.guessMax - stats.guessMin));
    }
}

function handleStealGuess(input, player) {
    const matchIdx = matchAnswer(input, roundAnswers);
    if (matchIdx >= 0) {
        roundAnswers[matchIdx].revealed = true;
        renderBoard();
        showFlash("correct-flash");
        SystemUI.playSound('win');
        setTimeout(() => endRound(player), 800);
    } else {
        showFlash("wrong-flash");
        showFlash("strike-flash");
        SystemUI.playSound('lose');
        setTimeout(() => endRound(activePlayer), 800);
    }
    if (gameMode === "online") pushGameState();
}

// ── ROUND / GAME END ─────────────────────────
function endRound(winner) {
    gamePhase = "roundover";
    roundAnswers.forEach(a => { a.revealed = true; });
    renderBoard();
    if (winner === 1) scores.p1 += boardPoints; else scores.p2 += boardPoints;
    renderScores();
    const wName = getPlayerName(winner).toUpperCase();
    setPhaseTag(`${wName} WINS THE ROUND!`);
    setActiveBanner(`+${boardPoints} POINTS FOR ${wName}!`);
    hideGuessZone();
    SystemUI.playSound('win');
    if (gameMode === "online" && isHost) pushGameState();
    setTimeout(() => { if (currentRound >= totalRounds) endGame(); else startNextRound(); }, 3200);
}

function endGame() {
    gamePhase = "gameover";
    const winner = scores.p1 > scores.p2 ? 1 : scores.p2 > scores.p1 ? 2 : 0;
    const wName  = winner === 0 ? "TIE" : getPlayerName(winner);
    const emoji = document.getElementById("game-over-emoji");
    if(emoji) emoji.textContent = winner === 0 ? "🤝" : "🏆";
    const title = document.getElementById("game-over-title");
    if(title) title.textContent = winner === 0 ? "IT'S A TIE!" : `${wName.toUpperCase()} WINS!`;
    const msg = document.getElementById("game-over-msg");
    if(msg) msg.textContent   = `${p1Name}: ${scores.p1} pts  —  ${p2Name}: ${scores.p2} pts`;
    const modal = document.getElementById("game-over-modal");
    if(modal) modal.classList.remove("hidden");
    SystemUI.playSound(winner === 1 ? 'win' : 'lose');
    if (typeof SystemStats !== 'undefined') {
        if (winner === 1) SystemStats.recordWin("feud", 0); else if (winner === 2) SystemStats.recordLoss("feud");
    }
    if (gameMode === "online" && isHost && window.db) {
        window.dbUpdate(window.dbRef(window.db, 'feud_rooms/' + currentRoomId), { status: "finished", winner: wName });
    }
}

// ── AI BRAIN ──────────────────────────────
function scheduleAiGuess(player) {
    if (gamePhase !== "playing" || !isBotTurn(player)) return;
    if (aiTimer) clearTimeout(aiTimer);
    const stats = getAiStats();
    aiTimer = setTimeout(() => {
        if (gamePhase !== "playing" || !isBotTurn(player)) return;
        const unrevealed = roundAnswers.filter(a => !a.revealed);
        if (unrevealed.length === 0) return;
        const sorted    = [...unrevealed].sort((a, b) => b.pts - a.pts);
        const aiSuccess = Math.random() < stats.guessAcc;
        handleGuess(aiSuccess ? sorted[0].text : "_no_match_");
    }, stats.guessMin + Math.random() * (stats.guessMax - stats.guessMin));
}

function aiAnswerFaceoff(player) {
    const unrevealed = roundAnswers.filter(a => !a.revealed);
    if (unrevealed.length === 0) return;
    const stats = getAiStats();
    const topAnswer  = unrevealed.reduce((best, cur) => cur.pts > best.pts ? cur : best, unrevealed[0]);
    const aiSuccess  = Math.random() < stats.faceoffAcc;
    setTimeout(() => { handleFaceoffGuess(aiSuccess ? topAnswer.text : "_no_match_"); }, 600);
}

// ── 9. EVENT LISTENERS ───────────────────────
const startBtn = document.getElementById("start-btn");
if(startBtn) startBtn.addEventListener("click", startGame);

const guessBtn = document.getElementById("guess-btn");
if(guessBtn) guessBtn.addEventListener("click", () => {
    const input = document.getElementById("guess-input");
    const val = input ? input.value.trim() : "";
    if (!val) return;
    if (gamePhase === "faceoff-answering") handleFaceoffGuess(val);
    else if (gamePhase === "playing") handleGuess(val);
    else if (gamePhase === "steal") handleStealGuess(val, otherPlayer(activePlayer));
});

const guessInput = document.getElementById("guess-input");
if(guessInput) guessInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); const btn = document.getElementById("guess-btn"); if(btn) btn.click(); } });

const playAgain = document.getElementById("btn-play-again");
if(playAgain) playAgain.addEventListener("click", () => {
    const modal = document.getElementById("game-over-modal");
    if(modal) modal.classList.add("hidden");
    resetGame();
    if (gameMode === "ai" || gameMode === "hotseat") startGame();
    else {
        showStartBtn();
        const btn = document.getElementById("start-btn");
        if (isHost) { if(btn) btn.disabled = false; }
        else { if(btn) { btn.innerText = "Waiting for Host..."; btn.disabled = true; } }
    }
});

document.addEventListener("keydown", e => {
    if (gamePhase !== "faceoff") return;
    if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        if (gameMode === "online")  { onlineBuzz(myId); return; }
        handleBuzz(1);
    }
    if (e.key === "Enter" && gameMode === "hotseat") { if (document.activeElement.tagName === "BUTTON") return; e.preventDefault(); handleBuzz(2); }
});

window.addEventListener("beforeunload", () => { if (isHost && currentRoomId && gameMode === "online") window.dbSet(window.dbRef(window.db, `feud_rooms/${currentRoomId}`), null); });