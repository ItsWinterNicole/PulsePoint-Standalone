const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const APP_PORT = 8765;
const RECORDINGS_DIR = path.join(__dirname, "recordings");
const TZ = "America/New_York";

// OBS connection
const OBS_WS_URL = process.env.OBS_WS_URL || "ws://127.0.0.1:4455";
const OBS_PASSWORD = process.env.OBS_PASSWORD || "";

if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

const appWss = new WebSocket.Server({ port: APP_PORT });

let latestConfig = {
  buildRiseMin: 4,
  buildSlopeMin: 0.24,
  buildPosRatioMin: 0.46,
  buildAccelMin: 0.0,
  buildMinSec: 2,
  buildHoldSec: 4,

  significantHrMin: 110,
  peakDropMin: 4,
  recoverySlopeMax: 0.30,
  recoveryMinSec: 1,
  recoveryHoldSec: 8
};

let currentRecording = null;
let obsRecordActive = false;
let obsOutputPath = null;

/* -------------------- Helpers -------------------- */

function formatFilenameDate(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = Object.fromEntries(
    fmt.formatToParts(d)
      .filter(p => p.type !== "literal")
      .map(p => [p.type, p.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}`;
}

function formatISOWithOffset(date = new Date(), timeZone = TZ) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false
  });

  const parts = Object.fromEntries(
    dtf.formatToParts(date)
      .filter(p => p.type !== "literal")
      .map(p => [p.type, p.value])
  );

  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
    Number(parts.fractionalSecond || 0)
  );

  const offsetMinutes = Math.round((asUTC - date.getTime()) / 60000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond || "000"}${sign}${hh}:${mm}`;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function cleanHr(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 25 || n > 250) return null;
  return Math.round(n);
}

function cleanNumber(value, decimals = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(decimals);
}

function normalizeMarker(phase) {
  if (!phase) return "";
  const p = String(phase).trim().toLowerCase();
  if (p.includes("build")) return "build";
  if (p.includes("recover")) return "recovery";
  if (p.includes("climax")) return "climax";
  if (p.includes("elevated")) return "elevated";
  if (p.includes("start")) return "start";
  return p.replace(/\s+/g, "_");
}

function buildNote(data) {
  const parts = [];

  if (data.phaseTimer) parts.push(`phase_timer=${data.phaseTimer}`);

  const bc = Number(data.buildConfidence);
  if (Number.isFinite(bc)) parts.push(`build_confidence=${Math.round(bc)}`);

  if (obsOutputPath) parts.push(`obs_output_path=${obsOutputPath}`);

  return parts.join("; ");
}

function broadcast(obj, except = null) {
  const msg = JSON.stringify(obj);
  for (const client of appWss.clients) {
    if (client !== except && client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

/* -------------------- CSV lifecycle -------------------- */

function createNewRecording(reason = "manual") {
  const stamp = formatFilenameDate();
  const filename = `hr_timeline_${stamp}.csv`;
  const filepath = path.join(RECORDINGS_DIR, filename);

  const header = [
    "timestamp",
    "time_offset_ms",
    "time_offset_s",
    "hr",
    "hr_smoothed",
    "baseline_hr",
    "elevated_delta",
    "marker",
    "note"
  ].join(",") + "\n";

  fs.writeFileSync(filepath, header, "utf8");

  currentRecording = {
    filename,
    filepath,
    createdAt: new Date(),
    startEpochMs: Date.now(),
    lastEpochMs: null,
    reason
  };

  obsOutputPath = null;

  console.log(`Started recording CSV: ${filename} (${reason})`);

  broadcast({
    type: "recording_info",
    recording: {
      filename: currentRecording.filename,
      filepath: currentRecording.filepath,
      active: obsRecordActive,
      startedAtMs: currentRecording.startEpochMs
    }
  });
}

function finalizeRecording(reason = "stopped") {
  if (!currentRecording) return;

  const metaPath = currentRecording.filepath.replace(/\.csv$/i, ".json");
  const meta = {
    reason,
    csv: currentRecording.filepath,
    createdAt: currentRecording.createdAt.toISOString(),
    endedAt: new Date().toISOString(),
    obsOutputPath
  };

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
  console.log(`Finalized recording: ${currentRecording.filename}`);

  broadcast({
    type: "recording_finalized",
    recording: {
      filename: currentRecording.filename,
      filepath: currentRecording.filepath,
      metaPath,
      obsOutputPath
    }
  });
}

function appendTelemetryRow(data) {
  if (!obsRecordActive) return;

  if (!currentRecording) {
    createNewRecording("obs_auto_start");
  }

  const now = new Date();
  const epochMs = now.getTime();

  if (currentRecording.lastEpochMs !== null && epochMs <= currentRecording.lastEpochMs) {
    return;
  }

  const hr = cleanHr(data.currentHr);
  if (hr === null) return;

  const timeOffsetMs = epochMs - currentRecording.startEpochMs;
  const timeOffsetS = (timeOffsetMs / 1000).toFixed(3);

  const row = [
    csvEscape(formatISOWithOffset(now)),
    csvEscape(timeOffsetMs),
    csvEscape(timeOffsetS),
    csvEscape(hr),
    csvEscape(cleanNumber(data.smoothedHr)),
    csvEscape(cleanNumber(data.baselineHr)),
    csvEscape(cleanNumber(data.elevatedDelta)),
    csvEscape(normalizeMarker(data.phase)),
    csvEscape(buildNote(data))
  ].join(",") + "\n";

  fs.appendFileSync(currentRecording.filepath, row, "utf8");
  currentRecording.lastEpochMs = epochMs;
}

/* -------------------- OBS websocket client -------------------- */

let obsWs = null;
let obsRpcId = 1;
const obsPending = new Map();

function sha256Base64(input) {
  return crypto.createHash("sha256").update(input).digest("base64");
}

function connectOBS() {
  obsWs = new WebSocket(OBS_WS_URL);

  obsWs.on("open", () => {
    console.log(`Connected to OBS websocket at ${OBS_WS_URL}`);
  });

  obsWs.on("close", () => {
    console.log("OBS websocket disconnected, retrying...");
    setTimeout(connectOBS, 1500);
  });

  obsWs.on("error", (err) => {
    console.error("OBS websocket error:", err.message);
  });

  obsWs.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.op === 0) {
      const hello = msg.d || {};
      const identify = {
        rpcVersion: hello.rpcVersion || 1,
        eventSubscriptions: 0xFFFFFFFF
      };

      if (hello.authentication?.challenge && hello.authentication?.salt) {
        const secret = sha256Base64(OBS_PASSWORD + hello.authentication.salt);
        identify.authentication = sha256Base64(secret + hello.authentication.challenge);
      }

      obsWs.send(JSON.stringify({ op: 1, d: identify }));
      return;
    }

    if (msg.op === 2) {
      console.log("OBS websocket identified");
      try {
        const status = await obsRequest("GetRecordStatus");
        if (status?.outputActive) {
          obsRecordActive = true;
          createNewRecording("obs_already_recording");
        }
      } catch (err) {
        console.error("Could not get initial OBS record status:", err.message || err);
      }
      return;
    }

    if (msg.op === 5) {
      const eventType = msg.d?.eventType;
      const eventData = msg.d?.eventData || {};

      if (eventType === "RecordStateChanged") {
        const wasActive = obsRecordActive;
        obsRecordActive = !!eventData.outputActive;

        if (!wasActive && obsRecordActive) {
          console.log("OBS recording started");
          createNewRecording("obs_record_start");

          broadcast({
            type: "obs_record_state",
            active: true,
            startedAtMs: currentRecording ? currentRecording.startEpochMs : Date.now(),
            eventData
          });
        } else if (wasActive && !obsRecordActive) {
          obsOutputPath = eventData.outputPath || null;
          console.log("OBS recording stopped");
          finalizeRecording("obs_record_stop");

          broadcast({
            type: "obs_record_state",
            active: false,
            stoppedAtMs: Date.now(),
            outputPath: obsOutputPath,
            eventData
          });
        }
      }

      return;
    }

    if (msg.op === 7) {
      const requestId = msg.d?.requestId;
      const pending = obsPending.get(requestId);
      if (!pending) return;

      obsPending.delete(requestId);

      if (msg.d?.requestStatus?.result) {
        pending.resolve(msg.d.responseData || {});
      } else {
        pending.reject(new Error(msg.d?.requestStatus?.comment || "OBS request failed"));
      }
    }
  });
}

function obsRequest(requestType, requestData = {}) {
  return new Promise((resolve, reject) => {
    if (!obsWs || obsWs.readyState !== WebSocket.OPEN) {
      reject(new Error("OBS websocket not connected"));
      return;
    }

    const requestId = String(obsRpcId++);
    obsPending.set(requestId, { resolve, reject });

    obsWs.send(JSON.stringify({
      op: 6,
      d: { requestType, requestId, requestData }
    }));
  });
}

async function startOBSRecording() {
  await obsRequest("StartRecord");
}

async function stopOBSRecording() {
  const res = await obsRequest("StopRecord");
  return res?.outputPath || null;
}

/* -------------------- App websocket server -------------------- */

appWss.on("connection", (ws) => {
  console.log("App client connected");

  ws.send(JSON.stringify({ type: "config", config: latestConfig }));
  ws.send(JSON.stringify({
    type: "recording_info",
    recording: currentRecording
      ? {
          filename: currentRecording.filename,
          filepath: currentRecording.filepath,
          active: obsRecordActive,
          startedAtMs: currentRecording.startEpochMs
        }
      : null
  }));

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (err) {
      console.error("Bad JSON from app client:", err.message);
      return;
    }

    if (msg.type === "config" && msg.config) {
      latestConfig = { ...latestConfig, ...msg.config };
      broadcast({ type: "config", config: latestConfig }, ws);
      return;
    }

    if (msg.type === "telemetry" && msg.data) {
      appendTelemetryRow(msg.data);
      broadcast({ type: "telemetry", data: msg.data }, ws);
      return;
    }

    if (msg.type === "reset") {
      createNewRecording("manual_reset");
      broadcast({ type: "reset" }, ws);
      return;
    }

    if (msg.type === "obs_start_record") {
      try {
        await startOBSRecording();
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", message: err.message }));
      }
      return;
    }

    if (msg.type === "obs_stop_record") {
      try {
        const outputPath = await stopOBSRecording();
        ws.send(JSON.stringify({ type: "obs_stop_result", outputPath }));
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", message: err.message }));
      }
    }
  });

  ws.on("close", () => {
    console.log("App client disconnected");
  });
});

console.log(`App websocket relay running on ws://localhost:${APP_PORT}`);
console.log(`OBS sync target: ${OBS_WS_URL}`);

connectOBS();