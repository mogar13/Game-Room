// --- 1. HUB AUDIO ENGINE ---
const hubAudio = {
    click: new Audio('system/audio/click1.mp3'),
    win: new Audio('system/audio/win.ogg') 
};

function playHubSound(type) {
    if (!hubAudio[type]) return;
    hubAudio[type].currentTime = 0;
    hubAudio[type].play().catch(e => console.log("Audio blocked by browser."));
}

// Wire hub sounds to all static interactive elements (cards wired after fetch)
document.querySelectorAll('.hub-interactive').forEach(el => {
    el.addEventListener('click', () => playHubSound('click'));
});

// --- 2. PROFILE BANNER & DAILY BONUS (REFACTORED FOR CASINO OS 2.0) ---
const bonusBtn = document.getElementById("daily-bonus-btn");

function updateBonusUI() {
    // Failsafe in case modules aren't loaded
    if (!window.SystemProfile || !window.SystemRewards) return;

    // 1. Sync the HUD securely through the Profile API
    const profile = SystemProfile.getProfile();
    document.getElementById("display-player-name").innerText = profile.name;
    document.getElementById("display-player-money").innerText = profile.bankroll;

    // 2. Sync the XP & Level UI
    const levelBadge = document.getElementById("display-player-level");
    const titleText = document.getElementById("display-player-title");
    const xpFill = document.getElementById("xp-bar-fill");
    const xpText = document.getElementById("xp-text");
    
    if (levelBadge) levelBadge.innerText = `Lv.${profile.level}`;
    if (titleText) titleText.innerText = SystemProfile.getLevelTitle();

    if (xpFill && xpText) {
        // XP Math based on system_profile thresholds
        const thresholds = [0, 500, 2000, 5000, 10000, 25000];
        let nextLvlXP = thresholds[profile.level] || 25000; 
        let prevLvlXP = thresholds[profile.level - 1] || 0;

        let xpIntoLevel = profile.xp - prevLvlXP;
        let xpNeeded = nextLvlXP - prevLvlXP;
        let pct = (xpIntoLevel / xpNeeded) * 100;
        
        if (pct > 100) pct = 100;
        
        if (profile.level >= 6) {
            xpFill.style.width = `100%`;
            xpText.innerText = "MAX LEVEL";
        } else {
            xpFill.style.width = `${pct}%`;
            xpText.innerText = `${profile.xp} / ${nextLvlXP} XP`;
        }
    }

    // 3. Sync the Bonus Button state with the Rewards API
    const todayStr = SystemRewards.getTodayString();
    if (SystemRewards.data.lastClaim === todayStr) {
        bonusBtn.disabled = true;
        bonusBtn.innerText = "Claimed Today";
        bonusBtn.style.background = "#444";
        bonusBtn.style.color = "#888";
    } else {
        bonusBtn.disabled = false;
        bonusBtn.innerText = "Claim Daily Bonus";
        bonusBtn.style.background = "#2ecc71";
        bonusBtn.style.color = "#000";
    }
}

// Make globally available so system_rewards.js can trigger UI updates after claiming
window.updateBonusButton = updateBonusUI;

document.addEventListener("DOMContentLoaded", () => {
    updateBonusUI();
    
    // If the Event Emitter is ready, listen for future money changes
    if (window.SystemUI && typeof window.SystemUI.on === 'function') {
        window.SystemUI.on("money_changed", updateBonusUI);
    }
});

bonusBtn.addEventListener("click", () => {
    if (bonusBtn.disabled) return;
    playHubSound('click');
    if (window.SystemRewards) {
        // This will launch the new AAA reward modal
        SystemRewards.checkDailyLogin(); 
    }
});

// --- 3. THEME LOGIC ---
const savedTheme = localStorage.getItem('shack_theme') || 'default';

// Made global so the onclick attribute in HTML can find it
window.changeTheme = function(theme) {
  document.body.className = ''; 
  if (theme !== 'default') document.body.classList.add('theme-' + theme);
  localStorage.setItem('shack_theme', theme);
  const themeSelect = document.getElementById('theme-dropdown');
  if (themeSelect) themeSelect.value = theme;
};

changeTheme(savedTheme);

