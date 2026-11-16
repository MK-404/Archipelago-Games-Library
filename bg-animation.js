/*
 * Archipelago Games Library — animated background
 * ------------------------------------------------------------------
 * Plain Canvas 2D, no dependencies (Three.js and its importmap can go).
 *
 * Seed = totalGames + totalTools. Everything visual is derived from it with a
 * seeded PRNG, so the background is identical for everyone and changes every
 * time a game or tool is added.
 *
 * Styles (pick one with STYLE below, or <canvas id="bgCanvas" data-style="…">):
 *   "pixel"   (chosen)      — 16-bit overworld: seeded archipelago in chunky pixels, palette-cycled
 *                              water, tiny boats. Redrawn at 10 fps, blitted nearest-neighbour.
 *   "islands"                — soft islands drifting on a current, linked by faint
 *                              dashed routes; now and then a "check" travels along one.
 *   "shapes"                 — the current idea, re-drawn as soft pre-blurred 2.5D shapes
 *                              on three depth layers.
 *   "chart"                  — slowly drifting topographic contour lines, like a sea chart.
 *
 * Depth comes from sprites that are pre-rendered at low resolution (so they upscale
 * soft) and from a canvas rendered at half resolution: no backdrop-filter needed.
 *
 * Page contract (unchanged): #bgCanvas, #bgOverlay, #bgToggle, #eggSpawnBtn,
 * window.spawnEasterEgg(), localStorage "bgAnimationOff", CSS vars
 * --bg-primary / --bg-secondary (plus a new --bg-hue).
 */

const STYLE = 'pixel';
const DATA_GAMES = 'data/games.json';
const DATA_TOOLS = 'data/tools.json';
const EGG_LIST = 'easter-eggs/list.json';
const EGG_DIR = 'easter-eggs/';
const EGG_CHANCE = 0.02;
const FPS = 30;              // slow motion: 30fps is plenty and halves the work
const RENDER_SCALE = 0.5;    // canvas pixels per CSS pixel (soft by design)

/* ------------------------------------------------------------------ utils */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const TAU = Math.PI * 2;
const hsla = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;
const mod = (n, m) => ((n % m) + m) % m;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (p) => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
function sprite(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w)); c.height = Math.max(2, Math.ceil(h));
  return c;
}

/* ------------------------------------------------------------------ theme */
export function themeFromSeed(seed) {
  seed = Math.max(0, Math.floor(+seed || 0));
  const r = mulberry32((seed * 2654435761) >>> 0);
  const hue = mod(seed * 7.3, 360);               // same rule as before
  const sat = Math.round(40 + r() * 30);          // shapes: hsl(hue, 40–70%, 30–55%)
  const light = Math.round(30 + r() * 25);
  const bgL = +(14 - ((light - 30) / 25) * 9).toFixed(1); // 5–14%, darker when shapes are lighter
  const bgS = +(8 + r() * 17).toFixed(1);                  // ≤ 25%
  return {
    seed, hue, sat, light, bgL, bgS,
    primary: `hsl(${hue.toFixed(1)} ${bgS}% ${bgL}%)`,
    secondary: `hsl(${hue.toFixed(1)} ${bgS}% ${Math.max(2, bgL - 3).toFixed(1)}%)`,
    shape: seed % 7,                 // shapes style: sphere, torus, triangle, square, pyramid, cube, cylinder
    speed: 0.75 + r() * 0.6,
    spin: 0.5 + r() * 0.8,
    size: 0.85 + r() * 0.4,
  };
}
export function applyTheme(t, el = document.documentElement) {
  el.style.setProperty('--bg-primary', t.primary);
  el.style.setProperty('--bg-secondary', t.secondary);
  el.style.setProperty('--bg-hue', t.hue.toFixed(1));
}

