// Windows port of stremio.js.
//
// Linux version reads MPRIS over D-Bus + Stremio's Flatpak sqlite local-storage file.
// Neither exists on Windows, so this reads:
//  - playback state/title from the Windows System Media Transport Controls (SMTC) session,
//    via a small PowerShell/WinRT bridge (src/win/get-media-session.ps1) — the Windows
//    equivalent of MPRIS for apps built on Chromium/QtWebEngine (Stremio's desktop shell).
//  - the library item from Stremio's local storage. Unlike the Linux Flatpak build (old
//    WebKit sqlite format), the Windows build's QtWebEngine shell uses modern Chromium
//    LevelDB local storage (confirmed at
//    "%LOCALAPPDATA%\Smart Code ltd\Stremio\QtWebEngine\Default\Local Storage\leveldb").
//    Entry keys are "_" + an 8-byte per-origin map id + the JS key as UTF-16LE, so rather
//    than reconstruct the origin id we just scan all keys for one ending in the
//    "library_recent" marker. Best-effort: if the schema shifts again, the RPC still works
//    from the SMTC title alone, just without poster/episode data.
const { execFile } = require("child_process");
const { ClassicLevel } = require("classic-level");
const fs = require("fs");
const os = require("os");
const path = require("path");

// LevelDB takes an exclusive lock on open, which fails while Stremio itself has the
// database open (i.e. whenever it's running at all). Read a throwaway copy instead,
// same trick browser-history readers use to read Chrome's SQLite while Chrome is open.
const SNAPSHOT_DIR = path.join(os.tmpdir(), "stremio-rpc-leveldb-snapshot");

function snapshotDb(dbPath) {
  fs.rmSync(SNAPSHOT_DIR, { recursive: true, force: true });
  fs.cpSync(dbPath, SNAPSHOT_DIR, { recursive: true, force: true });
  return SNAPSHOT_DIR;
}

const PS_SCRIPT = path.join(__dirname, "win", "get-media-session.ps1");

const STORAGE_ROOTS = [
  path.join(os.homedir(), "AppData", "Local", "Smart Code ltd", "Stremio", "QtWebEngine", "Default", "Local Storage", "leveldb"),
  path.join(os.homedir(), "AppData", "Roaming", "stremio", "stremio-shell"),
];

function runPowerShell() {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PS_SCRIPT],
      { timeout: 5000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          resolve(null);
        }
      }
    );
  });
}

// Returns { status, title, artUrl } or null when nothing is playing, matching the Linux shape.
async function readPlayer() {
  const info = await runPowerShell();
  if (!info || info.status === "Stopped" || !info.title) return null;
  return { status: info.status, title: info.title, artUrl: "" };
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