// --- 4. CAROUSEL, SEARCH & CATEGORY LOGIC ---
const searchInput = document.getElementById('game-search');
const prevBtn = document.getElementById('prev-page');
const nextBtn = document.getElementById('next-page');
const dotsContainer = document.getElementById('pagination-dots');
const grid = document.getElementById('game-grid');
const catBtns = document.querySelectorAll('.cat-btn');

let allCards = [];
let currentPage = parseInt(localStorage.getItem('hub_current_page')) || 1;
const itemsPerPage = 6;
let filteredCards = [];
let currentCategory = 'all';

function renderCarousel() {
    const totalPages = Math.ceil(filteredCards.length / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    localStorage.setItem('hub_current_page', currentPage);

    allCards.forEach(card => card.style.display = 'none');

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const visibleNow = filteredCards.slice(start, end);

    visibleNow.forEach(card => card.style.display = 'flex');

    // Show category headers only if at least one card in that category is visible on this page
    document.querySelectorAll('.cat-section-header').forEach(header => {
        const cat = header.dataset.cat;
        const hasVisible = visibleNow.some(card => card.dataset.cat === cat);
        header.style.display = hasVisible ? '' : 'none';
    });

    prevBtn.style.visibility = currentPage === 1 ? 'hidden' : 'visible';
    nextBtn.style.visibility = currentPage === totalPages ? 'hidden' : 'visible';

    dotsContainer.innerHTML = '';
    for(let i = 1; i <= totalPages; i++) {
        const dot = document.createElement('div');
        dot.className = `dot ${i === currentPage ? 'active' : ''}`;
        dot.onclick = () => { playHubSound('click'); currentPage = i; renderCarousel(); };
        dotsContainer.appendChild(dot);
    }
}

function applyFilters() {
    const term = searchInput.value.toLowerCase();
    filteredCards = allCards.filter(card => {
        const nameMatch = card.querySelector('h2').innerText.toLowerCase().includes(term);
        const tagsMatch = (card.dataset.name || "").includes(term);
        const searchMatch = nameMatch || tagsMatch;
        
        let catMatch = true;
        if (currentCategory !== 'all') {
            const badgesText = card.querySelector('.card-badges').innerText.toLowerCase();
            catMatch = badgesText.includes(currentCategory);
        }
        
        return searchMatch && catMatch;
    });
    currentPage = 1;
    renderCarousel();
}

if(searchInput) searchInput.addEventListener('input', applyFilters);

catBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        catBtns.forEach(b => b.classList.remove('active-cat'));
        e.target.classList.add('active-cat');
        currentCategory = e.target.dataset.filter;
        applyFilters();
    });
});

if(prevBtn) prevBtn.addEventListener('click', () => { currentPage--; renderCarousel(); });
if(nextBtn) nextBtn.addEventListener('click', () => { currentPage++; renderCarousel(); });

let touchStartX = 0;
let touchEndX = 0;
if(grid) {
    grid.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
    grid.addEventListener('touchend', e => { 
        touchEndX = e.changedTouches[0].screenX; 
        handleSwipe(); 
    }, {passive: true});
}

function handleSwipe() {
    const swipeThreshold = 50; 
    if (touchEndX < touchStartX - swipeThreshold) {
        if (currentPage < Math.ceil(filteredCards.length / itemsPerPage)) {
            playHubSound('click'); currentPage++; renderCarousel();
        }
    }
    if (touchEndX > touchStartX + swipeThreshold) {
        if (currentPage > 1) {
            playHubSound('click'); currentPage--; renderCarousel();
        }
    }
}

// --- 5. FAVORITES LOGIC ---
let favorites = JSON.parse(localStorage.getItem('hub_favorites')) || [];

function toggleFavorite(id, e) {
    e.preventDefault();
    e.stopPropagation();
    if (favorites.includes(id)) {
        favorites = favorites.filter(f => f !== id);
    } else {
        favorites.push(id);
    }
    localStorage.setItem('hub_favorites', JSON.stringify(favorites));
    renderFavorites();
    updateStarIcons();
}

