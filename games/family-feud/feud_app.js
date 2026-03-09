// =============================================
// FAMILY FEUD — feud_app.js
// The Game Shack | Casino OS
// Modes: vs AI | Hotseat | Online
// =============================================

// ── 1. OS INIT ────────────────────────────────
let gameMode = localStorage.getItem("feud_mode") || "ai";
let totalRounds = parseInt(localStorage.getItem("feud_rounds") || "3");
let chatStarted = false;
let currentRoomId = null;
let myId = 1;
let isHost = false;

let p1Name = SystemUI.getPlayerName();
let p2Name = "AI";

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
        },
        {
            id: "sys-feud-rounds",
            options: [
                { value: "3", label: "3 Rounds" },
                { value: "5", label: "5 Rounds" },
                { value: "7", label: "7 Rounds" }
            ]
        }
    ]
});

setTimeout(() => {
    gameMode = document.getElementById("sys-feud-mode").value;
    totalRounds = parseInt(document.getElementById("sys-feud-rounds").value);
    updateNames();
    resetGame();
}, 10);

document.getElementById("sys-feud-mode").addEventListener("change", e => {
    gameMode = e.target.value;
    localStorage.setItem("feud_mode", gameMode);
    document.getElementById("sys-modal").classList.add("sys-hidden");
    if (gameMode === "online") {
        document.getElementById("multiplayer-lobby").classList.remove("hidden");
    } else {
        document.getElementById("multiplayer-lobby").classList.add("hidden");
        SystemUI.stopChat();
        chatStarted = false;
        updateNames();
        resetGame();
    }
});

document.getElementById("sys-feud-rounds").addEventListener("change", e => {
    totalRounds = parseInt(e.target.value);
    localStorage.setItem("feud_rounds", e.target.value);
});

// ── 2. QUESTION BANK ─────────────────────────
// Points per question sum to ~100
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
            { text: "Hangover",         pts: 32, aliases: ["drunk","drinking","hung over","party too hard"] },
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
// Phases: idle → faceoff → faceoff-answering → play-or-pass → playing → steal → roundover → gameover
let gamePhase = "idle";
let currentRound = 0;
let currentQuestionIndex = -1;
let usedQuestions = [];
let activePlayer = 1;    // who is playing the board (or answering the face-off)
let faceoffWinner = 0;   // who won the buzz-in
let strikes = 0;
let boardPoints = 0;
let scores = { p1: 0, p2: 0 };
let roundAnswers = [];   // current question's answers with .revealed status
let aiTimer = null;
let buzzLocked = false;
let buzzProcessed = false; // online only: prevent double-processing buzz

// ── 4. HELPERS ───────────────────────────────
function isMyTurn() {
    if (gameMode === "online")   return activePlayer === myId;
    if (gameMode === "hotseat")  return true;
    return activePlayer === 1;
}

function canIBuzz() {
    if (gameMode === "online")  return true; // both can buzz in online
    if (gameMode === "hotseat") return false; // hotseat uses separate buttons
    return true; // AI mode: player 1 buzzes
}

function getPlayerName(id) { return id === 1 ? p1Name : p2Name; }
function otherPlayer(id)   { return id === 1 ? 2 : 1; }

function updateNames() {
    if (gameMode === "ai")      p2Name = "AI";
    if (gameMode === "hotseat") p2Name = "PLAYER 2";
    document.getElementById("t1-name").textContent = p1Name.toUpperCase();
    document.getElementById("t2-name").textContent = p2Name.toUpperCase();
}

// ── 5. ANSWER MATCHING ───────────────────────
/*
 * Matching Strategy (most lenient → most strict):
 * 1. Exact match after normalization
 * 2. One string contains the other (handles "shower" → "take a shower")
 * 3. Keyword overlap (strips stopwords, checks shared meaningful words)
 * 4. Alias list per answer (hand-curated synonyms)
 */
const STOPWORDS = new Set([
    'a','an','the','to','at','in','on','of','for','and','or','with',
    'is','are','was','my','your','their','its','some','any','all','be',
    'by','from','do','go','get','have','has','give','take','make','use'
]);

