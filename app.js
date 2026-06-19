// Archipelago Games Library - Frontend

const DISCORD_CLIENT_ID = '1517486577381806231';
const DISCORD_WORKER_CALLBACK = 'https://archipelago-games-library-auth.lellone-ciao.workers.dev/discord/callback';
// ============================

const firebaseConfig = {
    apiKey: "AIzaSyCx61otmpsts6xwQoeDqs_Nv6tv70ncdxE",
    authDomain: "archipelago-games-library.firebaseapp.com",
    projectId: "archipelago-games-library",
    storageBucket: "archipelago-games-library.firebasestorage.app",
    messagingSenderId: "209146086324",
    appId: "1:209146086324:web:6935953023edad7eda28e1"
};
// ============================

const SUPABASE_URL = 'https://thcojeibhdywdohmfoxa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoY29qZWliaGR5d2RvaG1mb3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjY5NjQsImV4cCI6MjA5NzQ0Mjk2NH0.sxWuwRRp9uQrW9hiXFa0-CEIzLr99hHqLmXyyFgMZp8';
// ============================

try { firebase.initializeApp(firebaseConfig); } catch (e) { }
const db = firebase.firestore();

// State
let allGames = [];
let displayedGames = [];
let showAdultContent = false;
let currentUser = null;
let userFavorites = [];
let userVotes = [];
let voteCounts = {};

const ICON_STAR =      `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256"><path d="M239.18,97.26A16.38,16.38,0,0,0,224.92,86l-59-4.76L143.14,26.15a16.36,16.36,0,0,0-30.27,0L90.11,81.23,31.08,86a16.46,16.46,0,0,0-9.37,28.86l45,38.83L53,211.75a16.38,16.38,0,0,0,24.5,17.82L128,198.49l50.53,31.08A16.4,16.4,0,0,0,203,211.75l-13.76-58.07,45-38.83A16.43,16.43,0,0,0,239.18,97.26Zm-15.34,5.47-48.7,42a8,8,0,0,0-2.56,7.91l14.88,62.8a.37.37,0,0,1-.17.48c-.18.14-.23.11-.38,0l-54.72-33.65a8,8,0,0,0-8.38,0L69.09,215.94c-.15.09-.19.12-.38,0a.37.37,0,0,1-.17-.48l14.88-62.8a8,8,0,0,0-2.56-7.91l-48.7-42c-.12-.1-.23-.19-.13-.5s.18-.27.33-.29l63.92-5.16A8,8,0,0,0,103,91.86l24.62-59.61c.08-.17.11-.25.35-.25s.27.08.35.25L153,91.86a8,8,0,0,0,6.75,4.92l63.92,5.16c.15,0,.24,0,.33.29S224,102.63,223.84,102.73Z"/></svg>`;
const ICON_STAR_FILL = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256"><path d="M234.29,114.85l-45,38.83L203,211.75a16.4,16.4,0,0,1-24.5,17.82L128,198.49,77.47,229.57A16.4,16.4,0,0,1,53,211.75l13.76-58.07-45-38.83A16.46,16.46,0,0,1,31.08,86l59-4.76,22.76-55.08a16.36,16.36,0,0,1,30.27,0l22.75,55.08,59,4.76a16.46,16.46,0,0,1,9.37,28.86Z"/></svg>`;
const ICON_THUMBS =      `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256"><path d="M234,80.12A24,24,0,0,0,216,72H160V56a40,40,0,0,0-40-40,8,8,0,0,0-7.16,4.42L75.06,96H32a16,16,0,0,0-16,16v88a16,16,0,0,0,16,16H204a24,24,0,0,0,23.82-21l12-96A24,24,0,0,0,234,80.12ZM32,112H72v88H32ZM223.94,97l-12,96a8,8,0,0,1-7.94,7H88V105.89l36.71-73.43A24,24,0,0,1,144,56V80a8,8,0,0,0,8,8h64a8,8,0,0,1,7.94,9Z"/></svg>`;
const ICON_THUMBS_FILL = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256"><path d="M234,80.12A24,24,0,0,0,216,72H160V56a40,40,0,0,0-40-40,8,8,0,0,0-7.16,4.42L75.06,96H32a16,16,0,0,0-16,16v88a16,16,0,0,0,16,16H204a24,24,0,0,0,23.82-21l12-96A24,24,0,0,0,234,80.12ZM32,112H72v88H32Z"/></svg>`;