function renderFavorites() {
    const bar = document.getElementById('favorites-bar');
    bar.innerHTML = '';
    if (favorites.length === 0) {
        bar.classList.add('hidden');
        return;
    }
    bar.classList.remove('hidden');
    favorites.forEach(id => {
        const card = allCards.find(c => c.dataset.id === id);
        if(card) {
            const iconUrl = card.querySelector('.card-icon').style.backgroundImage;
            const url = card.getAttribute('href');
            const name = card.querySelector('h2').innerText;
            const a = document.createElement('a');
            a.href = url;
            a.className = 'fav-shortcut hub-interactive';
            a.innerHTML = `<div class="fav-shortcut-icon" style="background-image: ${iconUrl}"></div><span>${name}</span>`;
            // Route through launch panel instead of direct iframe load
            a.addEventListener('click', (e) => {
                e.preventDefault();
                openLaunchPanel(card);
            });
            bar.appendChild(a);
        }
    });
}

function updateStarIcons() {
    allCards.forEach(card => {
        const id = card.dataset.id;
        const star = card.querySelector('.fav-btn');
        if(favorites.includes(id)) {
            star.innerHTML = '★';
            star.classList.add('is-fav');
        } else {
            star.innerHTML = '☆';
            star.classList.remove('is-fav');
        }
    });
}

// --- 6. TROPHY ROOM (ACHIEVEMENTS VIEWER) ---
const btnAchievements = document.getElementById("btn-achievements");
const modalAchievements = document.getElementById("achievements-modal");
const closeAchBtn = document.getElementById("close-ach-btn");
const achList = document.getElementById("ach-list");

function renderTrophyRoom() {
    if (!window.SystemAchievements) return;
    
    // Force a fresh sync from local storage
    if (typeof window.SystemAchievements.loadData === 'function') {
        window.SystemAchievements.loadData();
    }
    
    achList.innerHTML = "";
    const list = SystemAchievements.list;
    const unlockedIds = SystemAchievements.data.unlocked;
    
    let unlockedCount = 0;
    const totalCount = Object.keys(list).length;

    // Loop through every achievement in the system
    Object.keys(list).forEach(key => {
        const ach = list[key];
        const isUnlocked = unlockedIds.includes(key);
        if (isUnlocked) unlockedCount++;

        const card = document.createElement("div");
        card.className = `ach-card ${isUnlocked ? 'unlocked' : 'locked'}`;
        
        card.innerHTML = `
            <div class="ach-icon">${isUnlocked ? ach.icon : '🔒'}</div>
            <div class="ach-info">
                <div class="ach-title">${ach.name}</div>
                <div class="ach-desc">${ach.desc}</div>
                <div class="ach-rewards">
                    <span class="ach-rxp">+${ach.xp} XP</span>
                    <span class="ach-rmoney">+$${ach.chips}</span>
                </div>
            </div>
            ${isUnlocked ? '<div style="color: #f1c40f; font-size: 1.5rem; font-weight: bold;">✓</div>' : ''}
        `;
        achList.appendChild(card);
    });

    document.getElementById("ach-count").innerText = `${unlockedCount} / ${totalCount} Unlocked`;
}

if (btnAchievements) {
    btnAchievements.addEventListener("click", () => {
        playHubSound('click');
        renderTrophyRoom();
        modalAchievements.classList.remove("hidden");
    });
}

if (closeAchBtn) {
    closeAchBtn.addEventListener("click", () => {
        playHubSound('click');
        modalAchievements.classList.add("hidden");
    });
}

