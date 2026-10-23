// Discord Rich Presence for the official Stremio app, matching Stremio Enhanced's presence:
// shown only while a video is open, "Watching" / "Watching S1 E2" with a time bar while
// playing, "Paused at HH:MM:SS" while paused, cleared everywhere else.
const discord = require("./discord-rpc");
const { readPlayer, readLibraryItem, idFromArtUrl } =
  process.platform === "win32" ? require("./stremio.win") : require("./stremio");

const POLL_INTERVAL = 1000;

let session = null; // what's open in the player right now
let polling = false;

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

// "tt123:1:2" -> { season: 1, episode: 2 }, "kitsu:42:5" -> { episode: 5 }
function parseEpisode(item) {
  if (!item || item.type !== "series") return null;
  const parts = String(item.state?.video_id || "").split(":");
  if (item._id.startsWith("kitsu:")) return parts.length >= 3 ? { episode: parts[2] } : null;
  return parts.length >= 3 ? { season: parts[1], episode: parts[2] } : null;
}

function episodeLabel(ep) {
  return ep.season !== undefined ? `S${ep.season} E${ep.episode}` : `E${ep.episode}`;
}

// Playback position in seconds, extrapolated from the last known anchor.
function currentPosition(s, now) {
  return s.playing ? s.pos + (now - s.at) / 1000 : s.pos;
}

// Stremio saves timeOffset to its storage on pause/seek/stop; use it to correct our clock.
function syncFromStorage(s, item, now) {
  const mtime = item?._mtime;
  if (!mtime || mtime === s.mtime) return;
  s.mtime = mtime;
  const offset = (item.state?.timeOffset || 0) / 1000;
  const savedAt = Date.parse(mtime) || now;
  s.pos = s.playing ? offset + Math.max(0, now - savedAt) / 1000 : offset;
  s.at = now;
  s.anchorStart = null;
  if (item.state?.duration) s.duration = item.state.duration / 1000;
}

async function tick() {
  if (polling) return;
  polling = true;
  try {
    const now = Date.now();
    const player = await readPlayer();

    if (!player || player.status === "Stopped" || !player.title) {
      session = null;
      discord.clearActivity();
      return;
    }

    const id = idFromArtUrl(player.artUrl);
    let item = readLibraryItem(id);
    if (item && !(id ? item._id === id : item.name === player.title)) item = null;

    const key = `${id || player.title}|${item?.state?.video_id || ""}`;
    const playing = player.status === "Playing";

    if (!session || session.key !== key) {
      session = {
        key,
        playing,
        pos: (item?.state?.timeOffset || 0) / 1000,
        at: now,
        mtime: item?._mtime,
        duration: (item?.state?.duration || 0) / 1000,
        anchorStart: null,
      };
    } else if (session.playing !== playing) {
      session.pos = currentPosition(session, now);
      session.at = now;
      session.playing = playing;
      session.anchorStart = null;
    }
    syncFromStorage(session, item, now);

    const name = item?.name || player.title;
    const poster = item?.poster;
    const ep = parseEpisode(item);
    const pos = currentPosition(session, now);

    if (playing) {
      if (session.anchorStart === null) session.anchorStart = Math.floor(now / 1000 - pos);
      const start = session.anchorStart;
      const end = session.duration ? start + Math.floor(session.duration) : undefined;
      discord.setPlaying(name, ep ? `Watching ${episodeLabel(ep)}` : "Watching", start, end, poster);
    } else {
      const at = formatTime(pos);
      discord.setPaused(name, ep ? `Paused at ${at} in ${episodeLabel(ep)}` : `Paused at ${at}`, poster);
    }
  } catch (err) {
    console.error("[stremio-rpc]", err);
  } finally {
    polling = false;
  }
}

function shutdown() {
  discord.destroy();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

discord.connect();
setInterval(tick, POLL_INTERVAL);
tick();
