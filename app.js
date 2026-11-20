// Archipelago Games Library - Frontend
import * as UI from './archipelago-ui.js';

const DISCORD_CLIENT_ID = '1517486577381806231';
// Cloudflare worker: Discord login, favorites/votes and the online counter (worker/ in this repo).
// On localhost the site talks to `wrangler dev` instead.
const WORKER_URL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? 'http://localhost:8787'
    : 'https://archipelago-games-library-auth.lellone-ciao.workers.dev';
const DISCORD_WORKER_CALLBACK = 'https://archipelago-games-library-auth.lellone-ciao.workers.dev/discord/callback';

const LINK_ICONS = { github: 'icons/github-logo.png', discord: 'icons/discord-logo.png', archipelago: 'icons/archipelago-logo.png' };
const CORE_ICON = 'icons/archipelago-logo.png';

// State
let allGames = [];
let displayedGames = [];
let showAdultContent = false;
let currentUser = null;
let userFavorites = [];
let userVotes = [];
let voteCounts = {};
let activeFilter = 'all';
let modalGame = null;

// DOM Elements
const $ = (id) => document.getElementById(id);
const searchInput = $('searchInput');
const view = document.getElementById('view-games');
const searchBox = view.querySelector('.search-box');
const sortSelect = $('sortSelect');
const gamesGrid = $('gamesGrid');
const gameCount = $('gameCount');
const filterChips = $('filterChips');
const adultContentToggle = $('adultContentToggle');
const ageVerificationModal = $('ageVerificationModal');
const gameModal = $('gameModal');
const afterDarkButton = document.querySelector('.discord-button.after-dark');
const toast = $('toast');

// Fill every [data-ico] placeholder with its inline SVG
function fillIcons(root = document) {
    root.querySelectorAll('[data-ico]').forEach(el => {
        const svg = UI.ICONS[el.dataset.ico];
        if (!svg) return;
        if (el.tagName === 'SPAN' && !el.childElementCount) el.outerHTML = svg;
        else { el.removeAttribute('data-ico'); el.insertAdjacentHTML('afterbegin', svg); }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    fillIcons();

    if (localStorage.getItem('showAdultContent') === 'true') {
        showAdultContent = true;
        adultContentToggle.checked = true;
    }
    updateAfterDarkButton();

    initAuth();
    initAuthUI();
    initPresence();
    renderSkeletons();

    try {
        const tasks = [loadGamesData(), loadVoteCounts()];
        if (currentUser) tasks.push(loadUserData());
        await Promise.all(tasks);
    } catch (error) {
        showError(error.message);
        console.error(error);
        return;
    }

    handleSearch();
    UI.enableCardTilt(gamesGrid);

    searchInput.addEventListener('input', () => {
        searchBox.classList.toggle('has-value', searchInput.value !== '');
        handleSearch();
    });
    view.querySelector('.search-clear').addEventListener('click', (e) => {
        e.preventDefault();
        searchInput.value = '';
        searchBox.classList.remove('has-value');
        searchInput.focus();
        handleSearch();
    });
    sortSelect.addEventListener('change', handleSearch);

    filterChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        setFilter(chip.dataset.filter);
    });

    gamesGrid.addEventListener('click', handleGridClick);

    adultContentToggle.addEventListener('change', handleAdultToggle);
    $('ageConfirmYes').addEventListener('click', confirmAge);
    $('ageConfirmNo').addEventListener('click', denyAge);
    $('ageClose').addEventListener('click', denyAge);
    ageVerificationModal.addEventListener('click', (e) => {
        if (e.target === ageVerificationModal) denyAge();
    });

    $('modalClose').addEventListener('click', closeModal);
    gameModal.addEventListener('click', (e) => {
        if (e.target === gameModal) closeModal();
    });
    gameModal.addEventListener('click', handleModalActionClick);

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (ageVerificationModal.classList.contains('active')) denyAge();
        else if (gameModal.classList.contains('active')) closeModal();
    });
});

// Load pre-built games data
async function loadGamesData() {
    const response = await fetch('data/games.json');
    if (!response.ok) throw new Error("games.json didn't respond. Try again in a moment.");

    const data = await response.json();
    allGames = data.games;
    $('navGameCount').textContent = allGames.length;
    $('adultCount').textContent = `${allGames.filter(isAfterDark).length} games`;

    if (data.generated) {
        const date = new Date(data.generated);
        $('lastUpdate').textContent =
            'Last update: ' + date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) + ', ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
}

function isGameNew(game) {
    return game.isNew === true;
}

function isAfterDark(game) {
    return game.isAdult === true;
}

