# Okaylist (manual playlist)

Collaborative playlist voting **without Spotify Premium or a Spotify API**.

1. Create a room and share the code  
2. Everyone **types song titles + artists** to nominate  
3. Vote **Love / Okay / Pass**  
4. Songs with **80% of the group** approving (Love or Okay) make the list  
5. **Copy the winning list** and add those tracks to Spotify yourself  

## Voting rule

With `N` people in the room, a song needs `ceil(N × 0.8)` Love/Okay votes.

| Group size | Approvals needed |
|---|---|
| 3 | 3 |
| 4 | 4 |
| 5 | 4 |
| 10 | 8 |

## Deploy on Netlify

1. Import this branch/repo on [app.netlify.com](https://app.netlify.com)  
2. Deploy — `@netlify/database` provisions free Postgres automatically  

No Spotify env vars required for the manual flow.

Optional (if you later add Spotify keys): live search still works as an extra nominate option.

## Local development

```bash
npm install
cp .env.example .env.local
# optional: DATABASE_URL=postgres://...
npm run dev
```