// --- 7. IFRAME GAME LOADER (message listener) ---
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'CASINO_OS_CLOSE_GAME') {
        
        // 🐛 MOBILE BUG FIX: Ensure the parent window also drops fullscreen
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(()=>{});
        } else if (document.webkitFullscreenElement) {
            document.webkitExitFullscreen().catch(()=>{});
        }

        const container = document.getElementById('os-game-container');
        const frame = document.getElementById('os-game-frame');

        // Hide the iframe and clear the source to stop the game processes
        // NOTE: save the URL BEFORE clearing frame.src — it will be '' immediately after
        const closingFrameUrl = frame.src || '';
        container.style.display = 'none';
        frame.src = '';

        // Force the Hub to re-read localStorage so stats & achievements from the iframe sync instantly
        if (window.SystemProfile) window.SystemProfile.loadData();
        if (window.SystemStats) window.SystemStats.loadData();
        if (window.SystemAchievements) window.SystemAchievements.loadData();

        // Update the Hub UI so new XP and Money instantly reflect
        if (typeof updateBonusUI === 'function') updateBonusUI();
        renderRecentlyPlayed();

        // Delete waiting rooms for the game that just closed so they never pile up in Firebase
        if (window.db && window.dbGet && window.dbRemove && window.dbRef) {
            const frameUrl = closingFrameUrl;
            const closingGame = rawGameData.find(g => frameUrl.includes(g.url.split('/').pop()));
            if (closingGame) {
                const roomsRef = window.dbRef(window.db, `${closingGame.id}_rooms`);
                window.dbGet(roomsRef).then(snap => {
                    const rooms = snap.val();
                    if (!rooms) return;
                    Object.keys(rooms).forEach(code => {
                        if (rooms[code].status === 'waiting') {
                            window.dbRemove(window.dbRef(window.db, `${closingGame.id}_rooms/${code}`));
                        }
                    });
                }).catch(() => {});
            }
        }
    }
});

// --- 8. PLAYER PROFILE PANEL ---
function openProfilePanel() {
    if (!window.SystemProfile || !window.SystemStats || !window.SystemAchievements) return;

    // Force sync before building the panel
    if (window.SystemProfile.loadData) window.SystemProfile.loadData();
    if (window.SystemStats.loadData) window.SystemStats.loadData();
    if (window.SystemAchievements.loadData) window.SystemAchievements.loadData();

    const profile = SystemProfile.getProfile();
    const globalStats = SystemStats.getStats();
    const unlockedAchs = SystemAchievements.data.unlocked;
    const achList = SystemAchievements.list;

    // Header
    document.getElementById('pp-name').innerText = profile.name;
    document.getElementById('pp-title').innerText = SystemProfile.getLevelTitle ? SystemProfile.getLevelTitle() : '';
    document.getElementById('pp-level').innerText = `Lv.${profile.level}`;
    document.getElementById('pp-money').innerText = `$${profile.bankroll.toLocaleString()}`;

    // XP bar
    const thresholds = [0, 500, 2000, 5000, 10000, 25000];
    const nextXP = thresholds[profile.level] || 25000;
    const prevXP = thresholds[profile.level - 1] || 0;
    const pct = profile.level >= 6 ? 100 : Math.min(100, ((profile.xp - prevXP) / (nextXP - prevXP)) * 100);
    document.getElementById('pp-xp-fill').style.width = pct + '%';
    document.getElementById('pp-xp-text').innerText = profile.level >= 6 ? 'MAX' : `${profile.xp} / ${nextXP} XP`;

    // Career stats
    const played = globalStats ? globalStats.gamesPlayed : 0;
    const wins   = globalStats ? globalStats.wins : 0;
    const losses = globalStats ? globalStats.losses : 0;
    const wr     = played > 0 ? Math.round((wins / played) * 100) + '%' : '—';
    document.getElementById('pp-played').innerText  = played;
    document.getElementById('pp-wins').innerText    = wins;
    document.getElementById('pp-losses').innerText  = losses;
    document.getElementById('pp-winrate').innerText = wr;

    // Achievements
    const achRow = document.getElementById('pp-ach-row');
    achRow.innerHTML = '';
    unlockedAchs.slice(0, 8).forEach(id => {
        const ach = achList[id];
        if (!ach) return;
        const span = document.createElement('span');
        span.className = 'pp-ach-icon';
        span.title = ach.name;
        span.innerText = ach.icon;
        achRow.appendChild(span);
    });
    document.getElementById('pp-ach-count').innerText =
        `${unlockedAchs.length} / ${Object.keys(achList).length} unlocked`;

    // Top games by wins
    const gamesData = SystemStats.data.games;
    const topGames = Object.entries(gamesData)
        .filter(([, s]) => s.gamesPlayed > 0)
        .sort(([, a], [, b]) => b.wins - a.wins)
        .slice(0, 5);

    const topGamesEl = document.getElementById('pp-top-games');
    topGamesEl.innerHTML = '';
    if (topGames.length === 0) {
        topGamesEl.innerHTML = '<div class="pp-no-games">No games played yet</div>';
    } else {
        topGames.forEach(([id, s]) => {
            const card = allCards.find(c => c.dataset.id === id);
            const name = card ? card.querySelector('h2').innerText : id;
            const row = document.createElement('div');
            row.className = 'pp-game-row';
            row.innerHTML = `
                <span class="pp-game-name">${name}</span>
                <span class="pp-game-stats">🏆 ${s.wins} &nbsp;·&nbsp; 🎮 ${s.gamesPlayed}</span>
            `;
            topGamesEl.appendChild(row);
        });
    }

    // Show panel
    document.getElementById('profile-panel-overlay').classList.remove('hidden');
    document.getElementById('profile-panel').classList.remove('hidden');
}

