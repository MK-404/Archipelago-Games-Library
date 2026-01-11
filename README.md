# Archipelago Games Viewer

Visualizzatore della libreria di giochi Archipelago con copertine e banner, simile alla libreria di Steam.

## Caratteristiche

- 🎮 Interfaccia stile Steam con griglia di copertine
- 🖼️ Cover e banner per ogni gioco da SteamGridDB
- 🔍 Ricerca in tempo reale con normalizzazione accenti
- 🎯 Filtri per tipo e stato dei giochi
- 📊 Ordinamento per nome, stato, e giochi nuovi
- 🆕 Badge "NEW" per giochi aggiunti di recente
- 💾 Build automatico con GitHub Actions
- 🎨 Modal con dettagli gioco, link e note

## Demo

🌐 **[Vedi la demo live su GitHub Pages](https://your-username.github.io/archipelago-games-viewer/)**

## Architettura

Il progetto usa un'architettura a due fasi:

1. **Build Phase** (Node.js): Legge il file XLSX, scarica immagini da SteamGridDB, genera JSON
2. **Runtime Phase** (Browser): Carica il JSON pre-generato e mostra l'interfaccia

### Vantaggi
- ✅ Nessuna API key necessaria per gli utenti finali
- ✅ Caricamento veloce (tutto pre-generato)
- ✅ Funziona su GitHub Pages (solo file statici)
- ✅ Nessun limite di rate per gli utenti

## Setup Locale

### Prerequisiti
- Node.js 18+
- npm

### Installazione

```bash
# Clona il repository
git clone https://github.com/your-username/archipelago-games-viewer.git
cd archipelago-games-viewer

# Installa le dipendenze
npm install

# Metti il file XLSX nella root
# Nome file: "Archipelago Games Sheet.xlsx"

# Esegui il build (genera il JSON e scarica le immagini)
npm run build

# Avvia il server locale
npm run serve

# Apri http://localhost:8080
```

## Deployment su GitHub Pages

### Setup Iniziale

1. **Crea un nuovo repository su GitHub**

2. **Configura GitHub Pages**:
   - Vai su Settings > Pages
   - Source: "GitHub Actions"

3. **Pusha il codice**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/your-username/archipelago-games-viewer.git
   git push -u origin main
   ```

4. **Il workflow automatico partirà**:
   - Il workflow `.github/workflows/deploy.yml` si attiverà automaticamente
   - Eseguirà `npm run build` per generare il JSON
   - Pubblicherà su GitHub Pages

### Aggiornare i Dati

Ogni volta che aggiorni il file XLSX:

```bash
# Aggiorna il file XLSX nella root
# Poi:
git add "Archipelago Games Sheet.xlsx"
git commit -m "Update games data"
git push

# GitHub Actions ribuilderà automaticamente il sito
```

## Script Disponibili

- `npm run build` - Genera il JSON dai dati XLSX
- `npm run extract-links` - Estrae link embeddati dai file HTML
- `npm run serve` - Avvia server locale su porta 8080

## Struttura File

```
.
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions workflow
├── build/
│   ├── build.js                # Script principale di build
│   └── extract-links.js        # Estrae link da HTML
├── data/
│   ├── covers/                 # Immagini cover (committate)
│   ├── banners/                # Immagini banner (committate)
│   ├── games.json              # Generato dal build (ignorato)
│   └── game-history.json       # Stato giochi (ignorato)
├── extract/
│   ├── Core-Verified Worlds.html
│   ├── Playable Worlds.html
│   └── extracted-links.json
├── index.html                  # Pagina principale
├── app.js                      # Logica frontend
├── styles.css                  # Stili
├── Archipelago Games Sheet.xlsx
└── package.json

```

## Build Process

Il file `build/build.js`:

1. Legge il file XLSX ("Archipelago Games Sheet.xlsx")
2. Estrae i dati dai fogli "Core-Verified Worlds" e "Playable Worlds"
3. Per ogni gioco:
   - Cerca cover e banner su SteamGridDB
   - Scarica e salva le immagini localmente
   - Usa `_default.png` se non trovato
4. Genera `data/games.json` con tutti i metadati
5. Aggiorna `data/game-history.json` per tracciare giochi nuovi

## Funzionalità Frontend

### Filtri
- **Tipo**: Tutti, Core-Verified, Playable
- **Stato**: Tutti, Core-Verified, Stable, Merged, etc.

### Ordinamento
- Predefinito (NEW games first, poi A→Z)
- A → Z / Z → A
- Per stato

### Ricerca
- Normalizzazione accenti (pokemon = pokémon)
- Case-insensitive
- Real-time

### Modal Dettagli
- Banner image di sfondo
- Titolo e stato
- Link a Game Page, Setup Guide, Discord (Core-Verified)
- Link a Source e Notes (Playable Worlds)
- Badge colorato per stato

### Badge NEW
- Appare sui giochi aggiunti nell'ultimo update
- Si rimuove automaticamente quando vengono aggiunti nuovi giochi
- Persiste finché non ci sono update con nuovi giochi

## Configurazione API

L'API key di SteamGridDB è hardcoded in `build/build.js`:

```javascript
STEAMGRIDDB_API_KEY: 'your-api-key-here'
```

⚠️ **Importante**: Non committare API key pubbliche su repository pubblici. Considera l'uso di GitHub Secrets per progetti pubblici.

## Personalizzazione

### Colori Stato
Modifica in `styles.css`:

```css
.game-card[data-status*="Stable"] { border-color: #4ade80; }
.game-card[data-status*="Unstable"] { border-color: #fbbf24; }
.game-card[data-status*="Broken"] { border-color: #ef4444; }
```

### Default Images
Sostituisci:
- `data/covers/_default.png` (cover predefinita)
- `data/banners/_default.png` (banner predefinito)

## Troubleshooting

### Build fallisce
```bash
# Verifica che il file XLSX esista
ls "Archipelago Games Sheet.xlsx"

# Reinstalla dipendenze
rm -rf node_modules package-lock.json
npm install
```

### GitHub Actions fallisce
- Controlla che il file XLSX sia committato
- Verifica i log in Actions tab
- Assicurati che GitHub Pages sia abilitato

### Immagini non si caricano
- Verifica che `data/covers/` e `data/banners/` siano committate
- Controlla i percorsi relativi in `games.json`

## Credits

- Dati: [Archipelago Games Spreadsheet](https://docs.google.com/spreadsheets/d/1iuzDTOAvdoNe8Ne8i461qGNucg5OuEoF-Ikqs8aUQZw/)
- Immagini: [SteamGridDB](https://www.steamgriddb.com/)
- Framework: Vanilla JS + CSS Grid
