# Okaylist

Collaborative Spotify playlist builder for Netlify. A group nominates songs, everyone votes **Love / Okay / Pass**, and anything with zero vetoes becomes the shared playlist.

**Backend:** Google Sheets via **Apps Script** (no Google Cloud project or service account).

## How it works

1. **Create a room** and share the 6-character code
2. Friends join with the code
3. Host opens **nominations** — search Spotify and add songs
4. Host opens **voting** — Love it, Okay with it, or Pass (veto)
5. Host reveals results — songs with no passes are sorted by enthusiasm
6. Host can **export to Spotify** (optional Spotify app credentials)

Consensus rule: a song makes the playlist only if nobody voted Pass and at least one person voted.

## Google Apps Script setup

See [`apps-script/README.md`](./apps-script/README.md) for the full walkthrough.

Short version:

1. Create a Google Sheet → **Extensions → Apps Script**
2. Paste [`apps-script/Code.gs`](./apps-script/Code.gs)
3. Add script property `APPS_SCRIPT_SECRET`
4. Deploy as a **Web app** (Execute as: Me, Who has access: Anyone)
5. Set env vars:

| Variable | Purpose |
|---|---|
| `GOOGLE_APPS_SCRIPT_URL` | Deployed Apps Script web app URL |
| `GOOGLE_APPS_SCRIPT_SECRET` | Same secret as the script property |
| `NEXT_PUBLIC_APP_URL` | Public site URL |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Optional live Spotify search + export |

Without Apps Script credentials the app falls back to **in-memory storage** (fine for local solo testing; not shared across Netlify instances).

## Local development

```bash
npm install
cp .env.example .env.local
# fill Apps Script + optional Spotify vars
npm run dev
```

## Netlify deploy

```bash
npx netlify login
npx netlify init

npx netlify env:set GOOGLE_APPS_SCRIPT_URL "https://script.google.com/macros/s/.../exec"
npx netlify env:set GOOGLE_APPS_SCRIPT_SECRET "your-secret"
npx netlify env:set NEXT_PUBLIC_APP_URL "https://your-site.netlify.app"

npx netlify deploy --build --prod
```

### Spotify redirect (optional)

```
https://your-site.netlify.app/api/spotify/export
```

## Scripts

- `npm run dev` — local development
- `npm run build` — production build
- `npm run lint` — ESLint