/* ------------------------------------------------------------------ concept: islands */
function islands(env) {
  const { W, H, theme, rnd, mobile, q } = env;
  const IL = Math.min(theme.light, 42), IS = Math.min(theme.sat, 58);   // islands stay calm on every seed
  // tonal palette around the seed hue: never a rainbow, so islands can't be
  // mistaken for the Stable / Unstable / Broken colours
  const k = 2 + Math.floor(rnd() * 3), spread = 16 + rnd() * 16;
  const pal = Array.from({ length: k }, (_, i) => theme.hue + (i - (k - 1) / 2) * spread);
  const area = clamp((W * H) / (1440 * 900), 0.45, 1.5);
  const n = mobile ? 6 + Math.floor(rnd() * 3) : Math.round((8 + Math.floor(rnd() * 5)) * area);
  const ang = rnd() * TAU, dir = { x: Math.cos(ang), y: Math.sin(ang) };
  const speed = (6 + rnd() * 8) * theme.speed;
  const lobes = 2 + Math.floor(rnd() * 3);
  const routeD = (mobile ? 220 : 320) + rnd() * 140;
  const checkEvery = 2.5 + rnd() * 3.5;
  const LAYERS = [{ d: 0.45, a: 0.3, s: 0.55 }, { d: 0.75, a: 0.46, s: 1 }, { d: 1.15, a: 0.28, s: 1.5 }];
  const sz = theme.size * (mobile ? 0.7 : 1);

  function islandSprite(R, hue) {
    // halo (shallow water) + land mass + a faint shoreline ring, rendered small so it upscales soft
    const qq = q * 0.7, D = 2 * R, c = sprite(D * qq, D * qq), g = c.getContext('2d');
    const land = sprite(D * qq, D * qq), lg = land.getContext('2d');
    lg.scale(qq, qq); g.scale(qq, qq);
    const m = lobes + Math.floor(rnd() * 3), blobs = [];
    for (let i = 0; i < m; i++) {
      const a = rnd() * TAU, dist = R * 0.24 * rnd();
      blobs.push([R + Math.cos(a) * dist, R + Math.sin(a) * dist, R * (0.2 + rnd() * 0.17)]);
    }
    for (const [x, y, r] of blobs) {   // halo
      const gr = g.createRadialGradient(x, y, r * 0.5, x, y, r * 2.3);
      gr.addColorStop(0, hsla(hue, IS - 10, IL - 6, 0.32));
      gr.addColorStop(1, hsla(hue, IS - 10, IL - 6, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 2.3, 0, TAU); g.fill();
    }
    lg.fillStyle = '#fff';
    for (const [x, y, r] of blobs) { lg.beginPath(); lg.arc(x, y, r, 0, TAU); lg.fill(); }
    const at = (k) => { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.translate(R * qq, R * qq); g.scale(k, k); g.translate(-R * qq, -R * qq); g.drawImage(land, 0, 0); g.restore(); };
    // shoreline ring: tint a scaled copy of the land, cut the middle
    const ring = sprite(D * qq, D * qq), rg = ring.getContext('2d');
    const put = (ctx2, k, op) => { ctx2.save(); ctx2.globalCompositeOperation = op; ctx2.translate(R * qq, R * qq); ctx2.scale(k, k); ctx2.translate(-R * qq, -R * qq); ctx2.drawImage(land, 0, 0); ctx2.restore(); };
    put(rg, 1.42, 'source-over'); put(rg, 1.34, 'destination-out');
    rg.globalCompositeOperation = 'source-in'; rg.fillStyle = hsla(hue, IS - 20, IL + 25, 0.45); rg.fillRect(0, 0, ring.width, ring.height);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(ring, 0, 0); g.restore();
    // land, lit from the top-left
    const tint = sprite(D * qq, D * qq), tg = tint.getContext('2d');
    tg.drawImage(land, 0, 0); tg.globalCompositeOperation = 'source-in';
    const lit = tg.createLinearGradient(0, 0, D * qq, D * qq);
    lit.addColorStop(0, hsla(hue, IS - 14, IL + 8, 0.95)); lit.addColorStop(1, hsla(hue, IS - 14, IL - 8, 0.95));
    tg.fillStyle = lit; tg.fillRect(0, 0, tint.width, tint.height);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(tint, 0, 0); g.restore();
    void at;
    return c;
  }
  const glow = (() => {
    const s = 40, c = sprite(s * q, s * q), g = c.getContext('2d'); g.scale(q, q);
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, hsla(theme.hue, 30, 92, 0.95));
    gr.addColorStop(0.25, hsla(theme.hue, 40, 80, 0.45));
    gr.addColorStop(1, hsla(theme.hue, 40, 70, 0));
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    return c;
  })();

  const isl = [];
  // jittered grid so islands start spread over the whole screen
  const gc = Math.max(1, Math.round(Math.sqrt((n * W) / H))), gr = Math.ceil(n / gc);
  const cells = Array.from({ length: gc * gr }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  for (let i = 0; i < n; i++) {
    const L = i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : (rnd() < 0.5 ? 2 : 1);
    const layer = LAYERS[L];
    const R = (110 + rnd() * 110) * layer.s * sz;
    const v = speed * (0.7 + layer.d * 0.5) * (0.85 + rnd() * 0.3);
    isl.push({
      L, R, x: ((cells[i] % gc) + 0.15 + rnd() * 0.7) * (W / gc), y: (Math.floor(cells[i] / gc) + 0.15 + rnd() * 0.7) * (H / gr), vx: dir.x * v, vy: dir.y * v,
      wob: rnd() * TAU, wobA: 6 + rnd() * 10, img: islandSprite(R, pal[i % pal.length]),
      dx: 0, dy: 0,
    });
  }
  isl.sort((a, b) => a.L - b.L);
  const M = 210 * 1.45 * sz;      // wrap margin
  const checks = []; let nextCheck = 1.2, tt = 0;

  function routes() {
    const out = [], mids = isl.filter((s) => s.L <= 1);
    for (let i = 0; i < mids.length; i++) for (let j = i + 1; j < mids.length; j++) {
      const a = mids[i], b = mids[j], d = Math.hypot(a.dx - b.dx, a.dy - b.dy);
      if (d < routeD * (a.L === b.L ? 1 : 0.8)) out.push([a, b, d]);
    }
    return out;
  }
  let R = [];
  return {
    update(dt) {
      tt += dt;
      for (const s of isl) {
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.x > W + M || s.x < -M) { s.x = s.x > W + M ? -M : W + M; s.y = rnd() * H; env.spawned(); }
        if (s.y > H + M || s.y < -M) { s.y = s.y > H + M ? -M : H + M; s.x = rnd() * W; env.spawned(); }
      }
      nextCheck -= dt;
      if (nextCheck <= 0 && R.length) {
        const [a, b] = R[Math.floor(rnd() * R.length)];
        checks.push(rnd() < 0.5 ? { a, b, p: 0, ring: -1 } : { a: b, b: a, p: 0, ring: -1 });
        { const it = apItem(rnd); env.log(`Check: ${apLoc(rnd)} · ${it[0]} sent to another island`); }
        nextCheck = checkEvery * (0.7 + rnd() * 0.6);
      }
      for (const c of checks) {
        if (c.ring < 0) { c.p += dt / 3.4; if (c.p >= 1) { c.p = 1; c.ring = 0; } }
        else c.ring += dt / 1.6;
      }
      for (let i = checks.length - 1; i >= 0; i--) if (checks[i].ring >= 1) checks.splice(i, 1);
    },
    draw(ctx, par) {
      for (const s of isl) {
        const d = LAYERS[s.L].d;
        s.dx = s.x + Math.sin(tt * 0.12 + s.wob) * s.wobA + par.px * d * 22;
        s.dy = mod(s.y + Math.cos(tt * 0.1 + s.wob) * s.wobA + par.py * d * 16 - par.sy * d * 0.05 + M, H + 2 * M) - M;
      }
      R = routes();
      // far + mid islands
      for (const s of isl) if (s.L < 2) { ctx.globalAlpha = LAYERS[s.L].a; ctx.drawImage(s.img, s.dx - s.R, s.dy - s.R, 2 * s.R, 2 * s.R); }
      // routes between mid islands: faint dashes slowly flowing
      ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.setLineDash([4, 9]); ctx.lineDashOffset = -tt * 5;
      for (const [a, b, d] of R) {
        const ux = (b.dx - a.dx) / d, uy = (b.dy - a.dy) / d, ra = a.R * 0.6, rb = b.R * 0.6;
        if (d < ra + rb + 20) continue;
        ctx.strokeStyle = hsla(theme.hue, 25, 82, 0.32 * Math.min(1, 1.6 * (1 - d / routeD)));
        ctx.beginPath(); ctx.moveTo(a.dx + ux * ra, a.dy + uy * ra); ctx.lineTo(b.dx - ux * rb, b.dy - uy * rb); ctx.stroke();
      }
      ctx.setLineDash([]);
      // checks travelling along a route, then a soft ring on arrival
      for (const c of checks) {
        if (c.ring < 0) {
          const e = ease(c.p), x = c.a.dx + (c.b.dx - c.a.dx) * e, y = c.a.dy + (c.b.dy - c.a.dy) * e;
          ctx.globalAlpha = 0.85 * Math.sin(Math.PI * clamp(c.p * 1.15, 0, 1)) + 0.15;
          ctx.drawImage(glow, x - 13, y - 13, 26, 26);
        } else {
          ctx.globalAlpha = 0.28 * (1 - c.ring);
          ctx.strokeStyle = hsla(theme.hue, 30, 85, 1); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(c.b.dx, c.b.dy, 6 + c.ring * 26, 0, TAU); ctx.stroke();
        }
      }
      // near islands on top, softest
      for (const s of isl) if (s.L === 2) { ctx.globalAlpha = LAYERS[2].a; ctx.drawImage(s.img, s.dx - s.R, s.dy - s.R, 2 * s.R, 2 * s.R); }
      ctx.globalAlpha = 1;
    },
  };
}

