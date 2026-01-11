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
        showError('Error loading data: ' + error.message);
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

                // If same status, sort alphabetically
                return a.name.localeCompare(b.name);
            });
            break;

        case 'date-newest':
            // Sort by date, newest first
            sorted.sort((a, b) => {
                const dateA = a.addedDate ? new Date(a.addedDate) : new Date(0);
                const dateB = b.addedDate ? new Date(b.addedDate) : new Date(0);
                return dateB - dateA; // Descending (newest first)
            });
            break;

        case 'date-oldest':
            // Sort by date, oldest first
            sorted.sort((a, b) => {
                const dateA = a.addedDate ? new Date(a.addedDate) : new Date(0);
                const dateB = b.addedDate ? new Date(b.addedDate) : new Date(0);
                return dateA - dateB; // Ascending (oldest first)
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

    // Filter games by search query
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
    if (url.includes('github.com')) {
        return '<img src="icons/github-logo.png" class="button-icon" alt="GitHub">';
    } else if (url.includes('discord.com')) {
        return '<img src="icons/discord-logo.png" class="button-icon" alt="Discord">';
    } else if (url.includes('archipelago.gg')) {
        return '<img src="icons/archipelago-logo.png" class="button-icon" alt="Archipelago">';
    }
    return '🔗'; // Default link icon (fallback)
}

// Parse download links from source field (Column C)
function parseDownloadLinks(game) {
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

    // Add Discord channel link if it exists (Core-Verified games)
    if (game.discordChannel && game.discordChannel.trim()) {
        links.push({
            label: 'Discord Channel',
            url: game.discordChannel.trim()
        });
    }

    // Parse source field for download links (Playable games - Column C)
    if (game.source) {
        // New structure: source is an object with text and links array
        if (typeof game.source === 'object' && game.source.links) {
            const sourceText = game.source.text || '';

            game.source.links.forEach((link, index) => {
                let label = 'Download';

                // If link text is descriptive (not just the URL), use it as label
                const linkText = link.text || '';
                const isJustUrl = linkText === link.url || linkText.trim() === link.url || linkText.startsWith('http');

                if (!isJustUrl && linkText.length > 0) {
                    // Use the full descriptive text as label
                    label = linkText;
                } else {
                    // Link text is just URL, try to infer from context
                    const urlIndex = sourceText.indexOf(link.url);
                    if (urlIndex > 0) {
                        // Get text before the URL
                        const beforeText = sourceText.substring(Math.max(0, urlIndex - 20), urlIndex).trim();
                        const beforeLower = beforeText.toLowerCase();

                        // Check if it's in "APWorld:" or "Client:" format
                        if (beforeLower.endsWith('apworld:') || beforeLower.endsWith('apworld')) {
                            label = 'APWorld';
                        } else if (beforeLower.endsWith('client:') || beforeLower.endsWith('client')) {
                            label = 'Client';
                        } else if (game.source.links.length > 1) {
                            label = `Download ${index + 1}`;
                        }
                    } else if (game.source.links.length > 1) {
                        label = `Download ${index + 1}`;
                    }
                }

                links.push({
                    label: label,
                    url: link.url
                });
            });
        }
        // Old structure: source is a string (backward compatibility)
        else if (typeof game.source === 'string' && game.source.trim()) {
            const sourceText = game.source.trim();
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const matches = sourceText.match(urlRegex);

            if (matches) {
                matches.forEach((url, index) => {
                    links.push({
                        label: matches.length > 1 ? `Download ${index + 1}` : 'Download',
                        url: url
                    });
                });
            }
        }
    }

    return links;
}

// Convert notes text with links to HTML (Column D)
function formatNotesWithLinks(game) {
    if (!game.notes) return '';

    let notesText = '';
    let notesLinks = [];

    // Extract text and links from notes
    if (typeof game.notes === 'object') {
        notesText = game.notes.text || '';
        notesLinks = game.notes.links || [];
    } else if (typeof game.notes === 'string') {
        notesText = game.notes;
    }

    if (!notesText.trim()) return '';

    // Replace URLs in text with clickable links
    let formattedText = notesText;

    // For each link, find the label before it in the text
    notesLinks.forEach(link => {
        let urlIndex = formattedText.indexOf(link.url);

        // If URL is not in the text, try to find the link text
        if (urlIndex === -1 && link.text && link.text !== link.url) {
            // The link text might be part of the notes text
            const linkTextIndex = formattedText.indexOf(link.text);
            if (linkTextIndex !== -1) {
                // Replace the link text with a clickable link
                const clickableLink = `<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="note-link" title="${link.url}">${link.text}</a>`;
                formattedText = formattedText.replace(link.text, clickableLink);
                return; // Done with this link
            }
        }

        if (urlIndex !== -1) {
            // Get text around the URL to find the label
            const beforeUrl = formattedText.substring(Math.max(0, urlIndex - 100), urlIndex);

            // Find the last occurrence of common patterns before the URL
            // Pattern 1: "Label: " (with colon)
            // Pattern 2: Text after last newline (for cases like "text\nSetup Guide here")
            // Pattern 3: "Label " (without colon, just space)
            const patterns = [
                /([^.!?\n]+):\s*$/,           // "Setup instructions: "
                /\n([^\n]+)\s*$/,              // "\nSetup Guide found here"
                /([^.!?\n]+)\s+$/,             // "Some text "
                /^(.+)$/                       // Fallback to all text
            ];
            let linkLabel = 'Link';
            let labelToRemove = '';
            let replaceWithNewline = false;

            for (const pattern of patterns) {
                const match = beforeUrl.match(pattern);
                if (match && match[1].trim().length > 0 && match[1].trim().length < 50) {
                    linkLabel = match[1].trim();
                    // Check if the pattern ends with ":" to remove it along with the label
                    if (pattern === patterns[0]) { // Pattern with colon
                        labelToRemove = match[0]; // Include the colon and whitespace
                    } else if (pattern === patterns[1]) { // Pattern after newline
                        labelToRemove = match[1]; // Text after newline (preserve any whitespace)
                        replaceWithNewline = true; // Keep the newline before the link
                    }
                    break;
                }
            }

            // Create the clickable link
            const clickableLink = `<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="note-link" title="${link.url}">${linkLabel}</a>`;

            // If we found a label to remove
            if (labelToRemove) {
                if (replaceWithNewline) {
                    // For newline pattern, replace "text url" with "\nlink" (preserve newline)
                    // Find and replace "Setup Guide found here[URL]" with "\n[link]"
                    const textToReplace = labelToRemove + link.url;
                    const escapedText = textToReplace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const replacePattern = new RegExp(escapedText, 'g');
                    formattedText = formattedText.replace(replacePattern, '\n' + clickableLink);
                } else {
                    // For colon pattern, replace "label: url" with "link"
                    const labelAndUrl = labelToRemove + link.url;
                    formattedText = formattedText.replace(labelAndUrl, clickableLink);
                }
            } else {
                // Otherwise just replace the URL
                const urlPattern = new RegExp(link.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                formattedText = formattedText.replace(urlPattern, clickableLink);
            }
        }
    });

    // Convert newlines to <br> tags
    formattedText = formattedText.replace(/\n/g, '<br>');

    return formattedText;
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

    // Parse and display download links (Column C only)
    const downloadLinks = parseDownloadLinks(game);

    if (downloadLinks.length > 0) {
        modalLinks.innerHTML = '';
        downloadLinks.forEach(link => {
            const linkElement = document.createElement('a');
            linkElement.className = 'modal-link';
            linkElement.href = link.url;
            linkElement.target = '_blank';
            linkElement.rel = 'noopener noreferrer';

            // Add icon and label
            const icon = getIconForUrl(link.url);
            linkElement.innerHTML = `${icon} ${link.label}`;
            linkElement.title = link.url; // Show URL on hover

            modalLinks.appendChild(linkElement);
        });
        modalLinksSection.style.display = 'block';
    } else {
        modalLinksSection.style.display = 'none';
    }

    // Display notes with inline clickable links (Column D)
    const formattedNotes = formatNotesWithLinks(game);

    if (formattedNotes) {
        modalNotes.innerHTML = formattedNotes; // Use innerHTML to render links
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
