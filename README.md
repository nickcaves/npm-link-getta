# NPR New Music Friday Scraper

Scrapes album lists from NPR's [New Music Friday](https://www.npr.org/sections/music/) pages and outputs structured JSON.

## Project structure (where things go)

```
npr-new-music/
├── README.md             # You are here
├── package.json          # Dependencies and npm scripts
├── index.html            # Website
├── site.css              # Website styles
├── site.js               # Website logic
├── scripts/
│   ├── scraper.js        # The scraper (npm run scrape)
│   └── resolve-links.js  # Spotify/Songlink links (npm run resolve)
└── data/
    ├── albums.json           # Scraper output
    └── albums-with-links.json# Enriched with links (used by website)
```

## Setup

1. **Install Node.js** (18+): [nodejs.org](https://nodejs.org/) or `brew install node`

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the scraper**:
   ```bash
   npm run scrape
   ```
   Output goes to `data/albums.json`.

4. **Add Spotify credentials (.env)**:

   Create a file called `.env` in the project root:

   ```bash
   cd /Users/nickcaves/documents/npr-new-music
   touch .env
   ```

   Then edit `.env` and add:

   ```ini
   SPOTIFY_CLIENT_ID=your_client_id_here
   SPOTIFY_CLIENT_SECRET=your_client_secret_here
   ```

   You get these from a Spotify app at `https://developer.spotify.com/dashboard`.

4. **Scrape a specific URL**:
   ```bash
   npm run scrape -- --url "https://www.npr.org/2026/02/27/nx-s1-5727557/new-music-friday-best-albums-feb-27"
   ```

5. **Resolve streaming links for featured albums**:

   ```bash
   npm run resolve
   ```

   This:
   - Reads `data/albums.json` (only the featured sections: Starting 5, Lightning Round, Dora's Corner via `allAlbums`).
   - Looks up each album on Spotify.
   - Calls Songlink/Odesli using the Spotify URL.
   - Writes `data/albums-with-links.json` with Spotify + universal link + per‑service URLs.

6. **Run the website**:

   ```bash
   npm run site
   ```

   Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Deploy to GitHub Pages

1. **Build the site data** (embeds albums into `data/albums-data.js` so the live site doesn’t need to fetch):

   ```bash
   npm run build
   ```

2. **Commit and push** (including `data/albums-data.js` and `data/albums-with-links.json`):

   ```bash
   git add index.html site.css site.js data/albums-data.js data/albums-with-links.json .nojekyll
   git commit -m "Deploy site to GitHub Pages"
   git push origin main
   ```

3. **Turn on GitHub Pages** in the repo:

   - On GitHub: **Settings** → **Pages**
   - Under **Build and deployment**, **Source**: **Deploy from a branch**
   - **Branch**: `main` (or `master`) → **/ (root)** → **Save**

4. After a minute or two the site will be at:

   **`https://YOUR_USERNAME.github.io/REPO_NAME/`**

   (Replace `YOUR_USERNAME` and `REPO_NAME` with your GitHub user and repo name.)

To update the live site after new scrapes/resolves, run `npm run build`, then commit and push the updated `data/albums-data.js` (and optionally `data/albums-with-links.json`).

## GitHub setup

### 1. Create a new repo

1. On [GitHub](https://github.com/new), create a new repository (e.g. `npr-new-music`).
2. Leave it empty (no README, .gitignore, or license).

### 2. Initialize and push from your machine

```bash
cd /path/to/npr-new-music

# Initialize git (if not already)
git init

# Add files
git add .
git commit -m "Initial commit: NPR New Music Friday scraper"

# Add your remote (replace YOUR_USERNAME and REPO_NAME with your values)
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# Push
git branch -M main
git push -u origin main
```

### 3. Weekly automation (GitHub Actions)

The workflow in `.github/workflows/scrape.yml` runs **every Saturday at 06:00 AEST** (Friday 20:00 UTC) and on manual trigger. It:

1. **Discovers** the latest New Music Friday page URL from the [NPR Music podcast RSS feed](https://feeds.npr.org/510019/podcast.xml) (no guessing — uses the first matching episode link).  
2. **Scrapes** that NPR page  
3. **Resolves** Spotify + Songlink links (needs your Spotify credentials)  
4. **Embeds** data for the site  
5. **Commits and pushes** updated `data/albums.json`, `data/albums-with-links.json`, and `data/albums-data.js`

**Add repo secrets** (required for the resolver):

1. In the repo: **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** for each:
   - Name: `SPOTIFY_CLIENT_ID` → Value: your Spotify app Client ID  
   - Name: `SPOTIFY_CLIENT_SECRET` → Value: your Spotify app Client Secret  

**Manual run:** In **Actions** → **Weekly scrape & resolve** → **Run workflow** you can optionally pass an **NPR URL** to scrape a specific week; if left blank, the workflow uses the URL discovered from the RSS feed.

## Output format

`data/albums.json` looks like:

```json
{
  "source": "https://www.npr.org/...",
  "scrapedAt": "2026-03-01T...",
  "date": "2026-02-27",
  "title": "The best new albums out Feb. 27",
  "starting5": [
    { "artist": "Mitski", "album": "Nothing's About to Happen to Me", "label": "Dead Oceans" }
  ],
  "lightningRound": [...],
  "dorasCorner": [...],
  "longList": {
    "Pop": [...],
    "Rock/Alt/Indie": [...]
  },
  "allAlbums": [ /* flat list with section/genre */ ]
}
```

## Next steps

- Add Spotify Search + Songlink to fetch universal streaming links for each album.
- Build a simple website that reads `data/albums.json` and displays albums with links.
