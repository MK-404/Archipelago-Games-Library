const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const XLSX = require('xlsx');

// Configuration
const CONFIG = {
    STEAMGRIDDB_API_KEY: process.env.STEAMGRIDDB_API_KEY || '',
    GOOGLE_SHEETS_API_KEY: process.env.GOOGLE_SHEETS_API_KEY || '',
    SPREADSHEET_ID: '1iuzDTOAvdoNe8Ne8i461qGNucg5OuEoF-Ikqs8aUQZw',
    XLSX_PATH: path.join(__dirname, '../extract/spreadsheet.xlsx'),
    OUTPUT_DIR: path.join(__dirname, '../data'),
    COVERS_DIR: path.join(__dirname, '../data/covers'),
    BANNERS_DIR: path.join(__dirname, '../data/banners'),
    OUTPUT_JSON: path.join(__dirname, '../data/games.json'),
    OUTPUT_TOOLS_JSON: path.join(__dirname, '../data/tools.json'),
    HISTORY_JSON: path.join(__dirname, '../data/game-history.json'),
    TOOLS_HISTORY_JSON: path.join(__dirname, '../data/tools-history.json'),
    EXTRACT_DIR: path.join(__dirname, '../extract'),
    BATCH_SIZE: 10,
    DELAY_BETWEEN_BATCHES: 1000,
};