// DOM Elements
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const gamesGrid = document.getElementById('gamesGrid');
const gameCount = document.getElementById('gameCount');
const loadingMessage = document.getElementById('loadingMessage');
const errorMessage = document.getElementById('errorMessage');

// Modal Elements
const gameModal = document.getElementById('gameModal');
const modalBanner = document.getElementById('modalBanner');
const modalClose = document.getElementById('modalClose');
const modalTitle = document.getElementById('modalTitle');
const modalStatus = document.getElementById('modalStatus');
const modalPrStatus = document.getElementById('modalPrStatus');
const modalLinksSection = document.getElementById('modalLinksSection');
const modalLinks = document.getElementById('modalLinks');
const modalNotesSection = document.getElementById('modalNotesSection');
const modalNotes = document.getElementById('modalNotes');

// Age Verification Elements
const adultContentToggle = document.getElementById('adultContentToggle');
const ageVerificationModal = document.getElementById('ageVerificationModal');
const ageConfirmYes = document.getElementById('ageConfirmYes');
const ageConfirmNo = document.getElementById('ageConfirmNo');

// After Dark Discord button
const afterDarkButton = document.querySelector('.discord-button.after-dark');

// Update After Dark button visibility
function updateAfterDarkButton() {
    if (afterDarkButton) {
        if (showAdultContent) {
            afterDarkButton.classList.remove('hidden');
        } else {
            afterDarkButton.classList.add('hidden');
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Load adult content preference from localStorage
    const savedPreference = localStorage.getItem('showAdultContent');
    if (savedPreference === 'true') {
        showAdultContent = true;
        adultContentToggle.checked = true;
    }

    // Update After Dark button visibility on load
    updateAfterDarkButton();

    // Init Discord auth (parse URL hash callback, load user from localStorage)
    initAuth();
    // Init auth UI (login button or user info)
    initAuthUI();
    // Start Supabase presence tracking
    initPresence();

    try {
        const tasks = [loadGamesData(), loadVoteCounts()];
        if (currentUser) tasks.push(loadUserData(currentUser.id));
        await Promise.all(tasks);
    } catch (error) {
        showError('Error loading data: ' + error.message);
        console.error(error);
    }

    handleSearch();

    searchInput.addEventListener('input', handleSearch);
    sortSelect.addEventListener('change', handleSearch);

    // Adult content toggle event listener
    adultContentToggle.addEventListener('change', handleAdultToggle);

    // Age verification modal event listeners
    ageConfirmYes.addEventListener('click', confirmAge);
    ageConfirmNo.addEventListener('click', denyAge);
    ageVerificationModal.addEventListener('click', (e) => {
        if (e.target === ageVerificationModal) {
            denyAge();
        }
    });

    // Modal event listeners
    modalClose.addEventListener('click', closeModal);
    gameModal.addEventListener('click', (e) => {
        if (e.target === gameModal) {
            closeModal();
        }
    });
});

// Load pre-built games data
async function loadGamesData() {
    showLoading('Loading games...');

    try {
        const response = await fetch('data/games.json');
        if (!response.ok) {
            throw new Error('Unable to load game data');
        }

        const data = await response.json();
        allGames = data.games;

        console.log(`Loaded ${allGames.length} games`);
        console.log(`Generated: ${data.generated}`);

        // Show last update date
        if (data.generated) {
            const date = new Date(data.generated);
            document.getElementById('lastUpdate').textContent =
                'Last update: ' + date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) + ', ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }

        hideLoading();

    } catch (error) {
        hideLoading();
        throw error;
    }
}

// Check if game is new (added in last build)
function isGameNew(game) {
    return game.isNew === true;
}

// Check if game is After Dark (+18)
function isAfterDark(game) {
    return game.isAdult === true;
}

// Handle adult content toggle
function handleAdultToggle() {
    if (adultContentToggle.checked) {
        if (!showAdultContent) {
            openAgeVerificationModal();
        }
    } else {
        showAdultContent = false;
        localStorage.setItem('showAdultContent', 'false');
        updateAfterDarkButton();
        handleSearch();
    }
}

// Open age verification modal
function openAgeVerificationModal() {
    ageVerificationModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Close age verification modal
function closeAgeVerificationModal() {
    ageVerificationModal.classList.remove('active');
    document.body.style.overflow = '';
}

// Confirm age (Yes button)
function confirmAge() {
    showAdultContent = true;
    localStorage.setItem('showAdultContent', 'true');
    adultContentToggle.checked = true;
    updateAfterDarkButton();
    closeAgeVerificationModal();
    handleSearch();
}

// Deny age (No button)
function denyAge() {
    showAdultContent = false;
    localStorage.setItem('showAdultContent', 'false');
    adultContentToggle.checked = false;
    updateAfterDarkButton();
    closeAgeVerificationModal();
    handleSearch();
}

// Get status priority for sorting
function getStatusPriority(status) {
    const statusLower = status ? status.toLowerCase() : '';

    if (statusLower.includes('broken')) return 6;
    if (statusLower.includes('unstable')) return 5;
    if (statusLower.includes('stable')) return 4;
    if (statusLower.includes('merged')) return 1;

    return 99;
}

// Sort games based on selected option
function sortGames(games, sortOption) {
    const sorted = [...games];

    switch (sortOption) {
        case 'default':
            sorted.sort((a, b) => {
                // Favorites first (only when logged in)
                const aFav = currentUser && userFavorites.includes(a.name);
                const bFav = currentUser && userFavorites.includes(b.name);
                if (aFav && !bFav) return -1;
                if (!aFav && bFav) return 1;
                // Then new games first
                const aIsNew = isGameNew(a);
                const bIsNew = isGameNew(b);
                if (aIsNew && !bIsNew) return -1;
                if (!aIsNew && bIsNew) return 1;
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
                const priorityA = getStatusPriority(a.stability || a.status);
                const priorityB = getStatusPriority(b.stability || b.status);
                if (priorityA !== priorityB) return priorityA - priorityB;
                return a.name.localeCompare(b.name);
            });
            break;

        case 'date-newest':
            sorted.sort((a, b) => {
                const dateA = a.addedDate ? new Date(a.addedDate) : new Date(0);
                const dateB = b.addedDate ? new Date(b.addedDate) : new Date(0);
                return dateB - dateA;
            });
            break;

        case 'date-oldest':
            sorted.sort((a, b) => {
                const dateA = a.addedDate ? new Date(a.addedDate) : new Date(0);
                const dateB = b.addedDate ? new Date(b.addedDate) : new Date(0);
                return dateA - dateB;
            });
            break;

        case 'votes':
            sorted.sort((a, b) => {
                const votesA = voteCounts[gameKey(a.name)] || 0;
                const votesB = voteCounts[gameKey(b.name)] || 0;
                if (votesB !== votesA) return votesB - votesA;
                return a.name.localeCompare(b.name);
            });
            break;
    }

    return sorted;
}

// Render games grid
function renderGames() {
    gamesGrid.innerHTML = '';

    if (displayedGames.length === 0) {
        gamesGrid.innerHTML = '<div class="loading-message">No games found</div>';
        return;
    }

    displayedGames.forEach(game => {
        const card = createGameCard(game);
        gamesGrid.appendChild(card);
    });
}

// Get status border class based on stability
function getStatusBorderClass(status) {
    if (!status) return '';

    const statusLower = status.toLowerCase();

    if (statusLower.includes('unstable')) return 'border-yellow';
    if (statusLower.includes('broken')) return 'border-red';
    if (statusLower.includes('merged') ||
        statusLower.includes('stable')) {
        return 'border-green';
    }

    return '';
}

// Create game card
function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';

    const borderClass = getStatusBorderClass(game.stability || game.status);
    if (borderClass) {
        card.classList.add(borderClass);
    }

    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
        openGameModal(game);
    });
    card.title = 'Click to view details';

    const coverImg = game.coverPath
        ? `<img src="${game.coverPath}" alt="${escapeHtml(game.name)}" class="game-cover" onerror="this.className='game-cover error'; this.outerHTML='<div class=\\'game-cover error\\'>${escapeHtml(game.name)}</div>';">`
        : `<div class="game-cover error">${escapeHtml(game.name)}</div>`;

    // Build metadata - stability badge
    let metadata = '';
    const stability = game.stability || game.status;
    if (stability && stability !== 'Unknown') {
        const statusLower = stability.toLowerCase();
        metadata += `<span class="game-status" data-status="${statusLower}">${escapeHtml(stability)}</span>`;
    }

    // PR Status badge (only show Merged)
    const prStatus = game.prStatus || '';
    if (prStatus.toLowerCase() === 'merged') {
        metadata += `<span class="game-pr-status" data-pr-status="merged">${escapeHtml(prStatus)}</span>`;
    }

    const newBadge = isGameNew(game) ? '<div class="new-badge">NEW</div>' : '';
    const voteCount = voteCounts[gameKey(game.name)] || 0;

    card.innerHTML = `
        <div class="game-cover-wrapper">
            ${newBadge}
            ${coverImg}
        </div>
        <div class="game-info">
            <div class="game-title" title="${escapeHtml(game.name)}">${escapeHtml(game.name)}</div>
            <div class="game-meta">
                <div class="game-meta-badges">${metadata || 'Unknown'}</div>
                <div class="game-actions">
                    <div class="thumbs-area">
                        <button class="thumbs-btn">
                            <span class="icon-outline">${ICON_THUMBS}</span>
                            <span class="icon-fill">${ICON_THUMBS_FILL}</span>
                        </button>
                        <span class="vote-count">${voteCount > 0 ? voteCount : ''}</span>
                    </div>
                    <button class="star-btn">
                        <span class="icon-outline">${ICON_STAR}</span>
                        <span class="icon-fill">${ICON_STAR_FILL}</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    const starBtn = card.querySelector('.star-btn');
    const thumbsBtn = card.querySelector('.thumbs-btn');
    const voteCountSpan = card.querySelector('.vote-count');

    // Set data attributes via JS to avoid HTML escaping issues
    starBtn.dataset.game = game.name;
    thumbsBtn.dataset.game = game.name;

    updateStarBtn(starBtn, game.name);
    updateThumbsBtn(thumbsBtn, game.name);

    starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!currentUser) { triggerDiscordLogin(); return; }
        toggleFavorite(game.name);
    });

    thumbsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!currentUser) { triggerDiscordLogin(); return; }
        toggleVote(game.name, thumbsBtn, voteCountSpan);
    });

    return card;
}

// Normalize text for search (remove accents)
function normalizeText(text) {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

// Handle search and filtering
function handleSearch() {
    const query = normalizeText(searchInput.value.trim());
    const sortValue = sortSelect.value;

    let filtered = allGames.filter(game => {
        const normalizedName = normalizeText(game.name);
        const matchesSearch = !query || normalizedName.includes(query);

        if (!showAdultContent && isAfterDark(game)) {
            return false;
        }

        return matchesSearch;
    });

    displayedGames = sortGames(filtered, sortValue);

    updateGameCount();
    renderGames();
}

// Update game count
function updateGameCount() {
    const count = displayedGames.length;
    gameCount.textContent = `${count} ${count === 1 ? 'game' : 'games'}`;
}

// UI helpers
function showLoading(message) {
    loadingMessage.textContent = message;
    loadingMessage.style.display = 'block';
    gamesGrid.style.display = 'none';
}

function hideLoading() {
    loadingMessage.style.display = 'none';
    gamesGrid.style.display = 'grid';
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Modal Functions

// Get icon based on URL
function getIconForUrl(url) {
    if (url.includes('github.com') || url.includes('gitlab.')) {
        return '<img src="icons/github-logo.png" class="button-icon" alt="GitHub">';
    } else if (url.includes('discord.com') || url.includes('discord.gg')) {
        return '<img src="icons/discord-logo.png" class="button-icon" alt="Discord">';
    } else if (url.includes('archipelago.gg')) {
        return '<img src="icons/archipelago-logo.png" class="button-icon" alt="Archipelago">';
    }
    return '<span class="button-icon-text">&#128279;</span>';
}

// Parse download links from game.links field
function parseDownloadLinks(game) {
    const links = [];

    if (game.links && game.links.links && game.links.links.length > 0) {
        game.links.links.forEach(link => {
            if (link.url) {
                links.push({
                    label: link.text || 'Link',
                    url: link.url
                });
            }
        });
    }

    return links;
}

// Convert notes text with links to HTML
function formatNotesWithLinks(game) {
    if (!game.notes) return '';

    let notesText = '';
    let notesLinks = [];

    if (typeof game.notes === 'object') {
        notesText = game.notes.text || '';
        notesLinks = game.notes.links || [];
    } else if (typeof game.notes === 'string') {
        notesText = game.notes;
    }

    if (!notesText.trim()) return '';

    let formattedText = notesText;

    notesLinks.forEach(link => {
        let urlIndex = formattedText.indexOf(link.url);

        if (urlIndex === -1 && link.text && link.text !== link.url) {
            const linkTextIndex = formattedText.indexOf(link.text);
            if (linkTextIndex !== -1) {
                const clickableLink = `<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="note-link" title="${link.url}">${link.text}</a>`;
                formattedText = formattedText.replace(link.text, clickableLink);
                return;
            }
        }

        if (urlIndex !== -1) {
            const beforeUrl = formattedText.substring(Math.max(0, urlIndex - 100), urlIndex);

            const patterns = [
                /([^.!?\n]+):\s*$/,
                /\n([^\n]+)\s*$/,
                /([^.!?\n]+)\s+$/,
                /^(.+)$/
            ];
            let linkLabel = 'Link';
            let labelToRemove = '';
            let replaceWithNewline = false;

            for (const pattern of patterns) {
                const match = beforeUrl.match(pattern);
                if (match && match[1].trim().length > 0 && match[1].trim().length < 50) {
                    linkLabel = match[1].trim();
                    if (pattern === patterns[0]) {
                        labelToRemove = match[0];
                    } else if (pattern === patterns[1]) {
                        labelToRemove = match[1];
                        replaceWithNewline = true;
                    }
                    break;
                }
            }

            const clickableLink = `<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="note-link" title="${link.url}">${linkLabel}</a>`;

            if (labelToRemove) {
                if (replaceWithNewline) {
                    const textToReplace = labelToRemove + link.url;
                    const escapedText = textToReplace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const replacePattern = new RegExp(escapedText, 'g');
                    formattedText = formattedText.replace(replacePattern, '\n' + clickableLink);
                } else {
                    const labelAndUrl = labelToRemove + link.url;
                    formattedText = formattedText.replace(labelAndUrl, clickableLink);
                }
            } else {
                const urlPattern = new RegExp(link.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                formattedText = formattedText.replace(urlPattern, clickableLink);
            }
        }
    });

    formattedText = formattedText.replace(/\n/g, '<br>');

    return formattedText;
}


// Open game modal
async function openGameModal(game) {
    console.log('Opening modal for:', game.name);

    // Set title
    modalTitle.textContent = game.name;

    // Set stability status
    const stability = game.stability || game.status;
    if (stability) {
        modalStatus.textContent = stability;
        modalStatus.className = 'modal-status';
        modalStatus.style.display = '';

        const statusLower = stability.toLowerCase();
        if (statusLower.includes('unstable')) {
            modalStatus.style.background = 'rgba(255, 193, 7, 0.2)';
            modalStatus.style.color = '#ffc107';
            modalStatus.style.border = '1px solid rgba(255, 193, 7, 0.3)';
        } else if (statusLower.includes('broken')) {
            modalStatus.style.background = 'rgba(244, 67, 54, 0.2)';
            modalStatus.style.color = '#f44336';
            modalStatus.style.border = '1px solid rgba(244, 67, 54, 0.3)';
        } else {
            modalStatus.style.background = 'rgba(76, 175, 80, 0.2)';
            modalStatus.style.color = '#4caf50';
            modalStatus.style.border = '1px solid rgba(76, 175, 80, 0.3)';
        }
    } else {
        modalStatus.style.display = 'none';
    }

    // Set PR Status badge
    const prStatus = game.prStatus || '';
    if (modalPrStatus) {
        if (prStatus.toLowerCase() === 'merged') {
            modalPrStatus.textContent = prStatus;
            modalPrStatus.className = 'modal-pr-status';
            modalPrStatus.style.display = '';
            modalPrStatus.style.background = 'rgba(26, 159, 255, 0.2)';
            modalPrStatus.style.color = '#1a9fff';
            modalPrStatus.style.border = '1px solid rgba(26, 159, 255, 0.3)';
        } else {
            modalPrStatus.style.display = 'none';
        }
    }

    // Set banner from local file
    modalBanner.style.backgroundImage = '';
    modalBanner.classList.remove('no-banner');

    if (game.bannerPath) {
        modalBanner.style.backgroundImage = `url(${game.bannerPath})`;
    } else {
        modalBanner.classList.add('no-banner');
    }

    // Parse and display download links
    const downloadLinks = parseDownloadLinks(game);

    if (downloadLinks.length > 0) {
        modalLinks.innerHTML = '';
        downloadLinks.forEach(link => {
            const linkElement = document.createElement('a');
            linkElement.className = 'modal-link';
            linkElement.href = link.url;
            linkElement.target = '_blank';
            linkElement.rel = 'noopener noreferrer';

            const icon = getIconForUrl(link.url);
            linkElement.innerHTML = `${icon} ${escapeHtml(link.label)}`;
            linkElement.title = link.url;

            modalLinks.appendChild(linkElement);
        });
        modalLinksSection.style.display = 'block';
    } else {
        modalLinksSection.style.display = 'none';
    }

    // Display notes with inline clickable links
    const formattedNotes = formatNotesWithLinks(game);

    if (formattedNotes) {
        modalNotes.innerHTML = formattedNotes;
        modalNotesSection.style.display = 'block';
    } else {
        modalNotesSection.style.display = 'none';
    }

    // Show modal
    gameModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Close modal
function closeModal() {
    gameModal.classList.remove('active');
    document.body.style.overflow = '';
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
        if (id && username) {
            localStorage.setItem('discord_user', JSON.stringify({ id, username, avatar }));
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    }

    if (hash && hash.includes('auth_error=')) {
        const params = new URLSearchParams(hash.substring(1));
        console.warn('Discord auth error:', params.get('auth_error'));
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    const stored = localStorage.getItem('discord_user');
    if (stored) {
        try { currentUser = JSON.parse(stored); } catch (e) { localStorage.removeItem('discord_user'); }
    }
}

function initAuthUI() {
    const loginBtn = document.getElementById('discord-login-btn');
    const userInfo = document.getElementById('user-info');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');
    const logoutBtn = document.getElementById('logout-btn');

    if (currentUser) {
        loginBtn.style.display = 'none';
        userInfo.style.display = 'flex';
        userName.textContent = currentUser.username;
        userAvatar.src = currentUser.avatar
            ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png?size=64`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(currentUser.id) % 6}.png`;
    } else {
        loginBtn.style.display = 'flex';
        userInfo.style.display = 'none';
    }

    loginBtn.addEventListener('click', triggerDiscordLogin);
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('discord_user');
        currentUser = null;
        userFavorites = [];
        userVotes = [];
        initAuthUI();
        handleSearch();
    });
}

function triggerDiscordLogin() {
    if (!DISCORD_CLIENT_ID || DISCORD_CLIENT_ID === 'YOUR_DISCORD_CLIENT_ID') {
        alert('Discord login not configured.\nSet DISCORD_CLIENT_ID and DISCORD_WORKER_CALLBACK in app.js.');
        return;
    }
    const redirectUri = encodeURIComponent(DISCORD_WORKER_CALLBACK);
    window.location.href = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&scope=identify&redirect_uri=${redirectUri}`;
}

