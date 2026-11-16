// Archipelago Tools, Meta & Hint Games - Frontend
import * as UI from './archipelago-ui.js';

const LINK_ICONS = { github: 'icons/github-logo.png', discord: 'icons/discord-logo.png', archipelago: 'icons/archipelago-logo.png' };

// State
let allTools = [];
let displayedTools = [];
let showAdultContent = false;

// DOM Elements
const $ = (id) => document.getElementById(id);
const searchInput = $('searchInput');
const searchBox = document.querySelector('.search-box');
const typeFilter = $('typeFilter');
const sortSelect = $('sortSelect');
const toolsGrid = $('toolsGrid');
const filterChips = $('filterChips');
const adultContentToggle = $('adultContentToggle');
const ageVerificationModal = $('ageVerificationModal');
const toolModal = $('toolModal');
const afterDarkButton = document.querySelector('.discord-button.after-dark');

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

    const sk = '<div class="skeleton-card"><div class="sk-cover"></div><div class="sk-line"></div><div class="sk-line short"></div></div>';
    toolsGrid.insertAdjacentHTML('beforeend', sk.repeat(10));

    try {
        await loadToolsData();
    } catch (error) {
        toolsGrid.innerHTML = '';
        $('errorText').textContent = error.message;
        $('errorMessage').classList.remove('hidden');
        console.error(error);
        return;
    }

    handleSearch();
    UI.enableCardTilt(toolsGrid);

    searchInput.addEventListener('input', () => {
        searchBox.classList.toggle('has-value', searchInput.value !== '');
        handleSearch();
    });
    document.querySelector('.search-clear').addEventListener('click', (e) => {
        e.preventDefault();
        searchInput.value = '';
        searchBox.classList.remove('has-value');
        searchInput.focus();
        handleSearch();
    });
    typeFilter.addEventListener('change', handleSearch);
    sortSelect.addEventListener('change', handleSearch);

    // Chips drive the hidden #typeFilter select
    filterChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        setTypeFilter(chip.dataset.filter);
    });

    toolsGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.game-card');
        if (!card) return;
        const tool = displayedTools[+card.dataset.index];
        if (tool) openToolModal(tool);
    });

    adultContentToggle.addEventListener('change', handleAdultToggle);
    $('ageConfirmYes').addEventListener('click', confirmAge);
    $('ageConfirmNo').addEventListener('click', denyAge);
    $('ageClose').addEventListener('click', denyAge);
    ageVerificationModal.addEventListener('click', (e) => {
        if (e.target === ageVerificationModal) denyAge();
    });

    $('modalClose').addEventListener('click', closeModal);
    toolModal.addEventListener('click', (e) => {
        if (e.target === toolModal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (ageVerificationModal.classList.contains('active')) denyAge();
        else if (toolModal.classList.contains('active')) closeModal();
    });
});

// Load pre-built tools data
async function loadToolsData() {
    const response = await fetch('data/tools.json');
    if (!response.ok) throw new Error("tools.json didn't respond. Try again in a moment.");

    const data = await response.json();
    allTools = data.tools;
    $('navToolCount').textContent = allTools.length;

    if (data.generated) {
        const date = new Date(data.generated);
        $('lastUpdate').textContent =
            'Last update: ' + date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) + ', ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
}