// Ensure directories exist
function ensureDirectories() {
    [CONFIG.OUTPUT_DIR, CONFIG.COVERS_DIR, CONFIG.BANNERS_DIR, CONFIG.EXTRACT_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}

// Sleep function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// HTTPS GET that follows redirects and returns a Buffer
function httpsGetBuffer(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) {
            return reject(new Error('Too many redirects'));
        }

        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        protocol.get(url, (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode)) {
                const redirectUrl = res.headers.location;
                if (!redirectUrl) {
                    return reject(new Error(`Redirect ${res.statusCode} without Location header`));
                }
                const absoluteUrl = new URL(redirectUrl, url).href;
                console.log(`  Redirect ${res.statusCode} -> ${absoluteUrl.substring(0, 80)}...`);
                httpsGetBuffer(absoluteUrl, maxRedirects - 1)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            }

            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

// Download the full spreadsheet as XLSX
async function downloadSpreadsheet() {
    const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/export?format=xlsx`;
    console.log(`\nDownloading spreadsheet as XLSX...`);

    try {
        const buffer = await httpsGetBuffer(url);
        fs.writeFileSync(CONFIG.XLSX_PATH, buffer);
        console.log(`  Saved: ${CONFIG.XLSX_PATH} (${(buffer.length / 1024).toFixed(1)} KB)`);
        return true;
    } catch (error) {
        console.log(`  Download failed: ${error.message}`);
        if (fs.existsSync(CONFIG.XLSX_PATH)) {
            console.log(`  Using existing local file as fallback`);
            return true;
        }
        return false;
    }
}

// Fetch cell data from Google Sheets API (returns all hyperlinks per cell)
async function fetchSheetLinks(sheetName, range) {
    const encodedRange = encodeURIComponent(`${sheetName}!${range}`);
    const fields = encodeURIComponent('sheets.data.rowData.values(formattedValue,textFormatRuns,hyperlink,chipRuns)');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?ranges=${encodedRange}&fields=${fields}&includeGridData=true&key=${CONFIG.GOOGLE_SHEETS_API_KEY}`;

    try {
        const buffer = await httpsGetBuffer(url);
        const data = JSON.parse(buffer.toString());
        const rows = data.sheets?.[0]?.data?.[0]?.rowData || [];
        return rows;
    } catch (error) {
        console.log(`  Warning: Sheets API failed for ${sheetName}: ${error.message}`);
        return null;
    }
}

// Extract links from a Sheets API cell (textFormatRuns + chipRuns + hyperlink)
function extractApiCellLinks(cell) {
    if (!cell) return { text: '', links: [] };
    const text = cell.formattedValue || '';
    const links = [];

    // Extract from textFormatRuns (regular hyperlinks in rich text)
    if (cell.textFormatRuns) {
        const runs = cell.textFormatRuns;
        for (let i = 0; i < runs.length; i++) {
            const run = runs[i];
            const uri = run.format?.link?.uri;
            if (!uri) continue;

            const startIdx = run.startIndex || 0;
            let endIdx = text.length;
            for (let j = i + 1; j < runs.length; j++) {
                if (runs[j].startIndex !== undefined) {
                    endIdx = runs[j].startIndex;
                    break;
                }
            }

            const label = text.substring(startIdx, endIdx).replace(/^[\s,;]+|[\s,;]+$/g, '');
            if (label) {
                links.push({ text: label, url: uri });
            }
        }
    }

    // Extract from chipRuns (Google smart chips - links to Docs/Sheets/etc)
    if (cell.chipRuns) {
        for (let i = 0; i < cell.chipRuns.length; i++) {
            const chip = cell.chipRuns[i];
            const uri = chip.chip?.richLinkProperties?.uri;
            if (!uri) continue;

            const startIdx = chip.startIndex || 0;
            let endIdx = text.length;
            for (let j = i + 1; j < cell.chipRuns.length; j++) {
                if (cell.chipRuns[j].startIndex !== undefined) {
                    endIdx = cell.chipRuns[j].startIndex;
                    break;
                }
            }

            const label = text.substring(startIdx, endIdx).replace(/^[\s,;]+|[\s,;]+$/g, '');
            if (label) {
                links.push({ text: label, url: uri });
            }
        }
    }

    // Fallback: simple cell with a single hyperlink (no rich text, no chips)
    if (links.length === 0 && cell.hyperlink) {
        links.push({ text: text, url: cell.hyperlink });
    }

    return { text, links };
}

// Load history (shared for games and tools)
function loadHistory(historyPath) {
    if (fs.existsSync(historyPath)) {
        try {
            const data = fs.readFileSync(historyPath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.log(`Warning: Could not read history: ${error.message}`);
            return {};
        }
    }
    return {};
}

// Save history
function saveHistory(history, historyPath) {
    try {
        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
    } catch (error) {
        console.log(`Warning: Could not save history: ${error.message}`);
    }
}

// Update history with new entries
function updateHistory(items, history) {
    const now = new Date().toISOString();
    const newNames = new Set();

    items.forEach(item => {
        if (!history[item.name]) {
            history[item.name] = {
                addedDate: now,
                firstSeen: now
            };
            newNames.add(item.name);
        }
    });

    return { newCount: newNames.size, newNames };
}

// Extract links from a cell's rich text XML and hyperlink
// XLSX stores only 1 hyperlink per cell, but the rich text XML shows
// which text fragments are styled as links (blue + underline).
// We extract the labeled link parts and map the first URL to the first label.
function extractCellLinks(cell) {
    if (!cell) return { text: '', links: [] };

    const text = (cell.v || '').toString().trim();
    const links = [];

    // Get the primary hyperlink URL (only one per cell in XLSX)
    const primaryUrl = cell.l ? (cell.l.Target || (cell.l.Rel && cell.l.Rel.Target) || '') : '';

    if (!cell.r) {
        // No rich text - simple cell
        if (primaryUrl) {
            links.push({ text: text, url: primaryUrl.replace(/&amp;/g, '&') });
        }
        return { text, links };
    }

    // Parse rich text XML to extract labeled link segments
    // Rich text format: <r><rPr><color rgb="FF1155CC"/><u/></rPr><t>Label</t></r>
    // Link segments have color #1155CC (Google's link blue) and underline
    const richXml = cell.r;
    const segmentRegex = /<r>([\s\S]*?)<\/r>/gi;
    let match;
    const linkLabels = [];

    while ((match = segmentRegex.exec(richXml)) !== null) {
        const segment = match[1];
        // Extract the text
        const textMatch = segment.match(/<t[^>]*>([\s\S]*?)<\/t>/i);
        if (!textMatch) continue;
        const segText = textMatch[1].trim();
        if (!segText || segText === ',' || segText === ', ' || segText === '; ') continue;

        // Check if this segment is styled as a link (blue color + underline)
        const isLink = segment.includes('1155CC') || segment.includes('underline');

        if (isLink && segText.length > 0) {
            linkLabels.push(segText);
        }
    }

    if (linkLabels.length > 0 && primaryUrl) {
        // First label gets the real URL
        links.push({ text: linkLabels[0], url: primaryUrl.replace(/&amp;/g, '&') });
        // Remaining labels - we don't have their URLs from XLSX
        // Store them with an empty url so the frontend knows they exist as labels
        for (let i = 1; i < linkLabels.length; i++) {
            links.push({ text: linkLabels[i], url: '' });
        }
    } else if (primaryUrl) {
        links.push({ text: text, url: primaryUrl.replace(/&amp;/g, '&') });
    }

    return { text, links };
}

// Merge several {text, links} cell results into one
function mergeLinkData(parts) {
    const texts = [];
    const links = [];
    for (const part of parts) {
        if (!part) continue;
        if (part.text) texts.push(part.text);
        if (part.links) links.push(...part.links);
    }
    return { text: texts.join(', '), links };
}

// Check if a row is an instruction/header row (skip it)
function isInstructionRow(name) {
    if (!name || name.length <= 1) return true;
    const lower = name.toLowerCase();
    // Skip header
    if (lower === 'game') return true;
    // Skip instruction rows that are clearly not game names
    if (lower.includes('the person generating')) return true;
    if (lower.includes('the apworlds should be placed')) return true;
    if (lower.includes('alternate places to get info')) return true;
    if (lower.includes('hover over column headers')) return true;
    if (lower.includes('please only download')) return true;
    if (lower.includes('do not sort')) return true;
    if (lower.includes('this is a duplication')) return true;
    if (lower.includes('if something is missing')) return true;
    // Skip rows with very long names (likely instruction text)
    if (name.length > 80) return true;
    return false;
}

// Compute game type from PR Status
function computeType(prStatus) {
    const pr = (prStatus || '').trim().toLowerCase();
    if (pr === 'merged' || pr === 'in review') return 'Core-Verified';
    return 'Playable';
}

// Get cell value as string
function getCellText(ws, ref) {
    const cell = ws[ref];
    if (!cell) return '';
    return (cell.v || '').toString().trim();
}

// Get cell as boolean (for TRUE/FALSE)
function getCellBool(ws, ref) {
    const cell = ws[ref];
    if (!cell) return false;
    if (typeof cell.v === 'boolean') return cell.v;
    return (cell.v || '').toString().toUpperCase() === 'TRUE';
}

// Parse Playable Worlds sheet from XLSX workbook + optional Sheets API data
// Columns: A=Game, B=Stability, C=PR Status, D=18+/Unrated, E=Links & Downloads,
//          F=Setup Guides, G=Support, H=Disclosures, I=Notes
function parsePlayableWorlds(wb, apiRows) {
    const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('playable'));
    if (!sheetName) {
        console.log('  Warning: "Playable Worlds" sheet not found');
        return [];
    }

    console.log(`\nParsing sheet: "${sheetName}"`);
    const ws = wb.Sheets[sheetName];
    const range = XLSX.utils.decode_range(ws['!ref']);
    const games = [];

    for (let row = range.s.r; row <= range.e.r; row++) {
        const name = getCellText(ws, XLSX.utils.encode_cell({ r: row, c: 0 }));
        if (isInstructionRow(name)) continue;

        const stability = getCellText(ws, XLSX.utils.encode_cell({ r: row, c: 1 }));
        const prStatus = getCellText(ws, XLSX.utils.encode_cell({ r: row, c: 2 }));
        const isAdult = getCellBool(ws, XLSX.utils.encode_cell({ r: row, c: 3 }));

        // Use Sheets API data for links/notes if available, fallback to XLSX
        let linksData, notesData;
        const apiRow = apiRows ? apiRows[row] : null;
        const apiValues = apiRow?.values;

        if (apiValues) {
            // Columns E (Links & Downloads), F (Setup Guides), G (Support)
            linksData = mergeLinkData([4, 5, 6].map(i => extractApiCellLinks(apiValues[i])));
            notesData = extractApiCellLinks(apiValues[8]); // Column I
        } else {
            linksData = mergeLinkData([4, 5, 6].map(
                c => extractCellLinks(ws[XLSX.utils.encode_cell({ r: row, c })])
            ));
            notesData = extractCellLinks(ws[XLSX.utils.encode_cell({ r: row, c: 8 })]);
        }

        games.push({
            name,
            stability,
            prStatus,
            links: linksData,
            isAdult,
            notes: notesData,
            status: stability,
            type: computeType(prStatus),
            coverPath: null,
            bannerPath: null
        });
    }

    console.log(`  Found ${games.length} games`);
    return games;
}

// Parse Core-Verified Worlds sheet from XLSX workbook
// Columns: A=Game, B=Game Page (link), C=Setup Guide (link), D=Discord Channel (link)
function parseCoreVerified(wb) {
    const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('core-verified'));
    if (!sheetName) {
        console.log('  Warning: "Core-Verified Worlds" sheet not found');
        return [];
    }

    console.log(`\nParsing sheet: "${sheetName}"`);
    const ws = wb.Sheets[sheetName];
    const range = XLSX.utils.decode_range(ws['!ref']);
    const games = [];

    for (let row = range.s.r; row <= range.e.r; row++) {
        const name = getCellText(ws, XLSX.utils.encode_cell({ r: row, c: 0 }));
        if (isInstructionRow(name)) continue;

        // Build links from columns B, C, D (each has a hyperlink)
        const links = [];
        const colLabels = ['Game Page', 'Setup Guide', 'Discord Channel'];
        for (let c = 1; c <= 3; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r: row, c })];
            if (cell && cell.l) {
                const url = cell.l.Target || (cell.l.Rel && cell.l.Rel.Target) || '';
                if (url) {
                    links.push({
                        text: colLabels[c - 1],
                        url: url.replace(/&amp;/g, '&')
                    });
                }
            }
        }

        const linkTexts = links.map(l => l.text).join(', ');

        games.push({
            name,
            stability: 'Stable',
            prStatus: 'Merged',
            links: { text: linkTexts, links },
            isAdult: false,
            notes: { text: '', links: [] },
            status: 'Stable',
            type: 'Core-Verified',
            coverPath: null,
            bannerPath: null
        });
    }

    console.log(`  Found ${games.length} core-verified games`);
    return games;
}

