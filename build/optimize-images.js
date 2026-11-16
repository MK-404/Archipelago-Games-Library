// Converts covers/banners to resized WEBP so the repo, the deploy and the site stay light.
// Covers: max 600×900 · Banners: max 1920 wide. Smaller images are never upscaled.
// Usage: node build/optimize-images.js   (converts every non-WEBP file, idempotent)

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const DATA = path.join(__dirname, '../data');
const SIZES = {
    covers: { width: 600, height: 900 },
    banners: { width: 1920, height: 1080 },
};
const QUALITY = 82;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

// Returns a WEBP buffer for an image of the given kind ('covers' | 'banners')
async function toWebp(input, kind) {
    const { width, height } = SIZES[kind];
    return sharp(input, { animated: false, limitInputPixels: 1e8 })
        .rotate()
        .resize({ width, height, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: QUALITY, effort: 5 })
        .toBuffer();
}

// Converts one file in place: Name.png → Name.webp (original removed)
async function optimizeFile(file, kind) {
    const ext = path.extname(file);
    const base = path.basename(file, ext);
    if (base.startsWith('_default') || ext.toLowerCase() === '.webp') return null;
    const out = path.join(path.dirname(file), base + '.webp');
    const before = fs.statSync(file).size;
    const buf = await toWebp(fs.readFileSync(file), kind);
    fs.writeFileSync(out, buf);
    fs.rmSync(file);
    return { before, after: buf.length };
}

async function optimizeAll() {
    let count = 0, before = 0, after = 0, failed = 0;
    for (const kind of Object.keys(SIZES)) {
        const dir = path.join(DATA, kind);
        if (!fs.existsSync(dir)) continue;
        for (const name of fs.readdirSync(dir)) {
            if (!IMAGE_EXT.test(name)) continue;
            try {
                const r = await optimizeFile(path.join(dir, name), kind);
                if (r) { count++; before += r.before; after += r.after; }
            } catch (err) {
                failed++;
                console.warn(`  Could not optimize ${kind}/${name}: ${err.message}`);
            }
        }
    }
    const mb = n => (n / 1048576).toFixed(1) + ' MB';
    console.log(`Optimized ${count} images: ${mb(before)} → ${mb(after)}${failed ? ` (${failed} failed)` : ''}`);
}

module.exports = { toWebp, optimizeFile, optimizeAll };

if (require.main === module) optimizeAll();
