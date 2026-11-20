// Archipelago Library worker
//   GET  /discord/callback   Discord OAuth → back to the site with the user + a signed token
//   GET  /api/votes          vote count per game (public)
//   GET  /api/me             the caller's favorites and votes (token)
//   POST /api/toggle         { kind: 'favorite' | 'vote', game, on } (token)
//   GET  /presence           WebSocket: live "online now" counter
//   GET  /online-badge       shields.io endpoint JSON for the README

import { DurableObject } from 'cloudflare:workers';

const ALLOWED_ORIGINS = ['https://archipelagolibrary.com', 'http://localhost:8080', 'http://127.0.0.1:8080'];
const TOKEN_DAYS = 180;
const MAX_GAME_LEN = 200;

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const cors = corsHeaders(request);

        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

        try {
            switch (url.pathname) {
                case '/discord/callback': return discordCallback(request, env);
                case '/api/votes': return votes(env, cors);
                case '/api/me': return me(request, env, cors);
                case '/api/toggle': return toggle(request, env, cors);
                case '/presence': return presence(request, env);
                case '/online-badge': return onlineBadge(request, env, ctx);
                default: return new Response('Archipelago Library worker is running.', { headers: cors });
            }
        } catch (err) {
            console.error(err);
            return json({ error: 'server_error' }, 500, cors);
        }
    },
};

// ---------------------------------------------------------------- helpers
function corsHeaders(request) {
    const origin = request.headers.get('Origin');
    const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allow,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
}

function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret, data) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
}

// token = "<discordId>.<expiresAtSeconds>.<signature>"
async function makeToken(env, userId) {
    const exp = Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400;
    return `${userId}.${exp}.${await hmac(env.TOKEN_SECRET, `${userId}.${exp}`)}`;
}

async function userFromRequest(request, env) {
    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const [id, exp, sig] = token.split('.');
    if (!id || !exp || !sig || !/^\d{5,25}$/.test(id) || +exp < Date.now() / 1000) return null;
    const expected = await hmac(env.TOKEN_SECRET, `${id}.${exp}`);
    if (expected.length !== sig.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    return diff === 0 ? id : null;
}

// ---------------------------------------------------------------- Discord login
async function discordCallback(request, env) {
    const site = env.SITE_URL;
    const code = new URL(request.url).searchParams.get('code');
    if (!code) return Response.redirect(`${site}/#auth_error=no_code`);

    try {
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: env.DISCORD_CLIENT_ID,
                client_secret: env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: `${new URL(request.url).origin}/discord/callback`,
            }),
        });
        const tokens = await tokenRes.json();
        if (!tokens.access_token) {
            return Response.redirect(`${site}/#auth_error=token_failed&detail=${encodeURIComponent(tokens.error || 'unknown')}`);
        }

        const user = await (await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokens.access_token}` } })).json();
        if (!user.id) return Response.redirect(`${site}/#auth_error=user_failed`);

        const params = new URLSearchParams({
            discord_id: user.id,
            username: user.username,
            avatar: user.avatar || '',
            token: await makeToken(env, user.id),
        });
        return Response.redirect(`${site}/#${params}`);
    } catch (err) {
        return Response.redirect(`${site}/#auth_error=server_error`);
    }
}

// ---------------------------------------------------------------- favorites / votes
async function votes(env, cors) {
    const { results } = await env.DB.prepare('SELECT game, COUNT(*) AS n FROM votes GROUP BY game').all();
    const counts = Object.fromEntries(results.map((r) => [r.game, r.n]));
    return json({ counts }, 200, { ...cors, 'Cache-Control': 'no-store' });
}

async function me(request, env, cors) {
    const user = await userFromRequest(request, env);
    if (!user) return json({ error: 'unauthorized' }, 401, cors);
    const [fav, vote] = await env.DB.batch([
        env.DB.prepare('SELECT game FROM favorites WHERE user_id = ?').bind(user),
        env.DB.prepare('SELECT game FROM votes WHERE user_id = ?').bind(user),
    ]);
    return json({ favorites: fav.results.map((r) => r.game), votes: vote.results.map((r) => r.game) }, 200, { ...cors, 'Cache-Control': 'no-store' });
}

async function toggle(request, env, cors) {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
    const user = await userFromRequest(request, env);
    if (!user) return json({ error: 'unauthorized' }, 401, cors);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400, cors); }
    const table = body.kind === 'favorite' ? 'favorites' : body.kind === 'vote' ? 'votes' : null;
    const game = typeof body.game === 'string' ? body.game.trim() : '';
    if (!table || !game || game.length > MAX_GAME_LEN) return json({ error: 'bad_request' }, 400, cors);

    const stmt = body.on
        ? env.DB.prepare(`INSERT OR IGNORE INTO ${table} (user_id, game, created_at) VALUES (?, ?, ?)`).bind(user, game, Date.now())
        : env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ? AND game = ?`).bind(user, game);
    await stmt.run();

    let count;
    if (table === 'votes') count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM votes WHERE game = ?').bind(game).first()).n;
    return json({ ok: true, count }, 200, cors);
}

// ---------------------------------------------------------------- online counter
function presence(request, env) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    return env.PRESENCE.get(env.PRESENCE.idFromName('global')).fetch(request);
}

async function onlineBadge(request, env, ctx) {
    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;

    let message = '?', color = 'lightgrey';
    try {
        const { online } = await (await env.PRESENCE.get(env.PRESENCE.idFromName('global')).fetch('https://presence/count')).json();
        message = String(online);
        color = online > 0 ? 'brightgreen' : 'lightgrey';
    } catch { /* "?" */ }

    const res = json({ schemaVersion: 1, label: 'online now', message, color }, 200, { 'Cache-Control': 'public, max-age=60', 'Access-Control-Allow-Origin': '*' });
    ctx.waitUntil(cache.put(request, res.clone()));
    return res;
}

// One instance holds every visitor's socket. Tabs of the same visitor share an id,
// so they count once. Hibernation keeps it free while nobody joins or leaves.
export class Presence extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        // keep-alive pings are answered without waking the object
        this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }

    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/count') return json({ online: this.count() });

        const { 0: client, 1: server } = new WebSocketPair();
        const id = (url.searchParams.get('id') || crypto.randomUUID()).slice(0, 64);
        this.ctx.acceptWebSocket(server, [id]);
        this.broadcast();
        return new Response(null, { status: 101, webSocket: client });
    }

    count(except) {
        const ids = new Set();
        for (const ws of this.ctx.getWebSockets()) if (ws !== except) ids.add(this.ctx.getTags(ws)[0]);
        return ids.size;
    }

    broadcast(except) {
        const msg = JSON.stringify({ online: this.count(except) });
        for (const ws of this.ctx.getWebSockets()) {
            if (ws === except) continue;
            try { ws.send(msg); } catch { /* closing */ }
        }
    }

    async webSocketMessage() { /* nothing to do: clients only listen */ }

    async webSocketClose(ws, code) {
        try { ws.close(code, 'bye'); } catch { /* already closed */ }
        this.broadcast(ws);
    }

    async webSocketError(ws) {
        this.broadcast(ws);
    }
}
