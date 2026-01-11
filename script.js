// Configuration
const CONFIG = {
    // Opzione 1: IGDB (più complesso ma più completo)
    IGDB_CLIENT_ID: '', // Sostituisci con il tuo Client ID da Twitch Dev
    IGDB_CLIENT_SECRET: '', // Sostituisci con il tuo Client Secret
    IGDB_ACCESS_TOKEN: '', // Access token da ottenere via OAuth

    // Opzione 2: SteamGridDB (più semplice, consigliato!)
    // Ottieni la tua API key da: https://www.steamgriddb.com/profile/preferences/api
    STEAMGRIDDB_API_KEY: 'f6c46127673a65d708ec019a7737d108', // Inserisci qui la tua API key

    // CORS Proxy (necessario per SteamGridDB dal browser)
    USE_CORS_PROXY: true,
    CORS_PROXIES: [
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url=',
        'https://api.codetabs.com/v1/proxy?quest='
    ],
    CURRENT_PROXY_INDEX: 0,

    CACHE_KEY: 'archipelago_games_cache',
    CACHE_EXPIRY_DAYS: 7,
    USE_STEAMGRIDDB: true, // Cambia a false per usare IGDB

    // Rate limiting
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000, // 2 secondi tra retry
    BATCH_SIZE: 2, // Solo 2 giochi alla volta
    BATCH_DELAY: 2000 // 2 secondi tra batch
};

// State
let allGames = [];
let displayedGames = [];
let coverCache = {};

// DOM Elements
const csvFileInput = document.getElementById('csvFileInput');
const searchInput = document.getElementById('searchInput');
const platformFilter = document.getElementById('platformFilter');
const gamesGrid = document.getElementById('gamesGrid');
const gameCount = document.getElementById('gameCount');
const loadingMessage = document.getElementById('loadingMessage');
const errorMessage = document.getElementById('errorMessage');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

// Platform detection patterns
const PLATFORM_PATTERNS = {
    'NES': /\bNES\b/i,
    'SNES': /\bSNES\b|Super Nintendo/i,
    'N64': /\bN64\b|Nintendo 64/i,
    'GameBoy': /Game ?Boy(?! Advance)/i,
    'GBA': /Game ?Boy Advance|GBA/i,
    'NDS': /\bDS\b|Nintendo DS/i,
    'GameCube': /GameCube|GC\b/i,
    'Wii': /\bWii\b(?! U)/i,
    'Switch': /\bSwitch\b/i,
    'PlayStation': /PlayStation|PS1|PSX/i,
    'PS2': /PlayStation 2|PS2/i,
    'PS3': /PlayStation 3|PS3/i,
    'PS4': /PlayStation 4|PS4/i,
    'PSP': /\bPSP\b/i,
    'PS Vita': /PS ?Vita/i,
    'Genesis': /Genesis|Mega Drive/i,
    'Saturn': /\bSaturn\b/i,
    'Dreamcast': /Dreamcast/i,
    'Xbox': /\bXbox\b(?! 360| One)/i,
    'Xbox 360': /Xbox 360/i,
    'Xbox One': /Xbox One/i,
    'PC': /\bPC\b|Windows|Steam/i,
    'Mobile': /\bMobile\b|Android|iOS/i
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadCache();
    csvFileInput.addEventListener('change', handleFileUpload);
    searchInput.addEventListener('input', handleSearch);
    platformFilter.addEventListener('change', handleSearch);
});

// Load cache from localStorage
function loadCache() {
    try {
        const cached = localStorage.getItem(CONFIG.CACHE_KEY);
        if (cached) {
            const data = JSON.parse(cached);
            const now = new Date().getTime();
            if (now - data.timestamp < CONFIG.CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000) {
                coverCache = data.covers || {};
                console.log('Loaded', Object.keys(coverCache).length, 'covers from cache');
            }
        }
    } catch (e) {
        console.error('Error loading cache:', e);
    }
}

// Save cache to localStorage
function saveCache() {
    try {
        const data = {
            timestamp: new Date().getTime(),
            covers: coverCache
        };
        localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Error saving cache:', e);
    }
}

