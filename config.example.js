// IGDB Configuration Example
//
// Per utilizzare le copertine da IGDB, segui questi passaggi:
//
// 1. Crea un account Twitch Developer su https://dev.twitch.tv/
// 2. Registra una nuova applicazione
// 3. Ottieni il Client ID e Client Secret
// 4. Usa questi dati per ottenere un Access Token
//
// Per ottenere l'Access Token, esegui questa richiesta:
//
// POST https://id.twitch.tv/oauth2/token?client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&grant_type=client_credentials
//
// Copia i valori in script.js nella sezione CONFIG

const IGDB_CONFIG_EXAMPLE = {
    CLIENT_ID: 'il_tuo_client_id_qui',
    CLIENT_SECRET: 'il_tuo_client_secret_qui',
    ACCESS_TOKEN: 'il_tuo_access_token_qui'
};

// ALTERNATIVE: SteamGridDB
//
// SteamGridDB è più facile da configurare:
// 1. Vai su https://www.steamgriddb.com/
// 2. Crea un account
// 3. Vai su https://www.steamgriddb.com/profile/preferences/api
// 4. Genera una API Key
//
// Questa è gratuita e più semplice da usare!
