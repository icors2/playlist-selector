# Okaylist

Collaborative Spotify playlist builder for Netlify. A group nominates songs, everyone votes **Love / Okay / Pass**, and anything with zero vetoes becomes the shared playlist.

**Backend:** Google Sheets (no database to provision).

## How it works

1. **Create a room** and share the 6-character code
2. Friends join with the code
3. Host opens **nominations** — search Spotify and add songs
4. Host opens **voting** — Love it, Okay with it, or Pass (veto)
5. Host reveals results — songs with no passes are sorted by enthusiasm
6. Host can **export to Spotify** (optional Spotify app credentials)

Consensus rule: a song makes the playlist only if nobody voted Pass and at least one person voted.

## Google Sheets setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Sheets API**
2. Create a **service account**, download its JSON key
3. Create a blank [Google Spreadsheet](https://sheets.google.com/)
4. Share the spreadsheet with the service account email as **Editor**
5. Copy the spreadsheet ID from the URL (`/d/<ID>/edit`)
6. Set env vars (see `.env.example`):

| Variable | Purpose |
|---|---|
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Spreadsheet ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email |
| `GOOGLE_PRIVATE_KEY` | Private key (keep `\n` escapes) |
| `NEXT_PUBLIC_APP_URL` | Public site URL |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Optional live Spotify search + export |

On first write, Okaylist creates four tabs automatically: `Rooms`, `Participants`, `Songs`, `Votes`.

Without Sheets credentials the app falls back to **in-memory storage** (fine for local solo testing; data is lost on restart and not shared across Netlify instances).

## Local development

```bash
npm install
cp .env.example .env.local
# fill Google Sheets + optional Spotify vars
npm run dev
```

## Netlify deploy

```bash
# one-time
npx netlify login
npx netlify init

# set env vars in Netlify UI, or:
npx netlify env:set GOOGLE_SHEETS_SPREADSHEET_ID "..."
npx netlify env:set GOOGLE_SERVICE_ACCOUNT_EMAIL "..."
npx netlify env:set GOOGLE_PRIVATE_KEY "-----BEGIN PRIVATE KEY-----\n..."
npx netlify env:set NEXT_PUBLIC_APP_URL "https://your-site.netlify.app"

npx netlify deploy --build --prod
```

`netlify.toml` builds with `npm run build` and publishes `.next`. The Next.js runtime on Netlify turns API routes into serverless functions.

### Spotify redirect (optional)

In the Spotify Developer Dashboard, add:

```
https://your-site.netlify.app/api/spotify/export
```

## Scripts

- `npm run dev` — local development
- `npm run build` — production build
- `npm run lint` — ESLint
