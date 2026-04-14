// Archipelago Games Library - Frontend

// State
let allGames = [];
let displayedGames = [];
let showAdultContent = false;

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

    try {
        await loadGamesData();
    } catch (error) {
        showError('Error loading data: ' + error.message);
        console.error(error);
    }

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

    switch(sortOption) {
        case 'default':
            sorted.sort((a, b) => {
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

    const coverElement = game.coverPath
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