function normalizeText(str) {
    return str.toLowerCase()
        .replace(/['-]/g, ' ')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
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

        // 1. Exact match
        if (normInput === normAns) return i;

        // 2. Contains match (only if the answer is specific enough)
        if (normAns.length > 3 && (normInput.includes(normAns) || normAns.includes(normInput))) return i;

        // 3. Keyword overlap
        if (ansKeys.length > 0 && inputKeys.length > 0) {
            const overlap = inputKeys.filter(k => ansKeys.includes(k));
            if (overlap.length >= Math.min(ansKeys.length, inputKeys.length)) return i;
            if (ansKeys.length === 1 && overlap.length >= 1) return i;
        }

        // 4. Aliases
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
        const tileAns = tile.querySelector('.t-ans');
        const tilePts = tile.querySelector('.t-pts');
        const tileNum = tile.querySelector('.t-num');

        if (i < roundAnswers.length) {
            tile.classList.remove('hidden');
            tileNum.textContent  = i + 1;
            tileAns.textContent  = roundAnswers[i].text.toUpperCase();
            tilePts.textContent  = roundAnswers[i].pts;
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
        box.classList.toggle('active', i < strikes);
        box.textContent = i < strikes ? '✗' : '';
    }
}

function renderScores() {
    document.getElementById("t1-pts").textContent = scores.p1;
    document.getElementById("t2-pts").textContent = scores.p2;
    document.getElementById("team1-block").classList.toggle("active", activePlayer === 1 && gamePhase === "playing");
    document.getElementById("team2-block").classList.toggle("active", activePlayer === 2 && gamePhase === "playing");
}

function setBoardPts(pts) {
    document.getElementById("board-pts-display").textContent = pts > 0 ? pts : "—";
}

function setPhaseTag(text)     { document.getElementById("phase-tag").textContent        = text; }
function setQuestion(text)     { document.getElementById("question-text").textContent    = text; }
function setActiveBanner(text) { document.getElementById("active-team-banner").textContent = text; }
function setRoundLabel(r)      { document.getElementById("round-label").textContent = `ROUND ${r} OF ${totalRounds}`; }

function showBuzzZone()  { document.getElementById("buzz-zone").classList.remove("hidden"); }
function hideBuzzZone()  { document.getElementById("buzz-zone").classList.add("hidden"); }
function showGuessZone() { document.getElementById("guess-zone").classList.remove("hidden"); }
function hideGuessZone() { document.getElementById("guess-zone").classList.add("hidden"); }
function showStartBtn()  { document.getElementById("start-btn").classList.remove("hidden"); }
function hideStartBtn()  { document.getElementById("start-btn").classList.add("hidden"); }

function showFlash(id) {
    const el = document.getElementById(id);
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1200);
}

function setGuessInputActive(active) {
    document.getElementById("guess-input").disabled  = !active;
    document.getElementById("guess-btn").disabled    = !active;
    if (active) {
        document.getElementById("guess-input").value = "";
        document.getElementById("guess-input").focus();
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
        t.classList.add('hidden');
        t.classList.remove('revealed');
    }

    document.getElementById("game-over-modal").classList.add("hidden");
    document.getElementById("pass-btn").classList.add("hidden");
    document.getElementById("steal-btn").classList.add("hidden");
    document.getElementById("guess-row").classList.remove("hidden");
    updateNames();
}

function startGame() {
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

    // Pick unused question
    let available = QUESTIONS.map((_, i) => i).filter(i => !usedQuestions.includes(i));
    if (available.length === 0) { usedQuestions = []; available = QUESTIONS.map((_, i) => i); }
    currentQuestionIndex = available[Math.floor(Math.random() * available.length)];
    usedQuestions.push(currentQuestionIndex);

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
    document.getElementById("pass-btn").classList.add("hidden");
    document.getElementById("steal-btn").classList.add("hidden");
    document.getElementById("guess-row").classList.remove("hidden");
    buzzLocked = false;
    buzzProcessed = false;
    setupBuzzZone();
    showBuzzZone();

    // AI gets a random reaction time — player must beat it to buzz in first
    if (gameMode === "ai") {
        const delay = 1200 + Math.random() * 2000;
        aiTimer = setTimeout(() => {
            if (gamePhase === "faceoff") handleBuzz(2);
        }, delay);
    }
}

function setupBuzzZone() {
    const buzzZone = document.getElementById("buzz-zone");
    if (gameMode === "hotseat") {
        buzzZone.innerHTML = `
            <div style="display:flex;gap:10px;width:100%;">
                <button id="buzz-btn-p1" style="flex:1;padding:16px;background:linear-gradient(180deg,#f5c518,#c49a14);border:none;border-radius:10px;cursor:pointer;font-family:'Anton',sans-serif;font-size:1rem;letter-spacing:2px;color:#1a0e00;line-height:1.3;">
                    🔔 ${p1Name.toUpperCase()}<br><small style="font-size:0.6rem;opacity:0.7;letter-spacing:3px;">SPACE</small>
                </button>
                <button id="buzz-btn-p2" style="flex:1;padding:16px;background:linear-gradient(180deg,#e53030,#9e1414);border:none;border-radius:10px;cursor:pointer;font-family:'Anton',sans-serif;font-size:1rem;letter-spacing:2px;color:#fff;line-height:1.3;">
                    🔔 PLAYER 2<br><small style="font-size:0.6rem;opacity:0.7;letter-spacing:3px;">ENTER</small>
                </button>
            </div>
        `;
        document.getElementById("buzz-btn-p1").onclick = () => handleBuzz(1);
        document.getElementById("buzz-btn-p2").onclick = () => handleBuzz(2);
    } else {
        buzzZone.innerHTML = `
            <button id="buzz-btn">
                <span class="buzz-icon">🔔</span>
                <span class="buzz-label">BUZZ IN</span>
            </button>
            <div id="buzz-hint">Press <kbd>SPACE</kbd> to buzz in</div>
        `;
        document.getElementById("buzz-btn").onclick = () => {
            if (gameMode === "online") { onlineBuzz(); return; }
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

    if (gameMode === "ai" && player === 2) {
        setPhaseTag("AI BUZZED IN!");
        setTimeout(() => aiAnswerFaceoff(), 900);
    } else {
        const name = getPlayerName(player).toUpperCase();
        setPhaseTag(`${name} BUZZED IN!`);
        showFaceoffInput(player);
    }

    if (gameMode === "online") pushGameState();
}

function showFaceoffInput(player) {
    const name    = getPlayerName(player).toUpperCase();
    const canType = (gameMode === "online") ? (player === myId) : true;

    setActiveBanner(`${name} — WHAT'S YOUR ANSWER?`);
    showGuessZone();
    document.getElementById("pass-btn").classList.add("hidden");
    document.getElementById("steal-btn").classList.add("hidden");
    setGuessInputActive(canType);

    if (!canType) {
        setActiveBanner(`${name} IS ANSWERING...`);
    }
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
            // Buzz winner was wrong → give other player a shot
            const other = otherPlayer(faceoffWinner);
            activePlayer = other;
            gamePhase    = "faceoff-answering";

            if (gameMode === "ai" && other === 2) {
                setTimeout(() => aiAnswerFaceoff(), 800);
            } else {
                showFaceoffInput(other);
            }
        } else {
            // Both players wrong → buzz winner plays by default
            activePlayer = faceoffWinner;
            startPlaying();
        }
        if (gameMode === "online") pushGameState();
    }
}

// ── PLAY OR PASS ─────────────────────────────
function goToPlayOrPass() {
    gamePhase = "play-or-pass";
    const winnerName = getPlayerName(faceoffWinner).toUpperCase();
    setPhaseTag("PLAY OR PASS?");
    setActiveBanner(`${winnerName} — PLAY OR PASS TO OPPONENT?`);

    showGuessZone();
    document.getElementById("guess-row").classList.add("hidden");     // hide the text input
    document.getElementById("pass-btn").textContent = "PASS TO OPPONENT";
    document.getElementById("pass-btn").classList.remove("hidden");

    // Repurpose steal-btn as the PLAY button during this phase
    const playBtn = document.getElementById("steal-btn");
    playBtn.textContent  = "PLAY!";
    playBtn.style.cssText = "flex:1;background:linear-gradient(180deg,#22c55e,#16a34a);box-shadow:0 4px 18px rgba(34,197,94,0.4);animation:none;";
    playBtn.classList.remove("hidden");
    playBtn.onclick = () => { if (gamePhase === "play-or-pass") choosePlay(); };
    document.getElementById("pass-btn").onclick = () => { if (gamePhase === "play-or-pass") choosePass(); };

    const canChoose = (gameMode === "online") ? (faceoffWinner === myId)
                    : (gameMode === "hotseat") ? true
                    : (faceoffWinner === 1);

    document.getElementById("pass-btn").disabled  = !canChoose;
    document.getElementById("steal-btn").disabled = !canChoose;

    if (!canChoose && gameMode === "ai" && faceoffWinner === 2) {
        setTimeout(() => {
            // AI tends to play if there are many answers left
            const remaining = roundAnswers.filter(a => !a.revealed).length;
            (remaining > 2) ? choosePlay() : (Math.random() < 0.35 ? choosePass() : choosePlay());
        }, 1200);
    }

    if (gameMode === "online") pushGameState();
}

function choosePlay() {
    activePlayer = faceoffWinner;
    restoreAfterPlayOrPass();
    startPlaying();
    if (gameMode === "online") pushGameState();
}

function choosePass() {
    activePlayer = otherPlayer(faceoffWinner);
    restoreAfterPlayOrPass();
    startPlaying();
    if (gameMode === "online") pushGameState();
}

function restoreAfterPlayOrPass() {
    document.getElementById("guess-row").classList.remove("hidden");
    document.getElementById("pass-btn").classList.add("hidden");

    // Restore steal-btn to its original style
    const stealBtn = document.getElementById("steal-btn");
    stealBtn.classList.add("hidden");
    stealBtn.textContent  = "⚡ STEAL!";
    stealBtn.style.cssText = "";
    stealBtn.onclick       = null;
    stealBtn.disabled      = false;
    document.getElementById("pass-btn").disabled = false;
}

// ── PLAYING ──────────────────────────────────
function startPlaying() {
    gamePhase = "playing";
    setPhaseTag("PLAYING");

    const name    = getPlayerName(activePlayer).toUpperCase();
    const canPlay = isMyTurn();

    setActiveBanner(`${name} IS PLAYING`);
    showGuessZone();
    document.getElementById("pass-btn").classList.add("hidden");
    document.getElementById("steal-btn").classList.add("hidden");
    setGuessInputActive(canPlay);

    if (!canPlay) setActiveBanner(`⏳ ${name} IS GUESSING...`);
    renderScores();

    if (gameMode === "ai" && activePlayer === 2) {
        setGuessInputActive(false);
        setActiveBanner("🤖 AI IS GUESSING...");
        scheduleAiGuess();
    }
}

function handleGuess(input) {
    if (gamePhase !== "playing") return;
    const matchIdx = matchAnswer(input, roundAnswers);

    if (matchIdx >= 0) {
        roundAnswers[matchIdx].revealed = true;
        boardPoints += roundAnswers[matchIdx].pts;
        setBoardPts(boardPoints);
        renderBoard();
        showFlash("correct-flash");
        SystemUI.playSound('win');
        document.getElementById("guess-input").value = "";

        const allRevealed = roundAnswers.every(a => a.revealed);
        if (allRevealed) { setTimeout(() => endRound(activePlayer), 800); return; }

        if (gameMode === "online") pushGameState();
        if (gameMode === "ai" && activePlayer === 2) scheduleAiGuess();

    } else {
        strikes++;
        renderStrikes();
        showFlash("wrong-flash");
        showFlash("strike-flash");
        SystemUI.playSound('lose');
        document.getElementById("guess-input").value = "";

        if (strikes >= 3) {
            setTimeout(() => startSteal(), 1000);
            return;
        }

        if (gameMode === "online") pushGameState();
        if (gameMode === "ai" && activePlayer === 2) scheduleAiGuess();
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
    document.getElementById("pass-btn").classList.add("hidden");
    document.getElementById("steal-btn").classList.add("hidden");

    const canSteal = (gameMode === "online") ? (stealer === myId)
                   : (gameMode === "hotseat") ? true
                   : (stealer === 1);

    setGuessInputActive(canSteal);
    if (!canSteal) setActiveBanner(`🤖 AI ATTEMPTING STEAL...`);

    if (gameMode === "online") pushGameState();

    if (gameMode === "ai" && stealer === 2) {
        setGuessInputActive(false);
        aiTimer = setTimeout(() => {
            const unrevealed = roundAnswers.filter(a => !a.revealed);
            if (unrevealed.length > 0 && Math.random() < 0.65) {
                const sorted = [...unrevealed].sort((a, b) => b.pts - a.pts);
                handleStealGuess(sorted[0].text, 2);
            } else {
                handleStealGuess("_no_match_", 2);
            }
        }, 1500 + Math.random() * 1000);
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

    if (winner === 1) scores.p1 += boardPoints;
    else              scores.p2 += boardPoints;
    renderScores();

    const wName = getPlayerName(winner).toUpperCase();
    setPhaseTag(`${wName} WINS THE ROUND!`);
    setActiveBanner(`+${boardPoints} POINTS FOR ${wName}!`);
    hideGuessZone();
    SystemUI.playSound('win');

    if (gameMode === "online") pushGameState();

    setTimeout(() => {
        if (currentRound >= totalRounds) endGame();
        else startNextRound();
    }, 3200);
}

function endGame() {
    gamePhase = "gameover";
    const winner = scores.p1 > scores.p2 ? 1 : scores.p2 > scores.p1 ? 2 : 0;
    const wName  = winner === 0 ? "TIE" : getPlayerName(winner);

    document.getElementById("game-over-emoji").textContent = winner === 0 ? "🤝" : "🏆";
    document.getElementById("game-over-title").textContent = winner === 0 ? "IT'S A TIE!" : `${wName.toUpperCase()} WINS!`;
    document.getElementById("game-over-msg").textContent   = `${p1Name}: ${scores.p1} pts  —  ${p2Name}: ${scores.p2} pts`;
    document.getElementById("game-over-modal").classList.remove("hidden");

    SystemUI.playSound(winner === 1 ? 'win' : 'lose');

    if (gameMode === "online") {
        window.dbUpdate(window.dbRef(window.db, 'feud_rooms/' + currentRoomId), {
            status: "finished", winner: wName
        });
    }
}

// ── 8. AI BRAIN ──────────────────────────────
/*
 * AI difficulty modeled via hit-rate probability:
 * Easy: 55% | Medium: 72% | Hard: 88%
 * Currently using a flat 72% (medium).
 * The AI never cheats — it picks the highest-value unrevealed answer,
 * but has a random chance of "missing" (submitting a non-matching guess).
 */
function scheduleAiGuess() {
    if (gamePhase !== "playing" || activePlayer !== 2) return;
    if (aiTimer) clearTimeout(aiTimer);

    aiTimer = setTimeout(() => {
        if (gamePhase !== "playing" || activePlayer !== 2) return;
        const unrevealed = roundAnswers.filter(a => !a.revealed);
        if (unrevealed.length === 0) return;

        const sorted    = [...unrevealed].sort((a, b) => b.pts - a.pts);
        const aiSuccess = Math.random() < 0.72;
        handleGuess(aiSuccess ? sorted[0].text : "_no_match_");
    }, 1400 + Math.random() * 1000);
}

function aiAnswerFaceoff() {
    // AI answers the face-off question with 80% accuracy
    const unrevealed = roundAnswers.filter(a => !a.revealed);
    if (unrevealed.length === 0) return;
    const topAnswer  = unrevealed.reduce((best, cur) => cur.pts > best.pts ? cur : best, unrevealed[0]);
    const aiSuccess  = Math.random() < 0.80;

    setTimeout(() => {
        handleFaceoffGuess(aiSuccess ? topAnswer.text : "_no_match_");
    }, 600);
}

// ── 9. EVENT LISTENERS ───────────────────────
document.getElementById("start-btn").addEventListener("click", startGame);

document.getElementById("guess-btn").addEventListener("click", () => {
    const val = document.getElementById("guess-input").value.trim();
    if (!val) return;

    if      (gamePhase === "faceoff-answering") handleFaceoffGuess(val);
    else if (gamePhase === "playing")           handleGuess(val);
    else if (gamePhase === "steal") {
        handleStealGuess(val, otherPlayer(activePlayer));
    }
});

document.getElementById("guess-input").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("guess-btn").click(); }
});