/* ------------------------------------------------------------------ concept: shapes */
function drawShape(g, type, r, h, s, l) {
  const poly = (n, rot, rr = r) => Array.from({ length: n }, (_, i) => [Math.cos(rot + (i * TAU) / n) * rr, Math.sin(rot + (i * TAU) / n) * rr]);
  const path = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  const lin = (a, b) => { const gr = g.createLinearGradient(-r, -r, r, r); gr.addColorStop(0, hsla(h, s, l + a)); gr.addColorStop(1, hsla(h, s, l + b)); return gr; };
  if (type === 0) {
    const gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
    gr.addColorStop(0, hsla(h, s, l + 18)); gr.addColorStop(0.6, hsla(h, s, l)); gr.addColorStop(1, hsla(h, s, l - 14));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  } else if (type === 1) {
    g.lineWidth = r * 0.38; g.strokeStyle = lin(14, -10); g.beginPath(); g.arc(0, 0, r * 0.78, 0, TAU); g.stroke();
  } else if (type === 2 || type === 3) {
    const pts = type === 2 ? poly(3, -Math.PI / 2) : poly(4, Math.PI / 4, r * 0.95);
    g.save(); g.translate(r * 0.12, r * 0.16); path(pts); g.fillStyle = hsla(h, s, l - 13); g.fill(); g.restore();
    path(pts); g.fillStyle = lin(12, -4); g.fill();
  } else if (type === 4) {
    const top = [0, -r], bl = [-r * 0.92, r * 0.62], br = [r * 0.92, r * 0.62], mid = [r * 0.12, r * 0.8];
    path([top, bl, mid]); g.fillStyle = hsla(h, s, l + 10); g.fill();
    path([top, mid, br]); g.fillStyle = hsla(h, s, l - 9); g.fill();
  } else if (type === 5) {
    const a = r * 0.87, b = r * 0.5;
    path([[0, -r], [a, -b], [0, 0], [-a, -b]]); g.fillStyle = hsla(h, s, l + 14); g.fill();
    path([[-a, -b], [0, 0], [0, r], [-a, b]]); g.fillStyle = hsla(h, s, l); g.fill();
    path([[0, 0], [a, -b], [a, b], [0, r]]); g.fillStyle = hsla(h, s, l - 12); g.fill();
  } else {
    const w = r * 0.62, hh = r * 0.72, e = r * 0.22;
    const gr = g.createLinearGradient(-w, 0, w, 0);
    gr.addColorStop(0, hsla(h, s, l - 10)); gr.addColorStop(0.45, hsla(h, s, l + 8)); gr.addColorStop(1, hsla(h, s, l - 13));
    g.fillStyle = gr; g.beginPath(); g.moveTo(-w, -hh); g.lineTo(-w, hh); g.ellipse(0, hh, w, e, 0, Math.PI, 0, true); g.lineTo(w, -hh); g.closePath(); g.fill();
    g.fillStyle = hsla(h, s, l + 16); g.beginPath(); g.ellipse(0, -hh, w, e, 0, 0, TAU); g.fill();
  }
}
function shapes(env) {
  const { W, H, theme, rnd, mobile, q } = env;
  const area = clamp((W * H) / (1440 * 900), 0.5, 1.4);
  const n = mobile ? 10 : Math.round(20 * area);
  const LAYERS = [{ d: 0.45, a: 0.4, s: 0.6, res: 0.24 }, { d: 0.75, a: 0.6, s: 1, res: 0.5 }, { d: 1.2, a: 0.42, s: 1.6, res: 0.14 }];
  const hues = [theme.hue, theme.hue + 18, theme.hue - 22];
  const cache = new Map();
  const base = (34 + rnd() * 20) * theme.size * (mobile ? 0.75 : 1);
  function img(L, ci) {
    const key = L * 10 + ci; if (cache.has(key)) return cache.get(key);
    const r = base * LAYERS[L].s, D = r * 2.5, qq = LAYERS[L].res, c = sprite(D * qq, D * qq), g = c.getContext('2d');
    g.scale(qq, qq); g.translate(D / 2, D / 2); drawShape(g, theme.shape, r, hues[ci], theme.sat, theme.light);
    const v = { c, D }; cache.set(key, v); return v;
  }
  const items = [];
  function make(initial) {
    const L = rnd() < 0.4 ? 0 : rnd() < 0.7 ? 1 : 2, { D } = img(L, 0), m = D;
    let x, y;
    if (initial) { x = rnd() * W; y = rnd() * H; }
    else { const side = Math.floor(rnd() * 4); x = side === 0 ? -m : side === 1 ? W + m : rnd() * W; y = side === 2 ? -m : side === 3 ? H + m : rnd() * H; }
    const tx = W / 2 + (rnd() - 0.5) * W * 0.6, ty = H / 2 + (rnd() - 0.5) * H * 0.6;
    const a = initial ? rnd() * TAU : Math.atan2(ty - y, tx - x);
    const v = (10 + rnd() * 14) * theme.speed * (0.6 + LAYERS[L].d * 0.6);
    return { L, ci: Math.floor(rnd() * 3), x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: rnd() * TAU, vr: (rnd() - 0.5) * 0.5 * theme.spin, m };
  }
  for (let i = 0; i < n; i++) items.push(make(true));
  items.sort((a, b) => a.L - b.L);
  return {
    update(dt) {
      for (let i = 0; i < items.length; i++) {
        const s = items[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
        if (s.x < -s.m * 1.5 || s.x > W + s.m * 1.5 || s.y < -s.m * 1.5 || s.y > H + s.m * 1.5) {
          items[i] = make(false); env.spawned();
        }
      }
      items.sort((a, b) => a.L - b.L);
    },
    draw(ctx, par) {
      for (const s of items) {
        const { c, D } = img(s.L, s.ci), d = LAYERS[s.L].d;
        const x = s.x + par.px * d * 22, y = mod(s.y + par.py * d * 16 - par.sy * d * 0.05 + s.m, H + 2 * s.m) - s.m;
        ctx.globalAlpha = LAYERS[s.L].a;
        ctx.setTransform(env.S * Math.cos(s.rot), env.S * Math.sin(s.rot), -env.S * Math.sin(s.rot), env.S * Math.cos(s.rot), x * env.S, y * env.S);
        ctx.drawImage(c, -D / 2, -D / 2, D, D);
      }
      ctx.setTransform(env.S, 0, 0, env.S, 0, 0); ctx.globalAlpha = 1;
    },
  };
}

/* ------------------------------------------------------------------ concept: chart */
function chart(env) {
  const { W, H, theme, rnd, mobile, q } = env;
  const perm = new Uint8Array(512), val = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; val[i] = rnd(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    const X = xi & 255, Y = yi & 255, X1 = (xi + 1) & 255, Y1 = (yi + 1) & 255;
    const a = val[perm[X + perm[Y]]], b = val[perm[X1 + perm[Y]]], c = val[perm[X + perm[Y1]]], d = val[perm[X1 + perm[Y1]]];
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
  const sc = 1 / (230 + rnd() * 170), levels = 4 + Math.floor(rnd() * 3);
  const TH = Array.from({ length: levels }, (_, i) => 0.36 + (i / (levels - 1)) * 0.36);
  const ang = rnd() * TAU, sp = (5 + rnd() * 5) * theme.speed;
  const cell = mobile ? 20 : 14, cols = Math.ceil(W / cell) + 1, rows = Math.ceil(H / cell) + 1;
  const v = new Float32Array((cols + 1) * (rows + 1));
  const layer = sprite(W * q, H * q), lg = layer.getContext('2d');
  const gridStep = 160 + Math.floor(rnd() * 80);
  let tt = 0, acc = 1, ox = rnd() * 100, oy = rnd() * 100;
  const T = 1, R = 2, B = 3, Lf = 4;
  const SEG = [[], [[Lf, B]], [[B, R]], [[Lf, R]], [[T, R]], [[Lf, T], [B, R]], [[T, B]], [[Lf, T]], [[Lf, T]], [[T, B]], [[T, R], [Lf, B]], [[T, R]], [[Lf, R]], [[B, R]], [[Lf, B]], []];
  function rebuild() {
    const m = 0.5 + 0.5 * Math.sin(tt * 0.025);
    const bx = ox + Math.cos(ang) * sp * tt * sc, by = oy + Math.sin(ang) * sp * tt * sc;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const x = i * cell * sc + bx, y = j * cell * sc + by;
      const f1 = noise(x, y) * 0.65 + noise(x * 2.1 + 17, y * 2.1 + 9) * 0.35;
      const f2 = noise(x + 41, y + 73) * 0.65 + noise(x * 2.1 + 5, y * 2.1 + 29) * 0.35;
      v[j * (cols + 1) + i] = f1 * m + f2 * (1 - m);
    }
    lg.setTransform(q, 0, 0, q, 0, 0); lg.clearRect(0, 0, W, H);
    // faint chart grid, drifting with the current
    lg.strokeStyle = hsla(theme.hue, 20, 80, 0.035); lg.lineWidth = 1; lg.beginPath();
    const gx = mod(-Math.cos(ang) * sp * tt, gridStep), gy = mod(-Math.sin(ang) * sp * tt, gridStep);
    for (let x = gx; x < W; x += gridStep) { lg.moveTo(x, 0); lg.lineTo(x, H); }
    for (let y = gy; y < H; y += gridStep) { lg.moveTo(0, y); lg.lineTo(W, y); }
    lg.stroke();
    TH.forEach((th, li) => {
      const top = li === TH.length - 1;
      lg.strokeStyle = hsla(theme.hue + li * 6, theme.sat - 15, theme.light + 22, 0.11 + li * 0.06);
      lg.lineWidth = top ? 2 : 1.3; lg.beginPath();
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const k = j * (cols + 1) + i, a = v[k], b = v[k + 1], c = v[k + cols + 2], d = v[k + cols + 1];
        const idx = (a >= th ? 8 : 0) | (b >= th ? 4 : 0) | (c >= th ? 2 : 0) | (d >= th ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x0 = i * cell, y0 = j * cell;
        const pt = (e) => e === T ? [x0 + cell * (th - a) / (b - a), y0] : e === R ? [x0 + cell, y0 + cell * (th - b) / (c - b)]
          : e === B ? [x0 + cell * (th - d) / (c - d), y0 + cell] : [x0, y0 + cell * (th - a) / (d - a)];
        for (const [e1, e2] of SEG[idx]) { const p1 = pt(e1), p2 = pt(e2); lg.moveTo(p1[0], p1[1]); lg.lineTo(p2[0], p2[1]); }
      }
      lg.stroke();
    });
  }
  return {
    update(dt) { tt += dt; acc += dt; if (acc >= (mobile ? 1 / 8 : 1 / 12)) { acc = 0; rebuild(); } },
    draw(ctx, par) {
      ctx.globalAlpha = 1;
      ctx.drawImage(layer, par.px * 14, par.py * 10, W, H);
    },
  };
}

/* ------------------------------------------------------------------ shared: seeded value noise */
function makeNoise(rnd) {
  const perm = new Uint8Array(512), val = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; val[i] = rnd(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    const X = xi & 255, Y = yi & 255, X1 = (xi + 1) & 255, Y1 = (yi + 1) & 255;
    const a = val[perm[X + perm[Y]]], b = val[perm[X1 + perm[Y]]], c = val[perm[X + perm[Y1]]], d = val[perm[X1 + perm[Y1]]];
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
}
function hslToRgb(h, s, l) {
  h = mod(h, 360) / 360; s /= 100; l /= 100;
  const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}

/* ------------------------------------------------------------------ concept: stars
   The sky IS the library: one star per game/tool. Star positions depend only on
   their index, so adding a game adds exactly one new star and nothing else moves.
   The newest star (the latest game) breathes softly. Shooting stars = checks. */
function stars(env) {
  const { W, H, theme, rnd, mobile } = env;
  const N = Math.max(1, theme.seed), R = Math.hypot(W, H) / 2 + 20, D = Math.ceil(R * 2);
  const sky = sprite(D, D), g = sky.getContext('2d');
  const pts = new Float32Array(N * 3);   // x, y (sky coords), size
  const members = new Map();
  for (let i = 0; i < N; i++) {
    const r = mulberry32((i * 2654435761) ^ 0x5bd1e995);
    const c = Math.floor(i / 14), clustered = r() < 0.55;
    let x, y;
    if (clustered) {
      const cr = mulberry32(c * 977 + 7), ca = cr() * TAU, cd = Math.sqrt(cr()) * 0.85;
      const gx = (r() + r() + r() - 1.5) * 0.06, gy = (r() + r() + r() - 1.5) * 0.06;
      x = Math.cos(ca) * cd + gx; y = Math.sin(ca) * cd + gy;
      if (!members.has(c)) members.set(c, []); members.get(c).push(i);
    } else { const a = r() * TAU, d = Math.sqrt(r()); x = Math.cos(a) * d; y = Math.sin(a) * d; }
    pts[i * 3] = R + x * R; pts[i * 3 + 1] = R + y * R; pts[i * 3 + 2] = 0.45 + Math.pow(r(), 5) * 1.9;
    const hue = theme.hue + (r() - 0.5) * 70;
    g.fillStyle = hsla(hue, 30, 82, 0.35 + pts[i * 3 + 2] * 0.3);
    g.beginPath(); g.arc(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], 0, TAU); g.fill();
  }
  // constellation lines inside each cluster (nearest earlier member)
  g.strokeStyle = hsla(theme.hue, 30, 80, 0.09); g.lineWidth = 1; g.beginPath();
  for (const list of members.values()) for (let k = 1; k < list.length; k++) {
    const i = list[k]; let best = -1, bd = 1e9;
    for (let m = 0; m < k; m++) { const j = list[m], d = Math.hypot(pts[i * 3] - pts[j * 3], pts[i * 3 + 1] - pts[j * 3 + 1]); if (d < bd) { bd = d; best = j; } }
    if (best >= 0 && bd < R * 0.09) { g.moveTo(pts[best * 3], pts[best * 3 + 1]); g.lineTo(pts[i * 3], pts[i * 3 + 1]); }
  }
  g.stroke();
  // a faint milky band
  const band = g.createLinearGradient(0, D * 0.3, D, D * 0.7);
  band.addColorStop(0, hsla(theme.hue, 30, 60, 0)); band.addColorStop(0.5, hsla(theme.hue, 30, 60, 0.05)); band.addColorStop(1, hsla(theme.hue, 30, 60, 0));
  g.fillStyle = band; g.fillRect(0, 0, D, D);

  const tw = []; for (let i = 0; i < N && tw.length < (mobile ? 25 : 60); i++) if (pts[i * 3 + 2] > 1.05) tw.push([i, rnd() * TAU, 0.4 + rnd() * 0.8]);
  const spin = 0.006 * theme.speed * (rnd() < 0.5 ? -1 : 1);
  const newest = N - 1;
  env.log(`${N} stars in the sky · one for every game and tool`);
  let tt = 0, ang = rnd() * TAU, next = 4 + rnd() * 6; const shoot = [];
  const toScreen = (i) => {
    const x = pts[i * 3] - R, y = pts[i * 3 + 1] - R, c = Math.cos(ang), s = Math.sin(ang);
    return [W / 2 + x * c - y * s, H / 2 + x * s + y * c];
  };
  return {
    update(dt) {
      tt += dt; ang += spin * dt; next -= dt;
      if (next <= 0) {
        const x = rnd() * W, y = rnd() * H * 0.5, a = Math.PI * (0.15 + rnd() * 0.25) * (rnd() < 0.5 ? 1 : -1) + (rnd() < 0.5 ? 0 : Math.PI);
        shoot.push({ x, y, vx: Math.cos(Math.abs(a)) * 420 * Math.sign(Math.cos(a)), vy: Math.abs(Math.sin(a)) * 420, p: 0 });
        next = 7 + rnd() * 9; env.spawned();
      }
      for (const s of shoot) { s.p += dt / 1.1; s.x += s.vx * dt; s.y += s.vy * dt; }
      for (let i = shoot.length - 1; i >= 0; i--) if (shoot[i].p >= 1) shoot.splice(i, 1);
    },
    draw(ctx, par) {
      ctx.save(); ctx.translate(W / 2 + par.px * 10, H / 2 + par.py * 8); ctx.rotate(ang); ctx.drawImage(sky, -R, -R, D, D); ctx.restore();
      for (const [i, ph, w] of tw) {
        const [x, y] = toScreen(i), a = 0.12 + 0.22 * (0.5 + 0.5 * Math.sin(tt * w + ph));
        ctx.fillStyle = hsla(theme.hue, 30, 90, a); ctx.beginPath(); ctx.arc(x + par.px * 10, y + par.py * 8, pts[i * 3 + 2] * 2.4, 0, TAU); ctx.fill();
      }
      // the newest game
      const [nx, ny] = toScreen(newest), k = 0.5 + 0.5 * Math.sin(tt * 1.6);
      const gr = ctx.createRadialGradient(nx, ny, 0, nx, ny, 16 + k * 6);
      gr.addColorStop(0, hsla(theme.hue, 40, 92, 0.75)); gr.addColorStop(0.25, hsla(theme.hue, 40, 85, 0.22)); gr.addColorStop(1, hsla(theme.hue, 40, 80, 0));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(nx + par.px * 10, ny + par.py * 8, 22, 0, TAU); ctx.fill();
      for (const s of shoot) {
        const a = Math.sin(Math.PI * s.p) * 0.45, len = 110, n = Math.hypot(s.vx, s.vy);
        const gx = s.x - (s.vx / n) * len, gy = s.y - (s.vy / n) * len;
        const lg = ctx.createLinearGradient(gx, gy, s.x, s.y);
        lg.addColorStop(0, hsla(theme.hue, 30, 90, 0)); lg.addColorStop(1, hsla(theme.hue, 30, 92, a));
        ctx.strokeStyle = lg; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(s.x, s.y); ctx.stroke();
      }
    },
  };
}

/* ------------------------------------------------------------------ concept: pixel
   A 16-bit overworld: seeded archipelago in chunky pixels, water shimmering by
   palette cycling, tiny boats sailing between islands. Redrawn at 10 fps on
   purpose (it's pixel art) and blitted with nearest-neighbour scaling. */
function pixel(env) {
  const { W, H, theme, rnd, mobile } = env;
  const cell = mobile ? 5 : 6, gw = Math.ceil(W / cell), gh = Math.ceil(H / cell);
  const noise = makeNoise(rnd), sc = 1 / (22 + rnd() * 16), sea = 0.57 + rnd() * 0.05;
  const h = new Float32Array(gw * gh), kind = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const v = noise(x * sc, y * sc) * 0.62 + noise(x * sc * 2.3 + 11, y * sc * 2.3 + 5) * 0.28 + noise(x * sc * 5 + 3, y * sc * 5 + 9) * 0.1;
    h[y * gw + x] = v;
  }
  // 0 deep · 1 water · 2 shallow · 3 sand · 4 grass · 5 forest · 6 hill · 7 peak
  for (let i = 0; i < h.length; i++) {
    const v = h[i] - sea;
    kind[i] = v < -0.09 ? 0 : v < -0.035 ? 1 : v < 0 ? 2 : v < 0.02 ? 3 : v < 0.07 ? 4 : v < 0.11 ? 5 : v < 0.15 ? 6 : 7;
  }
  const L = theme.bgL, S = theme.bgS, hu = theme.hue;
  const PAL = [
    [hu, S + 8, L + 1.5, 0], [hu, S + 10, L + 2.5, 0.45], [hu, S + 14, L + 5, 0.75], [hu + 28, 22, L + 10, 0.9],
    [hu - 18, 24, L + 7, 0.9], [hu - 26, 24, L + 5, 0.9], [hu + 8, 14, L + 10, 0.9], [hu + 8, 10, L + 13, 0.9],
  ].map(([a, b, c, al]) => [...hslToRgb(a, b, c), Math.round(al * 255)]);
  const GLINT = [...hslToRgb(hu, S + 16, L + 10), 150], FOAM = [...hslToRgb(hu, 18, L + 16), 160], LIT = 1.12, SHADE = 0.86;
  const BOAT = [...hslToRgb(hu + 30, 25, L + 30), 230], WAKE = [...hslToRgb(hu, 20, L + 14), 140];
  const grid = sprite(gw, gh), gg = grid.getContext('2d'), img = gg.createImageData(gw, gh), px = img.data;
  const HASH = new Float32Array(gw * gh); for (let i = 0; i < HASH.length; i++) HASH[i] = rnd() * 400;
  const boats = Array.from({ length: mobile ? 3 : 6 }, () => {
    let x, y, tries = 0; do { x = rnd() * gw; y = rnd() * gh; tries++; } while (kind[(y | 0) * gw + (x | 0)] > 1 && tries < 200);
    const a = rnd() * TAU; return { x, y, a, v: 0.9 + rnd() * 0.8 };
  });
  let tt = 0, acc = 0;
  function paint() {
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x, k = kind[i]; let c = PAL[k], f = 1;
      if (k <= 2) {
        // palette cycling: shallow water foams in slow waves, a few scattered pixels twinkle
        if (k === 2 && Math.sin(tt * 0.9 - h[i] * 90) > 0.6) c = FOAM;
        else if (k >= 1 && Math.sin(tt * 1.4 + HASH[i]) > 0.985) c = GLINT;
      } else if (x > 0 && y > 0) {
        const up = h[i - gw - 1]; f = h[i] - up > 0.004 ? LIT : up - h[i] > 0.004 ? SHADE : 1;
      }
      const o = i * 4; px[o] = Math.min(255, c[0] * f); px[o + 1] = Math.min(255, c[1] * f); px[o + 2] = Math.min(255, c[2] * f); px[o + 3] = c[3];
    }
    for (const b of boats) {
      const set = (x, y, c) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= gw || y >= gh) return; const o = (y * gw + x) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = c[3]; };
      const dx = Math.cos(b.a), dy = Math.sin(b.a);
      set(b.x - dx * 2, b.y - dy * 2, WAKE); set(b.x - dx * 3.5, b.y - dy * 3.5 + 0.5, WAKE);
      set(b.x, b.y, BOAT); set(b.x + (Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0), b.y + (Math.abs(dx) > Math.abs(dy) ? 0 : Math.sign(dy)), BOAT);
    }
    gg.putImageData(img, 0, 0);
  }
  paint();
  return {
    update(dt) {
      tt += dt; acc += dt;
      for (const b of boats) {
        const nx = b.x + Math.cos(b.a) * b.v * dt, ny = b.y + Math.sin(b.a) * b.v * dt;
        const k = kind[(mod(ny, gh) | 0) * gw + (mod(nx, gw) | 0)];
        if (k > 2) { b.a += Math.PI * (0.5 + rnd()); } else { b.x = nx; b.y = ny; }
        if (b.x < -2 || b.x > gw + 2 || b.y < -2 || b.y > gh + 2) { b.x = mod(b.x, gw); b.y = mod(b.y, gh); env.spawned(); }
      }
      if (acc >= 0.1) { acc = 0; paint(); }
    },
    draw(ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1; ctx.drawImage(grid, 0, 0, gw * cell, gh * cell);
      ctx.imageSmoothingEnabled = true;
    },
  };
}