// =====================
// +18 / AGE VERIFICATION
// =====================
function updateAfterDarkButton() {
    if (afterDarkButton) afterDarkButton.classList.toggle('hidden', !showAdultContent);
}

function handleAdultToggle() {
    if (adultContentToggle.checked) {
        if (!showAdultContent) openOverlay(ageVerificationModal);
    } else {
        setAdult(false);
    }
}

function setAdult(value, fromOtherView = false) {
    showAdultContent = value;
    localStorage.setItem('showAdultContent', String(value));
    adultContentToggle.checked = value;
    updateAfterDarkButton();
    handleSearch();
    // games and tools live on the same page: keep both +18 toggles in sync
    if (!fromOtherView) window.dispatchEvent(new CustomEvent('adult-change', { detail: { value, source: 'games' } }));
}
window.addEventListener('adult-change', (e) => {
    if (e.detail.source !== 'games' && e.detail.value !== showAdultContent) setAdult(e.detail.value, true);
});

function confirmAge() {
    closeOverlay(ageVerificationModal);
    setAdult(true);
}

function denyAge() {
    closeOverlay(ageVerificationModal);
    setAdult(false);
}

function openOverlay(overlay) {
    overlay.classList.add('active');
    document.body.classList.add('modal-open');
    const close = overlay.querySelector('.modal-close');
    if (close) close.focus();
}

function closeOverlay(overlay) {
    overlay.classList.remove('active');
    if (!document.querySelector('.modal-overlay.active')) document.body.classList.remove('modal-open');
}

// =====================
// FILTER / SORT / RENDER
// =====================
function getStatusPriority(status) {
    const statusLower = status ? status.toLowerCase() : '';
    if (statusLower.includes('broken')) return 6;
    if (statusLower.includes('unstable')) return 5;
    if (statusLower.includes('stable')) return 4;
    if (statusLower.includes('merged')) return 1;
    return 99;
}

const byDate = (g) => g.addedDate ? new Date(g.addedDate) : new Date(0);

function sortGames(games, sortOption) {
    const sorted = [...games];
    switch (sortOption) {
        case 'default':
            sorted.sort((a, b) => {
                // Favorites first (only when logged in), then new games
                const aFav = currentUser && userFavorites.includes(a.name);
                const bFav = currentUser && userFavorites.includes(b.name);
                if (aFav !== bFav) return aFav ? -1 : 1;
                if (isGameNew(a) !== isGameNew(b)) return isGameNew(a) ? -1 : 1;
                // new games: most recently added first
                if (isGameNew(a)) return (byDate(b) - byDate(a)) || a.name.localeCompare(b.name);
                return a.name.localeCompare(b.name);
            });
            break;
        case 'alpha-asc':
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'alpha-desc':
            sorted.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'status':
            sorted.sort((a, b) => {
                const diff = getStatusPriority(a.stability || a.status) - getStatusPriority(b.stability || b.status);
                return diff || a.name.localeCompare(b.name);
            });
            break;
        case 'date-newest':
            sorted.sort((a, b) => byDate(b) - byDate(a));
            break;
        case 'date-oldest':
            sorted.sort((a, b) => byDate(a) - byDate(b));
            break;
        case 'votes':
            sorted.sort((a, b) => {
                const diff = (voteCounts[gameKey(b.name)] || 0) - (voteCounts[gameKey(a.name)] || 0);
                return diff || a.name.localeCompare(b.name);
            });
            break;
    }
    return sorted;
}

function matchesFilter(game, filter) {
    if (filter === 'all') return true;
    if (filter === 'core') return game.prStatus === 'Core';
    if (filter === 'favorites') return userFavorites.includes(game.name);
    return (game.stability || game.status) === filter;
}

function setFilter(filter) {
    activeFilter = filter;
    filterChips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.filter === filter)));
    handleSearch();
}

function updateChipCounts(visible) {
    filterChips.querySelectorAll('.chip').forEach(chip => {
        chip.querySelector('.chip-count').textContent = visible.filter(g => matchesFilter(g, chip.dataset.filter)).length;
    });
    const favChip = filterChips.querySelector('[data-filter="favorites"]');
    favChip.classList.toggle('hidden', !currentUser);
    if (!currentUser && activeFilter === 'favorites') setFilter('all');
}

