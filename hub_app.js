// --- 1. HUB AUDIO ENGINE ---
const hubAudio = {
    click: new Audio('system/audio/confirmation_001.ogg'),
    win: new Audio('system/audio/win.ogg') 
};

function playHubSound(type) {
    if (!hubAudio[type]) return;
    hubAudio[type].currentTime = 0;
    hubAudio[type].play().catch(e => console.log("Audio blocked by browser."));
}

document.querySelectorAll('.hub-interactive').forEach(el => {
    el.addEventListener('click', () => playHubSound('click'));
});

// --- 2. PROFILE BANNER & DAILY BONUS ---
const bonusBtn = document.getElementById("daily-bonus-btn");
let bonusTimerInterval;

function updateBonusButton() {
    const lastClaim = localStorage.getItem("last_bonus_claim");
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000; // 24 hours in ms

    if (lastClaim && (now - parseInt(lastClaim)) < cooldown) {
        bonusBtn.disabled = true;
        const timeLeft = cooldown - (now - parseInt(lastClaim));
        
        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        bonusBtn.innerText = `Next in ${hours}h ${minutes}m`;

        if(!bonusTimerInterval) {
            bonusTimerInterval = setInterval(updateBonusButton, 60000);
        }
    } else {
        bonusBtn.disabled = false;
        bonusBtn.innerText = "Claim +$1,000";
        clearInterval(bonusTimerInterval);
        bonusTimerInterval = null;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const pName = localStorage.getItem("casino_player_name") || "Player";
    const pMoney = localStorage.getItem("blackjack_money") || "5000";
    document.getElementById("display-player-name").innerText = pName;
    document.getElementById("display-player-money").innerText = pMoney;
    updateBonusButton();
});

bonusBtn.addEventListener("click", () => {
    if (bonusBtn.disabled) return;
    
    playHubSound('win');
    
    let currentMoney = parseInt(localStorage.getItem("blackjack_money")) || 5000;
    currentMoney += 1000;
    localStorage.setItem("blackjack_money", currentMoney);
    document.getElementById("display-player-money").innerText = currentMoney;
    
    localStorage.setItem("last_bonus_claim", Date.now());
    updateBonusButton();
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
const allCards = Array.from(document.querySelectorAll('.game-card'));
const prevBtn = document.getElementById('prev-page');
const nextBtn = document.getElementById('next-page');
const dotsContainer = document.getElementById('pagination-dots');
const grid = document.getElementById('game-grid');
const catBtns = document.querySelectorAll('.cat-btn');

let currentPage = parseInt(localStorage.getItem('hub_current_page')) || 1;
const itemsPerPage = 6;
let filteredCards = [...allCards];
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

allCards.forEach(card => {
    const star = card.querySelector('.fav-btn');
    if (star) {
        star.addEventListener('click', (e) => toggleFavorite(card.dataset.id, e));
    }
});

renderFavorites();
updateStarIcons();
renderCarousel();