# Stremio

Discord RPC (Rich Presence) for the official Stremio Linux app (Flathub `com.stremio.Stremio`).

The official app plays through libmpv, so HEVC and everything else just works. Its built-in
Discord presence is off. This small service shows the same presence Stremio Enhanced used to:

- only while a video is open (cleared in menus)
- `Watching` / `Watching S1 E2`, with a time bar and the poster
- `Paused at HH:MM:SS` while paused

## How it works

- Title and Playing/Paused come from Stremio's MPRIS player (`org.mpris.MediaPlayer2.Stremio`).
- Poster, duration, saved position and episode come from Stremio's library in its local storage
  (`~/.var/app/com.stremio.Stremio/data/stremio/storage/.../localstorage.sqlite3`, read-only).
- Stremio doesn't expose a live position, so the service runs its own clock and re-syncs whenever
  Stremio saves the position (pause, seek, stop).

## Install

```bash
npm install
cp contrib/stremio-rpc.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now stremio-rpc.service
```

Logs: `journalctl --user -u stremio-rpc -f`

Requires Node 22+ (uses the built-in `node:sqlite`).

## Windows

Playback/title comes from the Windows System Media Transport Controls (SMTC) session
instead of MPRIS — only a session whose app id contains "stremio" is used, never whatever
else happens to be playing (Spotify, a browser tab, etc.). The library lookup reads
Stremio's LevelDB local storage (confirmed path: `%LOCALAPPDATA%\Smart Code ltd\Stremio\
QtWebEngine\Default\Local Storage\leveldb`), via a throwaway copy since Stremio holds the
real one open — see `src/stremio.win.js`. The library read is best-effort, so if it can't
find it, the presence still works from the title alone, just without poster/episode info.

Not yet confirmed: whether Stremio's QtWebEngine shell actually registers an SMTC session
while a video is playing (it wasn't tested against a real stream). If Discord never shows
anything while you're watching, that's the first thing to check.

```powershell
npm install
.\contrib\install-windows.ps1
```

This drops a shortcut into your Startup folder (the Windows equivalent of the systemd unit)
that starts the service at logon, hidden, and starts it immediately too.