function isAdultTool(tool) {
    return tool.isAdult === true;
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

function setAdult(value) {
    showAdultContent = value;
    localStorage.setItem('showAdultContent', String(value));
    adultContentToggle.checked = value;
    updateAfterDarkButton();
    handleSearch();
}

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
function getTypePriority(toolType) {
    const type = (toolType || '').toLowerCase();
    if (type === 'tool') return 1;
    if (type === 'meta game') return 2;
    if (type === 'hint game') return 3;
    return 99;
}

const byDate = (t) => t.addedDate ? new Date(t.addedDate) : new Date(0);

function sortTools(tools, sortOption) {
    const sorted = [...tools];
    switch (sortOption) {
        case 'default':
            sorted.sort((a, b) => {
                const aIsNew = a.isNew === true;
                const bIsNew = b.isNew === true;
                if (aIsNew !== bIsNew) return aIsNew ? -1 : 1;
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
                const diff = getTypePriority(a.toolType) - getTypePriority(b.toolType);
                return diff || a.name.localeCompare(b.name);
            });
            break;
        case 'date-newest':
            sorted.sort((a, b) => byDate(b) - byDate(a));
            break;
        case 'date-oldest':
            sorted.sort((a, b) => byDate(a) - byDate(b));
            break;
    }
    return sorted;
}

function setTypeFilter(value) {
    typeFilter.value = value;
    typeFilter.dispatchEvent(new Event('change'));
}

function normalizeText(text) {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function handleSearch() {
    const query = normalizeText(searchInput.value.trim());
    const typeValue = typeFilter.value;
    const visible = allTools.filter(tool => showAdultContent || !isAdultTool(tool));

    filterChips.querySelectorAll('.chip').forEach(chip => {
        const f = chip.dataset.filter;
        chip.setAttribute('aria-pressed', String(f === typeValue));
        chip.querySelector('.chip-count').textContent = visible.filter(t => f === 'all' || t.toolType === f).length;
    });

    const filtered = visible.filter(tool =>
        (!query || normalizeText(tool.name).includes(query)) && (typeValue === 'all' || tool.toolType === typeValue));

    displayedTools = sortTools(filtered, sortSelect.value);
    const count = displayedTools.length;
    $('toolCount').innerHTML = `<b>${count}</b> ${count === 1 ? 'item' : 'items'}`;
    renderTools();
}

function renderTools() {
    if (displayedTools.length === 0) {
        const q = searchInput.value.trim();
        const parts = [q ? `Nothing matches “${UI.esc(q)}”.` : 'No tools in this filter.'];
        if (!showAdultContent) parts.push('18+ entries are hidden.');
        toolsGrid.innerHTML = `<div class="empty-state"><h3 class="state-title">No tools found</h3><p>${parts.join(' ')}</p><button class="btn primary" type="button" id="clearAll">Clear search &amp; filters</button></div>`;
        $('clearAll').addEventListener('click', () => {
            searchInput.value = '';
            searchBox.classList.remove('has-value');
            sortSelect.value = 'default';
            setTypeFilter('all');
        });
        return;
    }
    toolsGrid.innerHTML = displayedTools.map((tool, index) => UI.toolCardHTML(tool, { index })).join('');
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

function openToolModal(tool) {
    const [cls, label, icon, hue] = UI.TOOL_TYPES[tool.toolType] || UI.TOOL_TYPES.Tool;
    const art = UI.toolArt(tool.name, hue);

    const content = toolModal.querySelector('.modal-content');
    content.classList.remove('border-blue', 'border-purple', 'border-teal');
    content.classList.add(cls);

    $('modalTitle').textContent = tool.name;
    const banner = $('modalBanner');
    banner.style.setProperty('--art', `url(${art})`);
    banner.style.backgroundImage = tool.bannerPath ? `url("${tool.bannerPath}")` : '';
    banner.classList.toggle('no-banner', !tool.bannerPath);
    $('modalPoster').innerHTML = tool.coverPath
        ? `<img src="${UI.esc(tool.coverPath)}" alt="">`
        : `<div class="tool-cover-placeholder" style="--art:url(${art})"><span class="tool-icon">${UI.ICONS[icon]}</span></div>`;

    const type = $('modalType');
    type.dataset.type = (tool.toolType || '').toLowerCase();
    type.innerHTML = UI.ICONS[icon] + UI.esc(label);
    $('modalNew').classList.toggle('hidden', tool.isNew !== true);
    $('modalAdult').classList.toggle('hidden', !isAdultTool(tool));
    $('modalAdded').textContent = tool.addedDate ? 'Added ' + fmtDate(tool.addedDate) : '';

    $('factType').textContent = tool.toolType || '—';
    $('factAdded').textContent = fmtDate(tool.addedDate);
    UI.fillAiDisclosure($('factAiRow'), $('factAiNote'), tool.disclosures);
    UI.fillArtworkLink($('artworkLink'), tool.name, 'Tool', !tool.coverPath || !tool.bannerPath);

    const links = renderLinkSection('modalLinksSection', 'modalLinks', tool.links, true);
    renderLinkSection('modalSupportSection', 'modalSupport', tool.support, false);

    const notes = UI.notesHTML(tool.notes);
    $('modalNotesSection').hidden = !notes;
    $('modalNotes').innerHTML = notes;

    $('modalFooter').innerHTML = links[0] ? UI.linkHTML(links[0], { primary: true, icons: LINK_ICONS }) : '';

    toolModal.querySelector('.modal-scroll').scrollTop = 0;
    openOverlay(toolModal);
}

function closeModal() {
    closeOverlay(toolModal);
}
