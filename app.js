// New simple frontend that loads pre-built data

// State
let allGames = [];
let displayedGames = [];

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
const modalLinksSection = document.getElementById('modalLinksSection');
const modalLinks = document.getElementById('modalLinks');
const modalNotesSection = document.getElementById('modalNotesSection');
const modalNotes = document.getElementById('modalNotes');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadGamesData();
    } catch (error) {
        showError('Errore nel caricamento dei dati: ' + error.message);
        console.error(error);
    }

    searchInput.addEventListener('input', handleSearch);
    sortSelect.addEventListener('change', handleSearch);

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
    showLoading('Caricamento giochi...');

    try {
        const response = await fetch('data/games.json');
        if (!response.ok) {
            throw new Error('Impossibile caricare i dati dei giochi');
        }

        const data = await response.json();
        allGames = data.games;

        console.log(`Loaded ${allGames.length} games`);
        console.log(`Generated: ${data.generated}`);
        console.log(`Covers found: ${data.coversFound}/${data.totalGames}`);

        hideLoading();
        // Apply default sorting (NEW games first)
        handleSearch();

    } catch (error) {
        hideLoading();
        throw error;
    }
}

// Check if game is new (added in last build)
function isGameNew(game) {
    return game.isNew === true;
}

// Get status priority for sorting
function getStatusPriority(status) {
    const statusLower = status ? status.toLowerCase() : '';

    // Check for worst states first (most important for mixed statuses)
    // Broken = 7 (highest priority for problems)
    if (statusLower.includes('broken')) return 7;
    // Unstable = 6
    if (statusLower.includes('unstable')) return 6;

    // Then check for stable states
    // Core-Verified = 1 (best)
    if (statusLower.includes('core-verified')) return 1;
    // APWorld Only = 2
    if (statusLower.includes('apworld only')) return 2;
    // Merged = 3
    if (statusLower.includes('merged')) return 3;
    // In Review = 4
    if (statusLower.includes('in review')) return 4;
    // Stable = 5
    if (statusLower.includes('stable')) return 5;

    // Unknown/Other = 99
    return 99;
}

// Sort games based on selected option
function sortGames(games, sortOption) {
    const sorted = [...games];

    switch(sortOption) {
        case 'default':
            // Default: NEW games first, then alphabetically
            sorted.sort((a, b) => {
                const aIsNew = isGameNew(a);
                const bIsNew = isGameNew(b);

                // If one is new and the other isn't, new comes first
                if (aIsNew && !bIsNew) return -1;
                if (!aIsNew && bIsNew) return 1;

                // Otherwise, sort alphabetically
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
                const priorityA = getStatusPriority(a.status);
                const priorityB = getStatusPriority(b.status);

                if (priorityA !== priorityB) {
                    return priorityA - priorityB;
                }

                // Se stesso status, ordina alfabeticamente
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
        gamesGrid.innerHTML = '<div class="loading-message">Nessun gioco trovato</div>';
        return;
    }

    displayedGames.forEach(game => {
        const card = createGameCard(game);
        gamesGrid.appendChild(card);
    });
}

// Get status border class
function getStatusBorderClass(status) {
    if (!status) return '';

    const statusLower = status.toLowerCase();

    // Unstable - bordo giallo
    if (statusLower.includes('unstable')) {
        return 'border-yellow';
    }
    // Broken on main - bordo rosso
    if (statusLower.includes('broken')) {
        return 'border-red';
    }
    // Merged, In review, Stable, Core-Verified, APWorld Only - bordo verde
    if (statusLower.includes('merged') ||
        statusLower.includes('in review') ||
        statusLower.includes('stable') ||
        statusLower.includes('core-verified') ||
        statusLower.includes('apworld only')) {
        return 'border-green';
    }

    return '';
}

// Create game card
function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';

    // Add status border class
    const borderClass = getStatusBorderClass(game.status);
    if (borderClass) {
        card.classList.add(borderClass);
    }

    // Add click handler to open modal
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
        openGameModal(game);
    });
    card.title = 'Click to view details';

    const coverElement = game.coverPath
        ? `<img src="${game.coverPath}" alt="${escapeHtml(game.name)}" class="game-cover" onerror="this.className='game-cover error'; this.outerHTML='<div class=\\'game-cover error\\'>${escapeHtml(game.name)}</div>';">`
        : `<div class="game-cover error">${escapeHtml(game.name)}</div>`;

    // Build metadata based on game type
    let metadata = '';
    if (game.status && game.status !== 'Unknown') {
        const statusLower = game.status.toLowerCase();
        metadata += `<span class="game-status" data-status="${statusLower}">${escapeHtml(game.status)}</span>`;
    }

    // Add NEW badge if game is new
    const newBadge = isGameNew(game) ? '<div class="new-badge">NEW</div>' : '';

    card.innerHTML = `
        ${newBadge}
        ${coverElement}
        <div class="game-info">
            <div class="game-title" title="${escapeHtml(game.name)}">${escapeHtml(game.name)}</div>
            <div class="game-meta">${metadata || 'Unknown'}</div>
        </div>
    `;

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

    // Filter games
    let filtered = allGames.filter(game => {
        const normalizedName = normalizeText(game.name);
        return !query || normalizedName.includes(query);
    });

    // Sort games
    displayedGames = sortGames(filtered, sortValue);

    updateGameCount();
    renderGames();
}