document.getElementById("btn-play-again").addEventListener("click", () => {
    document.getElementById("game-over-modal").classList.add("hidden");
    resetGame();
    if (gameMode === "ai" || gameMode === "hotseat") startGame();
    else {
        showStartBtn();
        if (isHost) document.getElementById("start-btn").disabled = false;
        else {
            document.getElementById("start-btn").innerText   = "Waiting for Host...";
            document.getElementById("start-btn").disabled    = true;
        }
    }
});

// Keyboard buzz: SPACE = P1, ENTER = P2 (hotseat only)
document.addEventListener("keydown", e => {
    if (gamePhase !== "faceoff") return;

    if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        if (gameMode === "online")  { onlineBuzz(); return; }
        if (gameMode === "hotseat") { handleBuzz(1); return; }
        handleBuzz(1);
    }

    if (e.key === "Enter" && gameMode === "hotseat") {
        // Don't intercept Enter when focus is on a button
        if (document.activeElement.tagName === "BUTTON") return;
        e.preventDefault();
        handleBuzz(2);
    }
});

// ── 10. FIREBASE ONLINE ──────────────────────
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
    isHost = true; myId = 1; chatStarted = false;

    window.dbSet(window.dbRef(window.db, 'feud_rooms/' + currentRoomId), {
        status: "waiting", players: 1, p1Name: p1Name, phase: "idle", buzzedBy: 0
    }).then(() => {
        document.getElementById("room-code-display").classList.remove("hidden");
        document.getElementById("host-room-id").innerText = currentRoomId;
        document.getElementById("btn-create-room").disabled = true;
        listenToRoom();
    });
});