// Handle CSV file upload
async function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    showLoading('Caricamento CSV...');
    hideError();

    allGames = [];

    try {
        for (const file of files) {
            const text = await file.text();
            const games = parseCSV(text);
            allGames = allGames.concat(games);
        }

        // Remove duplicates
        allGames = [...new Map(allGames.map(g => [g.name, g])).values()];

        // Sort alphabetically
        allGames.sort((a, b) => a.name.localeCompare(b.name));

        displayedGames = [...allGames];
        updatePlatformFilter();
        updateGameCount();
        hideLoading();

        await renderGames();

    } catch (error) {
        showError('Errore nel caricamento del CSV: ' + error.message);
        console.error(error);
    }
}

// Parse CSV content
function parseCSV(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    const games = [];

    // Skip header rows (usually first 4-5 rows are metadata/headers)
    let startIndex = 0;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
        if (lines[i].toLowerCase().includes('game')) {
            startIndex = i + 1;
            break;
        }
    }

    for (let i = startIndex; i < lines.length; i++) {
        const columns = parseCSVLine(lines[i]);
        if (columns.length > 0 && columns[0]) {
            const gameName = columns[0].trim();
            // Skip empty names and metadata rows
            if (gameName &&
                !gameName.toLowerCase().includes('please') &&
                !gameName.toLowerCase().includes('headers') &&
                !gameName.toLowerCase().includes('if something') &&
                gameName.length > 1) {
                const game = {
                    name: gameName,
                    status: columns[1] || '',
                    source: columns[2] || '',
                    notes: columns[3] || '',
                    platform: detectPlatform(gameName)
                };
                games.push(game);
            }
        }
    }

    return games;
}

// Parse a single CSV line (handles quoted fields)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current);
    return result;
}

// Detect platform from game name
function detectPlatform(gameName) {
    for (const [platform, pattern] of Object.entries(PLATFORM_PATTERNS)) {
        if (pattern.test(gameName)) {
            return platform;
        }
    }
    return 'Unknown';
}

// Update platform filter options
function updatePlatformFilter() {
    const platforms = new Set();
    allGames.forEach(game => {
        if (game.platform) {
            platforms.add(game.platform);
        }
    });

    // Clear existing options except the first one
    platformFilter.innerHTML = '<option value="">Tutte le piattaforme</option>';

    // Add platform options in alphabetical order
    [...platforms].sort().forEach(platform => {
        const option = document.createElement('option');
        option.value = platform;
        option.textContent = platform;
        platformFilter.appendChild(option);
    });
}

// Render games grid
async function renderGames() {
    gamesGrid.innerHTML = '';

    if (displayedGames.length === 0) {
        gamesGrid.innerHTML = '<div class="loading-message">Nessun gioco trovato</div>';
        return;
    }

    for (const game of displayedGames) {
        const card = createGameCard(game);
        gamesGrid.appendChild(card);
    }

    // Load covers asynchronously
    await loadCovers();
}

// Create game card HTML
function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.dataset.gameName = game.name;

    card.innerHTML = `
        <div class="game-cover loading">
            <div class="loading-spinner"></div>
        </div>
        <div class="game-info">
            <div class="game-title" title="${escapeHtml(game.name)}">${escapeHtml(game.name)}</div>
            <div class="game-meta">${escapeHtml(game.status)}</div>
        </div>
    `;

    return card;
}

// Load covers for all displayed games
async function loadCovers() {
    // Check if any API is configured
    const hasAPI = (CONFIG.USE_STEAMGRIDDB && CONFIG.STEAMGRIDDB_API_KEY) ||
                   (!CONFIG.USE_STEAMGRIDDB && CONFIG.IGDB_ACCESS_TOKEN);

    console.log('Loading covers...', {
        hasAPI,
        useSteamGridDB: CONFIG.USE_STEAMGRIDDB,
        hasKey: !!CONFIG.STEAMGRIDDB_API_KEY,
        gamesCount: displayedGames.length
    });

    if (!hasAPI) {
        console.warn('Nessuna API configurata. Le copertine verranno mostrate come placeholder.');
        displayedGames.forEach(game => {
            updateGameCover(game.name, null);
        });
        return;
    }

    // Show progress bar
    progressBar.style.display = 'block';
    updateProgress(0, displayedGames.length);

    // Load covers in batches to avoid rate limiting
    const batchSize = CONFIG.BATCH_SIZE;
    const totalBatches = Math.ceil(displayedGames.length / batchSize);
    let loadedCount = 0;

    for (let i = 0; i < displayedGames.length; i += batchSize) {
        const batch = displayedGames.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        console.log(`Loading batch ${batchNum}/${totalBatches}: ${batch.map(g => g.name).join(', ')}`);

        // Process games sequentially within batch to reduce load
        for (const game of batch) {
            await loadGameCover(game.name);
            loadedCount++;
            updateProgress(loadedCount, displayedGames.length);
            await sleep(300); // Small delay between games
        }

        // Longer delay between batches
        if (i + batchSize < displayedGames.length) {
            console.log(`Waiting ${CONFIG.BATCH_DELAY}ms before next batch...`);
            await sleep(CONFIG.BATCH_DELAY);
        }
    }

    console.log('All covers loaded');
    saveCache();

    // Hide progress bar
    progressBar.style.display = 'none';
}

