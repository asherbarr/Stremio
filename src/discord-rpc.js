const { Client } = require("@xhayper/discord-rpc");

// Same Discord application and look as Stremio Enhanced's built-in presence.
const CLIENT_ID = "1200186750727893164";
const DEFAULT_IMAGE = "1024stremio";
const LARGE_IMAGE_TEXT = "Stremio Enhanced";
const RECONNECT_INTERVAL = 10000;
const ACTIVITY_TYPE_WATCHING = 3;

let client = null;
let ready = false;
let reconnectTimer = null;
let lastActivityKey = null;

function connect() {
  clearTimeout(reconnectTimer);
  client = new Client({ clientId: CLIENT_ID });

  client.on("ready", () => {
    ready = true;
    lastActivityKey = null;
    console.log("[discord-rpc] Connected to Discord");
  });

  client.on("disconnected", () => {
    ready = false;
    console.warn("[discord-rpc] Disconnected, reconnecting...");
    scheduleReconnect();
  });

  client.login().catch(() => {
    ready = false;
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    try { client?.destroy(); } catch {}
    connect();
  }, RECONNECT_INTERVAL);
}

function setActivity(activity) {
  if (!ready || !client?.user) return;
  const key = JSON.stringify(activity);
  if (key === lastActivityKey) return;
  lastActivityKey = key;
  console.log(`[discord-rpc] ${activity.details} | ${activity.state}`);
  client.user.setActivity(activity).catch((err) => {
    lastActivityKey = null;
    console.error("[discord-rpc] Failed to set activity:", err.message);
  });
}

function setPlaying(details, state, startTimestamp, endTimestamp, imageKey) {
  setActivity({
    details,
    state,
    startTimestamp,
    endTimestamp,
    largeImageKey: imageKey || DEFAULT_IMAGE,
    largeImageText: LARGE_IMAGE_TEXT,
    instance: false,
    type: ACTIVITY_TYPE_WATCHING,
  });
}

function setPaused(details, state, imageKey) {
  setActivity({
    details,
    state,
    largeImageKey: imageKey || DEFAULT_IMAGE,
    largeImageText: LARGE_IMAGE_TEXT,
    instance: false,
    type: ACTIVITY_TYPE_WATCHING,
  });
}

function clearActivity() {
  if (lastActivityKey === "clear") return;
  lastActivityKey = "clear";
  if (!ready || !client?.user) return;
  client.user.clearActivity().catch(() => {});
}

function destroy() {
  clearTimeout(reconnectTimer);
  try { client?.user?.clearActivity(); } catch {}
  try { client?.destroy(); } catch {}
}

module.exports = { connect, setPlaying, setPaused, clearActivity, destroy };
