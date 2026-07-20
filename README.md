# Okaylist

Collaborative Spotify playlist builder. Import your group’s playlist, vote **Love / Okay / Pass**, and write the survivors back to Spotify.

**Backend:** free Netlify Database (Postgres) — persists across uses.  
**Songs:** pulled from a Spotify playlist URL (and/or search), not from genres.

## Do I need a Spotify API?

**Yes, for real playlists.** It’s free:

1. Open [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) (Spotify login)
2. **Create app** → any name
3. Copy **Client ID** and **Client Secret**
4. Edit Settings → **Redirect URIs** → add:
   `https://YOUR-SITE.netlify.app/api/spotify/export`
5. On Netlify → Site settings → Environment variables:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `NEXT_PUBLIC_APP_URL` = `https://YOUR-SITE.netlify.app`

Without those keys the app still runs (demo song catalog + voting), but it **cannot** import or update your real Spotify playlist.

Your playlist must be **public** for import (or you’ll see a “not found” error). The person who clicks **Update Spotify playlist** must be able to edit that playlist (owner/collaborator).

## How a session works

1. Deploy to Netlify first (so you have a site URL for Spotify’s redirect)
2. Create a Spotify Developer app with redirect  
   `https://YOUR-SITE.netlify.app/api/spotify/export`
3. Host creates a room and pastes a Spotify playlist they can edit
4. Songs import as nominations → vote → host updates that playlist

Tip: create your own playlist in Spotify (even empty) and use that link so you’re the owner.

## Deploy on Netlify (phone-friendly)

1. [app.netlify.com](https://app.netlify.com) → Add site → Import from GitHub
2. Deploy (database is created automatically)
3. Add the Spotify env vars above
4. Redeploy once so the keys are live

## Local development

```bash
npm install
cp .env.example .env.local
# optional: DATABASE_URL, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
npm run dev
```

## Scripts

- `npm run dev` — local development
- `npm run build` — production build
- `npm run db:generate` — new Drizzle migration after schema edits