// Parse Tools sheet from XLSX workbook + optional Sheets API data
// Columns: A=Game, B=Type, C=18+/Unrated, D=Links & Downloads, E=Support, F=Disclosures, G=Notes
function parseTools(wb, apiRows) {
    const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('tools'));
    if (!sheetName) {
        console.log('  Warning: "Tools" sheet not found');
        return [];
    }

    console.log(`\nParsing sheet: "${sheetName}"`);
    const ws = wb.Sheets[sheetName];
    const range = XLSX.utils.decode_range(ws['!ref']);
    const tools = [];

    for (let row = range.s.r; row <= range.e.r; row++) {
        const name = getCellText(ws, XLSX.utils.encode_cell({ r: row, c: 0 }));
        if (isInstructionRow(name)) continue;

        const toolType = getCellText(ws, XLSX.utils.encode_cell({ r: row, c: 1 }));
        if (!toolType) continue; // Skip rows without a type

        const isAdult = getCellBool(ws, XLSX.utils.encode_cell({ r: row, c: 2 }));

        // Use Sheets API data for links/notes if available, fallback to XLSX
        let linksData, notesData;
        const apiRow = apiRows ? apiRows[row] : null;
        const apiValues = apiRow?.values;

        if (apiValues) {
            // Columns D (Links & Downloads), E (Support)
            linksData = mergeLinkData([3, 4].map(i => extractApiCellLinks(apiValues[i])));
            notesData = extractApiCellLinks(apiValues[6]); // Column G
        } else {
            linksData = mergeLinkData([3, 4].map(
                c => extractCellLinks(ws[XLSX.utils.encode_cell({ r: row, c })])
            ));
            notesData = extractCellLinks(ws[XLSX.utils.encode_cell({ r: row, c: 6 })]);
        }

        tools.push({
            name,
            toolType,
            links: linksData,
            isAdult,
            notes: notesData
        });
    }

    console.log(`  Found ${tools.length} tools/meta games/hint games`);
    return tools;
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
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                }
            });
        }).on('error', reject);
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
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 100);
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