// =====================
// SUPABASE PRESENCE
// =====================

function initPresence() {
    if (!SUPABASE_URL || SUPABASE_URL.includes('YOUR_SUPABASE_URL')) {
        document.querySelector('.online-counter').style.display = 'none';
        return;
    }

    try {
        const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        const userId = currentUser
            ? 'discord_' + currentUser.id
            : (() => {
                let id = localStorage.getItem('archipelago_user_id');
                if (!id) {
                    id = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
                    localStorage.setItem('archipelago_user_id', id);
                }
                return id;
            })();

        const channel = supabase.channel('online-users', {
            config: { presence: { key: userId } }
        });

        channel.on('presence', { event: 'sync' }, () => {
            const count = Object.keys(channel.presenceState()).length;
            document.getElementById('onlineCount').textContent = count;
        });

        channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({ online_at: Date.now() });
            }
        });
    } catch (e) {
        console.warn('Supabase presence not available:', e.message);
        document.querySelector('.online-counter').style.display = 'none';
    }
}

// =====================
// FIRESTORE HELPERS
// =====================

function gameKey(name) {
    return name.replace(/[./\[\]*~]/g, '_');
}

async function loadVoteCounts() {
    try {
        const snap = await db.collection('meta').doc('voteCounts').get();
        if (snap.exists) voteCounts = snap.data().counts || {};
    } catch (e) {
        console.warn('Failed to load vote counts:', e.message);
    }
}