function closeProfilePanel() {
    document.getElementById('profile-panel-overlay').classList.add('hidden');
    document.getElementById('profile-panel').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
    const nameEl = document.getElementById('display-player-name');
    if (nameEl) nameEl.addEventListener('click', () => { playHubSound('click'); openProfilePanel(); });

    const closeBtn = document.getElementById('pp-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => { playHubSound('click'); closeProfilePanel(); });

    const overlay = document.getElementById('profile-panel-overlay');
    if (overlay) overlay.addEventListener('click', closeProfilePanel);
});

// --- 8. RECENTLY PLAYED ---
const RECENT_KEY = 'hub_recently_played';
const RECENT_MAX = 5;

function getRecentlyPlayed() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; }
    catch(e) { return []; }
}

function addRecentlyPlayed(gameId) {
    let recent = getRecentlyPlayed();
    recent = recent.filter(id => id !== gameId);
    recent.unshift(gameId);
    if (recent.length > RECENT_MAX) recent = recent.slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}

function renderRecentlyPlayed() {
    const bar = document.getElementById('recently-played-bar');
    if (!bar) return;
    const recent = getRecentlyPlayed();
    if (recent.length === 0) {
        bar.classList.add('hidden');
        return;
    }
    bar.classList.remove('hidden');
    const list = bar.querySelector('.rp-list');
    if (!list) return;
    list.innerHTML = '';
    recent.forEach(id => {
        const card = allCards.find(c => c.dataset.id === id);
        if (!card) return;
        const iconUrl = card.querySelector('.card-icon').style.backgroundImage;
        const url = card.getAttribute('href');
        const name = card.querySelector('h2').innerText;
        const chip = document.createElement('a');
        chip.href = url;
        chip.className = 'rp-chip hub-interactive';
        chip.dataset.recentId = id;
        chip.innerHTML = `<div class="rp-icon" style="background-image:${iconUrl}"></div><span>${name}</span>`;
        list.appendChild(chip);
    });
    // Wire rp chip clicks through the launch panel
    list.querySelectorAll('.rp-chip').forEach(chip => {
        chip.addEventListener('click', function(e) {
            e.preventDefault();
            const id = this.dataset.recentId;
            const card = allCards.find(c => c.dataset.id === id);
            if (card) openLaunchPanel(card);
        });
    });
}

// --- 9. LAUNCH PANEL ---
function launchGame(gameUrl) {
    const frame = document.getElementById('os-game-frame');
    const container = document.getElementById('os-game-container');
    frame.src = gameUrl;
    container.style.display = 'block';
}

