/*
 * Archipelago Games Library — UI helpers (ES module, no dependencies)
 * ------------------------------------------------------------------
 * The HTML templates of the design system, as functions app.js can call.
 * Class names and IDs match components/bundle.css (and the current site
 * where the role is the same). Everything returns strings for innerHTML,
 * except enableCardTilt(), which wires one delegated listener.
 */

/* ---------------- icons (inline SVG, stroke = currentColor) ---------------- */
export const ICONS = {
  stable: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm3.3 5.2-3.9 4a.8.8 0 0 1-1.1 0L4.7 8.6a.8.8 0 1 1 1.1-1.1l1.1 1 3.3-3.4a.8.8 0 1 1 1.1 1.1Z"/></svg>',
  unstable: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M7.1 1.9a1 1 0 0 1 1.8 0l6 11.2a1 1 0 0 1-.9 1.5H2a1 1 0 0 1-.9-1.5Zm.1 4v3.6a.8.8 0 0 0 1.6 0V5.9a.8.8 0 0 0-1.6 0ZM8 12.6a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z"/></svg>',
  broken: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm2.6 8.5a.8.8 0 1 1-1.1 1.1L8 9.1l-1.5 1.5a.8.8 0 1 1-1.1-1.1L6.9 8 5.4 6.5a.8.8 0 1 1 1.1-1.1L8 6.9l1.5-1.5a.8.8 0 1 1 1.1 1.1L9.1 8Z"/></svg>',
  merged: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="4" cy="3.5" r="1.7"/><circle cx="4" cy="12.5" r="1.7"/><circle cx="12" cy="8" r="1.7"/><path d="M4 5.2v5.6M4 5.2c0 2.6 2 2.8 6.3 2.8"/></svg>',
  starOutline: '<svg class="icon-outline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8Z"/></svg>',
  starFill: '<svg class="icon-fill" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8Z"/></svg>',
  thumbsOutline: '<svg class="icon-outline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 10.5 11 3.5a2.5 2.5 0 0 1 2.5 2.5v3.5h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 20.5H7.5Zm0 0h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3"/></svg>',
  thumbsFill: '<svg class="icon-fill" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.5 10.3 11.4 3a2.6 2.6 0 0 1 3 2.6v3.9h4.6a2.2 2.2 0 0 1 2.2 2.5l-1.2 7.3a2.2 2.2 0 0 1-2.2 1.8H8.5ZM3.5 10.5h3.2v10.1H3.5a1 1 0 0 1-1-1v-8.1a1 1 0 0 1 1-1Z"/></svg>',
  tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-2 2-1.3-1.3a4 4 0 0 0-5-5L4 17.3 6.7 20l8.6-8.6"/><path d="M14.7 6.3 13 4.6l2-2 1.7 1.7"/></svg>',
  meta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/></svg>',
  hint: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5Z"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 4h12v16H6zM9 9h6M9 13h6M9 17h3"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>',
  go: '<svg class="link-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  search: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
  chevron: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  sheet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 9.5h17M3.5 15h17M9.5 9.5v11"/></svg>',
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- colour roles ---------------- */
/** stability → [class, short label, icon key]. Classes are the site's existing border-* classes. */
export function statusOf(stability = '') {
  if (stability.startsWith('Broken')) return ['border-red', 'Broken', 'broken'];
  if (stability === 'Unstable') return ['border-yellow', 'Unstable', 'unstable'];
  return ['border-green', 'Stable', 'stable'];
}
/** toolType → [class, label, icon key, art hue] */
// AI disclosure levels (spreadsheet "Disclosures" column)
export const AI_DISCLOSURES = {
  None: 'No generative AI was used to make this integration.',
  Consulted: 'AI was only consulted for questions or research. No AI-written code or assets are included.',
  Minor: 'Small parts were made with AI help, such as code snippets or boilerplate.',
  Major: 'A significant part of the code or assets was generated with AI.',
  Unknown: "The developer hasn't said whether AI was used.",
};

// fills the "AI use" fact row + note; hides both when there's no value
export function fillAiDisclosure(row, note, value) {
  const level = (value || '').trim();
  row.hidden = note.hidden = !level;
  if (!level) return;
  row.dataset.ai = level in AI_DISCLOSURES ? level : 'Unknown';
  row.querySelector('dd').textContent = level;
  note.textContent = AI_DISCLOSURES[level] || '';
  note.hidden = !note.textContent;
}

export const TOOL_TYPES = {
  'Tool': ['border-blue', 'Tool', 'tool', 210],
  'Meta Game': ['border-purple', 'Meta Game', 'meta', 250],
  'Hint Game': ['border-teal', 'Hint Game', 'hint', 172],
};

/* ---------------- game card ---------------- */
/**
 * @param game  an entry of data/games.json
 * @param o     { favorited, voted, votes, coreIcon: url of the Archipelago logo, index }
 */
export function gameCardHTML(game, o = {}) {
  const [cls, label, icon] = statusOf(game.stability);
  const pr = game.prStatus === 'Core'
    ? `<span class="game-pr-status pr-core">${o.coreIcon ? `<img src="${esc(o.coreIcon)}" alt="">` : ''}Core</span>`
    : game.prStatus === 'Merged' ? `<span class="game-pr-status pr-merged">${ICONS.merged}Merged</span>` : '';
  const votes = (o.votes ?? 0);
  return `<article class="game-card ${cls}" data-name="${esc(game.name)}"${o.index != null ? ` data-index="${o.index}"` : ''}>
  <button class="card-open" aria-label="Open ${esc(game.name)}"></button>
  <div class="game-cover-wrapper">
    <img class="game-cover" src="${esc(game.coverPath)}" alt="" loading="lazy" decoding="async">
    <div class="card-flags">${game.isNew ? '<span class="new-badge">New</span>' : ''}${game.isAdult ? '<span class="adult-badge">18+</span>' : ''}</div>
  </div>
  <div class="game-info">
    <h3 class="game-title" title="${esc(game.name)}">${esc(game.name)}</h3>
    <div class="game-meta">
      <div class="game-meta-badges"><span class="game-status">${ICONS[icon]}${label}</span>${pr}</div>
      <div class="game-actions">
        <button class="star-btn${o.favorited ? ' favorited' : ''}" aria-pressed="${!!o.favorited}" aria-label="Favourite">${ICONS.starOutline}${ICONS.starFill}</button>
        <div class="thumbs-area"><button class="thumbs-btn${o.voted ? ' voted' : ''}" aria-pressed="${!!o.voted}" aria-label="Vote">${ICONS.thumbsOutline}${ICONS.thumbsFill}<span class="vote-count">${votes}</span></button></div>
      </div>
    </div>
  </div>
</article>`;
}

/* ---------------- tool card + placeholder art ---------------- */
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const artCache = new Map();
/** A 30×45 pixel island generated from the name (same world as the background). Deterministic; cached. Returns a PNG data URL. */
export function toolArt(name, hue = 210) {
  const key = name + '|' + hue; if (artCache.has(key)) return artCache.get(key);
  const w = 30, h = 45, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), r = mulberry32(hash(name));
  const blobs = Array.from({ length: 2 + Math.floor(r() * 3) }, () => [7 + r() * 16, 9 + r() * 20, 3 + r() * 4.5]);
  const P = (H, S, L) => `hsl(${H} ${S}% ${L}%)`;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0; for (const [bx, by, br] of blobs) v = Math.max(v, 1 - Math.hypot(x - bx, (y - by) * 0.9) / br);
    v += (r() - 0.5) * 0.12;
    let col = (x + y) % 2 ? P(hue, 35, 12) : P(hue, 35, 13.5);                 // dithered sea
    if (v > 0.78) col = P(hue, 18, 46); else if (v > 0.55) col = P(hue - 24, 34, 30); else if (v > 0.36) col = P(hue - 12, 32, 25);
    else if (v > 0.22) col = P(hue + 35, 30, 38); else if (v > 0.08) col = P(hue, 36, 19); else if (r() < 0.02) col = P(hue, 45, 32);
    g.fillStyle = col; g.fillRect(x, y, 1, 1);
  }
  const url = c.toDataURL(); artCache.set(key, url); return url;
}
export function toolCardHTML(tool, o = {}) {
  const [cls, label, icon, hue] = TOOL_TYPES[tool.toolType] || TOOL_TYPES.Tool;
  const cover = tool.coverPath
    ? `<img class="game-cover" src="${esc(tool.coverPath)}" alt="" loading="lazy" decoding="async">`
    : `<div class="tool-cover-placeholder" style="--art:url(${toolArt(tool.name, hue)})"><span class="tool-icon">${ICONS[icon]}</span><span class="tool-kind">${label}<b>${esc(tool.name)}</b></span></div>`;
  return `<article class="game-card ${cls}" data-name="${esc(tool.name)}"${o.index != null ? ` data-index="${o.index}"` : ''}>
  <button class="card-open" aria-label="Open ${esc(tool.name)}"></button>
  <div class="game-cover-wrapper">${cover}
    <div class="card-flags">${tool.isNew ? '<span class="new-badge">New</span>' : ''}${tool.isAdult ? '<span class="adult-badge">18+</span>' : ''}</div>
  </div>
  <div class="game-info">
    <h3 class="game-title" title="${esc(tool.name)}">${esc(tool.name)}</h3>
    <div class="game-meta"><div class="game-meta-badges"><span class="tool-type-badge" data-type="${esc(tool.toolType.toLowerCase())}">${ICONS[icon]}${label}</span></div></div>
  </div>
</article>`;
}