async function loadUserData(discordId) {
    try {
        const snap = await db.collection('users').doc(discordId).get();
        if (snap.exists) {
            const data = snap.data();
            userFavorites = data.favorites || [];
            userVotes = data.votes || [];
        } else {
            userFavorites = [];
            userVotes = [];
        }
    } catch (e) {
        console.warn('Failed to load user data:', e.message);
    }
}

async function toggleFavorite(gameName) {
    if (!currentUser) return;
    const isFav = userFavorites.includes(gameName);

    if (isFav) {
        userFavorites = userFavorites.filter(n => n !== gameName);
    } else {
        userFavorites.push(gameName);
    }

    // Update all star buttons for this game in DOM
    document.querySelectorAll('.star-btn').forEach(btn => {
        if (btn.dataset.game === gameName) updateStarBtn(btn, gameName);
    });

    if (sortSelect.value === 'default') handleSearch();

    try {
        const userRef = db.collection('users').doc(currentUser.id);
        await userRef.set({
            favorites: isFav
                ? firebase.firestore.FieldValue.arrayRemove(gameName)
                : firebase.firestore.FieldValue.arrayUnion(gameName)
        }, { merge: true });
    } catch (e) {
        console.warn('Failed to save favorite:', e.message);
    }
}

async function toggleVote(gameName, thumbsBtn, countSpan) {
    if (!currentUser) return;
    const hasVoted = userVotes.includes(gameName);
    const key = gameKey(gameName);
    const delta = hasVoted ? -1 : 1;

    if (hasVoted) {
        userVotes = userVotes.filter(n => n !== gameName);
    } else {
        userVotes.push(gameName);
    }

    voteCounts[key] = Math.max(0, (voteCounts[key] || 0) + delta);
    updateThumbsBtn(thumbsBtn, gameName);
    if (countSpan) countSpan.textContent = voteCounts[key] > 0 ? voteCounts[key] : '';

    if (sortSelect.value === 'votes') handleSearch();

    try {
        const userRef = db.collection('users').doc(currentUser.id);
        const voteRef = db.collection('meta').doc('voteCounts');
        await Promise.all([
            userRef.set({
                votes: hasVoted
                    ? firebase.firestore.FieldValue.arrayRemove(gameName)
                    : firebase.firestore.FieldValue.arrayUnion(gameName)
            }, { merge: true }),
            updateVoteCountDoc(voteRef, key, delta)
        ]);
    } catch (e) {
        console.warn('Failed to save vote:', e.message);
    }
}

async function updateVoteCountDoc(voteRef, key, delta) {
    try {
        await voteRef.update({ [`counts.${key}`]: firebase.firestore.FieldValue.increment(delta) });
    } catch (e) {
        if (e.code === 'not-found') {
            await voteRef.set({ counts: { [key]: Math.max(0, delta) } });
        } else {
            throw e;
        }
    }
}

function updateStarBtn(btn, gameName) {
    if (!btn) return;
    const isFav = currentUser && userFavorites.includes(gameName);
    btn.classList.toggle('favorited', isFav);
    btn.title = isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti';
}

function updateThumbsBtn(btn, gameName) {
    if (!btn) return;
    const hasVoted = currentUser && userVotes.includes(gameName);
    btn.classList.toggle('voted', hasVoted);
    btn.title = hasVoted ? 'Rimuovi voto' : 'Vota';
}