function normalizeText(text) {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function handleSearch() {
    const query = normalizeText(searchInput.value.trim());
    const visible = allGames.filter(game => showAdultContent || !isAfterDark(game));
    updateChipCounts(visible);

    const filtered = visible.filter(game =>
        (!query || normalizeText(game.name).includes(query)) && matchesFilter(game, activeFilter));

    displayedGames = sortGames(filtered, sortSelect.value);
    const count = displayedGames.length;
    gameCount.innerHTML = `<b>${count}</b> ${count === 1 ? 'game' : 'games'}`;
    renderGames();
}

function renderGames() {
    if (displayedGames.length === 0) {
        renderEmptyState();
        return;
    }
    gamesGrid.innerHTML = displayedGames.map((game, index) => UI.gameCardHTML(game, {
        favorited: currentUser && userFavorites.includes(game.name),
        voted: currentUser && userVotes.includes(game.name),
        votes: voteCounts[gameKey(game.name)] || 0,
        coreIcon: CORE_ICON,
        index
    })).join('');
    gamesGrid.querySelectorAll('img.game-cover').forEach(img => {
        img.addEventListener('error', () => img.classList.add('error'), { once: true });
    });
}

function renderSkeletons() {
    const sk = '<div class="skeleton-card"><div class="sk-cover"></div><div class="sk-line"></div><div class="sk-line short"></div></div>';
    gamesGrid.insertAdjacentHTML('beforeend', sk.repeat(10));
}

function renderEmptyState() {
    const q = searchInput.value.trim();
    const parts = [];
    if (q) parts.push(`Nothing matches “${UI.esc(q)}”.`);
    else parts.push('No games in this filter.');
    if (!showAdultContent) parts.push('18+ entries are hidden.');
    gamesGrid.innerHTML = `<div class="empty-state"><h3 class="state-title">No games found</h3><p>${parts.join(' ')}</p><button class="btn primary" type="button" id="clearAll">Clear search &amp; filters</button></div>`;
    $('clearAll').addEventListener('click', () => {
        searchInput.value = '';
        searchBox.classList.remove('has-value');
        sortSelect.value = 'default';
        setFilter('all');
    });
}

function showError(message) {
    gamesGrid.innerHTML = '';
    $('errorText').textContent = message;
    $('errorMessage').classList.remove('hidden');
}

function showToast(html, ms = 3200) {
    toast.innerHTML = html;
    toast.classList.add('show');
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => toast.classList.remove('show'), ms);
    const btn = toast.querySelector('.discord-login-btn');
    if (btn) btn.addEventListener('click', triggerDiscordLogin);
}

function askLogin() {
    showToast('Log in with Discord to vote and save favourites <button class="discord-login-btn" type="button"><img class="discord-icon" src="icons/discord-logo.png" alt="">Login</button>');
}

function handleGridClick(e) {
    const card = e.target.closest('.game-card');
    if (!card) return;
    const game = displayedGames[+card.dataset.index];
    if (!game) return;

    if (e.target.closest('.star-btn')) {
        e.stopPropagation();
        if (!currentUser) { askLogin(); return; }
        toggleFavorite(game.name);
        return;
    }
    if (e.target.closest('.thumbs-btn')) {
        e.stopPropagation();
        if (!currentUser) { askLogin(); return; }
        toggleVote(game.name);
        return;
    }
    openGameModal(game);
}

// =====================
// MODAL
// =====================
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

function renderLinkSection(sectionId, containerId, field, withPrimary) {
    const links = UI.validLinks(field);
    $(sectionId).hidden = links.length === 0;
    $(containerId).innerHTML = links.map((l, i) => UI.linkHTML(l, { primary: withPrimary && i === 0, icons: LINK_ICONS })).join('');
    return links;
}

