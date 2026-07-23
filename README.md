# Okaylist

Group playlist voting with an **80% approval** rule. Search **Spotify** (primary) with **iTunes** as backup, vote Love / Okay / Pass, then copy winners into Spotify — or export via Spotify OAuth when configured.

## Song search

`GET /api/catalog/search?q=…`

1. **Spotify** (Client Credentials) when `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` are set  
2. **iTunes Search API** if Spotify is missing, errors, or returns nothing  
3. Local Postgres / seed catalog as a last resort  

Empty query browses the local catalog seed.

## Spotify keys (Render)

Create a free app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard), then add these **Redirect URIs** in the app settings:

| Environment | Redirect URI |
|---|---|
| Production (Render) | `https://okaylist.onrender.com/api/spotify/export` |
| Local | `http://localhost:3000/api/spotify/export` |

Use your real Render hostname if it differs from `okaylist.onrender.com`.

### Env vars to set on the Render web service

| Key | Required for | Notes |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Search + import + export | From Spotify Dashboard |
| `SPOTIFY_CLIENT_SECRET` | Search + import + export | From Spotify Dashboard |
| `NEXT_PUBLIC_APP_URL` | OAuth export redirects | e.g. `https://okaylist.onrender.com` (no trailing slash) |
| `DATABASE_URL` | Rooms / votes | Auto-wired by Blueprint from `okaylist-db` |

Search and public playlist import use **Client Credentials** (no user login).  
**Export / “Update Spotify playlist”** uses OAuth and needs the redirect URI above to match exactly.

## Render deploy (Blueprint)

[`render.yaml`](./render.yaml) defines free web + free Postgres on branch `cursor/spotify-primary-search-ba17`.

1. Push this branch  
2. Render → **New** → **Blueprint** (or sync the existing Blueprint / update the service branch)  
3. Fill `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL` when prompted (`sync: false`)  
4. Apply / redeploy  

> Only **one** free Postgres database is allowed per Render workspace.

Deploy lifecycle:

```bash
# build
npm ci && npm run build && npm run db:migrate
# start (binds port immediately; seed runs alongside)
bash scripts/start.sh
```

> Free Render Postgres expires after 30 days of inactivity on free plans.

## How voting works

With `N` people in the room, a song needs `ceil(N × 0.8)` Love/Okay votes to make the playlist. Nominations stay open during voting — new songs show up live (~1.5s poll).

## Local development

```bash
npm install
cp .env.example .env.local
# set DATABASE_URL + Spotify keys
npm run db:migrate
npm run db:seed
npm run dev
```

Without Spotify keys, search falls back to iTunes, then the local seed.

## Scripts

- `npm run dev` — local Next.js  
- `npm run build` / `npm start` — production (binds `0.0.0.0`)  
- `npm run db:migrate` — apply Drizzle migrations  
- `npm run db:seed` — upsert song catalog  
