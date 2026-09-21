# Stand Inventory

Shared inventory counter: multiple people enter starting counts, log restocks, and enter final counts; the app totals everything and shows what sold.

## Run locally
    npm install
    npm start
Open http://localhost:3000

## Deploy on Render
1. Put this folder in a GitHub repo.
2. In Render: New → Web Service → connect the repo. Render reads `render.yaml`
   (build `npm install`, start `npm start`). Or set those by hand.
3. Optional: set env var `ADMIN_PIN` so only you can use "Clear everything".
4. Open the URL Render gives you and share it with your counters.

### Keeping data through restarts
Counts are saved to `data/inventory.json`. On Render's free tier the filesystem is
wiped whenever the service restarts or redeploys (and free services sleep after
15 min idle, then restart on the next visit), so counts can be lost mid-event.
To keep them: use a paid instance, add a Persistent Disk mounted at `/data`,
and set env var `DATA_DIR=/data`. Or just download the CSV periodically.
