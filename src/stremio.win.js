// Windows port of stremio.js.
//
// Linux version reads MPRIS over D-Bus + Stremio's Flatpak sqlite local-storage file.
// Neither exists on Windows, so this reads:
//  - playback state/title from the Windows System Media Transport Controls (SMTC) session,
//    via a small PowerShell/WinRT bridge (src/win/get-media-session.ps1) — the Windows
//    equivalent of MPRIS for apps built on Chromium/QtWebEngine (Stremio's desktop shell).
//  - the library item from Stremio's local-storage sqlite file, searched across the
//    Windows install locations Stremio is known to use. Chromium LocalStorage format can
//    vary by the embedding shell's version, so this is best-effort: if it can't be read,
//    the RPC still works from the SMTC title alone, just without poster/episode data.
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PS_SCRIPT = path.join(__dirname, "win", "get-media-session.ps1");

const STORAGE_ROOTS = [
  path.join(os.homedir(), "AppData", "Roaming", "stremio", "stremio-shell"),
  path.join(os.homedir(), "AppData", "Roaming", "stremio"),
  path.join(os.homedir(), "AppData", "Local", "stremio"),
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

function findStorageDb() {
  for (const root of STORAGE_ROOTS) {
    try {
      for (const a of fs.readdirSync(root)) {
        const dir = path.join(root, a);
        if (!fs.statSync(dir).isDirectory()) continue;
        for (const b of fs.readdirSync(dir)) {
          const db = path.join(dir, b, "LocalStorage", "localstorage.sqlite3");
          if (fs.existsSync(db)) return db;
        }
      }
    } catch {}
  }
  return null;
}

let DatabaseSync = null;
function openDb(file) {
  if (!DatabaseSync) DatabaseSync = require("node:sqlite").DatabaseSync;
  return new DatabaseSync(file, { readOnly: true });
}

// Same as Linux: Stremio's library entry for an id, or the most recently watched one.
function readLibraryItem(id) {
  const file = findStorageDb();
  if (!file) return null;
  let db;
  try {
    db = openDb(file);
    const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'library_recent'").get();
    if (!row) return null;
    const lib = JSON.parse(Buffer.from(row.value).toString("utf16le"));
    const items = Object.values(lib.items || {});
    if (id && lib.items?.[id]) return lib.items[id];
    items.sort((x, y) => String(y.state?.lastWatched).localeCompare(String(x.state?.lastWatched)));
    return items[0] || null;
  } catch (err) {
    console.warn("[stremio] Failed to read library (non-fatal on Windows):", err.message);
    return null;
  } finally {
    try { db?.close(); } catch {}
  }
}

// No MPRIS artUrl on Windows, so there's no id to extract. Library lookup falls back to
// matching by title (see index.js), so this just always returns null here.
function idFromArtUrl() {
  return null;
}

module.exports = { readPlayer, readLibraryItem, idFromArtUrl };
