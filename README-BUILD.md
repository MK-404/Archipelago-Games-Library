# Archipelago Games Viewer - Build System

Sistema in due fasi per il visualizzatore di giochi Archipelago.

## Architettura

### Fase 1: Build (Node.js)
Script Node.js che:
- Legge i file CSV con i giochi (supporta entrambi i formati)
  - **Playable Worlds**: Game, Status, Source, Notes
  - **Core-Verified Worlds**: Game, Game Page, Setup Page, Discord Channel
- Scarica le copertine da SteamGridDB (10 in parallelo)
- Salva le immagini con il **nome del gioco** (es: `Celeste.jpg`)
- **Salta i download** se l'immagine esiste già
- Genera `data/games.json` con tutti i dati

### Fase 2: Frontend (Statico)
Applicazione web statica che:
- Carica il JSON pre-generato
- Mostra i giochi con le copertine locali
- Badge colorati per piattaforma e status
- Click su giochi Core-Verified apre la pagina ufficiale
- Nessuna chiamata API in runtime
- Veloce, affidabile, nessun problema CORS

## Setup Iniziale

### 1. Installa Node.js
Se non ce l'hai già, scarica e installa Node.js da: https://nodejs.org/

### 2. Installa le dipendenze
```bash
npm install
```

## Workflow di Aggiornamento

### Quando aggiorni i CSV:

1. **Sostituisci i file CSV** nella cartella principale con le nuove versioni

2. **Esegui il build**:
   ```bash
   npm run build
   ```

   Questo processo:
   - Legge i CSV
   - Trova tutti i giochi
   - Scarica le copertine (può richiedere diversi minuti)
   - Salva tutto in `data/`

3. **Testa in locale**:
   ```bash
   npm run serve
   ```
   Poi apri http://localhost:8080

4. **Deploy**: Carica tutta la cartella su un hosting statico

## Struttura File

```
Archipelago Games Viewer/
├── build.js                    # Script di build
├── package.json                # Configurazione Node.js
├── index.html                  # Frontend
├── app.js                      # Frontend JavaScript (nuovo)
├── script.js                   # Script vecchio (ora inutilizzato)
├── styles.css                  # Stili
├── Archipelago Games Sheet - Playable Worlds.csv
├── Archipelago Games Sheet - Core-Verified Worlds.csv
└── data/                       # Generato dal build
    ├── games.json              # Database dei giochi
    └── covers/                 # Copertine scaricate
        ├── 12345.jpg
        ├── 67890.png
        └── ...
```

## File Generati

### `data/games.json`
Contiene tutti i dati dei giochi in formato JSON:
```json
{
  "generated": "2025-01-15T10:30:00.000Z",
  "totalGames": 150,
  "coversFound": 142,
  "coversMissing": 8,
  "games": [
    {
      "name": "A Link to the Past",
      "status": "Core-Verified",
      "platform": "SNES",
      "coverPath": "data/covers/12345.jpg",
      "coverUrl": "https://..."
    },
    ...
  ]
}
```

## Note

- Le copertine vengono scaricate **solo durante il build**
- Il frontend carica solo il JSON, nessuna chiamata API
- Puoi hostare su GitHub Pages, Netlify, Vercel, etc.
- I file CSV possono essere aggiornati periodicamente, basta rifare il build

## Vantaggi

✅ Nessun problema CORS
✅ Nessun rate limiting in runtime
✅ Caricamento velocissimo
✅ Funziona offline (dopo il primo caricamento)
✅ Può essere hostato ovunque (hosting statico)
✅ SEO-friendly
✅ Copertine in alta qualità salvate localmente
✅ **Build incrementali**: le immagini già scaricate non vengono riscaricate
✅ **Parallelizzazione**: 10 richieste simultanee per velocizzare il download
✅ **Supporto multi-formato**: gestisce entrambi i tipi di CSV automaticamente

## Troubleshooting

### Il build fallisce con errori di rate limiting
- Lo script ha già dei delay tra le richieste (500ms)
- Se necessario, aumenta `DELAY_BETWEEN_REQUESTS` in `build.js`

### Alcune copertine non vengono trovate
- Normale, non tutti i giochi hanno copertine su SteamGridDB
- Il frontend mostrerà un placeholder con il nome del gioco

### Errore "Cannot find module"
- Assicurati di aver eseguito `npm install`

### Il sito non carica i dati
- Verifica che esista `data/games.json`
- Usa `npm run serve` per testare in locale (necessario per il CORS)