// Fetch banner for a game
async function fetchGameBanner(game) {
    try {
        const sanitizedName = sanitizeFilename(game.name);
        let searchName = game.name
            .replace(/\s*\(.*?\)\s*/g, '')
            .replace(/\s*\[.*?\]\s*/g, '')
            .trim();

        console.log(`  Searching banner: ${searchName}`);
        const searchUrl = `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(searchName)}`;
        const searchData = await fetchSteamGridDB(searchUrl);

        if (!searchData.data || searchData.data.length === 0) {
            console.log(`    No results found`);
            return null;
        }

        const gameId = searchData.data[0].id;
        console.log(`    Found: ${searchData.data[0].name} (ID: ${gameId})`);

        const heroesUrl = `https://www.steamgriddb.com/api/v2/heroes/game/${gameId}`;
        const heroesData = await fetchSteamGridDB(heroesUrl);

        if (!heroesData.data || heroesData.data.length === 0) {
            console.log(`    No banner found`);
            return null;
        }

        const banner = heroesData.data[0];
        const ext = path.extname(new URL(banner.url).pathname) || '.jpg';
        const filename = `${sanitizedName}${ext}`;
        const filepath = path.join(CONFIG.BANNERS_DIR, filename);

        console.log(`    Downloading banner...`);
        await downloadImage(banner.url, filepath);
        console.log(`    Saved: ${filename}`);

        return { url: banner.url, path: `data/banners/${filename}` };
    } catch (error) {
        console.log(`    Error: ${error.message}`);
        return null;
    }
}

