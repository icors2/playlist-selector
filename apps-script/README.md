# Okaylist Apps Script backend

This replaces Google Cloud service accounts. Your spreadsheet + one deployed script is the whole backend.

## Setup (about 5 minutes)

1. Create a blank [Google Spreadsheet](https://sheets.google.com/)
2. **Extensions → Apps Script**
3. Delete any stub code and paste [`Code.gs`](./Code.gs)
4. **Project Settings** (gear) → **Script properties** → **Add script property**
   - Property: `APPS_SCRIPT_SECRET`
   - Value: a long random string (same value you’ll put in Netlify)
5. **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Authorize when prompted, then copy the **Web app URL**
7. Set on Netlify / `.env.local`:
   - `GOOGLE_APPS_SCRIPT_URL` = that Web app URL
   - `GOOGLE_APPS_SCRIPT_SECRET` = the same secret from step 4

On first request, the script creates tabs: `Rooms`, `Participants`, `Songs`, `Votes`.

## Updating the script

After editing `Code.gs` in the Apps Script editor, deploy again with **Deploy → Manage deployments → Edit → New version**.
