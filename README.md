# stremio-rpc

Discord Rich Presence for the official Stremio Linux app (Flathub `com.stremio.Stremio`).

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