document.getElementById("btn-join-room").addEventListener("click", () => {
    SystemUI.playSound('click');
    const code = document.getElementById("join-room-input").value.toUpperCase();

    window.dbGet(window.dbChild(window.dbRef(window.db), `feud_rooms/${code}`)).then(snapshot => {
        if (snapshot.exists() && snapshot.val().players === 1) {
            currentRoomId = code; isHost = false; myId = 2; chatStarted = false;
            window.dbUpdate(window.dbRef(window.db, 'feud_rooms/' + currentRoomId), {
                players: 2, p2Name: p1Name, status: "playing"
            });
            lobbyUI.classList.add("hidden");
            listenToRoom();
        } else {
            document.getElementById("lobby-error-msg").textContent = "Room not found or already full.";
        }
    });
});

function onlineBuzz() {
    // Atomic "first write wins" — Firebase last-write-wins but for casual play this is fine
    if (buzzLocked || gamePhase !== "faceoff") return;
    window.dbUpdate(window.dbRef(window.db, 'feud_rooms/' + currentRoomId), {
        buzzedBy: myId, buzzTime: Date.now()
    });
}

function listenToRoom() {
    let onlineGameStarted = false;
    window.dbOnValue(window.dbRef(window.db, 'feud_rooms/' + currentRoomId), snapshot => {
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
            p2Name = (myId === 1) ? (data.p2Name || "Opponent") : (data.p1Name || "Opponent");
            updateNames();
            if (isHost) { hideStartBtn(); startGame(); }
            else          hideStartBtn();
        }

        if (data.status === "playing" && onlineGameStarted) syncFromFirebase(data);
    });
}