// Load cover for a single game
async function loadGameCover(gameName) {
    // Check cache first
    if (coverCache[gameName]) {
        console.log(`Using cached cover for: ${gameName}`);
        updateGameCover(gameName, coverCache[gameName]);
        return;
    }

    try {
        console.log(`Fetching cover for: ${gameName}`);
        const coverUrl = await fetchGameCover(gameName);
        console.log(`Got cover URL for ${gameName}:`, coverUrl);
        coverCache[gameName] = coverUrl;
        updateGameCover(gameName, coverUrl);
    } catch (error) {
        console.error(`Error loading cover for ${gameName}:`, error);
        updateGameCover(gameName, null);
    }
}

// Fetch game cover from IGDB or alternative service
async function fetchGameCover(gameName) {
    try {
        if (CONFIG.USE_STEAMGRIDDB && CONFIG.STEAMGRIDDB_API_KEY) {
            return await fetchSteamGridDBCover(gameName);
        } else if (CONFIG.IGDB_ACCESS_TOKEN) {
            return await fetchIGDBCover(gameName);
        }
    } catch (error) {
        console.error(`Error fetching cover for ${gameName}:`, error);
    }

    return null;
}

// Get current CORS proxy
function getCurrentProxy() {
    if (!CONFIG.USE_CORS_PROXY) return '';
    return CONFIG.CORS_PROXIES[CONFIG.CURRENT_PROXY_INDEX];
}

// Switch to next proxy
function switchProxy() {
    CONFIG.CURRENT_PROXY_INDEX = (CONFIG.CURRENT_PROXY_INDEX + 1) % CONFIG.CORS_PROXIES.length;
    console.log(`Switching to proxy ${CONFIG.CURRENT_PROXY_INDEX + 1}/${CONFIG.CORS_PROXIES.length}: ${getCurrentProxy()}`);
}