/* ------------------------------------------------------------------ Archipelago vocabulary (generic, no game IP) */
const AP_ITEMS = [
  // [name, glyph, classification]
  ['Small Key', 'key', 'progression'], ['Progressive Sword', 'sword', 'progression'], ['Grappling Hook', 'hook', 'progression'],
  ['Double Jump', 'boot', 'progression'], ['Boss Key', 'key', 'progression'],
  ['Heart Container', 'heart', 'useful'], ['Bomb Bag', 'bomb', 'useful'], ['Map Fragment', 'map', 'filler'],
  ['50 Coins', 'coin', 'filler'], ['Potion', 'potion', 'filler'], ['Arrows', 'coin', 'filler'],
  ['Ice Trap', 'trap', 'trap'], ['Slow Trap', 'trap', 'trap'],
];
const AP_LOCS = ['Chest #', 'Boss Reward', 'Shop Slot ', 'Secret Room', 'NPC Gift', 'Hidden Cave', 'Tower Top', 'Sunken Chest', 'Puzzle Prize', 'Fishing Prize'];
function apLoc(rnd) { const l = AP_LOCS[Math.floor(rnd() * AP_LOCS.length)]; return /[# ]$/.test(l) ? l + (1 + Math.floor(rnd() * 40)) : l; }
function apItem(rnd) {
  const r = rnd(), cls = r < 0.28 ? 'progression' : r < 0.5 ? 'useful' : r < 0.9 ? 'filler' : 'trap';
  const pool = AP_ITEMS.filter((i) => i[2] === cls); return pool[Math.floor(rnd() * pool.length)];
}
const AP_GLYPH = {
  key: (g) => { g.beginPath(); g.arc(-4, 0, 4.5, 0, TAU); g.moveTo(0.5, 0); g.lineTo(9, 0); g.moveTo(6, 0); g.lineTo(6, 3.5); g.moveTo(8.5, 0); g.lineTo(8.5, 3); g.stroke(); },
  sword: (g) => { g.beginPath(); g.moveTo(-7, 7); g.lineTo(6, -6); g.moveTo(-6, 2); g.lineTo(-2, 6); g.moveTo(6, -6); g.lineTo(7.5, -7.5); g.stroke(); },
  hook: (g) => { g.beginPath(); g.moveTo(-6, -7); g.lineTo(-6, 1); g.arc(-1, 1, 5, Math.PI, 0, true); g.lineTo(4, -2); g.moveTo(-6, -7); g.lineTo(-8, -4); g.stroke(); },
  boot: (g) => { g.beginPath(); g.moveTo(-5, -7); g.lineTo(-5, 4); g.lineTo(7, 4); g.lineTo(7, 1); g.lineTo(1, -1); g.lineTo(1, -7); g.closePath(); g.moveTo(-8, 7); g.lineTo(-3, 7); g.stroke(); },
  heart: (g) => { g.beginPath(); g.moveTo(0, 7); g.bezierCurveTo(-9, 1, -6, -8, 0, -3); g.bezierCurveTo(6, -8, 9, 1, 0, 7); g.stroke(); },
  bomb: (g) => { g.beginPath(); g.arc(-1, 2, 5.5, 0, TAU); g.moveTo(2.5, -2.5); g.quadraticCurveTo(5, -7, 8, -6); g.stroke(); },
  map: (g) => { g.beginPath(); g.moveTo(-7, -5); g.lineTo(-2, -7); g.lineTo(2, -5); g.lineTo(7, -7); g.lineTo(7, 5); g.lineTo(2, 7); g.lineTo(-2, 5); g.lineTo(-7, 7); g.closePath(); g.moveTo(-2, -7); g.lineTo(-2, 5); g.moveTo(2, -5); g.lineTo(2, 7); g.stroke(); },
  coin: (g) => { g.beginPath(); g.arc(0, 0, 6.5, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, 3.2, 0, TAU); g.stroke(); },
  potion: (g) => { g.beginPath(); g.arc(0, 2.5, 5, 0, TAU); g.moveTo(-2, -2); g.lineTo(-2, -6.5); g.lineTo(2, -6.5); g.lineTo(2, -2); g.stroke(); },
  trap: (g) => { g.beginPath(); g.moveTo(0, -7.5); g.lineTo(8, 6.5); g.lineTo(-8, 6.5); g.closePath(); g.moveTo(0, -2.5); g.lineTo(0, 2); g.moveTo(0, 4.3); g.lineTo(0, 4.6); g.stroke(); },
};

/* ------------------------------------------------------------------ concept: multiworld
   A tiny, endless Archipelago session running in the background.
   · six worlds (the six circles of the logo) = six players' games, P1–P6
   · checking a location in a world sends an ITEM to another world; the source
     world's progress ring fills (checks done / total)
   · item classes: progression (big + glow), useful, filler (small), trap (wobbles)
   · a world that reaches its goal RELEASES its remaining items, then starts over
   · rare HINTs (dashed line + “?”) and DEATHLINKs (a dark ripple that dips every world)
   · every event can be echoed to a quiet server-log feed via env.log() */
function multiworld(env) {
  const { W, H, theme, rnd, mobile } = env;
  const n = 6, rot = rnd() * TAU, worlds = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * TAU) / n + (rnd() - 0.5) * 0.3;
    const total = 18 + Math.floor(rnd() * 26);
    worlds.push({
      i, name: 'P' + (i + 1), x: W / 2 + Math.cos(a) * W * (mobile ? 0.4 : 0.455), y: H / 2 + Math.sin(a) * H * 0.43,
      r: (mobile ? 30 : 50) + rnd() * (mobile ? 12 : 22), hue: theme.hue + (i - 2.5) * 9,
      total, done: Math.floor(rnd() * total * 0.75), shown: 0, ping: 0, recv: 0, dip: 0, goal: 0, ph: rnd() * TAU,
    });
  }
  // keep the top-right corner free for the feed (desktop)
  if (!mobile) for (const w of worlds) if (w.x > W * 0.6 && w.y < H * 0.34) { w.y = H * 0.4 + w.r; w.x = Math.min(w.x, W - w.r * 0.6); }
  { const w = worlds[Math.floor(rnd() * n)]; w.done = w.total - 2; }   // someone is close to their goal
  worlds.forEach((w) => { w.done = Math.min(w.done, w.total - 1); w.shown = w.done; });
  const C = (l, a) => hsla(theme.hue, 30, l, a);
  const sprites = {};
  for (const [k, fn] of Object.entries(AP_GLYPH)) {
    const s = 26, c = sprite(s * 2, s * 2), g = c.getContext('2d'); g.scale(2, 2); g.translate(s / 2, s / 2);
    g.lineWidth = 1.8; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = C(88, 1); fn(g); sprites[k] = c;
  }
  const glow = (() => { const s = 64, c = sprite(s, s), g = c.getContext('2d');
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, C(85, 0.5)); gr.addColorStop(0.4, C(75, 0.16)); gr.addColorStop(1, C(70, 0));
    g.fillStyle = gr; g.fillRect(0, 0, s, s); return c; })();
  const STYLE = { progression: { s: 36, glow: 1, a: 0.9 }, useful: { s: 30, glow: 0.55, a: 0.8 }, filler: { s: 22, glow: 0, a: 0.6 }, trap: { s: 28, glow: 0.3, a: 0.75 } };

  const flights = [], hints = [], ripples = [];
  let tt = 0, nextCheck = 0.6, nextHint = 18 + rnd() * 20, nextDeath = 55 + rnd() * 60, releaseQ = [];
  const log = (m) => env.log && env.log(m);
  log(`Multiworld seed ${theme.seed} · 6 players · ${worlds.reduce((s, w) => s + w.total, 0)} locations`);

  function send(src, item, loc, fast) {
    let j = Math.floor(rnd() * (n - 1)); if (j >= src.i) j++;
    const a = src, b = worlds[j], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const ox = mx - W / 2, oy = my - H / 2, ol = Math.hypot(ox, oy) || 1, d = Math.hypot(b.x - a.x, b.y - a.y);
    flights.push({ a, b, ax: a.x, ay: a.y, bx: b.x, by: b.y, cx: mx + (ox / ol) * d * 0.33, cy: my + (oy / ol) * d * 0.33,
      p: 0, dur: (fast ? 3.2 : 6) + rnd() * 3, item, st: STYLE[item[2]], spin: (rnd() - 0.5) * 0.8 });
    src.ping = 1;
    if (!fast) log(`${a.name} sent ${item[0]} to ${b.name} (${loc})`);
    env.spawned();
  }
  const bez = (f, p) => { const u = 1 - p; return [u * u * f.ax + 2 * u * p * f.cx + p * p * f.bx, u * u * f.ay + 2 * u * p * f.cy + p * p * f.by]; };

  return {
    update(dt) {
      tt += dt; nextCheck -= dt; nextHint -= dt; nextDeath -= dt;
      if (nextCheck <= 0) {
        const live = worlds.filter((w) => !w.goal && w.done < w.total);
        if (live.length) {
          const w = live[Math.floor(rnd() * live.length)];
          w.done++; send(w, apItem(rnd), apLoc(rnd));
          if (w.done >= w.total) {
            w.goal = 1; log(`${w.name} has completed their goal!`); log(`${w.name} released their remaining items`);
            const k = 3 + Math.floor(rnd() * 4); for (let q = 0; q < k; q++) releaseQ.push([w, 1.2 + q * 0.35]);
          }
        }
        nextCheck = (mobile ? 3.4 : 2.1) * (0.6 + rnd() * 0.8);
      }
      if (releaseQ.length) {
        for (const r of releaseQ) r[1] -= dt;
        while (releaseQ.length && releaseQ[0][1] <= 0) { const [w] = releaseQ.shift(); send(w, apItem(rnd), 'release', true); }
      }
      for (const w of worlds) if (w.goal) {
        w.goal += dt;
        if (w.goal > 9) { w.goal = 0; w.total = 18 + Math.floor(rnd() * 26); w.done = 0; w.shown = 0; log(`${w.name} joined with a new game · 0/${w.total} checks`); }
      }
      if (nextHint <= 0) {
        const a = worlds[Math.floor(rnd() * n)]; let b = worlds[Math.floor(rnd() * n)]; if (b === a) b = worlds[(a.i + 3) % n];
        const it = AP_ITEMS.filter((x) => x[2] === 'progression')[Math.floor(rnd() * 5)];
        hints.push({ a, b, t: 0 }); log(`Hint: ${a.name}'s ${it[0]} is at ${b.name}'s ${apLoc(rnd)}`);
        nextHint = 30 + rnd() * 30;
      }
      if (nextDeath <= 0) {
        const w = worlds[Math.floor(rnd() * n)];
        ripples.push({ w, t: 0, hit: new Set([w.i]) }); w.dip = 1;
        log(`DeathLink: ${w.name} died · everyone else goes down too`);
        nextDeath = 80 + rnd() * 70;
      }
      for (const f of flights) f.p += dt / f.dur;
      for (let k = flights.length - 1; k >= 0; k--) if (flights[k].p >= 1) { flights[k].b.recv = 1; flights.splice(k, 1); }
      for (const h of hints) h.t += dt / 6; for (let k = hints.length - 1; k >= 0; k--) if (hints[k].t >= 1) hints.splice(k, 1);
      for (const r of ripples) {
        r.t += dt; const rad = r.t * 520;
        for (const w of worlds) if (!r.hit.has(w.i) && Math.hypot(w.x - r.w.x, w.y - r.w.y) < rad) { r.hit.add(w.i); w.dip = 1; }
      }
      for (let k = ripples.length - 1; k >= 0; k--) if (ripples[k].t > 4) ripples.splice(k, 1);
      for (const w of worlds) {
        w.ping = Math.max(0, w.ping - dt / 1.2); w.recv = Math.max(0, w.recv - dt / 1.6); w.dip = Math.max(0, w.dip - dt / 2.2);
        w.shown += (w.done - w.shown) * Math.min(1, dt * 3);
      }
    },
    draw(ctx, par) {
      const ox = par.px * 12, oy = par.py * 9;
      // DeathLink ripple
      for (const r of ripples) {
        const rad = r.t * 520, a = 0.22 * Math.max(0, 1 - r.t / 4);
        ctx.strokeStyle = hsla(theme.hue, 20, 4, a * 2.5); ctx.lineWidth = 26; ctx.beginPath(); ctx.arc(r.w.x + ox, r.w.y + oy, rad, 0, TAU); ctx.stroke();
        ctx.strokeStyle = C(80, a * 0.6); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(r.w.x + ox, r.w.y + oy, rad + 14, 0, TAU); ctx.stroke();
      }
      // hints: dashed line + “?”
      ctx.setLineDash([2, 7]);
      for (const h of hints) {
        const a = Math.sin(Math.PI * h.t) * 0.45;
        ctx.strokeStyle = C(85, a); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(h.a.x + ox, h.a.y + oy); ctx.lineTo(h.b.x + ox, h.b.y + oy); ctx.stroke();
        const mx = (h.a.x + h.b.x) / 2 + ox, my = (h.a.y + h.b.y) / 2 + oy;
        ctx.fillStyle = C(88, a * 1.4); ctx.font = '700 18px Figtree, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', mx, my);
      }
      ctx.setLineDash([]);
      // worlds
      for (const w of worlds) {
        const x = w.x + ox, y = w.y + oy, dip = w.dip, k = 1 + 0.025 * Math.sin(tt * 0.5 + w.ph) + w.recv * 0.08 - dip * 0.12;
        const R = w.r * k, alpha = 1 - dip * 0.55;
        const gr = ctx.createRadialGradient(x, y, R * 0.2, x, y, R + 20);
        gr.addColorStop(0, hsla(w.hue, 30, 50, 0.12 * alpha)); gr.addColorStop(1, hsla(w.hue, 30, 50, 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, R + 20, 0, TAU); ctx.fill();
        ctx.lineWidth = 6; ctx.strokeStyle = hsla(w.hue, 25, 70, 0.12 * alpha); ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
        // progress = checks done / total
        const frac = w.shown / w.total;
        ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = hsla(w.hue, 35, 82, (w.goal ? 0.75 : 0.45) * alpha);
        ctx.beginPath(); ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke(); ctx.lineCap = 'butt';
        if (w.ping) { ctx.strokeStyle = hsla(w.hue, 35, 85, 0.35 * w.ping); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, R + 6 + (1 - w.ping) * 16, 0, TAU); ctx.stroke(); }
        if (w.recv) { ctx.strokeStyle = hsla(w.hue, 35, 85, 0.3 * w.recv); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, R - 6 - (1 - w.recv) * 10, 0, TAU); ctx.stroke(); }
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = hsla(w.hue, 25, 86, (w.goal ? 0.6 : 0.34) * alpha); ctx.font = `700 ${mobile ? 13 : 17}px Figtree, system-ui, sans-serif`;
        ctx.fillText(w.goal ? '★' : w.name, x, y - (mobile ? 5 : 7));
        ctx.fillStyle = hsla(w.hue, 20, 80, 0.26 * alpha); ctx.font = `600 ${mobile ? 9.5 : 11}px ui-monospace, Menlo, monospace`;
        ctx.fillText(w.goal ? 'GOAL' : `${Math.round(w.shown)}/${w.total}`, x, y + (mobile ? 8 : 11));
      }
      // items in flight
      for (const f of flights) {
        const e = ease(f.p), fade = Math.min(1, f.p * 6, (1 - f.p) * 6), st = f.st;
        for (let k = 7; k >= 1; k--) {
          const [tx, ty] = bez(f, Math.max(0, e - k * 0.011));
          ctx.globalAlpha = (st.glow ? 0.22 : 0.12) * fade * (1 - k / 8); ctx.fillStyle = C(88, 1);
          ctx.beginPath(); ctx.arc(tx + ox, ty + oy, st.glow ? 1.9 : 1.3, 0, TAU); ctx.fill();
        }
        const [x0, y0] = bez(f, e); const X = x0 + ox, Y = y0 + oy;
        if (st.glow) { ctx.globalAlpha = st.glow * fade; ctx.drawImage(glow, X - st.s, Y - st.s, st.s * 2, st.s * 2); }
        const wob = f.item[2] === 'trap' ? Math.sin(tt * 9 + f.spin * 10) * 0.35 : Math.sin(tt * 0.8 + f.spin) * 0.2;
        ctx.save(); ctx.globalAlpha = st.a * fade; ctx.translate(X, Y); ctx.rotate(wob + f.spin * f.p);
        ctx.drawImage(sprites[f.item[1]], -st.s / 2, -st.s / 2, st.s, st.s); ctx.restore();
      }
      ctx.globalAlpha = 1; ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    },
  };
}

