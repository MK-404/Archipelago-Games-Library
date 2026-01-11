const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const XLSX = require('xlsx');

// Configuration
const CONFIG = {
    STEAMGRIDDB_API_KEY: 'f6c46127673a65d708ec019a7737d108',
    XLSX_FILE: '../Archipelago Games Sheet.xlsx',
    SHEET_NAMES: ['Core-Verified Worlds', 'Playable Worlds'],
    OUTPUT_DIR: '../data',
    COVERS_DIR: '../data/covers',
    BANNERS_DIR: '../data/banners',
    OUTPUT_JSON: '../data/games.json',
    HISTORY_JSON: '../data/game-history.json',
    BATCH_SIZE: 10, // Process 10 games in parallel
    DELAY_BETWEEN_BATCHES: 1000, // 1 second delay between batches
    NEW_GAME_DAYS: 30, // Games added in last 30 days are marked as NEW
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
    let newGamesCount = 0;

    // First pass: identify truly new games
    const newGames = [];
    games.forEach(game => {
        if (!history[game.name]) {
            newGames.push(game);
        }
    });

    // Second pass: if there are new games, remove isNew from all existing games
    if (newGames.length > 0) {
        Object.keys(history).forEach(gameName => {
            if (history[gameName].isNew) {
                delete history[gameName].isNew;
            }
        });

        // Add new games with isNew flag
        newGames.forEach(game => {
            history[game.name] = {
                addedDate: now,
                firstSeen: now,
                isNew: true  // Mark as new only on first appearance
            };
            newGamesCount++;
        });
    }
    // If no new games, keep existing isNew flags unchanged

    return newGamesCount;
}

// Parse XLSX sheet
function parseSheet(sheet, sheetName) {
    console.log(`\nParsing sheet: ${sheetName}`);

    // Convert sheet to array of arrays (no headers)
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const games = [];

    const isPlayableWorlds = sheetName === 'Playable Worlds';
    const isCoreVerified = sheetName === 'Core-Verified Worlds';

    console.log(`  Type: ${sheetName}`);
    console.log(`  Rows: ${data.length}`);

    // Parse each row
    for (const row of data) {
        // Get game name from first column (index 0)
        const gameName = (row[0] || '').toString().trim();

        // Skip metadata rows and empty rows
        if (gameName &&
            !gameName.toLowerCase().includes('please') &&
            !gameName.toLowerCase().includes('headers') &&
            !gameName.toLowerCase().includes('if something') &&
            !gameName.toLowerCase().includes('this is a duplication') &&
            gameName.length > 1) {

            const game = {
                name: gameName,
                coverPath: null,
                bannerPath: null
            };

            // Parse columns based on sheet type
            if (isPlayableWorlds) {
                // Playable Worlds: Column 0 = Game, Column 1 = Status, Column 2 = Source, Column 3 = Notes
                game.status = (row[1] || '').toString();
                game.source = (row[2] || '').toString();
                game.notes = (row[3] || '').toString();
                game.type = 'Playable';
            } else if (isCoreVerified) {
                // Core-Verified: Column 0 = Game, Column 1 = Game Page, Column 2 = Setup Page, Column 3 = Discord Channel
                game.gamePage = (row[1] || '').toString();
                game.setupPage = (row[2] || '').toString();
                game.discordChannel = (row[3] || '').toString();
                game.status = 'Core-Verified';
                game.type = 'Core-Verified';
            }

            games.push(game);
        }
    }

    console.log(`  Found ${games.length} games`);
    return games;
}

// Parse XLSX file
function parseXLSX(filePath) {
    console.log(`\nReading XLSX file: ${filePath}`);

    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const workbook = XLSX.readFile(filePath);
    let allGames = [];

    // Parse each specified sheet
    for (const sheetName of CONFIG.SHEET_NAMES) {
        if (workbook.SheetNames.includes(sheetName)) {
            const sheet = workbook.Sheets[sheetName];
            const games = parseSheet(sheet, sheetName);
            allGames = allGames.concat(games);
        } else {
            console.log(`⚠ Warning: Sheet "${sheetName}" not found in workbook`);
            console.log(`  Available sheets: ${workbook.SheetNames.join(', ')}`);
        }
    }

    return allGames;
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
            fs.unlink(filepath, () => {});
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
    console.log('=== Archipelago Games Viewer - Build Script ===\n');

    ensureDirectories();

    // Parse XLSX file
    const allGames = parseXLSX(CONFIG.XLSX_FILE);

    // Remove duplicates
    const uniqueGames = [...new Map(allGames.map(g => [g.name, g])).values()];
    console.log(`\nTotal unique games: ${uniqueGames.length}`);

    // Sort alphabetically
    uniqueGames.sort((a, b) => a.name.localeCompare(b.name));

    // Load and update game history
    console.log('\n=== Updating Game History ===\n');
    const gameHistory = loadGameHistory();
    const newGamesCount = updateGameHistory(uniqueGames, gameHistory);

    if (newGamesCount > 0) {
        console.log(`✓ Found ${newGamesCount} new game(s) added to the library!`);
    } else {
        console.log(`✓ No new games detected`);
    }

    // Add addedDate and isNew flag to each game
    uniqueGames.forEach(game => {
        if (gameHistory[game.name]) {
            game.addedDate = gameHistory[game.name].addedDate;
            game.isNew = gameHistory[game.name].isNew || false;
        }
    });

    // Save updated history
    saveGameHistory(gameHistory);

    // Fetch covers
    console.log('\n=== Checking Existing Covers ===\n');

    // Check if default cover exists
    const defaultCoverPath = 'data/covers/_default.png';
    const hasDefaultCover = fs.existsSync(defaultCoverPath);

    // First, check which games already have covers
    const gamesWithCovers = [];
    const gamesMissingCovers = [];

    for (const game of uniqueGames) {
        const existingCover = hasExistingCover(game);
        if (existingCover) {
            // Has specific cover
            game.coverPath = existingCover;
            gamesWithCovers.push(game);
        } else if (hasDefaultCover) {
            // No specific cover, but default exists - use it directly
            game.coverPath = defaultCoverPath;
            gamesWithCovers.push(game);
        } else {
            // No specific cover and no default - needs download attempt
            gamesMissingCovers.push(game);
        }
    }

    console.log(`✓ Found ${gamesWithCovers.length} games with existing covers (including default)`);
    console.log(`⚠ Need to download ${gamesMissingCovers.length} covers\n`);

    // Now fetch missing covers in parallel batches
    let successCount = gamesWithCovers.length; // Start with existing covers
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

    // First, check which games already have banners
    const gamesWithBanners = [];
    const gamesMissingBanners = [];
    const defaultBannerPath = 'data/banners/_default.png';
    const hasDefaultBanner = fs.existsSync(defaultBannerPath);

    for (const game of uniqueGames) {
        const existingBanner = hasExistingBanner(game);
        if (existingBanner) {
            // Has specific banner
            game.bannerPath = existingBanner;
            gamesWithBanners.push(game);
        } else if (hasDefaultBanner) {
            // No specific banner, but default exists - use it directly
            game.bannerPath = defaultBannerPath;
            gamesWithBanners.push(game);
        } else {
            // No specific banner and no default - needs download attempt
            gamesMissingBanners.push(game);
        }
    }

    console.log(`✓ Found ${gamesWithBanners.length} games with existing banners (including default)`);
    console.log(`⚠ Need to download ${gamesMissingBanners.length} banners\n`);

    // Now fetch missing banners in parallel batches
    let bannersSuccessCount = gamesWithBanners.length;
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
