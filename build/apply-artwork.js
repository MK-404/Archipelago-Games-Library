// Applies an approved "Cover / banner" issue: downloads the image(s) and saves them
// where build.js looks for existing covers/banners.
// Env: ISSUE_BODY, ISSUE_AUTHOR. Writes artwork-result.json (summary + commit message).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAX_BYTES = 5 * 1024 * 1024;
const EXTS = ['.jpg', '.png', '.webp', '.jpeg'];
const ALLOWED_HOSTS = ['github.com', 'user-images.githubusercontent.com', 'private-user-images.githubusercontent.com', 'cdn2.steamgriddb.com'];

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

function findImageUrl(text) {
    if (!text) return null;
    const m = text.match(/!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/) || text.match(/src="(https:\/\/[^"]+)"/) || text.match(/(https:\/\/\S+)/);
    if (!m) throw new Error(`No image or link found in: "${text.slice(0, 80)}"`);
    const url = new URL(m[1]);
    if (!ALLOWED_HOSTS.includes(url.hostname)) throw new Error(`Links from ${url.hostname} are not accepted. Drag the image into the issue or use a cdn2.steamgriddb.com link.`);
    if (url.hostname === 'github.com' && !url.pathname.startsWith('/user-attachments/')) throw new Error('Only images uploaded to the issue are accepted from github.com.');
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
    if (!ext) throw new Error('The file is not a PNG, JPG or WEBP image');
    return { buf, ext };
}

function findEntry(name, category) {
    const file = category === 'Tool' ? 'data/tools.json' : 'data/games.json';
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    const list = data.tools || data.games || data;
    const wanted = name.trim().toLowerCase();
    const entry = list.find(e => e.name.trim().toLowerCase() === wanted);
    if (!entry) throw new Error(`"${name}" was not found on the ${category === 'Tool' ? 'Tools' : 'Games'} page. Check the spelling.`);
    return entry;
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
        const { buf, ext } = await download(findImageUrl(fields[kind]));
        for (const old of EXTS) fs.rmSync(path.join(ROOT, dir, base + old), { force: true });
        fs.writeFileSync(path.join(ROOT, dir, base + ext), buf);
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
