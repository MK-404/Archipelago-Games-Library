const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const CONFIG = {
    STEAMGRIDDB_API_KEY: process.env.STEAMGRIDDB_API_KEY || '',
    CORE_VERIFIED_HTML: path.join(__dirname, '../extract/Core-Verified Worlds.html'),
    PLAYABLE_WORLDS_HTML: path.join(__dirname, '../extract/Playable Worlds.html'),
    OUTPUT_DIR: path.join(__dirname, '../data'),
    COVERS_DIR: path.join(__dirname, '../data/covers'),
    BANNERS_DIR: path.join(__dirname, '../data/banners'),
    OUTPUT_JSON: path.join(__dirname, '../data/games.json'),
    HISTORY_JSON: path.join(__dirname, '../data/game-history.json'),
    BATCH_SIZE: 10, // Process 10 games in parallel
    DELAY_BETWEEN_BATCHES: 1000, // 1 second delay between batches
};

// Platform detection removed - not needed

// Ensure directories exist
function ensureDirectories() {
    if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
        fs.mkdirSync(CONFIG.OUTPUT_DIR);
    }
    if (!fs.existsSync(CONFIG.COVERS_DIR)) {
        fs.mkdirSync(CONFIG.COVERS_DIR, { recursive: true });
    }
    if (!fs.existsSync(CONFIG.BANNERS_DIR)) {
        fs.mkdirSync(CONFIG.BANNERS_DIR, { recursive: true });
    }
}

// Sleep function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Load game history
function loadGameHistory() {
    if (fs.existsSync(CONFIG.HISTORY_JSON)) {
        try {
            const data = fs.readFileSync(CONFIG.HISTORY_JSON, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.log(`⚠ Warning: Could not read game history: ${error.message}`);
            return {};
        }
    }
    return {};
}

// Save game history
function saveGameHistory(history) {
    try {
        fs.writeFileSync(CONFIG.HISTORY_JSON, JSON.stringify(history, null, 2));
    } catch (error) {
        console.log(`⚠ Warning: Could not save game history: ${error.message}`);
    }
}

// Update game history with new games
function updateGameHistory(games, history) {
    const now = new Date().toISOString();
    const newGameNames = new Set();

    // Add new games to history
    games.forEach(game => {
        if (!history[game.name]) {
            history[game.name] = {
                addedDate: now,
                firstSeen: now
            };
            newGameNames.add(game.name);
        }
    });

    return { newGamesCount: newGameNames.size, newGameNames };
}

// Parse HTML table rows
function parseHTMLTable(html) {
    const rows = [];
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;

    while ((trMatch = trRegex.exec(html)) !== null) {
        const rowContent = trMatch[1];
        const cells = [];
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let tdMatch;

        while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
            const cellContent = tdMatch[1];
            const links = [];
            const aRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
            let aMatch;

            while ((aMatch = aRegex.exec(cellContent)) !== null) {
                links.push({
                    text: aMatch[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim(),
                    url: aMatch[1]
                });
            }

            let text = cellContent
                .replace(/<br\s*\/?>/gi, '\n') // Preserve line breaks
                .replace(/<[^>]+>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/ +/g, ' ') // Multiple spaces to single space
                .trim();

            cells.push({ text, links });
        }

        if (cells.length > 0) {
            rows.push(cells);
        }
    }

    return rows;
}

// Parse Core-Verified Worlds HTML
function parseCoreVerified(filePath) {
    console.log(`\nParsing: ${filePath}`);
    const html = fs.readFileSync(filePath, 'utf-8');
    const rows = parseHTMLTable(html);
    const games = [];

    for (const row of rows) {
        if (row.length >= 4) {
            const name = row[0].text;

            if (!name || name === 'Game' ||
                name.toLowerCase().includes('please') ||
                name.toLowerCase().includes('headers') ||
                name.toLowerCase().includes('if something') ||
                name.toLowerCase().includes('do not sort') ||
                name.toLowerCase().includes('this is a duplication') ||
                name.length <= 1) {
                continue;
            }

            games.push({
                name: name,
                gamePage: row[1].links.length > 0 ? row[1].links[0].url : '',
                setupGuide: row[2].links.length > 0 ? row[2].links[0].url : '',
                discordChannel: row[3].links.length > 0 ? row[3].links[0].url : '',
                status: 'Core-Verified',
                type: 'Core-Verified',
                coverPath: null,
                bannerPath: null
            });
        }
    }

    console.log(`  Found ${games.length} Core-Verified games`);
    return games;
}

// Parse Playable Worlds HTML
function parsePlayableWorlds(filePath) {
    console.log(`\nParsing: ${filePath}`);
    const html = fs.readFileSync(filePath, 'utf-8');
    const rows = parseHTMLTable(html);
    const games = [];

    for (const row of rows) {
        if (row.length >= 4) {
            const name = row[0].text;

            if (!name || name === 'Game' ||
                name.toLowerCase().includes('please') ||
                name.toLowerCase().includes('headers') ||
                name.toLowerCase().includes('if something') ||
                name.toLowerCase().includes('do not sort') ||
                name.toLowerCase().includes('this is a duplication') ||
                name.length <= 1) {
                continue;
            }

            games.push({
                name: name,
                status: row[1].text,
                source: {
                    text: row[2].text,
                    links: row[2].links
                },
                notes: {
                    text: row[3].text,
                    links: row[3].links
                },
                type: 'Playable',
                coverPath: null,
                bannerPath: null
            });
        }
    }

    console.log(`  Found ${games.length} Playable Worlds games`);
    return games;
}

// Parse HTML files
function parseHTML() {
    console.log('\n=== Parsing HTML Files ===');

    if (!fs.existsSync(CONFIG.CORE_VERIFIED_HTML)) {
        throw new Error(`File not found: ${CONFIG.CORE_VERIFIED_HTML}`);
    }
    if (!fs.existsSync(CONFIG.PLAYABLE_WORLDS_HTML)) {
        throw new Error(`File not found: ${CONFIG.PLAYABLE_WORLDS_HTML}`);
    }

    const coreVerified = parseCoreVerified(CONFIG.CORE_VERIFIED_HTML);
    const playableWorlds = parsePlayableWorlds(CONFIG.PLAYABLE_WORLDS_HTML);

    return [...coreVerified, ...playableWorlds];
}

// Fetch from SteamGridDB
async function fetchSteamGridDB(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'Authorization': `Bearer ${CONFIG.STEAMGRIDDB_API_KEY}`
            }
        };

        https.get(url, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                }
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

