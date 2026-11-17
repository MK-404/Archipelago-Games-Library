// Applies an approved "Cover / banner" issue: downloads the image(s) and saves them
// where build.js looks for existing covers/banners.
// Env: ISSUE_BODY, ISSUE_AUTHOR. Writes artwork-result.json (summary + commit message).

const fs = require('fs');
const path = require('path');
const { toWebp } = require('./optimize-images');

const ROOT = path.join(__dirname, '..');
const MAX_BYTES = 5 * 1024 * 1024;
const EXTS = ['.jpg', '.png', '.webp', '.jpeg'];

// Same as sanitizeFilename() in build.js — keep in sync
function sanitizeFilename(name) {
    return name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 100);
}

// Issue forms render as "### Label\n\nvalue"
function parseIssueForm(body) {
    const fields = {};
    const parts = body.replace(/\r/g, '').split(/^### /m).slice(1);
    for (const part of parts) {
        const nl = part.indexOf('\n');
        const label = part.slice(0, nl).trim().toLowerCase();
        const value = part.slice(nl + 1).trim();
        fields[label] = value === '_No response_' ? '' : value;
    }
    return fields;
}

// Accepts an image dropped into the issue, a markdown/HTML image, a full link or a bare one
// ("cdn2.steamgriddb.com/grid/…"). Any host is fine: the owner approves every issue by hand and
// the file is checked to be a real image and re-encoded before it's saved.
function findImageUrl(text) {
    if (!text) return null;
    const m = text.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/) || text.match(/src="(https?:\/\/[^"]+)"/) ||
        text.match(/(https?:\/\/\S+)/) || text.match(/\b((?:[a-z0-9-]+\.)+[a-z]{2,}\/\S+)/i);
    if (!m) throw new Error(`No image or link found in: "${text.slice(0, 80)}"`);
    const url = new URL(/^https?:\/\//i.test(m[1]) ? m[1] : 'https://' + m[1]);
    if (/^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(url.hostname)) throw new Error('That link is not a public website.');
    return url.href;
}

function detectExt(buf) {
    if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return '.png';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
    return null;
}

async function download(url) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('Image is larger than 5 MB');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('Image is larger than 5 MB');
    const ext = detectExt(buf);
    if (!ext) throw new Error('The link is not a PNG, JPG or WEBP image. Use the direct image link (right click on the image → Copy image address).');
    return { buf, ext };
}

function findEntry(name, category) {
    // games.json/tools.json are build output (not in git); the history files are tracked
    // and keyed by the exact names the build uses
    const file = category === 'Tool' ? 'data/tools-history.json' : 'data/game-history.json';
    const names = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')));
    const wanted = name.trim().toLowerCase();
    const match = names.find(n => n.trim().toLowerCase() === wanted);
    if (!match) throw new Error(`"${name}" was not found on the ${category === 'Tool' ? 'Tools' : 'Games'} page. Check the spelling.`);
    return { name: match };
}

async function main() {
    const fields = parseIssueForm(process.env.ISSUE_BODY || '');
    const category = fields.page === 'Tool' ? 'Tool' : 'Game';
    const entry = findEntry(fields.name || '', category);
    const base = sanitizeFilename(entry.name);
    if (!base || base.startsWith('.') || base.startsWith('_default')) throw new Error('Invalid name');

    const jobs = [['cover', 'data/covers'], ['banner', 'data/banners']].filter(([k]) => fields[k]);
    if (!jobs.length) throw new Error('No cover or banner was attached.');

    const saved = [];
    for (const [kind, dir] of jobs) {
        const { buf } = await download(findImageUrl(fields[kind]));
        const webp = await toWebp(buf, kind === 'cover' ? 'covers' : 'banners');
        for (const old of EXTS) fs.rmSync(path.join(ROOT, dir, base + old), { force: true });
        fs.writeFileSync(path.join(ROOT, dir, base + '.webp'), webp);
        saved.push(kind);
    }

    const author = process.env.ISSUE_AUTHOR || 'unknown';
    const credit = (fields['credit name'] || '').replace(/[\r\n]/g, ' ').trim().slice(0, 60);
    const by = credit ? `${credit} (@${author})` : `@${author}`;
    const what = saved.join(' and ');
    fs.writeFileSync(path.join(ROOT, 'artwork-result.json'), JSON.stringify({
        summary: `${what} for ${entry.name}`,
        commitMessage: `update ${what} for ${entry.name}\n\nsubmitted by ${by}`,
    }));
    console.log(`Saved ${what} for ${entry.name}`);
}

main().catch(err => {
    fs.writeFileSync(path.join(ROOT, 'artwork-result.json'), JSON.stringify({ error: err.message }));
    console.error(err.message);
    process.exit(1);
});