/* ---------------- modal link button ---------------- */
const AFTER_DARK_GUILD = '1085716850370957462';
export function linkIcon(url, icons = {}) {
  let host = ''; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* bad url */ }
  if (host.endsWith('github.com')) return icons.github ? `<img class="is-github" src="${esc(icons.github)}" alt="">` : ICONS.link;
  if (host.endsWith('discord.com') || host.endsWith('discord.gg')) return icons.discord ? `<img src="${esc(icons.discord)}" alt="">` : ICONS.chat;
  if (host.endsWith('archipelago.gg')) return icons.archipelago ? `<img src="${esc(icons.archipelago)}" alt="">` : ICONS.link;
  return ICONS.link;
}
/**
 * One link of a links/setupGuides/support block. Links with an empty url are skipped by the caller.
 * @param link   { text, url }
 * @param o      { primary: first download, icons: {github, discord, archipelago} urls }
 */
export function linkHTML(link, o = {}) {
  let host = ''; try { host = new URL(link.url).hostname.replace(/^www\./, ''); } catch { /* keep empty */ }
  const ad = /\(AD\)/.test(link.text);
  const sub = host.endsWith('discord.com') ? (link.url.includes(`/${AFTER_DARK_GUILD}/`) ? 'After Dark server' : 'Archipelago Discord') : host;
  return `<a class="modal-link${o.primary ? ' primary' : ''}${ad ? ' after-dark' : ''}" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">
  <span class="link-icon">${linkIcon(link.url, o.icons)}</span>
  <span class="link-text"><b>${esc(link.text.replace(/\s*\(AD\)/, ''))}</b><small>${esc(sub)}</small></span>${ad ? '<span class="link-tag">18+</span>' : ''}${ICONS.go}
</a>`;
}
export const validLinks = (block) => (block && block.links || []).filter((l) => l.url);

/** Notes text with its inline links turned into .note-link anchors. */
export function notesHTML(notes) {
  if (!notes || !notes.text) return '';
  let t = esc(notes.text);
  for (const l of notes.links || []) {
    if (!l.text) continue; const e = esc(l.text);
    t = t.replace(e, l.url ? `<a class="note-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${e}</a>` : e);
  }
  return t;
}

/* ---------------- hover tilt ---------------- */
/** One delegated pointer listener; only the hovered card gets --rx/--ry. Mouse only; respects reduced motion. */
export function enableCardTilt(root = document) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  let cur = null, raf = 0;
  const onMove = (e) => {
    const c = e.target.closest && e.target.closest('.game-card');
    if (cur && cur !== c) { cur.style.removeProperty('--rx'); cur.style.removeProperty('--ry'); }
    cur = c; if (!c || e.pointerType !== 'mouse') return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      c.style.setProperty('--rx', ((0.5 - y) * 4).toFixed(2) + 'deg');   // max ±2°
      c.style.setProperty('--ry', ((x - 0.5) * 5).toFixed(2) + 'deg');   // max ±2.5°
    });
  };
  root.addEventListener('pointermove', onMove, { passive: true });
  return () => root.removeEventListener('pointermove', onMove);
}
