export const HR_SOURCE_OPTIONS = [
  {
    value: "heartrateonstream",
    label: "HeartRateOnStream",
    helper: "Existing OBS relay workflow",
  },
  {
    value: "pulsoid",
    label: "Pulsoid / Polar H10",
    helper: "Polar H10 through Pulsoid",
  },
];

export const PULSOID_MODE_OPTIONS = [
  { value: "websocket", label: "WebSocket" },
  { value: "http", label: "HTTP latest" },
];

export function maskPulsoidToken(token = "") {
  const value = String(token || "").trim();
  if (!value) return "";
  if (value.length <= 10) return `${value.slice(0, 2)}...${value.slice(-2)}`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function readHrSourceSettings() {
  return {
    source: localStorage.getItem("pulsepoint.hrSource") || "heartrateonstream",
    pulsoidToken: localStorage.getItem("pulsepoint.pulsoid.accessToken") || "",
    pulsoidMode: localStorage.getItem("pulsepoint.pulsoid.mode") || "websocket",
  };
}

export function writeHrSourceSettings(settings) {
  if (settings.source) localStorage.setItem("pulsepoint.hrSource", settings.source);
  if (settings.pulsoidToken != null) localStorage.setItem("pulsepoint.pulsoid.accessToken", settings.pulsoidToken);
  if (settings.pulsoidMode) localStorage.setItem("pulsepoint.pulsoid.mode", settings.pulsoidMode);
}
