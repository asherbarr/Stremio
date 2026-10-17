const dbus = require("dbus-next");
const fs = require("fs");
const os = require("os");
const path = require("path");

const MPRIS_NAME = "org.mpris.MediaPlayer2.Stremio";
const MPRIS_PATH = "/org/mpris/MediaPlayer2";
const PLAYER_IFACE = "org.mpris.MediaPlayer2.Player";

const STORAGE_ROOT = path.join(os.homedir(), ".var/app/com.stremio.Stremio/data/stremio/storage");

const bus = dbus.sessionBus();

// Returns { status, title, artUrl } or null when Stremio isn't running.
async function readPlayer() {
  try {
    const obj = await bus.getProxyObject(MPRIS_NAME, MPRIS_PATH);
    const props = obj.getInterface("org.freedesktop.DBus.Properties");
    const all = await props.GetAll(PLAYER_IFACE);
    const meta = all.Metadata?.value || {};
    return {
      status: all.PlaybackStatus?.value || "Stopped",
      title: meta["xesam:title"]?.value || "",
      artUrl: meta["mpris:artUrl"]?.value || "",
    };
  } catch {
    return null;
  }
}

function findStorageDb() {
  // storage/<origin>/<origin>/LocalStorage/localstorage.sqlite3
  try {
    for (const a of fs.readdirSync(STORAGE_ROOT)) {
      for (const b of fs.readdirSync(path.join(STORAGE_ROOT, a))) {
        const db = path.join(STORAGE_ROOT, a, b, "LocalStorage", "localstorage.sqlite3");
        if (fs.existsSync(db)) return db;
      }
    }
  } catch {}
  return null;
}

let DatabaseSync = null;
function openDb(file) {
  if (!DatabaseSync) DatabaseSync = require("node:sqlite").DatabaseSync;
  return new DatabaseSync(file, { readOnly: true });
}

// Stremio's library entry for an id ("tt123" / "kitsu:1"), or the most recently watched one.
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
    console.warn("[stremio] Failed to read library:", err.message);
    return null;
  } finally {
    try { db?.close(); } catch {}
  }
}

// MPRIS art is the metahub logo: https://images.metahub.space/logo/medium/<id>/img
function idFromArtUrl(artUrl) {
  const m = /\/(?:logo|poster|background)\/[^/]+\/([^/]+)\/img/.exec(artUrl || "");
  return m ? decodeURIComponent(m[1]) : null;
}

module.exports = { readPlayer, readLibraryItem, idFromArtUrl };