function openLaunchPanel(cardEl) {
    playHubSound('click');
    const gameUrl  = cardEl.getAttribute('href');
    const gameName = cardEl.querySelector('h2').innerText;
    const iconStyle = cardEl.querySelector('.card-icon').style.backgroundImage;
    const hasOnline = cardEl.querySelector('.b-online') !== null;
    const gameId   = cardEl.dataset.id;

    // Build or reuse overlay
    let overlay = document.getElementById('launch-panel-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'launch-panel-overlay';
        document.body.appendChild(overlay);
    }

    const onlineBtn = hasOnline ? `
        <button class="lp-btn lp-btn-online" id="lp-btn-online">
            👥 Play Online
        </button>` : '';

    overlay.innerHTML = `
        <div class="lp-box">
            <button class="lp-close" id="lp-close">&times;</button>
            <div class="lp-icon" style="background-image:${iconStyle}"></div>
            <div class="lp-title">${gameName}</div>
            <div class="lp-buttons">
                <button class="lp-btn lp-btn-solo" id="lp-btn-solo">🎮 Solo / AI</button>
                ${onlineBtn}
            </div>
        </div>
    `;
    overlay.classList.remove('lp-hidden');

    document.getElementById('lp-close').addEventListener('click', () => {
        overlay.classList.add('lp-hidden');
    });
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.classList.add('lp-hidden');
    });

    document.getElementById('lp-btn-solo').addEventListener('click', () => {
        overlay.classList.add('lp-hidden');
        addRecentlyPlayed(gameId);
        launchGame(gameUrl);
    });

    if (hasOnline) {
        document.getElementById('lp-btn-online').addEventListener('click', () => {
            overlay.classList.add('lp-hidden');
            addRecentlyPlayed(gameId);
            launchGame(gameUrl + '?mode=online');
        });
    }
}

// --- 10. CARD GENERATION FROM games.json ---
let rawGameData = []; // Store raw json for the scanner

async function initCards() {
    let games = [];
    try {
        const res = await fetch('games.json');
        games = await res.json();
        rawGameData = games;
    } catch(e) {
        console.error('Game Shack: Failed to load games.json', e);
        return;
    }

    // Group games by category for Steam-style section headers
    const categoryLabels = {
        'board':  '🎲 Board Games',
        'casino': '🃏 Casino',
        'card':   '🂡 Card Games',
        'arcade': '🕹 Arcade'
    };
    const grouped = {};
    games.forEach(game => {
        const cat = game.category || 'board';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(game);
    });

    // Render each category group with a header
    Object.entries(grouped).forEach(([cat, catGames]) => {
        // Section header — sits outside the grid, spans full width
        const header = document.createElement('div');
        header.className = 'cat-section-header';
        header.dataset.cat = cat;
        header.innerText = categoryLabels[cat] || cat.toUpperCase();
        grid.appendChild(header);

        catGames.forEach(game => {
            const iconStyle = game.iconStyle ? ` ${game.iconStyle}` : '';
            const badgesHTML = game.badges.map(b => {
                const cls = b.includes('Online') ? 'b-online' : b.includes('Solo') ? 'b-solo' : '';
                return `<span class="badge ${cls}">${b}</span>`;
            }).join(' ');

            const stats = (window.SystemStats) ? window.SystemStats.getStats(game.id) : null;
            const wins   = stats ? stats.wins : 0;
            const played = stats ? stats.gamesPlayed : 0;

            const a = document.createElement('a');
            a.href = game.url;
            a.className = 'game-card hub-interactive';
            a.dataset.id = game.id;
            a.dataset.name = game.searchTags;
            a.dataset.cat = game.category;
            a.innerHTML = `
                <div class="fav-btn hub-interactive">☆</div>
                <div class="card-icon" style="background-image: url('${game.icon}');${iconStyle}"></div>
                <h2>${game.name}</h2>
                <div class="card-badges">${badgesHTML}</div>
                <div class="card-stats">
                    <span class="card-stat">🏆 ${wins}</span>
                    <span class="card-stat-sep">·</span>
                    <span class="card-stat">🎮 ${played}</span>
                </div>
                <div class="card-play-btn">▶ PLAY</div>
            `;
            grid.appendChild(a);
        });
    });

    // Rebuild allCards from the now-populated DOM
    allCards = Array.from(document.querySelectorAll('.game-card'));
    filteredCards = [...allCards];

    // Wire hub click sound to each new card
    allCards.forEach(card => {
        card.addEventListener('click', () => playHubSound('click'));
    });

    // Wire fav star buttons
    allCards.forEach(card => {
        const star = card.querySelector('.fav-btn');
        if (star) {
            star.addEventListener('click', (e) => toggleFavorite(card.dataset.id, e));
        }
    });

    // Wire card clicks to launch panel instead of direct iframe load
    allCards.forEach(card => {
        card.addEventListener('click', function(e) {
            e.preventDefault();
            openLaunchPanel(this);
        });
    });

    // Initial render
    renderFavorites();
    updateStarIcons();
    renderRecentlyPlayed();
    renderCarousel();
    
    // Boot the live multiplayer scanner after cards exist
    scanActiveMatches();
}

