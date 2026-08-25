// Archipelago Tools, Meta & Hint Games - Frontend

// State
let allTools = [];
let displayedTools = [];
let showAdultContent = false;

// DOM Elements
const searchInput = document.getElementById('searchInput');
const typeFilter = document.getElementById('typeFilter');
const sortSelect = document.getElementById('sortSelect');
const toolsGrid = document.getElementById('toolsGrid');
const toolCount = document.getElementById('toolCount');
const loadingMessage = document.getElementById('loadingMessage');
const errorMessage = document.getElementById('errorMessage');

// Modal Elements
const toolModal = document.getElementById('toolModal');
const modalBanner = document.getElementById('modalBanner');
const modalClose = document.getElementById('modalClose');
const modalTitle = document.getElementById('modalTitle');
const modalType = document.getElementById('modalType');
const modalLinksSection = document.getElementById('modalLinksSection');
const modalLinks = document.getElementById('modalLinks');
const modalSupportSection = document.getElementById('modalSupportSection');
const modalSupport = document.getElementById('modalSupport');
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
    const savedPreference = localStorage.getItem('showAdultContent');
    if (savedPreference === 'true') {
        showAdultContent = true;
        adultContentToggle.checked = true;
    }

    updateAfterDarkButton();

    try {
        await loadToolsData();
    } catch (error) {
        showError('Error loading data: ' + error.message);
        console.error(error);
    }

    searchInput.addEventListener('input', handleSearch);
    typeFilter.addEventListener('change', handleSearch);
    sortSelect.addEventListener('change', handleSearch);

    adultContentToggle.addEventListener('change', handleAdultToggle);

    ageConfirmYes.addEventListener('click', confirmAge);
    ageConfirmNo.addEventListener('click', denyAge);
    ageVerificationModal.addEventListener('click', (e) => {
        if (e.target === ageVerificationModal) {
            denyAge();
        }
    });

    modalClose.addEventListener('click', closeModal);
    toolModal.addEventListener('click', (e) => {
        if (e.target === toolModal) {
            closeModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;

        if (ageVerificationModal.classList.contains('active')) {
            denyAge();
        } else if (toolModal.classList.contains('active')) {
            closeModal();
        }
    });
});