function openGameModal(game) {
    modalGame = game;
    const stability = game.stability || game.status || '';
    const [cls, label, icon] = UI.statusOf(stability);

    $('modalTitle').textContent = game.name;
    $('modalPoster').src = game.coverPath || '';

    const row = $('modalStatusRow');
    row.classList.remove('border-green', 'border-yellow', 'border-red');
    row.classList.add(cls);
    $('modalStatus').innerHTML = UI.ICONS[icon] + UI.esc(label);

    const pr = $('modalPrStatus');
    pr.className = 'modal-pr-status';
    if (game.prStatus === 'Core') {
        pr.classList.add('pr-core');
        pr.innerHTML = `<img src="${CORE_ICON}" alt="">Core`;
        pr.classList.toggle('hidden', false);
    } else if (game.prStatus === 'Merged') {
        pr.classList.add('pr-merged');
        pr.innerHTML = UI.ICONS.merged + 'Merged';
        pr.classList.toggle('hidden', false);
    } else {
        pr.classList.toggle('hidden', true);
    }
    $('modalNew').classList.toggle('hidden', !isGameNew(game));
    $('modalAdult').classList.toggle('hidden', !isAfterDark(game));
    $('modalAdded').textContent = game.addedDate ? 'Added ' + fmtDate(game.addedDate) : '';

    const banner = $('modalBanner');
    banner.classList.remove('is-default', 'no-banner');
    banner.style.backgroundImage = game.bannerPath ? `url("${game.bannerPath}")` : '';
    if (!game.bannerPath) banner.classList.add('no-banner');
    else if (game.bannerPath.endsWith('_default.png')) banner.classList.add('is-default');

    $('factStatus').textContent = stability || '—';
    $('factPr').textContent = game.prStatus && game.prStatus !== '--' ? game.prStatus : '—';
    $('factAdded').textContent = fmtDate(game.addedDate);
    UI.fillAiDisclosure($('factAiRow'), $('factAiNote'), game.disclosures);
    const isDefault = p => !p || p.endsWith('_default.png');
    UI.fillArtworkLink($('artworkLink'), game.name, 'Game', isDefault(game.coverPath) || isDefault(game.bannerPath));

    const downloads = renderLinkSection('modalLinksSection', 'modalLinks', game.links, true);
    renderLinkSection('modalSetupSection', 'modalSetup', game.setupGuides, false);
    renderLinkSection('modalSupportSection', 'modalSupport', game.support, false);

    const notes = UI.notesHTML(game.notes);
    $('modalNotesSection').hidden = !notes;
    $('modalNotes').innerHTML = notes;

    // Mobile sticky footer: primary download + the two actions
    $('modalFooter').innerHTML = (downloads[0] ? UI.linkHTML(downloads[0], { primary: true, icons: LINK_ICONS }) : '') + $('modalActions').innerHTML;
    syncModalActions();

    gameModal.querySelector('.modal-scroll').scrollTop = 0;
    openOverlay(gameModal);
}

function syncModalActions() {
    if (!modalGame) return;
    const fav = !!currentUser && userFavorites.includes(modalGame.name);
    const voted = !!currentUser && userVotes.includes(modalGame.name);
    const votes = voteCounts[gameKey(modalGame.name)] || 0;
    gameModal.querySelectorAll('.modal-action.star-btn').forEach(b => {
        b.classList.toggle('favorited', fav);
        b.setAttribute('aria-pressed', String(fav));
    });
    gameModal.querySelectorAll('.modal-action.thumbs-btn').forEach(b => {
        b.classList.toggle('voted', voted);
        b.setAttribute('aria-pressed', String(voted));
        b.querySelector('.vote-count').textContent = votes;
    });
}

function handleModalActionClick(e) {
    const btn = e.target.closest('.modal-action');
    if (!btn || !modalGame) return;
    if (!currentUser) { askLogin(); return; }
    if (btn.classList.contains('star-btn')) toggleFavorite(modalGame.name);
    else toggleVote(modalGame.name);
}

function closeModal() {
    closeOverlay(gameModal);
    modalGame = null;
}

