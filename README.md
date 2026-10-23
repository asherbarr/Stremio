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

Stremio's QtWebEngine shell doesn't register a Windows System Media Transport Controls
session (confirmed against a real, actively-playing stream — only unrelated apps like
Spotify showed up there), so there's no MPRIS equivalent to read play/pause and title from.
Instead, "is a video open" comes from Stremio's own local streaming server
(`http://127.0.0.1:11470/stats.json`), which lists the active torrent/file while one is
loaded. This has no pause signal (the engine keeps buffering while paused), so unlike
Linux, the Windows RPC can't show "Paused at HH:MM:SS" — it's "Watching" for as long as
something's open, full stop.

The library item (name/poster/episode/saved position) still comes from local storage like
Linux, just LevelDB instead of sqlite (confirmed path: `%LOCALAPPDATA%\Smart Code ltd\
Stremio\QtWebEngine\Default\Local Storage\leveldb`), read via a throwaway copy since
Stremio holds the real file open — see `src/stremio.win.js`. Best-effort: if it can't find
it, the presence still works from the torrent's filename, just without poster/episode info
or a time bar.

```powershell
npm install
.\contrib\install-windows.ps1
```

This drops a shortcut into your Startup folder (the Windows equivalent of the systemd unit)
that starts the service at logon, hidden, and starts it immediately too.