const CONCEPTS = { islands, shapes, chart, stars, pixel, multiworld, mail: multiworld };
const STYLE_SCALE = { stars: 1, multiworld: 1, mail: 1 };   // stars need crisp pixels; everything else renders soft at half res

/* ------------------------------------------------------------------ engine */
export function createBackground(canvas, opts = {}) {
  const o = { style: STYLE, seed: 1, fps: FPS, renderScale: RENDER_SCALE, eggImages: [], pointerTarget: window, scrollTarget: window, eggChance: EGG_CHANCE, ...opts };
  const ctx = canvas.getContext('2d');
  const env = { W: 1, H: 1, S: o.renderScale, q: o.renderScale, theme: null, rnd: null, mobile: false, spawned: () => { if (Math.random() < o.eggChance) spawnEgg(); }, log: (m) => o.onLog && o.onLog(m) };
  let scene = null, raf = 0, last = 0, acc = 0, running = false, tt = 0;
  const par = { px: 0, py: 0, tx: 0, ty: 0, sy: 0 };
  const eggs = [], eggImgs = [];
  o.eggImages.forEach((src) => { const im = new Image(); im.decoding = 'async'; im.onload = () => eggImgs.push(im); im.src = src; });

  function build() {
    // client size ignores CSS transforms on ancestors
    env.W = Math.max(1, canvas.clientWidth); env.H = Math.max(1, canvas.clientHeight); env.mobile = env.W < 480;
    env.S = env.q = STYLE_SCALE[o.style] ?? o.renderScale;
    canvas.width = Math.round(env.W * env.S); canvas.height = Math.round(env.H * env.S);
    env.theme = themeFromSeed(o.seed);
    env.rnd = mulberry32(((o.seed * 2654435761) ^ (o.style.length * 0x9e3779b9)) >>> 0);
    scene = (CONCEPTS[o.style] || islands)(env);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  }
  function spawnEgg() {
    if (!eggImgs.length) return false;
    const im = eggImgs[Math.floor(Math.random() * eggImgs.length)], { W, H } = env;
    const w = (env.mobile ? 110 : 170) * (0.8 + Math.random() * 0.4), h = w * (im.naturalHeight / im.naturalWidth || 1), m = Math.max(w, h);
    const side = Math.floor(Math.random() * 4);
    const x = side === 0 ? -m : side === 1 ? W + m : Math.random() * W, y = side === 2 ? -m : side === 3 ? H + m : Math.random() * H;
    const a = Math.atan2(H / 2 + (Math.random() - 0.5) * H * 0.4 - y, W / 2 + (Math.random() - 0.5) * W * 0.4 - x), v = 34 + Math.random() * 22;
    eggs.push({ im, w, h, m, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: (Math.random() - 0.5) * 0.4, vr: (Math.random() - 0.5) * 0.25 });
    if (!running) draw();
    return true;
  }
  function step(dt) {
    tt += dt;
    par.px += (par.tx - par.px) * Math.min(1, dt * 2.5); par.py += (par.ty - par.py) * Math.min(1, dt * 2.5);
    scene.update(dt);
    for (let i = eggs.length - 1; i >= 0; i--) {
      const e = eggs[i]; e.x += e.vx * dt; e.y += e.vy * dt; e.rot += e.vr * dt;
      if (e.x < -e.m * 1.5 || e.x > env.W + e.m * 1.5 || e.y < -e.m * 1.5 || e.y > env.H + e.m * 1.5) eggs.splice(i, 1);
    }
  }
  function draw() {
    ctx.setTransform(env.S, 0, 0, env.S, 0, 0);
    ctx.clearRect(0, 0, env.W, env.H);
    scene.draw(ctx, par);
    for (const e of eggs) {
      ctx.globalAlpha = 0.8;
      ctx.setTransform(env.S * Math.cos(e.rot), env.S * Math.sin(e.rot), -env.S * Math.sin(e.rot), env.S * Math.cos(e.rot), e.x * env.S, e.y * env.S);
      ctx.drawImage(e.im, -e.w / 2, -e.h / 2, e.w, e.h);
    }
    ctx.setTransform(env.S, 0, 0, env.S, 0, 0); ctx.globalAlpha = 1;
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? (now - last) / 1000 : 0; last = now; acc += dt;
    if (acc < 1 / o.fps - 0.004) return;
    step(Math.min(acc, 0.1)); acc = 0; draw();
  }
  const onPointer = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const r = canvas.getBoundingClientRect();
    par.tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    par.ty = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
  };
  const onScroll = () => { par.sy = o.scrollTarget === window ? window.scrollY : o.scrollTarget.scrollTop; if (!running) draw(); };
  o.pointerTarget && o.pointerTarget.addEventListener('pointermove', onPointer, { passive: true });
  o.scrollTarget && o.scrollTarget.addEventListener('scroll', onScroll, { passive: true });
  let rt = 0;
  const ro = new ResizeObserver(() => {
    if (canvas.clientWidth === env.W && canvas.clientHeight === env.H) return;   // initial callback / no real change
    clearTimeout(rt); rt = setTimeout(() => { build(); if (!running) draw(); }, 150);
  });
  ro.observe(canvas);
  build();

  return {
    get theme() { return env.theme; },
    start() { if (running) return; running = true; last = 0; acc = 0; raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    advance(sec) { const n = Math.ceil(sec * 30); for (let i = 0; i < n; i++) step(1 / 30); draw(); },
    draw,
    spawnEgg,
    setSeed(seed) { o.seed = seed; build(); if (!running) draw(); },
    setStyle(style) { o.style = style; build(); if (!running) draw(); },
    destroy() { this.stop(); ro.disconnect(); o.pointerTarget && o.pointerTarget.removeEventListener('pointermove', onPointer); o.scrollTarget && o.scrollTarget.removeEventListener('scroll', onScroll); },
  };
}