// =====================
// AUTH FUNCTIONS
// =====================
function initAuth() {
    const hash = window.location.hash;
    if (hash && hash.includes('discord_id=')) {
        const params = new URLSearchParams(hash.substring(1));
        const id = params.get('discord_id');
        const username = params.get('username');
        const avatar = params.get('avatar');
        const token = params.get('token');
        if (id && username && token) {
            localStorage.setItem('discord_user', JSON.stringify({ id, username, avatar, token }));
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    }
    if (hash && hash.includes('auth_error=')) {
        const params = new URLSearchParams(hash.substring(1));
        console.warn('Discord auth error:', params.get('auth_error'), params.get('detail'));
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    const stored = localStorage.getItem('discord_user');
    if (stored) {
        try { currentUser = JSON.parse(stored); } catch (e) { localStorage.removeItem('discord_user'); }
        // logins from before the move to Cloudflare have no token: ask for a fresh login
        if (currentUser && !currentUser.token) { localStorage.removeItem('discord_user'); currentUser = null; }
    }
}

function initAuthUI() {
    const loginBtn = $('discord-login-btn');
    const userInfo = $('user-info');

    document.body.classList.toggle('logged-out', !currentUser);
    if (currentUser) {
        loginBtn.style.display = 'none';
        userInfo.style.display = 'flex';
        $('user-name').textContent = currentUser.username;
        $('user-avatar').src = currentUser.avatar
            ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png?size=64`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(currentUser.id) % 6}.png`;
    } else {
        loginBtn.style.display = 'flex';
        userInfo.style.display = 'none';
    }
}

$('discord-login-btn').addEventListener('click', triggerDiscordLogin);
$('logout-btn').addEventListener('click', logout);
function logout() {
    localStorage.removeItem('discord_user');
    currentUser = null;
    userFavorites = [];
    userVotes = [];
    initAuthUI();
    handleSearch();
}

function triggerDiscordLogin() {
    const redirectUri = encodeURIComponent(DISCORD_WORKER_CALLBACK);
    window.location.href = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&scope=identify&redirect_uri=${redirectUri}`;
}

// =====================
// ONLINE COUNTER (WebSocket to the worker)
// =====================
function initPresence() {
    const counter = document.querySelector('.online-counter');
    if (!('WebSocket' in window)) { counter.style.display = 'none'; return; }
    let id = currentUser ? 'discord_' + currentUser.id : localStorage.getItem('archipelago_user_id');
    if (!id) {
        id = 'user_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now();
        localStorage.setItem('archipelago_user_id', id);
    }
    let retry = 1000, ping = 0;
    const connect = () => {
        const ws = new WebSocket(WORKER_URL.replace(/^http/, 'ws') + '/presence?id=' + encodeURIComponent(id));
        ws.onopen = () => { retry = 1000; ping = setInterval(() => ws.readyState === 1 && ws.send('ping'), 45000); };
        ws.onmessage = (e) => {
            if (e.data === 'pong') return;
            try { $('onlineCount').textContent = JSON.parse(e.data).online; } catch (err) { /* ignore */ }
        };
        ws.onclose = () => { clearInterval(ping); setTimeout(connect, retry); retry = Math.min(retry * 2, 60000); };
    };
    connect();
}

// =====================
// FAVORITES / VOTES (worker + D1)
// =====================
function gameKey(name) {
    return name;
}

async function api(path, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}) };
    if (currentUser) headers.Authorization = 'Bearer ' + currentUser.token;
    const res = await fetch(WORKER_URL + path, { ...options, headers });
    if (res.status === 401 && currentUser) { logout(); askLogin(); throw new Error('unauthorized'); }
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json();
}

async function loadVoteCounts() {
    try {
        voteCounts = (await api('/api/votes')).counts || {};
    } catch (e) {
        console.warn('Failed to load vote counts:', e.message);
    }
}

async function loadUserData() {
    try {
        const data = await api('/api/me');
        userFavorites = data.favorites || [];
        userVotes = data.votes || [];
    } catch (e) {
        console.warn('Failed to load user data:', e.message);
    }
}

// Update the card buttons for one game without re-rendering the grid
function updateCard(gameName) {
    const card = [...gamesGrid.querySelectorAll('.game-card')].find(c => c.dataset.name === gameName);
    if (card) {
        const fav = userFavorites.includes(gameName);
        const voted = userVotes.includes(gameName);
        const star = card.querySelector('.star-btn');
        const thumbs = card.querySelector('.thumbs-btn');
        star.classList.toggle('favorited', fav);
        star.setAttribute('aria-pressed', String(fav));
        thumbs.classList.toggle('voted', voted);
        thumbs.setAttribute('aria-pressed', String(voted));
        thumbs.querySelector('.vote-count').textContent = voteCounts[gameKey(gameName)] || 0;
    }
    syncModalActions();
}

async function toggleFavorite(gameName) {
    if (!currentUser) return;
    const isFav = userFavorites.includes(gameName);
    userFavorites = isFav ? userFavorites.filter(n => n !== gameName) : [...userFavorites, gameName];

    if (sortSelect.value === 'default' || activeFilter === 'favorites') handleSearch();
    else { updateCard(gameName); updateChipCounts(allGames.filter(g => showAdultContent || !isAfterDark(g))); }
    syncModalActions();

    try {
        await api('/api/toggle', { method: 'POST', body: JSON.stringify({ kind: 'favorite', game: gameName, on: !isFav }) });
    } catch (e) {
        console.warn('Failed to save favorite:', e.message);
    }
}

async function toggleVote(gameName) {
    if (!currentUser) return;
    const hasVoted = userVotes.includes(gameName);
    const key = gameKey(gameName);

    userVotes = hasVoted ? userVotes.filter(n => n !== gameName) : [...userVotes, gameName];
    voteCounts[key] = Math.max(0, (voteCounts[key] || 0) + (hasVoted ? -1 : 1));

    if (sortSelect.value === 'votes') handleSearch();
    else updateCard(gameName);
    syncModalActions();

    try {
        const { count } = await api('/api/toggle', { method: 'POST', body: JSON.stringify({ kind: 'vote', game: gameName, on: !hasVoted }) });
        if (typeof count === 'number' && count !== voteCounts[key]) { voteCounts[key] = count; updateCard(gameName); }
    } catch (e) {
        console.warn('Failed to save vote:', e.message);
    }
}