initCards();

// --- 11. LIVE MULTIPLAYER SCANNER ---
let activeMatchesListeners = [];

function scanActiveMatches() {
    // Only run if Firebase is connected
    if (typeof window.db === 'undefined' || typeof window.dbRef === 'undefined') return;

    const bar = document.getElementById('active-matches-bar');
    const list = bar.querySelector('.am-list');

    // Clean up old listeners
    activeMatchesListeners.forEach(off => off());
    activeMatchesListeners = [];

    // Filter down to only games that support online multiplayer
    const onlineGames = rawGameData.filter(g => g.badges.includes("👥 Online"));

    onlineGames.forEach(game => {
        const roomRef = window.dbRef(window.db, `${game.id}_rooms`);
        
        const listener = window.dbOnValue(roomRef, (snapshot) => {
            const rooms = snapshot.val();
            if (!rooms) {
                removeMatchesForGame(game.id);
                return;
            }

            // Collect every roomCode that is currently waiting and was created recently
            const TWO_HOURS = 2 * 60 * 60 * 1000;
            const now = Date.now();
            const waitingCodes = [];
            Object.keys(rooms).forEach(roomCode => {
                const roomData = rooms[roomCode];
                // Skip rooms older than 2 hours — they are ghosts from abandoned sessions
                if (roomData.createdAt && (now - roomData.createdAt) > TWO_HOURS) return;
                if (roomData.status === "waiting") {
                    waitingCodes.push(roomCode);
                    // Try to grab the host's name safely depending on how the game stores it
                    let hostName = "Player";
                    if (roomData.seats && roomData.seats[0]) hostName = roomData.seats[0].name;
                    else if (roomData.p1Name) hostName = roomData.p1Name;

                    upsertMatchChip(game, roomCode, hostName);
                }
            });

            if (waitingCodes.length === 0) {
                // No waiting rooms at all — remove all chips for this game
                removeMatchesForGame(game.id);
            } else {
                // Remove chips for rooms that used to be waiting but no longer are
                const list = document.querySelector('.am-list');
                const staleChips = list.querySelectorAll(`.am-chip[data-game-id="${game.id}"]`);
                staleChips.forEach(chip => {
                    if (!waitingCodes.includes(chip.dataset.roomCode)) {
                        chip.remove();
                    }
                });
                // Keep the bar visible as long as any chips remain
                const bar = document.getElementById('active-matches-bar');
                if (list.children.length === 0) bar.classList.add('hidden');
            }
        });
        
        activeMatchesListeners.push(listener);
    });
}

function upsertMatchChip(game, roomCode, hostName) {
    const list = document.querySelector('.am-list');
    const bar = document.getElementById('active-matches-bar');
    // Key by game + roomCode — one chip per open room, exactly as intended
    const chipId = `am-chip-${game.id}-${roomCode}`;

    let chip = document.getElementById(chipId);
    if (!chip) {
        chip = document.createElement('a');
        chip.id = chipId;
        chip.className = 'rp-chip am-chip hub-interactive';
        chip.dataset.gameId = game.id;
        chip.dataset.roomCode = roomCode;
        list.appendChild(chip);
        bar.classList.remove('hidden');
    }

    // Set innerHTML first, then onclick — so the handler is always on the final element
    chip.innerHTML = `
        <div class="rp-icon" style="background-image:url('${game.icon}')"></div>
        <span class="am-host">${hostName}</span>
        <span style="color:#aaa;"> — ${game.name}</span>
        <span class="am-join-tag">JOIN</span>
    `;

    chip.onclick = (e) => {
        e.preventDefault();
        playHubSound('win');
        addRecentlyPlayed(game.id);
        launchGame(`${game.url}?mode=online&join=${roomCode}`);
    };
}

function removeMatchesForGame(gameId) {
    const list = document.querySelector('.am-list');
    const bar = document.getElementById('active-matches-bar');
    
    const chips = list.querySelectorAll(`.am-chip[data-game-id="${gameId}"]`);
    chips.forEach(c => c.remove());
    
    if (list.children.length === 0) {
        bar.classList.add('hidden');
    }
}