/* ------------------------------------------------------------------ page boot */
async function getJSON(url) {
  try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch { return null; }
}
function count(d, key, arr) {
  if (!d) return 0;
  if (Array.isArray(d)) return d.length;
  if (typeof d[key] === 'number') return d[key];
  return Array.isArray(d[arr]) ? d[arr].length : 0;
}
async function loadSeed() {
  const [g, t] = await Promise.all([getJSON(DATA_GAMES), getJSON(DATA_TOOLS)]);
  return count(g, 'totalGames', 'games') + count(t, 'totalTools', 'tools');
}
async function loadEggs() {
  const d = await getJSON(EGG_LIST);
  const list = Array.isArray(d) ? d : (d && (d.images || d.eggs || d.files)) || [];
  return list.map((x) => (typeof x === 'string' ? x : x && (x.src || x.file || x.path))).filter(Boolean)
    .map((s) => (/^(https?:)?\/\//.test(s) || s.includes('/') ? s : EGG_DIR + s));
}

async function boot() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas) return;
  const root = document.documentElement;
  const toggle = document.getElementById('bgToggle');
  const eggBtn = document.getElementById('eggSpawnBtn');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

  // 1. paint the last known theme immediately, then the fresh one
  const cached = +store.get('bgSeed');
  if (cached) applyTheme(themeFromSeed(cached));
  let seed = await loadSeed();
  if (seed) store.set('bgSeed', String(seed)); else seed = cached || 1;
  applyTheme(themeFromSeed(seed));

  // 2. optional server-log feed: only created if the chosen style writes to it (pixel doesn't)
  let logEl = null;
  const lines = [];
  const onLog = (m) => {
    if (!logEl) {
      logEl = document.getElementById('bgLog') || document.body.appendChild(document.createElement('div'));
      logEl.id = 'bgLog'; logEl.classList.add('bg-log'); logEl.setAttribute('aria-hidden', 'true');
    }
    lines.push(m); if (lines.length > 4) lines.shift();
    logEl.replaceChildren(...lines.map((l, i) => { const d = document.createElement('div'); d.textContent = l; d.style.setProperty('--age', String(lines.length - 1 - i)); return d; }));
  };

  // 3. the background itself
  const bg = createBackground(canvas, { seed, style: canvas.dataset.style || STYLE, eggImages: await loadEggs(), onLog });
  let off = store.get('bgAnimationOff') === 'true';

  function apply() {
    root.classList.toggle('bg-off', off);
    if (toggle) {
      toggle.classList.toggle('off', off); toggle.classList.toggle('active', !off);
      toggle.setAttribute('aria-pressed', String(!off));
      toggle.title = off ? 'Turn background animation on' : 'Turn background animation off';
    }
    if (off || document.hidden) bg.stop();
    else if (reduce.matches) { bg.stop(); bg.advance(6); }   // one still frame, no motion
    else bg.start();
  }
  if (toggle) {
    toggle.setAttribute('role', 'button'); toggle.tabIndex = 0;
    const flip = () => { off = !off; store.set('bgAnimationOff', String(off)); apply(); };
    toggle.addEventListener('click', flip);
    toggle.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  }
  document.addEventListener('visibilitychange', apply);
  reduce.addEventListener?.('change', apply);

  window.spawnEasterEgg = () => {
    if (off) { off = false; store.set('bgAnimationOff', 'false'); apply(); }
    return bg.spawnEgg();
  };

  // Konami: ↑↑↓↓←→←→ B A Enter → reveal the egg button
  const K = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'Enter'];
  let ki = 0;
  document.addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    ki = k === K[ki] ? ki + 1 : k === K[0] ? 1 : 0;
    if (ki === K.length) { ki = 0; if (eggBtn) { eggBtn.classList.add('revealed'); eggBtn.style.display = ''; } window.spawnEasterEgg(); }
  });

  apply();
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
}