// Download image
function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(filepath);

        protocol.get(url, (response) => {
            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(filepath, () => { });
            reject(err);
        });
    });
}

// Sanitize filename
function sanitizeFilename(name) {
    return name
        .normalize('NFD') // Decompose accented characters
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .substring(0, 100); // Limit length
}

// Check if a game already has a cover
function hasExistingCover(game) {
    const sanitizedName = sanitizeFilename(game.name);
    const possibleExtensions = ['.jpg', '.png', '.webp', '.jpeg'];

    for (const ext of possibleExtensions) {
        const testPath = path.join(CONFIG.COVERS_DIR, sanitizedName + ext);
        if (fs.existsSync(testPath)) {
            return `data/covers/${sanitizedName}${ext}`;
        }
    }
    return null;
}

// Check if a game already has a banner
function hasExistingBanner(game) {
    const sanitizedName = sanitizeFilename(game.name);
    const possibleExtensions = ['.jpg', '.png', '.webp', '.jpeg'];

    for (const ext of possibleExtensions) {
        const testPath = path.join(CONFIG.BANNERS_DIR, sanitizedName + ext);
        if (fs.existsSync(testPath)) {
            return `data/banners/${sanitizedName}${ext}`;
        }
    }
    return null;
}

// Fetch banner for a game (assumes banner doesn't exist yet)
async function fetchGameBanner(game) {
    try {
        // Create filename from game name
        const sanitizedName = sanitizeFilename(game.name);

        // Clean up game name for search
        let searchName = game.name
            .replace(/\s*\(.*?\)\s*/g, '')
            .replace(/\s*\[.*?\]\s*/g, '')
            .trim();

        console.log(`  Searching banner: ${searchName}`);

        // Search for game
        const searchUrl = `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(searchName)}`;
        const searchData = await fetchSteamGridDB(searchUrl);

        if (!searchData.data || searchData.data.length === 0) {
            console.log(`    ❌ No results found`);
            return null;
        }

        const gameId = searchData.data[0].id;
        const foundName = searchData.data[0].name;
        console.log(`    ✓ Found: ${foundName} (ID: ${gameId})`);

        // Fetch heroes (banners)
        const heroesUrl = `https://www.steamgriddb.com/api/v2/heroes/game/${gameId}`;
        const heroesData = await fetchSteamGridDB(heroesUrl);

        if (!heroesData.data || heroesData.data.length === 0) {
            console.log(`    ❌ No banner found`);
            return null;
        }

        const banner = heroesData.data[0];

        // Download banner with game name
        const ext = path.extname(new URL(banner.url).pathname) || '.jpg';
        const filename = `${sanitizedName}${ext}`;
        const filepath = path.join(CONFIG.BANNERS_DIR, filename);

        console.log(`    ⬇ Downloading banner...`);
        await downloadImage(banner.url, filepath);
        console.log(`    ✓ Saved: ${filename}`);

        return {
            url: banner.url,
            path: `data/banners/${filename}`
        };

    } catch (error) {
        console.log(`    ❌ Error: ${error.message}`);
        return null;
    }
}

