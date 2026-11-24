JPL LIVE V4 CLOUD — REMOTE CONTROL
==================================
This version is designed so your Android phone and OBS PC can connect to the same hosted cloud server from different internet connections.

IMPORTANT FREE-HOSTING LIMIT
This starter uses Render's free web service. Render free services sleep after 15 minutes without inbound traffic and can take about a minute to wake. In-memory match data is lost if the service restarts/sleeps/redeploys. It is for testing, NOT a dependable live-tournament production service. See Render's current free-tier rules: https://render.com/docs/free

DEPLOY (one-time; you must do these account steps)
1. Create/sign in to a GitHub account.
2. Create a new repository named jpl-live-cloud.
3. Upload ALL files from this ZIP (server.js, package.json, render.yaml, public folder).
4. Sign in to Render and choose New > Blueprint.
5. Connect the GitHub repository and deploy the detected render.yaml blueprint.
6. Render gives you a public address like https://jpl-live-cloud.onrender.com

USE
Phone controller: https://YOUR-APP.onrender.com/?room=JPL8LIVE
OBS Browser Source: https://YOUR-APP.onrender.com/overlay.html?room=JPL8LIVE
OBS size: 1920 x 1080
Both URLs must use exactly the same room code. Change JPL8LIVE to a private code you choose; do not share it publicly.

NO PC SERVER REQUIRED
For V4 cloud mode, OBS connects directly to the hosted overlay URL. Your phone connects to the hosted controller URL. Both need internet, not the same Wi-Fi.

CURRENT LIMITATIONS
- Match state is held in server memory and can disappear on sleep/restart/redeploy.
- Free Render service sleeps after 15 minutes without inbound traffic and may cold-start.
- No login/user accounts, persistent database, backup, logo upload, full tournament/fixtures/points-table module yet.
- Scoring is a prototype: complex extras, run-outs, innings transitions, bowler rotation/over rules and official score validation are incomplete.
- Do not rely on this for official scoring until these are implemented and tested.