// Fetch cover for a game
async function fetchGameCover(game) {
    try {
        const sanitizedName = sanitizeFilename(game.name);
        let searchName = game.name
            .replace(/\s*\(.*?\)\s*/g, '')
            .replace(/\s*\[.*?\]\s*/g, '')
            .trim();

        console.log(`  Searching: ${searchName}`);
        const searchUrl = `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(searchName)}`;
        const searchData = await fetchSteamGridDB(searchUrl);

        if (!searchData.data || searchData.data.length === 0) {
            console.log(`    No results found`);
            return null;
        }

        const gameId = searchData.data[0].id;
        console.log(`    Found: ${searchData.data[0].name} (ID: ${gameId})`);

        const gridsUrl = `https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=600x900,342x482,660x930`;
        const gridsData = await fetchSteamGridDB(gridsUrl);

        if (!gridsData.data || gridsData.data.length === 0) {
            console.log(`    No covers found`);
            return null;
        }

        const verticalGrid = gridsData.data.find(g => g.height > g.width);
        const cover = verticalGrid || gridsData.data[0];

        const ext = path.extname(new URL(cover.url).pathname) || '.jpg';
        const filename = `${sanitizedName}${ext}`;
        const filepath = path.join(CONFIG.COVERS_DIR, filename);

        console.log(`    Downloading cover...`);
        await downloadImage(cover.url, filepath);
        console.log(`    Saved: ${filename}`);

        return { url: cover.url, path: `data/covers/${filename}` };
    } catch (error) {
        console.log(`    Error: ${error.message}`);
        return null;
    }
}