function pushGameState() {
    if (gameMode !== "online") return;
    window.dbUpdate(window.dbRef(window.db, 'feud_rooms/' + currentRoomId), {
        phase:               gamePhase,
        currentRound:        currentRound,
        questionIndex:       currentQuestionIndex,
        activePlayer:        activePlayer,
        faceoffWinner:       faceoffWinner,
        strikes:             strikes,
        boardPoints:         boardPoints,
        revealedAnswers:     roundAnswers.map(a => a.revealed),
        scores:              scores,
        buzzedBy:            0,          // reset buzz after push
        status:              gamePhase === "gameover" ? "finished" : "playing"
    });
}

function syncFromFirebase(data) {
    if (!data) return;

    // Handle buzz-in: first client to write buzzedBy wins
    if (data.buzzedBy && data.buzzedBy !== 0 && gamePhase === "faceoff" && !buzzProcessed) {
        buzzProcessed = true;
        handleBuzz(data.buzzedBy);
        return;
    }

    // Sync question change (new round)
    if (data.questionIndex !== undefined && data.questionIndex !== currentQuestionIndex) {
        currentQuestionIndex = data.questionIndex;
        const q = QUESTIONS[currentQuestionIndex];
        roundAnswers = q.answers.map(a => ({ ...a, revealed: false }));
        setQuestion(q.q);
    }

    // Apply revealed answers
    if (data.revealedAnswers && roundAnswers.length > 0) {
        data.revealedAnswers.forEach((rev, i) => { if (roundAnswers[i]) roundAnswers[i].revealed = rev; });
    }

    // Sync numeric state
    if (data.currentRound !== undefined && data.currentRound !== currentRound) {
        currentRound = data.currentRound;
        setRoundLabel(currentRound);
    }
    if (data.strikes    !== undefined) { strikes = data.strikes;       renderStrikes(); }
    if (data.boardPoints!== undefined) { boardPoints = data.boardPoints; setBoardPts(boardPoints); }
    if (data.scores)                   { scores = data.scores;          renderScores(); }
    if (data.activePlayer  !== undefined) activePlayer  = data.activePlayer;
    if (data.faceoffWinner !== undefined) faceoffWinner = data.faceoffWinner;

    renderBoard();

    // Phase transition
    if (data.phase && data.phase !== gamePhase) {
        const prevPhase = gamePhase;
        gamePhase = data.phase;

        switch (gamePhase) {
            case "faceoff":
                buzzLocked = false; buzzProcessed = false;
                startFaceoff();
                break;
            case "faceoff-answering":
                hideBuzzZone();
                showFaceoffInput(activePlayer);
                break;
            case "play-or-pass":
                hideBuzzZone();
                goToPlayOrPass();
                break;
            case "playing":
                hideBuzzZone();
                startPlaying();
                break;
            case "steal":
                startSteal();
                break;
            case "roundover":
                hideGuessZone();
                setPhaseTag(`${getPlayerName(activePlayer).toUpperCase()} WINS THE ROUND!`);
                break;
            case "gameover":
                endGame();
                break;
        }
    }
}

document.getElementById("lobby-close-btn").addEventListener("click", () => lobbyUI.classList.add("hidden"));
document.getElementById("btn-cancel-lobby").addEventListener("click", () => {
    gameMode = "ai"; p2Name = "AI";
    document.getElementById("sys-feud-mode").value = "ai";
    localStorage.setItem("feud_mode", "ai");
    lobbyUI.classList.add("hidden");
    SystemUI.stopChat(); chatStarted = false;
    updateNames(); resetGame();
});

// ── BOOT ─────────────────────────────────────
resetGame();