// Fetch cover for a game (assumes cover doesn't exist yet)
async function fetchGameCover(game) {
    try {
        // Create filename from game name
        const sanitizedName = sanitizeFilename(game.name);

        // Clean up game name for search
        let searchName = game.name
            .replace(/\s*\(.*?\)\s*/g, '')
            .replace(/\s*\[.*?\]\s*/g, '')
            .trim();

        console.log(`  Searching: ${searchName}`);

        // Search for game
        const searchUrl = `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(searchName)}`;
        const searchData = await fetchSteamGridDB(searchUrl);

        if (!searchData.data || searchData.data.length === 0) {
            console.log(`    ❌ No results found`);
            return null;
        }

        const gameId = searchData.data[0].id;
        const foundName = searchData.data[0].name;
        console.log(`    ✓ Found: ${foundName} (ID: ${gameId})`);

        // Fetch grids
        const gridsUrl = `https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=600x900,342x482,660x930`;
        const gridsData = await fetchSteamGridDB(gridsUrl);

        if (!gridsData.data || gridsData.data.length === 0) {
            console.log(`    ❌ No covers found`);
            return null;
        }

        // Prefer vertical grids
        const verticalGrid = gridsData.data.find(g => g.height > g.width);
        const cover = verticalGrid || gridsData.data[0];

        // Download cover with game name
        const ext = path.extname(new URL(cover.url).pathname) || '.jpg';
        const filename = `${sanitizedName}${ext}`;
        const filepath = path.join(CONFIG.COVERS_DIR, filename);

        console.log(`    ⬇ Downloading cover...`);
        await downloadImage(cover.url, filepath);
        console.log(`    ✓ Saved: ${filename}`);

        return {
            url: cover.url,
            path: `data/covers/${filename}`
        };

    } catch (error) {
        console.log(`    ❌ Error: ${error.message}`);
        return null;
    }
}

