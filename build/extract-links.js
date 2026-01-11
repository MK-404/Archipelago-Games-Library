const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    EXTRACT_DIR: path.join(__dirname, '../extract'),
    CORE_VERIFIED_HTML: path.join(__dirname, '../extract/Core-Verified Worlds.html'),
    PLAYABLE_WORLDS_HTML: path.join(__dirname, '../extract/Playable Worlds.html'),
    OUTPUT_JSON: path.join(__dirname, '../extract/extracted-links.json')
};

// Parse HTML table rows
function parseHTMLTable(html) {
    const rows = [];

    // Match all table rows
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;

    while ((trMatch = trRegex.exec(html)) !== null) {
        const rowContent = trMatch[1];
        const cells = [];

        // Match ONLY table data cells (td), ignore row headers (th)
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let tdMatch;

        while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
            const cellContent = tdMatch[1];

            // Extract text and links from cell
            const links = [];
            const aRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
            let aMatch;

            while ((aMatch = aRegex.exec(cellContent)) !== null) {
                const url = aMatch[1];
                const linkText = aMatch[2]
                    .replace(/<[^>]+>/g, '') // Remove any HTML tags
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .trim();

                links.push({
                    text: linkText,
                    url: url
                });
            }

            // Extract plain text (remove all HTML tags and decode entities)
            let text = cellContent
                .replace(/<[^>]+>/g, '') // Remove HTML tags
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/\s+/g, ' ') // Normalize whitespace
                .trim();

            cells.push({
                text: text,
                links: links
            });
        }

        if (cells.length > 0) {
            rows.push(cells);
        }
    }

    return rows;
}

// Parse Core-Verified Worlds
function parseCoreVerified(filePath) {
    console.log(`\nParsing: ${filePath}`);

    const html = fs.readFileSync(filePath, 'utf-8');
    const rows = parseHTMLTable(html);

    console.log(`  Found ${rows.length} rows`);

    const games = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        if (row.length >= 4) {
            const name = row[0].text;

            // Skip empty or metadata rows
            if (!name ||
                name === 'Game' || // Header row
                name.toLowerCase().includes('please') ||
                name.toLowerCase().includes('headers') ||
                name.toLowerCase().includes('if something') ||
                name.toLowerCase().includes('do not sort') ||
                name.toLowerCase().includes('this is a duplication') ||
                name.length <= 1) {
                continue;
            }

            // Column B: Game Page (index 1)
            const gamePage = row[1].links.length > 0 ? row[1].links[0].url : '';

            // Column C: Setup Guide (index 2)
            const setupGuide = row[2].links.length > 0 ? row[2].links[0].url : '';

            // Column D: Discord Channel (index 3)
            const discordChannel = row[3].links.length > 0 ? row[3].links[0].url : '';

            games.push({
                name: name,
                gamePage: gamePage,
                setupGuide: setupGuide,
                discordChannel: discordChannel
            });
        }
    }

    console.log(`  Extracted ${games.length} games`);
    return games;
}

// Parse Playable Worlds
function parsePlayableWorlds(filePath) {
    console.log(`\nParsing: ${filePath}`);

    const html = fs.readFileSync(filePath, 'utf-8');
    const rows = parseHTMLTable(html);

    console.log(`  Found ${rows.length} rows`);

    const games = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        if (row.length >= 4) {
            const name = row[0].text;

            // Skip empty or metadata rows
            if (!name ||
                name === 'Game' || // Header row
                name.toLowerCase().includes('please') ||
                name.toLowerCase().includes('headers') ||
                name.toLowerCase().includes('if something') ||
                name.toLowerCase().includes('do not sort') ||
                name.toLowerCase().includes('this is a duplication') ||
                name.length <= 1) {
                continue;
            }

            // Column B: Status (index 1)
            const status = row[1].text;

            // Column C: Source (index 2) - "Where can you get the APWorld and Client?"
            const sourceText = row[2].text;
            const sourceLinks = row[2].links.map(link => ({
                text: link.text,
                url: link.url
            }));

            // Column D: Notes (index 3)
            const notesText = row[3].text;
            const notesLinks = row[3].links.map(link => ({
                text: link.text,
                url: link.url
            }));

            games.push({
                name: name,
                status: status,
                source: {
                    text: sourceText,
                    links: sourceLinks
                },
                notes: {
                    text: notesText,
                    links: notesLinks
                }
            });
        }
    }

    console.log(`  Extracted ${games.length} games`);
    return games;
}

// Main extraction function
function extractLinks() {
    console.log('=== Archipelago HTML Link Extractor ===\n');

    // Check if files exist
    if (!fs.existsSync(CONFIG.CORE_VERIFIED_HTML)) {
        console.error(`Error: File not found - ${CONFIG.CORE_VERIFIED_HTML}`);
        process.exit(1);
    }

    if (!fs.existsSync(CONFIG.PLAYABLE_WORLDS_HTML)) {
        console.error(`Error: File not found - ${CONFIG.PLAYABLE_WORLDS_HTML}`);
        process.exit(1);
    }

    // Parse both files
    const coreVerified = parseCoreVerified(CONFIG.CORE_VERIFIED_HTML);
    const playableWorlds = parsePlayableWorlds(CONFIG.PLAYABLE_WORLDS_HTML);

    // Create output structure
    const output = {
        coreVerified: coreVerified,
        playableWorlds: playableWorlds
    };

    // Save to JSON
    console.log(`\n=== Saving Data ===\n`);
    fs.writeFileSync(CONFIG.OUTPUT_JSON, JSON.stringify(output, null, 2));
    console.log(`Saved: ${CONFIG.OUTPUT_JSON}`);

    // Summary
    console.log('\n=== Extraction Summary ===\n');
    console.log(`Core-Verified games: ${coreVerified.length}`);
    console.log(`Playable Worlds games: ${playableWorlds.length}`);
    console.log(`Total games: ${coreVerified.length + playableWorlds.length}`);
    console.log(`\nExtraction complete!`);
}

// Run extraction
extractLinks();
