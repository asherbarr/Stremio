// Windows port of stremio.js.
//
// Linux version reads MPRIS over D-Bus + Stremio's Flatpak sqlite local-storage file.
// Neither exists on Windows. Tried the Windows System Media Transport Controls (SMTC)
// session first (the usual equivalent of MPRIS for Chromium/QtWebEngine apps) — confirmed
// against a real, actively-playing stream that Stremio's QtWebEngine shell never registers
// one (only unrelated apps like Spotify showed up), so that approach is dead.
//
// What actually works, confirmed against a real stream: Stremio's local streaming server
// (http://127.0.0.1:11470/stats.json) exposes the active torrent/file while something is
// loaded, which is the "is a video open" signal MPRIS's PlaybackStatus gave us on Linux.
// It has no play/pause distinction (the engine keeps buffering while paused), so this
// reports "Playing" for as long as something's loaded and can't show "Paused at HH:MM:SS"
// the way the Linux version does.
//
// The library item (name/poster/episode/position) still comes from Stremio's local
// storage, same as Linux — just LevelDB instead of sqlite (the Windows build's QtWebEngine
// shell uses modern Chromium local storage, confirmed at "%LOCALAPPDATA%\Smart Code ltd\
// Stremio\QtWebEngine\Default\Local Storage\leveldb"). Entry keys are "_" + an 8-byte
// per-origin map id + the JS key as UTF-16LE, so rather than reconstruct the origin id we
// just scan all keys for one ending in the "library_recent" marker.
const { ClassicLevel } = require("classic-level");
const fs = require("fs");
const os = require("os");
const path = require("path");

const STATS_URL = "http://127.0.0.1:11470/stats.json";

// Scene-release filename -> rough display title, used only when the library lookup
// below doesn't have a matching item yet (e.g. first few seconds of a brand new stream).
function titleFromFilename(filename) {
  let name = filename.replace(/\.\w{2,4}$/, "").replace(/[._]/g, " ");
  const cut = name.match(/^(.*?)(?:\s+(?:19|20)\d{2}\b|\s+(?:1080p|720p|2160p|4K|WEBRip|BluRay|HDRip)\b)/i);
  if (cut) name = cut[1];
  return name.trim();
}

// LevelDB takes an exclusive lock on open, which fails while Stremio itself has the
// database open (i.e. whenever it's running at all). Read a throwaway copy instead,
// same trick browser-history readers use to read Chrome's SQLite while Chrome is open.
const SNAPSHOT_DIR = path.join(os.tmpdir(), "stremio-rpc-leveldb-snapshot");

function snapshotDb(dbPath) {
  fs.rmSync(SNAPSHOT_DIR, { recursive: true, force: true });
  fs.cpSync(dbPath, SNAPSHOT_DIR, { recursive: true, force: true });
  return SNAPSHOT_DIR;
}

const STORAGE_ROOTS = [
  path.join(os.homedir(), "AppData", "Local", "Smart Code ltd", "Stremio", "QtWebEngine", "Default", "Local Storage", "leveldb"),
];

// Returns { status, title, artUrl } or null when nothing is loaded, matching the Linux shape.
// Always reports "Playing" (see file header: the streaming-server API has no pause signal).
async function readPlayer() {
  let stats;
  try {
    const res = await fetch(STATS_URL, { signal: AbortSignal.timeout(3000) });
    stats = await res.json();
  } catch {
    return null; // Stremio not running, or its server isn't up yet.
  }

  const torrents = Object.values(stats || {});
  if (torrents.length === 0) return null;

  // The library item (set by index.js's own readLibraryItem call, matched by name) gives
  // a clean title; fall back to the raw torrent filename if the library hasn't caught up.
  const item = await readLibraryItem(null);
  const file = torrents[0].files?.[0];
  const title = item?.name || (file ? titleFromFilename(file.name) : torrents[0].name);
  if (!title) return null;

  return { status: "Playing", title, artUrl: "" };
}

const LIBRARY_KEY_NEEDLE = Buffer.from("library_recent", "utf16le");

// Chromium LocalStorage values are tag-prefixed: try the tags we might see
// (0 = UTF-16LE, 1 = Latin1/ASCII) and fall back to UTF-8 for good measure.
function decodeValue(buf) {
  const body = buf.subarray(1);
  const tag = buf[0];
  const encodings = tag === 1 ? ["latin1", "utf16le", "utf8"] : ["utf16le", "latin1", "utf8"];
  for (const enc of encodings) {
    try {
      return JSON.parse(body.toString(enc));
    } catch {}
  }
  return null;
}

// Same shape as Linux: Stremio's library entry for an id, or the most recently watched one.
async function readLibraryItem(id) {
  for (const dbPath of STORAGE_ROOTS) {
    let db;
    try {
      if (!fs.existsSync(dbPath)) continue;
      const snapshotPath = snapshotDb(dbPath);
      db = new ClassicLevel(snapshotPath, { keyEncoding: "buffer", valueEncoding: "buffer", createIfMissing: false });
      await db.open();
      let lib = null;
      for await (const [key, value] of db.iterator()) {
        if (key.includes(LIBRARY_KEY_NEEDLE)) {
          lib = decodeValue(value);
          break;
        }
      }
      if (!lib) continue;
      const items = Object.values(lib.items || {});
      if (id && lib.items?.[id]) return lib.items[id];
      items.sort((x, y) => String(y.state?.lastWatched).localeCompare(String(x.state?.lastWatched)));
      return items[0] || null;
    } catch (err) {
      console.warn("[stremio] Failed to read library from", dbPath, "(non-fatal):", err.message);
    } finally {
      try { await db?.close(); } catch {}
    }
  }
  return null;
}

// No MPRIS artUrl on Windows, so there's no id to extract. Library lookup falls back to
// matching by title (see index.js), so this just always returns null here.
function idFromArtUrl() {
  return null;
}

module.exports = { readPlayer, readLibraryItem, idFromArtUrl };