// Main build function
async function build() {
    console.log('=== Archipelago Games Library - Build Script ===\n');

    ensureDirectories();

    // === Download spreadsheet ===
    console.log('=== Downloading Spreadsheet ===');
    const downloadOk = await downloadSpreadsheet();

    if (!downloadOk) {
        throw new Error('Could not download or find spreadsheet XLSX');
    }

    // === Read XLSX ===
    console.log('\n=== Parsing Spreadsheet ===');
    const xlsxData = fs.readFileSync(CONFIG.XLSX_PATH);
    const wb = XLSX.read(xlsxData, { type: 'buffer' });
    console.log(`Sheets found: ${wb.SheetNames.join(', ')}`);

    // === Fetch full link data from Google Sheets API ===
    let playableApiRows = null;
    let toolsApiRows = null;

    if (CONFIG.GOOGLE_SHEETS_API_KEY) {
        console.log('\n=== Fetching links from Google Sheets API ===');
        const playableSheet = wb.SheetNames.find(n => n.toLowerCase().includes('playable'));
        const toolsSheet = wb.SheetNames.find(n => n.toLowerCase().includes('tools'));

        if (playableSheet) {
            const ws = wb.Sheets[playableSheet];
            const range = XLSX.utils.decode_range(ws['!ref']);
            const apiRange = `A1:F${range.e.r + 1}`;
            console.log(`  Fetching ${playableSheet} (${apiRange})...`);
            playableApiRows = await fetchSheetLinks(playableSheet, apiRange);
            if (playableApiRows) {
                console.log(`  Got ${playableApiRows.length} rows from API`);
            }
        }

        if (toolsSheet) {
            const ws = wb.Sheets[toolsSheet];
            const range = XLSX.utils.decode_range(ws['!ref']);
            const apiRange = `A1:E${range.e.r + 1}`;
            console.log(`  Fetching ${toolsSheet} (${apiRange})...`);
            toolsApiRows = await fetchSheetLinks(toolsSheet, apiRange);
            if (toolsApiRows) {
                console.log(`  Got ${toolsApiRows.length} rows from API`);
            }
        }
    } else {
        console.log('\n=== Google Sheets API key not set, using XLSX links (1 per cell) ===');
    }

    // === Parse games ===
    const playableGames = parsePlayableWorlds(wb, playableApiRows);
    const coreGames = parseCoreVerified(wb);

    // Merge: Playable Worlds entries take priority (they have more detail)
    // Core-Verified games not already in Playable Worlds get added
    const gamesByName = new Map(playableGames.map(g => [g.name, g]));
    let coreAdded = 0;
    for (const cg of coreGames) {
        if (!gamesByName.has(cg.name)) {
            gamesByName.set(cg.name, cg);
            coreAdded++;
        }
    }
    console.log(`\nAdded ${coreAdded} games from Core-Verified sheet (not in Playable Worlds)`);

    // Remove duplicates
    const uniqueGames = [...gamesByName.values()];
    console.log(`\nTotal unique games: ${uniqueGames.length}`);

    // Sort alphabetically
    uniqueGames.sort((a, b) => a.name.localeCompare(b.name));

    // === Parse tools ===
    const allToolsRaw = parseTools(wb, toolsApiRows);
    const uniqueTools = [...new Map(allToolsRaw.map(t => [t.name, t])).values()];
    uniqueTools.sort((a, b) => a.name.localeCompare(b.name));
    console.log(`Total unique tools: ${uniqueTools.length}`);

    // === Game history ===
    console.log('\n=== Updating Game History ===\n');
    const gameHistory = loadHistory(CONFIG.HISTORY_JSON);
    const { newCount: newGamesCount, newNames: newGameNames } = updateHistory(uniqueGames, gameHistory);

    if (newGamesCount > 0) {
        console.log(`Found ${newGamesCount} new game(s) added to the library!`);
    } else {
        console.log(`No new games detected`);
    }

    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    uniqueGames.forEach(game => {
        if (gameHistory[game.name]) {
            game.addedDate = gameHistory[game.name].addedDate;
            const addedDate = new Date(gameHistory[game.name].addedDate);
            game.isNew = addedDate >= fifteenDaysAgo;
        }
    });

    saveHistory(gameHistory, CONFIG.HISTORY_JSON);

    // === Tools history ===
    console.log('\n=== Updating Tools History ===\n');
    const toolsHistory = loadHistory(CONFIG.TOOLS_HISTORY_JSON);
    const { newCount: newToolsCount } = updateHistory(uniqueTools, toolsHistory);

    if (newToolsCount > 0) {
        console.log(`Found ${newToolsCount} new tool(s) added!`);
    } else {
        console.log(`No new tools detected`);
    }

    uniqueTools.forEach(tool => {
        if (toolsHistory[tool.name]) {
            tool.addedDate = toolsHistory[tool.name].addedDate;
            const addedDate = new Date(toolsHistory[tool.name].addedDate);
            tool.isNew = addedDate >= fifteenDaysAgo;
        }
    });

    saveHistory(toolsHistory, CONFIG.TOOLS_HISTORY_JSON);

    // === Fetch covers ===
    console.log('\n=== Checking Existing Covers ===\n');

    const defaultCoverPath = 'data/covers/_default.png';
    const hasDefaultCover = fs.existsSync(path.join(__dirname, '..', defaultCoverPath));
    const gamesMissingCovers = [];

    for (const game of uniqueGames) {
        const existingCover = hasExistingCover(game);
        if (existingCover) {
            game.coverPath = existingCover;
        } else if (newGameNames.has(game.name)) {
            gamesMissingCovers.push(game);
        } else if (hasDefaultCover) {
            game.coverPath = defaultCoverPath;
        }
    }

    console.log(`Need to download ${gamesMissingCovers.length} covers for NEW games\n`);

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

            const results = await Promise.all(
                batch.map(async (game, index) => {
                    console.log(`[${start + index + 1}/${gamesMissingCovers.length}] ${game.name}`);
                    const cover = await fetchGameCover(game);
                    if (cover) {
                        game.coverPath = cover.path;
                        return { success: true };
                    }
                    return { success: false };
                })
            );

            results.forEach(r => r.success ? successCount++ : failCount++);
            console.log(`\nBatch ${batchIndex + 1} complete: ${results.filter(r => r.success).length}/${results.length} covers`);

            if (batchIndex < totalBatches - 1) {
                await sleep(CONFIG.DELAY_BETWEEN_BATCHES);
            }
        }
    }

    // Assign default cover
    if (hasDefaultCover) {
        let defaultCount = 0;
        uniqueGames.forEach(game => {
            if (!game.coverPath) {
                game.coverPath = defaultCoverPath;
                defaultCount++;
            }
        });
        if (defaultCount > 0) console.log(`\nAssigned default cover to ${defaultCount} games`);
    }

    // === Fetch banners ===
    console.log('\n=== Checking Existing Banners ===\n');

    const defaultBannerPath = 'data/banners/_default.png';
    const hasDefaultBanner = fs.existsSync(path.join(__dirname, '..', defaultBannerPath));
    const gamesMissingBanners = [];

    for (const game of uniqueGames) {
        const existingBanner = hasExistingBanner(game);
        if (existingBanner) {
            game.bannerPath = existingBanner;
        } else if (newGameNames.has(game.name)) {
            gamesMissingBanners.push(game);
        } else if (hasDefaultBanner) {
            game.bannerPath = defaultBannerPath;
        }
    }

    console.log(`Need to download ${gamesMissingBanners.length} banners for NEW games\n`);

    let bannersSuccess = 0;
    let bannersFail = 0;

    if (gamesMissingBanners.length > 0) {
        console.log('=== Downloading Missing Banners ===\n');
        const totalBatches = Math.ceil(gamesMissingBanners.length / CONFIG.BATCH_SIZE);

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const start = batchIndex * CONFIG.BATCH_SIZE;
            const end = Math.min(start + CONFIG.BATCH_SIZE, gamesMissingBanners.length);
            const batch = gamesMissingBanners.slice(start, end);

            console.log(`\n--- Batch ${batchIndex + 1}/${totalBatches} (${start + 1}-${end}/${gamesMissingBanners.length}) ---\n`);

            const results = await Promise.all(
                batch.map(async (game, index) => {
                    console.log(`[${start + index + 1}/${gamesMissingBanners.length}] ${game.name}`);
                    const banner = await fetchGameBanner(game);
                    if (banner) {
                        game.bannerPath = banner.path;
                        return { success: true };
                    }
                    return { success: false };
                })
            );

            results.forEach(r => r.success ? bannersSuccess++ : bannersFail++);
            console.log(`\nBatch ${batchIndex + 1} complete: ${results.filter(r => r.success).length}/${results.length} banners`);

            if (batchIndex < totalBatches - 1) {
                await sleep(CONFIG.DELAY_BETWEEN_BATCHES);
            }
        }
    }

    // === Save games JSON ===
    console.log('\n=== Saving Data ===\n');
    const gamesOutput = {
        generated: new Date().toISOString(),
        totalGames: uniqueGames.length,
        coversFound: successCount,
        coversMissing: failCount,
        games: uniqueGames
    };

    fs.writeFileSync(CONFIG.OUTPUT_JSON, JSON.stringify(gamesOutput, null, 2));
    console.log(`Saved: ${CONFIG.OUTPUT_JSON}`);

    // === Save tools JSON ===
    const toolsOutput = {
        generated: new Date().toISOString(),
        totalTools: uniqueTools.length,
        tools: uniqueTools
    };

    fs.writeFileSync(CONFIG.OUTPUT_TOOLS_JSON, JSON.stringify(toolsOutput, null, 2));
    console.log(`Saved: ${CONFIG.OUTPUT_TOOLS_JSON}`);

    // === Summary ===
    console.log('\n=== Build Summary ===\n');
    console.log(`Total games: ${uniqueGames.length}`);
    console.log(`  - Core-Verified (Merged/In Review): ${uniqueGames.filter(g => g.type === 'Core-Verified').length}`);
    console.log(`  - Playable: ${uniqueGames.filter(g => g.type === 'Playable').length}`);
    console.log(`\nCovers: ${successCount} downloaded, ${failCount} failed`);
    console.log(`Banners: ${bannersSuccess} downloaded, ${bannersFail} failed`);
    console.log(`\nTotal tools/meta/hint: ${uniqueTools.length}`);
    console.log(`  - Tools: ${uniqueTools.filter(t => t.toolType === 'Tool').length}`);
    console.log(`  - Meta Games: ${uniqueTools.filter(t => t.toolType === 'Meta Game').length}`);
    console.log(`  - Hint Games: ${uniqueTools.filter(t => t.toolType === 'Hint Game').length}`);

    // Generate easter eggs list
    const easterEggsDir = path.join(__dirname, '../easter-eggs');
    if (fs.existsSync(easterEggsDir)) {
        const easterEggs = fs.readdirSync(easterEggsDir)
            .filter(f => f.toLowerCase().endsWith('.png'))
            .sort();
        fs.writeFileSync(
            path.join(easterEggsDir, 'list.json'),
            JSON.stringify(easterEggs)
        );
        console.log(`\nEaster eggs: ${easterEggs.length} PNG files indexed`);
    }

    console.log(`\nBuild complete!`);
    console.log(`\nTo test: npm run serve`);
    console.log(`Then open: http://localhost:8080`);
}

// Run build
build().catch(error => {
    console.error('\nBuild failed:', error);
    process.exit(1);
});
