# KKuTu local edition

1. Double-click `start-local.bat`.
2. The browser opens directly in the game lobby and logs in as the local ADMIN account.
3. Create a room, select Korean KKuTu (`KKT`), add robots if desired, and start.
4. Double-click `stop-local.bat` when finished.

## Local developer cheats

When logged in as the local `ADMIN`, press the backquote/tilde key (`` ` `` / `~`, below Esc) or click the dark `</>` button at the bottom-right. The local-only panel can enable automatic words, grant Ping/XP, add game score, skip the current turn, add an AI robot, and ready/start the room. Automatic words select a dictionary candidate on each ADMIN turn; if none exists, a local `[DEV]` test word is force-accepted. The server rejects these commands unless `LOCAL_DEVTOOLS` is enabled and the connected account is an administrator.

The first launch initializes the bundled PostgreSQL database and may take a minute. No Docker, PostgreSQL installation, OAuth keys, or internet connection is required after the included dependencies are present.

Logs are stored under `runtime/logs`. This local configuration binds the web and database services to this computer only.
