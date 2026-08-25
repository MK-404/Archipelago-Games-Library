export default {
    async fetch(request, env) {
        const url = new URL(request.url);

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