// Fetch with retry and proxy rotation
async function fetchWithRetry(url, options = {}, retries = CONFIG.MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
        try {
            let finalUrl = url;
            if (CONFIG.USE_CORS_PROXY) {
                finalUrl = getCurrentProxy() + encodeURIComponent(url);
            }

            console.log(`Attempt ${i + 1}/${retries} - Fetching: ${url.substring(0, 100)}...`);

            const response = await fetch(finalUrl, options);

            if (!response.ok) {
                // If we get a 429 (rate limit) or 5xx error, try next proxy
                if (response.status === 429 || response.status >= 500) {
                    console.warn(`Got ${response.status} error, trying different proxy...`);
                    switchProxy();
                    if (i < retries - 1) {
                        await sleep(CONFIG.RETRY_DELAY);
                        continue;
                    }
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response;
        } catch (error) {
            console.error(`Fetch attempt ${i + 1} failed:`, error.message);

            if (i < retries - 1) {
                // Try next proxy
                switchProxy();
                console.log(`Retrying in ${CONFIG.RETRY_DELAY}ms...`);
                await sleep(CONFIG.RETRY_DELAY);
            } else {
                throw error;
            }
        }
    }
}

// Fetch cover from SteamGridDB
async function fetchSteamGridDBCover(gameName) {
    // Clean up game name for better matching
    let searchName = gameName;

    // Remove common suffixes/prefixes that might interfere with search
    searchName = searchName
        .replace(/\s*\(.*?\)\s*/g, '') // Remove parentheses content
        .replace(/\s*\[.*?\]\s*/g, '') // Remove brackets content
        .trim();

    console.log(`Searching SteamGridDB for: "${searchName}" (original: "${gameName}")`);

    try {
        // First, search for the game
        const searchUrl = `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(searchName)}`;

        const searchResponse = await fetchWithRetry(searchUrl, {
            headers: {
                'Authorization': `Bearer ${CONFIG.STEAMGRIDDB_API_KEY}`
            }
        });

        const searchData = await searchResponse.json();
        console.log(`Search results for "${searchName}":`, searchData);

        if (!searchData.data || searchData.data.length === 0) {
            console.log(`No results found for: ${searchName}`);
            return null;
        }

        // Get the first game's ID
        const gameId = searchData.data[0].id;
        const foundGameName = searchData.data[0].name;
        console.log(`Found game: "${foundGameName}" (ID: ${gameId})`);

        // Now fetch the grid images for this game
        const gridsUrl = `https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=600x900,342x482,660x930`;

        const gridsResponse = await fetchWithRetry(gridsUrl, {
            headers: {
                'Authorization': `Bearer ${CONFIG.STEAMGRIDDB_API_KEY}`
            }
        });

        const gridsData = await gridsResponse.json();
        console.log(`Grids data for game ${gameId}:`, gridsData);

        if (gridsData.data && gridsData.data.length > 0) {
            // Prefer vertical grids, then any available
            const verticalGrid = gridsData.data.find(g => g.height > g.width);
            if (verticalGrid) {
                console.log(`Using vertical grid: ${verticalGrid.url}`);
                return verticalGrid.url;
            }
            // Return the first grid image URL if no vertical found
            console.log(`Using first available grid: ${gridsData.data[0].url}`);
            return gridsData.data[0].url;
        }

        console.log(`No grids found for game ${gameId}`);
        return null;
    } catch (error) {
        console.error(`Exception in fetchSteamGridDBCover for "${gameName}":`, error);
        return null; // Return null instead of throwing to continue with other games
    }
}

// Fetch cover from IGDB
async function fetchIGDBCover(gameName) {
    const query = `
        search "${gameName}";
        fields cover.url;
        limit 1;
    `;

    const response = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
            'Client-ID': CONFIG.IGDB_CLIENT_ID,
            'Authorization': `Bearer ${CONFIG.IGDB_ACCESS_TOKEN}`,
            'Accept': 'application/json'
        },
        body: query
    });

    if (!response.ok) {
        throw new Error(`IGDB API error: ${response.status}`);
    }

    const data = await response.json();
    if (data.length > 0 && data[0].cover && data[0].cover.url) {
        // Convert to high-res image
        return data[0].cover.url.replace('t_thumb', 't_cover_big');
    }

    return null;
}

// Update game card with cover image
function updateGameCover(gameName, coverUrl) {
    const card = document.querySelector(`[data-game-name="${gameName}"]`);
    if (!card) return;

    const coverDiv = card.querySelector('.game-cover');

    if (coverUrl) {
        const img = document.createElement('img');
        img.className = 'game-cover';
        img.src = coverUrl.startsWith('//') ? 'https:' + coverUrl : coverUrl;
        img.alt = gameName;
        img.onerror = () => {
            coverDiv.className = 'game-cover error';
            coverDiv.innerHTML = escapeHtml(gameName);
        };
        coverDiv.replaceWith(img);
    } else {
        // Show placeholder with game name
        coverDiv.className = 'game-cover error';
        coverDiv.innerHTML = escapeHtml(gameName);
    }
}

// Handle search and filtering
function handleSearch() {
    const query = searchInput.value.toLowerCase().trim();
    const selectedPlatform = platformFilter.value;

    displayedGames = allGames.filter(game => {
        const matchesSearch = !query || game.name.toLowerCase().includes(query);
        const matchesPlatform = !selectedPlatform || game.platform === selectedPlatform;
        return matchesSearch && matchesPlatform;
    });

    updateGameCount();
    renderGames();
}

// Update game count display
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

function hideError() {
    errorMessage.style.display = 'none';
}

function updateProgress(loaded, total) {
    const percentage = Math.round((loaded / total) * 100);
    progressFill.style.width = percentage + '%';
    progressText.textContent = `Caricamento copertine: ${loaded}/${total} (${percentage}%)`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
