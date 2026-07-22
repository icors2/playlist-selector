# Okaylist

Group playlist voting with an **80% approval** rule. Nominate from Apple’s **iTunes Search API** (no API key), vote Love / Okay / Pass, then copy the winners into Spotify by hand.

## Song search (iTunes)

Typing in Nominate hits Apple’s public [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/):

```
GET https://itunes.apple.com/search?term=…&media=music&entity=song
```

- **No API key / OAuth** — server-side fetch from `src/lib/itunes.ts`
- App route: `GET /api/catalog/search?q=…`
- Empty query browses the local Postgres seed catalog; typed queries prefer iTunes, then fall back to local DB/seed
- Artwork hosts (`*.mzstatic.com`) are allowlisted in `next.config.ts`

## Render deploy (Blueprint)

This repo includes a full [`render.yaml`](./render.yaml):

| Resource | Plan | Purpose |
|---|---|---|
| `okaylist` web service | free | Next.js app (`0.0.0.0:$PORT`) |
| `okaylist-db` Postgres | free | Rooms, votes, **song catalog** |

### Steps

1. Push this branch to GitHub
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
3. Select the repo / `cursor/manual-playlist-ba17` branch
4. Apply the Blueprint
5. After first deploy, set `NEXT_PUBLIC_APP_URL` to your `https://….onrender.com` URL (optional but useful)

On each start (free tier has no pre-deploy step), the service runs:

```bash
npm run db:migrate && npm run db:seed && npm run start
```

That creates tables and loads the song catalog, then boots Next.js.

> Free Render Postgres expires after 30 days of inactivity on free plans — upgrade or export data if you need it longer.

## How voting works

With `N` people in the room, a song needs `ceil(N × 0.8)` Love/Okay votes to make the playlist. Copy the winning list and add those tracks in Spotify yourself.

## Local development

```bash
npm install
cp .env.example .env.local
# set DATABASE_URL to any Postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Without `DATABASE_URL`, the app uses in-memory rooms + the built-in catalog seed for search.

## Scripts

- `npm run dev` — local Next.js
- `npm run build` / `npm start` — production (binds `0.0.0.0`)
- `npm run db:migrate` — apply Drizzle migrations
- `npm run db:seed` — upsert song catalog