// Load pre-built tools data
async function loadToolsData() {
    showLoading('Loading tools...');

    try {
        const response = await fetch('data/tools.json');
        if (!response.ok) {
            throw new Error('Unable to load tools data');
        }

        const data = await response.json();
        allTools = data.tools;

        console.log(`Loaded ${allTools.length} tools`);

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

// Check if tool is adult content
function isAdultTool(tool) {
    return tool.isAdult === true;
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

function openAgeVerificationModal() {
    ageVerificationModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeAgeVerificationModal() {
    ageVerificationModal.classList.remove('active');
    document.body.style.overflow = '';
}

function confirmAge() {
    showAdultContent = true;
    localStorage.setItem('showAdultContent', 'true');
    adultContentToggle.checked = true;
    updateAfterDarkButton();
    closeAgeVerificationModal();
    handleSearch();
}

function denyAge() {
    showAdultContent = false;
    localStorage.setItem('showAdultContent', 'false');
    adultContentToggle.checked = false;
    updateAfterDarkButton();
    closeAgeVerificationModal();
    handleSearch();
}

// Get type priority for sorting
function getTypePriority(toolType) {
    const type = (toolType || '').toLowerCase();
    if (type === 'tool') return 1;
    if (type === 'meta game') return 2;
    if (type === 'hint game') return 3;
    return 99;
}

// Sort tools
function sortTools(tools, sortOption) {
    const sorted = [...tools];

    switch (sortOption) {
        case 'default':
            sorted.sort((a, b) => {
                const aIsNew = a.isNew === true;
                const bIsNew = b.isNew === true;
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

        case 'type':
            sorted.sort((a, b) => {
                const priorityA = getTypePriority(a.toolType);
                const priorityB = getTypePriority(b.toolType);
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

// Normalize text for search
function normalizeText(text) {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

// Handle search and filtering
function handleSearch() {
    const query = normalizeText(searchInput.value.trim());
    const typeValue = typeFilter.value;
    const sortValue = sortSelect.value;

    let filtered = allTools.filter(tool => {
        const normalizedName = normalizeText(tool.name);
        const matchesSearch = !query || normalizedName.includes(query);
        const matchesType = typeValue === 'all' || tool.toolType === typeValue;

        if (!showAdultContent && isAdultTool(tool)) {
            return false;
        }

        return matchesSearch && matchesType;
    });

    displayedTools = sortTools(filtered, sortValue);

    updateToolCount();
    renderTools();
}

// Update tool count
function updateToolCount() {
    const count = displayedTools.length;
    toolCount.textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
}

// Render tools grid
function renderTools() {
    toolsGrid.innerHTML = '';

    if (displayedTools.length === 0) {
        toolsGrid.innerHTML = '<div class="loading-message">No tools found</div>';
        return;
    }

    displayedTools.forEach(tool => {
        const card = createToolCard(tool);
        toolsGrid.appendChild(card);
    });
}

// Get icon for tool type
function getToolTypeIcon(toolType) {
    const type = (toolType || '').toLowerCase();
    if (type === 'tool') return '\u{1F527}';
    if (type === 'meta game') return '\u{1F3B2}';
    if (type === 'hint game') return '\u{1F4A1}';
    return '\u{1F4E6}';
}

// Get border class for tool type
function getTypeBorderClass(toolType) {
    const type = (toolType || '').toLowerCase();
    if (type === 'tool') return 'border-blue';
    if (type === 'meta game') return 'border-purple';
    if (type === 'hint game') return 'border-green';
    return '';
}

// Create tool card
function createToolCard(tool) {
    const card = document.createElement('div');
    card.className = 'game-card';

    const borderClass = getTypeBorderClass(tool.toolType);
    if (borderClass) {
        card.classList.add(borderClass);
    }

    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
        openToolModal(tool);
    });
    card.title = 'Click to view details';

    const icon = getToolTypeIcon(tool.toolType);
    const coverElement = `<div class="tool-cover-placeholder"><span class="tool-icon">${icon}</span><span>${escapeHtml(tool.name)}</span></div>`;

    let metadata = '';
    if (tool.toolType) {
        const typeLower = tool.toolType.toLowerCase();
        metadata += `<span class="tool-type-badge" data-type="${typeLower}">${escapeHtml(tool.toolType)}</span>`;
    }

    const newBadge = tool.isNew === true ? '<div class="new-badge">NEW</div>' : '';

    card.innerHTML = `
        ${newBadge}
        ${coverElement}
        <div class="game-info">
            <div class="game-title" title="${escapeHtml(tool.name)}">${escapeHtml(tool.name)}</div>
            <div class="game-meta">${metadata || 'Unknown'}</div>
        </div>
    `;

    return card;
}

// UI helpers
function showLoading(message) {
    loadingMessage.textContent = message;
    loadingMessage.style.display = 'block';
    toolsGrid.style.display = 'none';
}

function hideLoading() {
    loadingMessage.style.display = 'none';
    toolsGrid.style.display = 'grid';
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

function parseLinkField(field) {
    const links = [];

    if (field && field.links && field.links.length > 0) {
        field.links.forEach(link => {
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

// Render a modal link section, hiding it when there is nothing to show
function renderLinkSection(sectionEl, containerEl, field) {
    if (!sectionEl || !containerEl) return;

    const links = parseLinkField(field);

    if (links.length === 0) {
        sectionEl.style.display = 'none';
        return;
    }

    containerEl.innerHTML = '';
    links.forEach(link => {
        const linkElement = document.createElement('a');
        linkElement.className = 'modal-link';
        linkElement.href = link.url;
        linkElement.target = '_blank';
        linkElement.rel = 'noopener noreferrer';
        linkElement.innerHTML = `${getIconForUrl(link.url)} ${escapeHtml(link.label)}`;
        linkElement.title = link.url;
        containerEl.appendChild(linkElement);
    });
    sectionEl.style.display = 'block';
}

function formatNotesWithLinks(tool) {
    if (!tool.notes) return '';

    let notesText = '';
    let notesLinks = [];

    if (typeof tool.notes === 'object') {
        notesText = tool.notes.text || '';
        notesLinks = tool.notes.links || [];
    } else if (typeof tool.notes === 'string') {
        notesText = tool.notes;
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
            const clickableLink = `<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="note-link" title="${link.url}">${link.text || 'Link'}</a>`;
            const urlPattern = new RegExp(link.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            formattedText = formattedText.replace(urlPattern, clickableLink);
        }
    });

    formattedText = formattedText.replace(/\n/g, '<br>');

    return formattedText;
}

// Open tool modal
function openToolModal(tool) {
    console.log('Opening modal for:', tool.name);

    modalTitle.textContent = tool.name;

    // Set type badge
    if (tool.toolType) {
        modalType.textContent = tool.toolType;
        modalType.className = 'modal-status';
        modalType.style.display = '';

        const typeLower = tool.toolType.toLowerCase();
        if (typeLower === 'tool') {
            modalType.style.background = 'rgba(26, 159, 255, 0.2)';
            modalType.style.color = '#1a9fff';
            modalType.style.border = '1px solid rgba(26, 159, 255, 0.3)';
        } else if (typeLower === 'meta game') {
            modalType.style.background = 'rgba(147, 51, 234, 0.2)';
            modalType.style.color = '#a855f7';
            modalType.style.border = '1px solid rgba(147, 51, 234, 0.3)';
        } else if (typeLower === 'hint game') {
            modalType.style.background = 'rgba(76, 175, 80, 0.2)';
            modalType.style.color = '#4caf50';
            modalType.style.border = '1px solid rgba(76, 175, 80, 0.3)';
        }
    } else {
        modalType.style.display = 'none';
    }

    // Banner - tools don't have banners
    modalBanner.style.backgroundImage = '';
    modalBanner.classList.add('no-banner');

    // Links and support each get their own section
    renderLinkSection(modalLinksSection, modalLinks, tool.links);
    renderLinkSection(modalSupportSection, modalSupport, tool.support);

    // Display notes
    const formattedNotes = formatNotesWithLinks(tool);

    if (formattedNotes) {
        modalNotes.innerHTML = formattedNotes;
        modalNotesSection.style.display = 'block';
    } else {
        modalNotesSection.style.display = 'none';
    }

    // Show modal
    toolModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Close modal
function closeModal() {
    toolModal.classList.remove('active');
    document.body.style.overflow = '';
}