// Main build function
async function build() {
    console.log('=== Archipelago Games Library - Build Script ===\n');

    ensureDirectories();

    // Parse HTML files
    const allGames = parseHTML();

    // Remove duplicates
    const uniqueGames = [...new Map(allGames.map(g => [g.name, g])).values()];
    console.log(`\nTotal unique games: ${uniqueGames.length}`);

    // Sort alphabetically
    uniqueGames.sort((a, b) => a.name.localeCompare(b.name));

    // Load and update game history
    console.log('\n=== Updating Game History ===\n');
    const gameHistory = loadGameHistory();
    const { newGamesCount, newGameNames } = updateGameHistory(uniqueGames, gameHistory);

    if (newGamesCount > 0) {
        console.log(`✓ Found ${newGamesCount} new game(s) added to the library!`);
    } else {
        console.log(`✓ No new games detected`);
    }

    // Add addedDate and calculate isNew based on date (last 15 days)
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    uniqueGames.forEach(game => {
        if (gameHistory[game.name]) {
            game.addedDate = gameHistory[game.name].addedDate;
            const addedDate = new Date(gameHistory[game.name].addedDate);
            game.isNew = addedDate >= fifteenDaysAgo;
        }
    });

    // Save updated history
    saveGameHistory(gameHistory);

    // Fetch covers
    console.log('\n=== Checking Existing Covers ===\n');

    // Check if default cover exists
    const defaultCoverPath = 'data/covers/_default.png';
    const hasDefaultCover = fs.existsSync(defaultCoverPath);

    // First, assign existing covers to ALL games
    // Only NEW games without covers will be downloaded
    const gamesMissingCovers = [];

    for (const game of uniqueGames) {
        const existingCover = hasExistingCover(game);
        if (existingCover) {
            // Has specific cover
            game.coverPath = existingCover;
        } else if (newGameNames.has(game.name)) {
            // New game without cover - needs download
            gamesMissingCovers.push(game);
        } else {
            // Old game without specific cover - use default
            if (hasDefaultCover) {
                game.coverPath = defaultCoverPath;
            }
        }
    }

    console.log(`⚠ Need to download ${gamesMissingCovers.length} covers for NEW games\n`);

    // Now fetch missing covers in parallel batches
    let successCount = 0;
    let failCount = 0;

    if (gamesMissingCovers.length > 0) {
        console.log('=== Downloading Missing Covers ===\n');

        const totalBatches = Math.ceil(gamesMissingCovers.length / CONFIG.BATCH_SIZE);

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const start = batchIndex * CONFIG.BATCH_SIZE;
            const end = Math.min(start + CONFIG.BATCH_SIZE, gamesMissingCovers.length);
            const batch = gamesMissingCovers.slice(start, end);

            console.log(`\n--- Batch ${batchIndex + 1}/${totalBatches} (${start + 1}-${end}/${gamesMissingCovers.length}) ---\n`);

            // Process batch in parallel
            const results = await Promise.all(
                batch.map(async (game, index) => {
                    const gameNumber = start + index + 1;
                    console.log(`[${gameNumber}/${gamesMissingCovers.length}] ${game.name}`);

                    const cover = await fetchGameCover(game);

                    if (cover) {
                        game.coverPath = cover.path;
                        return { success: true };
                    } else {
                        return { success: false };
                    }
                })
            );

            // Count results
            results.forEach(result => {
                if (result.success) {
                    successCount++;
                } else {
                    failCount++;
                }
            });

            console.log(`\nBatch ${batchIndex + 1} complete: ${results.filter(r => r.success).length}/${results.length} covers downloaded`);

            // Delay between batches (except for last batch)
            if (batchIndex < totalBatches - 1) {
                console.log(`\nWaiting ${CONFIG.DELAY_BETWEEN_BATCHES}ms before next batch...\n`);
                await sleep(CONFIG.DELAY_BETWEEN_BATCHES);
            }
        }
    }

    // Assign default cover to games without covers
    if (hasDefaultCover) {
        let defaultAssignedCount = 0;
        uniqueGames.forEach(game => {
            if (!game.coverPath) {
                game.coverPath = defaultCoverPath;
                defaultAssignedCount++;
            }
        });
        if (defaultAssignedCount > 0) {
            console.log(`\n✓ Assigned default cover to ${defaultAssignedCount} games without covers`);
        }
    }

    // Fetch banners
    console.log('\n=== Checking Existing Banners ===\n');

    // First, assign existing banners to ALL games
    // Only NEW games without banners will be downloaded
    const gamesMissingBanners = [];
    const defaultBannerPath = 'data/banners/_default.png';
    const hasDefaultBanner = fs.existsSync(defaultBannerPath);

    for (const game of uniqueGames) {
        const existingBanner = hasExistingBanner(game);
        if (existingBanner) {
            // Has specific banner
            game.bannerPath = existingBanner;
        } else if (newGameNames.has(game.name)) {
            // New game without banner - needs download
            gamesMissingBanners.push(game);
        } else {
            // Old game without specific banner - use default
            if (hasDefaultBanner) {
                game.bannerPath = defaultBannerPath;
            }
        }
    }

    console.log(`⚠ Need to download ${gamesMissingBanners.length} banners for NEW games\n`);

    // Now fetch missing banners in parallel batches
    let bannersSuccessCount = 0;
    let bannersFailCount = 0;

    if (gamesMissingBanners.length > 0) {
        console.log('=== Downloading Missing Banners ===\n');

        const totalBannerBatches = Math.ceil(gamesMissingBanners.length / CONFIG.BATCH_SIZE);

        for (let batchIndex = 0; batchIndex < totalBannerBatches; batchIndex++) {
            const start = batchIndex * CONFIG.BATCH_SIZE;
            const end = Math.min(start + CONFIG.BATCH_SIZE, gamesMissingBanners.length);
            const batch = gamesMissingBanners.slice(start, end);

            console.log(`\n--- Batch ${batchIndex + 1}/${totalBannerBatches} (${start + 1}-${end}/${gamesMissingBanners.length}) ---\n`);

            // Process batch in parallel
            const results = await Promise.all(
                batch.map(async (game, index) => {
                    const gameNumber = start + index + 1;
                    console.log(`[${gameNumber}/${gamesMissingBanners.length}] ${game.name}`);

                    const banner = await fetchGameBanner(game);

                    if (banner) {
                        game.bannerPath = banner.path;
                        return { success: true };
                    } else {
                        return { success: false };
                    }
                })
            );

            // Count results
            results.forEach(result => {
                if (result.success) {
                    bannersSuccessCount++;
                } else {
                    bannersFailCount++;
                }
            });

            console.log(`\nBatch ${batchIndex + 1} complete: ${results.filter(r => r.success).length}/${results.length} banners downloaded`);

            // Delay between batches (except for last batch)
            if (batchIndex < totalBannerBatches - 1) {
                console.log(`\nWaiting ${CONFIG.DELAY_BETWEEN_BATCHES}ms before next batch...\n`);
                await sleep(CONFIG.DELAY_BETWEEN_BATCHES);
            }
        }
    }

    // Save JSON
    console.log('\n=== Saving Data ===\n');
    const output = {
        generated: new Date().toISOString(),
        totalGames: uniqueGames.length,
        coversFound: successCount,
        coversMissing: failCount,
        games: uniqueGames
    };

    fs.writeFileSync(CONFIG.OUTPUT_JSON, JSON.stringify(output, null, 2));
    console.log(`✓ Saved: ${CONFIG.OUTPUT_JSON}`);

    // Summary
    console.log('\n=== Build Summary ===\n');
    console.log(`Total games: ${uniqueGames.length}`);
    console.log(`  - Core-Verified: ${uniqueGames.filter(g => g.type === 'Core-Verified').length}`);
    console.log(`  - Playable: ${uniqueGames.filter(g => g.type === 'Playable').length}`);
    console.log(`\nCovers found: ${successCount} (${Math.round(successCount / uniqueGames.length * 100)}%)`);
    console.log(`Covers missing: ${failCount}`);
    console.log(`\nBanners found: ${bannersSuccessCount} (${Math.round(bannersSuccessCount / uniqueGames.length * 100)}%)`);
    console.log(`Banners missing: ${bannersFailCount}`);

    console.log(`\nOutput saved to: ${CONFIG.OUTPUT_JSON}`);
    console.log(`Covers saved to: ${CONFIG.COVERS_DIR}/`);
    console.log(`Banners saved to: ${CONFIG.BANNERS_DIR}/`);
    console.log(`\nBuild complete! 🎉`);
    console.log(`\nTo test: npm run serve`);
    console.log(`Then open: http://localhost:8080`);
}

// Run build
build().catch(error => {
    console.error('\n❌ Build failed:', error);
    process.exit(1);
});
