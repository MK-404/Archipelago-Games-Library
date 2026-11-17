export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname === '/online-badge') return onlineBadge(request, env, ctx);

        if (url.pathname !== '/discord/callback') {
            return new Response('Archipelago Auth Worker is running.', { status: 200 });
        }

        const code = url.searchParams.get('code');
        if (!code) {
            return Response.redirect(`${env.SITE_URL}/#auth_error=no_code`);
        }

        try {
            const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: env.DISCORD_CLIENT_ID,
                    client_secret: env.DISCORD_CLIENT_SECRET,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: `${new URL(request.url).origin}/discord/callback`
                })
            });

            const tokens = await tokenRes.json();
            if (!tokens.access_token) {
                const detail = encodeURIComponent(tokens.error || JSON.stringify(tokens));
                return Response.redirect(`${env.SITE_URL}/#auth_error=token_failed&detail=${detail}`);
            }

            const userRes = await fetch('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${tokens.access_token}` }
            });
            const user = await userRes.json();

            if (!user.id) {
                return Response.redirect(`${env.SITE_URL}/#auth_error=user_failed`);
            }

            const params = new URLSearchParams({
                discord_id: user.id,
                username: user.username,
                avatar: user.avatar || ''
            });

            return Response.redirect(`${env.SITE_URL}/#${params.toString()}`);
        } catch (err) {
            return Response.redirect(`${env.SITE_URL}/#auth_error=server_error`);
        }
    }
};

// README badge: how many people have the site open right now.
// Joins the same Supabase presence channel the site uses (without tracking itself),
// reads the presence list and answers in shields.io "endpoint" format. Cached for 60 s.
const SUPABASE_REALTIME = 'https://thcojeibhdywdohmfoxa.supabase.co/realtime/v1/websocket';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoY29qZWliaGR5d2RvaG1mb3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjY5NjQsImV4cCI6MjA5NzQ0Mjk2NH0.sxWuwRRp9uQrW9hiXFa0-CEIzLr99hHqLmXyyFgMZp8';

async function onlineBadge(request, env, ctx) {
    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;

    let message = '?', color = 'lightgrey';
    try {
        const n = await countOnline();
        message = String(n);
        color = n > 0 ? 'brightgreen' : 'lightgrey';
    } catch (e) { /* show "?" */ }

    const res = new Response(JSON.stringify({ schemaVersion: 1, label: 'online now', message, color }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', 'Access-Control-Allow-Origin': '*' },
    });
    ctx.waitUntil(cache.put(request, res.clone()));
    return res;
}

async function countOnline() {
    const upgrade = await fetch(`${SUPABASE_REALTIME}?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`, { headers: { Upgrade: 'websocket' } });
    const ws = upgrade.webSocket;
    if (!ws) throw new Error('no websocket');
    ws.accept();
    return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 8000);
        ws.addEventListener('message', (e) => {
            const m = JSON.parse(e.data);
            if (m.event !== 'presence_state') return;
            clearTimeout(timer); ws.close();
            resolve(Object.keys(m.payload).length);
        });
        ws.send(JSON.stringify({
            topic: 'realtime:online-users', event: 'phx_join', ref: '1',
            payload: { config: { broadcast: { ack: false, self: false }, presence: { key: '', enabled: true }, postgres_changes: [], private: false }, access_token: SUPABASE_ANON_KEY },
        }));
    });
}