// Update game count
function updateGameCount() {
    const count = displayedGames.length;
    gameCount.textContent = `${count} ${count === 1 ? 'gioco' : 'giochi'}`;
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

// Parse links from source or other fields
function parseLinks(game) {
    const links = [];

    // Add game page link if it exists (Core-Verified games)
    if (game.gamePage && game.gamePage.trim()) {
        links.push({
            label: 'Game Page',
            url: game.gamePage.trim()
        });
    }

    // Add setup page link if it exists
    if (game.setupPage && game.setupPage.trim()) {
        links.push({
            label: 'Setup Guide',
            url: game.setupPage.trim()
        });
    }

    // Parse source field for links (Playable games)
    if (game.source && game.source.trim()) {
        const sourceText = game.source.trim();

        // Try to extract URLs from the source field
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const matches = sourceText.match(urlRegex);

        if (matches) {
            matches.forEach((url, index) => {
                links.push({
                    label: `Source ${index + 1}`,
                    url: url
                });
            });
        } else if (sourceText) {
            // If no URL found but there's text, show it as a link anyway
            links.push({
                label: 'Source',
                url: sourceText
            });
        }
    }

    return links;
}


// Open game modal
async function openGameModal(game) {
    console.log('Opening modal for:', game.name);

    // Set title
    modalTitle.textContent = game.name;

    // Set status
    if (game.status) {
        modalStatus.textContent = game.status;
        modalStatus.className = 'modal-status';

        // Apply same styling as game cards
        const statusLower = game.status.toLowerCase();
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

    // Set banner from local file
    modalBanner.style.backgroundImage = '';
    modalBanner.classList.remove('no-banner');

    if (game.bannerPath) {
        modalBanner.style.backgroundImage = `url(${game.bannerPath})`;
    } else {
        modalBanner.classList.add('no-banner');
    }

    // Parse and display links
    const links = parseLinks(game);

    if (links.length > 0) {
        modalLinks.innerHTML = '';
        links.forEach(link => {
            const linkElement = document.createElement('a');
            linkElement.className = 'modal-link';
            linkElement.href = link.url;
            linkElement.target = '_blank';
            linkElement.rel = 'noopener noreferrer';
            linkElement.textContent = `${link.label}: ${link.url}`;
            modalLinks.appendChild(linkElement);
        });
        modalLinksSection.style.display = 'block';
    } else {
        modalLinksSection.style.display = 'none';
    }

    // Display notes
    if (game.notes && game.notes.trim()) {
        modalNotes.textContent = game.notes.trim();
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
