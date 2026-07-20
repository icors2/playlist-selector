# Okaylist

Collaborative Spotify playlist builder. A group nominates songs, everyone votes **Love / Okay / Pass**, and anything with zero vetoes becomes the shared playlist.

**Backend:** free **Netlify Database** (Postgres). No Google Sheet, no Apps Script, no Cloud console — deploy the site and data persists.

## How it works

1. **Create a room** and share the 6-character code
2. Friends join with the code
3. Host opens **nominations** — search Spotify and add songs
4. Host opens **voting** — Love it, Okay with it, or Pass (veto)
5. Host reveals results — songs with no passes are sorted by enthusiasm
6. Host can **export to Spotify** (optional)

## Deploy on Netlify (phone-friendly)

1. Push this repo to GitHub (already done if you’re on this branch)
2. On your phone, open [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**
3. Pick the GitHub repo → Deploy
4. Set one env var if you want Spotify playlist export later:
   - `NEXT_PUBLIC_APP_URL` = your `https://….netlify.app` URL

That’s it. Installing `@netlify/database` makes Netlify create a free Postgres database on deploy. Migrations in `netlify/database/migrations/` are applied automatically.

## Local development

```bash
npm install
cp .env.example .env.local
# optional: DATABASE_URL=postgres://... for persistent local data
npm run dev
```

Without `DATABASE_URL`, the app uses in-memory storage (fine for solo UI testing; data resets on restart).

## Optional Spotify

| Variable | Purpose |
|---|---|
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Live search + playlist export |
| `NEXT_PUBLIC_APP_URL` | OAuth redirect base URL |

Redirect URI in the Spotify dashboard:

```
https://your-site.netlify.app/api/spotify/export
```

Without Spotify keys, a built-in demo song catalog is used so voting still works.

## Scripts

- `npm run dev` — local development
- `npm run build` — production build
- `npm run db:generate` — create a new Drizzle migration after schema edits
