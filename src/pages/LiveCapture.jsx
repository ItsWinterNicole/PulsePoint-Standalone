import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Brain, CircleDot, ExternalLink, FileText, Flag, HeartPulse, Maximize2, Mic, MicOff, Radio, RefreshCw, SlidersHorizontal, Undo2, UploadCloud, Video, X, Zap } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PageHeader from "@/components/PageHeader";
import { base44 } from "@/api/base44Client";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const MAX_TELEMETRY_POINTS = 240;
const MAX_VOICE_NOTE_MS = 12000;
const VOICE_NOTE_MIN_MS = 900;
const VOICE_NOTE_SILENCE_MS = 1300;
const VOICE_NOTE_SILENCE_RMS = 0.018;
const WHISPER_PROMPT =
  "PulsePoint live session annotation. Timestamped observation during physiological recording. " +
  "Heart rate, arousal, stimulation, physical finding, legs tense, feet planted, toe curl, tremor, breathing, " +
  "stroke speed, grip pressure, repositioning, comfort adjustment, nearing climax, ejaculation, climax, recovery.";
const CAPTURE_MODES = [
  { value: "full", label: "Full telemetry", helper: "HR, EMG, OBS, and voice notes" },
  { value: "media", label: "Media", helper: "Video-first live review" },
  { value: "hr_emg", label: "HR + EMG", helper: "Telemetry-focused capture" },
  { value: "hr", label: "HR only", helper: "Hide EMG until needed" },
  { value: "video", label: "Video sync", helper: "OBS-first review workflow" },
];

function playToneSequence(audioContext, frequencies) {
  if (!audioContext || audioContext.state === "closed") return;
  const startedAt = audioContext.currentTime + 0.02;
  frequencies.forEach((frequency, index) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const t = startedAt + index * 0.13;
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  });
}

function fmtTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  } catch {
    return "—";
  }
}

function fmtMmSs(value) {
  const total = Math.max(0, Math.round(Number(value) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtNumber(value, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function isRecent(value, maxAgeMs = 5000) {
  if (!value) return false;
  const t = new Date(value).getTime();
  return Number.isFinite(t) && Date.now() - t <= maxAgeMs;
}

function readNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return [value];
}

function levelColor(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const hue = Math.round(142 - (142 * p) / 100);
  return `hsl(${hue} 74% 45%)`;
}

function phaseMarkerColor(label = "") {
  const normalized = String(label).toLowerCase();
  if (normalized.includes("recovery")) return "hsl(var(--chart-2))";
  if (normalized.includes("climax")) return "hsl(var(--destructive))";
  if (normalized.includes("build")) return "hsl(var(--primary))";
  return "hsl(var(--chart-4))";
}

function hrLevelPercent(value, baseline) {
  const hr = Number(value);
  if (!Number.isFinite(hr)) return null;
  const base = Number(baseline);
  if (Number.isFinite(base)) return Math.max(0, Math.min(100, ((hr - base) / 45) * 100));
  return Math.max(0, Math.min(100, ((hr - 70) / 70) * 100));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function normalizeVoiceAnnotationText(value) {
  let text = String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  text = text.replace(/^(pulse\s*point|pulsepoint)[,:\-\s]+/i, "").trim();
  text = text.replace(/\b(?:stop|end|done|save|stop recording|end recording)\b[\s.!?]*$/i, "").trim();
  text = text.replace(/\s+([,.!?;:])/g, "$1").trim();
  return text;
}

function categorizeVoiceNote(note) {
  const text = String(note || "").toLowerCase();
  const categories = new Set();
  if (/\b(stroke|stroking|grip|squeeze|speed|pressure|manual|sleeve|vibrat|estim|e-stim|foley|catheter|perine|glans|shaft|stimulation)\b/.test(text)) {
    categories.add("stimulation");
  }
  if (/\b(start|started|begin|began|first contact)\b/.test(text)) categories.add("stimulation_started");
  if (/\b(pause|paused|break|stop touching|stopped touching)\b/.test(text)) categories.add("stimulation_paused");
  if (/\b(resume|resumed|restart|restarted)\b/.test(text)) categories.add("stimulation_resumed");
  if (/\b(stopped|stop stimulation|ended stimulation|stimulation stopped)\b/.test(text)) categories.add("stimulation_stopped");
  if (/\b(leg|legs|feet|foot|toe|curl|plant|planted|tense|tensing|relax|shudder|tremor|spasm|pelvic|breath|erection|foreskin|scrot|body)\b/.test(text)) {
    categories.add("physical");
  }
  if (/\b(feel|felt|sensation|pleasure|pressure|tingle|urge|near|climax|release|recovery|sensitive|discomfort|pain)\b/.test(text)) {
    categories.add("sensation");
  }
  return categories.size ? [...categories] : ["other"];
}

function tagVoiceNote(note) {
  const text = String(note || "").toLowerCase();
  const tags = new Set();
  if (/\b(leg|legs|feet|foot|toe|curl|plant|planted|tense|tensing|shudder|tremor|spasm|breath|erection|foreskin|scrot|body)\b/.test(text)) tags.add("physical_finding");
  if (/\b(hr|heart rate|bpm|sympathetic|parasympathetic|arousal|climax|ejaculat|release|recovery|autonomic)\b/.test(text)) tags.add("physiological_observation");
  if (/\b(stroke|stroking|grip|squeeze|speed|pressure|manual|sleeve|vibrat|estim|e-stim|foley|catheter|perine|glans|shaft|stimulation)\b/.test(text)) tags.add("stimulation_action");
  if (/\b(increase|increasing|decrease|decreasing|faster|slower|firmer|lighter|pause|resume|stop|start|switch|adjust)\b/.test(text)) tags.add("stimulation_change");
  if (/\b(feel|felt|sensation|pleasure|pressure|tingle|urge|near|sensitive|discomfort|pain)\b/.test(text)) tags.add("sensation_report");
  if (/\b(position|reposition|moved|shifted|table|comfort|pillow|supine|lithotomy)\b/.test(text)) tags.add("position_or_comfort");
  return tags.size ? [...tags] : ["other_context"];
}

function isEndListeningCommand(text) {
  const words = String(text || "").toLowerCase().replace(/[^a-z]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const phrase = words.join(" ");
  if (!phrase) return false;
  if (phrase === "end" || phrase === "stop") return true;
  if (phrase.includes("end listening") || phrase.includes("stop listening")) return true;
  if (phrase.includes("pulse point end") || phrase.includes("pulsepoint end")) return true;
  return words.includes("end") && words.length <= 3;
}

function parseLiveCommand(text) {
  const phrase = String(text || "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (!phrase) return null;
  if (/\b(undo last|delete last|remove last)\b/.test(phrase)) return { type: "undo_last" };
  if (/\b(mark pre climax|mark preclimax|pre climax)\b/.test(phrase)) return { type: "mark_phase", key: "pre_climax_offset_s", label: "Pre-climax" };
  if (/\b(mark climax|climax now)\b/.test(phrase)) return { type: "mark_phase", key: "climax_offset_s", label: "Climax" };
  if (/\b(mark recovery|recovery now)\b/.test(phrase)) return { type: "mark_phase", key: "recovery_offset_s", label: "Recovery" };
  if (/\b(pause annotation|pause annotations)\b/.test(phrase)) return { type: "stop_listening" };
  return null;
}

function makeTelemetryPoint(hrTelemetry, emgTelemetry) {
  const now = Date.now();
  return {
    ts: now,
    time: new Date(now).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
    hr: readNumber(hrTelemetry?.currentHr, hrTelemetry?.hr, hrTelemetry?.heartRate),
    hrSmoothed: readNumber(hrTelemetry?.hrSmoothed, hrTelemetry?.smoothedHr, hrTelemetry?.hr_smoothed),
    baseline: readNumber(hrTelemetry?.baselineHr, hrTelemetry?.baseline_hr),
    build: readNumber(hrTelemetry?.buildConfidence, hrTelemetry?.build_confidence),
    left: readNumber(emgTelemetry?.left_pct, emgTelemetry?.level_pct),
    right: readNumber(emgTelemetry?.right_pct),
    diff: readNumber(emgTelemetry?.diff_pct),
  };
}

function StatusDot({ active }) {
  return (
    <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-primary shadow-[0_0_12px_hsl(var(--primary))]" : "bg-muted-foreground/40"}`} />
  );
}

function MetricCard({ icon, label, value, helper, active, level }) {
  const hasLevel = Number.isFinite(Number(level));
  const color = hasLevel ? levelColor(level) : null;
  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-4 ${active ? "border-primary/40 bg-primary/8" : "border-border bg-card"}`}
      style={hasLevel ? { borderColor: `${color}80`, background: `linear-gradient(135deg, ${color}24, hsl(var(--card)) 58%)` } : undefined}
    >
      {hasLevel && (
        <div
          className="absolute inset-x-0 bottom-0 h-1 transition-all"
          style={{ width: `${Math.max(4, Math.min(100, Number(level)))}%`, background: color }}
        />
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          {label}
        </div>
        <StatusDot active={active || hasLevel} />
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">{value}</p>
      {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}

function CompactStat({ label, value, helper, tone = "primary" }) {
  const toneClass = tone === "danger" ? "text-destructive" : tone === "muted" ? "text-muted-foreground" : "text-primary";
  return (
    <div className="rounded-lg border border-border bg-muted/25 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${toneClass}`}>{value}</p>
      {helper && <p className="mt-0.5 text-[10px] text-muted-foreground">{helper}</p>}
    </div>
  );
}

function FileCard({ title, file }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">{file?.name || "No file detected"}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{file?.modifiedAt ? `Updated ${fmtTime(file.modifiedAt)}` : "Waiting for finalized capture"}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4">
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="font-mono text-foreground">{fmtNumber(entry.value, 0)}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyChartState() {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
      Waiting for live samples
    </div>
  );
}

function TrendPanel({ title, subtitle, children, empty, heightClass = "h-56" }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{title}</p>
          {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className={heightClass}>
        {empty ? <EmptyChartState /> : children}
      </div>
    </div>
  );
}

function computePrediction(hrTelemetry, emgTelemetry, history = []) {
  const phase = String(hrTelemetry?.phase || "").toLowerCase();
  const buildConfidence = Number(hrTelemetry?.buildConfidence || 0);
  const currentHr = Number(hrTelemetry?.currentHr || 0);
  const baselineHr = Number(hrTelemetry?.baselineHr || 0);
  const elevatedDelta = Number(hrTelemetry?.elevatedDelta || (currentHr && baselineHr ? currentHr - baselineHr : 0));
  const left = Number(emgTelemetry?.left_pct || emgTelemetry?.level_pct || 0);
  const right = Number(emgTelemetry?.right_pct || 0);
  const emgPeak = Math.max(left, right);
  const recent = history.slice(-12).filter((point) => point.hr != null);
  const firstRecent = recent[0];
  const lastRecent = recent[recent.length - 1];
  const recentSlope = firstRecent && lastRecent && lastRecent.ts !== firstRecent.ts
    ? ((lastRecent.hr - firstRecent.hr) / ((lastRecent.ts - firstRecent.ts) / 1000)) * 30
    : 0;
  const recentPeak = recent.length ? Math.max(...recent.map((point) => point.hr)) : currentHr;
  const dropFromRecentPeak = currentHr && recentPeak ? recentPeak - currentHr : 0;

  let nearClimax = 0;
  nearClimax += Math.min(buildConfidence, 100) * 0.45;
  nearClimax += Math.max(0, Math.min(elevatedDelta * 4, 35));
  nearClimax += Math.min(emgPeak * 0.2, 20);
  if (recentSlope > 2) nearClimax += Math.min(12, recentSlope * 2);
  if (dropFromRecentPeak > 8) nearClimax -= 12;
  if (phase.includes("build")) nearClimax += 12;
  if (phase.includes("recovery")) nearClimax = Math.min(nearClimax, 25);
  nearClimax = Math.round(Math.max(0, Math.min(100, nearClimax)));

  const recovery = phase.includes("recovery")
    ? Math.max(65, Math.min(100, 65 + Math.max(0, 100 - buildConfidence) * 0.25))
    : Math.max(0, Math.min(100, Math.round((buildConfidence < 25 && elevatedDelta < 6 ? 35 : 0) + (emgPeak < 10 ? 10 : 0) + (dropFromRecentPeak > 8 ? 20 : 0))));

  const label = phase.includes("recovery")
    ? "Recovery likely"
    : nearClimax >= 75
      ? "Near-climax watch"
      : nearClimax >= 45
        ? "Build intensifying"
        : "Baseline/build";

  const reason = [
    buildConfidence ? `build ${Math.round(buildConfidence)}%` : null,
    elevatedDelta ? `HR +${Math.round(elevatedDelta)} over baseline` : null,
    recentSlope > 1 ? `rising ${recentSlope.toFixed(1)} bpm/30s` : null,
    dropFromRecentPeak > 8 ? `drop ${Math.round(dropFromRecentPeak)} from recent peak` : null,
    emgPeak ? `EMG ${Math.round(emgPeak)}%` : null,
  ].filter(Boolean).join(" · ");

  return { nearClimax, recovery: Math.round(recovery), label, reason, recentSlope, dropFromRecentPeak };
}

export default function LiveCapture() {
  const [status, setStatus] = useState(null);
  const [hrTelemetry, setHrTelemetry] = useState(null);
  const [emgTelemetry, setEmgTelemetry] = useState(null);
  const [recording, setRecording] = useState(null);
  const [files, setFiles] = useState(null);
  const [liveSession, setLiveSession] = useState(null);
  const [activeSessionDoc, setActiveSessionDoc] = useState(null);
  const [connected, setConnected] = useState(false);
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [phaseMarkers, setPhaseMarkers] = useState([]);
  const [captureMode, setCaptureMode] = useState(() => localStorage.getItem("pulsepoint.captureMode") || "full");
  const [voiceWakeEnabled, setVoiceWakeEnabled] = useState(false);
  const [wakeListening, setWakeListening] = useState(false);
  const [annotationRecording, setAnnotationRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Say “Pulse Point” to start a voice annotation. Say “end” to stop listening.");
  const [voiceError, setVoiceError] = useState("");
  const [lastVoiceNote, setLastVoiceNote] = useState("");
  const [mediaVideo, setMediaVideo] = useState(null);
  const [mediaDragging, setMediaDragging] = useState(false);
  const [mediaFullscreen, setMediaFullscreen] = useState(false);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const latestHrRef = useRef(null);
  const latestEmgRef = useRef(null);
  const recognitionRef = useRef(null);
  const wakeRestartTimerRef = useRef(null);
  const voiceWakeEnabledRef = useRef(false);
  const annotationRecordingRef = useRef(false);
  const applyLiveCommandRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const voiceChunksRef = useRef([]);
  const voiceNoteTimeRef = useRef(0);
  const voiceNoteTimeoutRef = useRef(null);
  const voiceSilenceRafRef = useRef(null);
  const voiceAudioSourceRef = useRef(null);
  const voiceSilenceStartedRef = useRef(null);
  const audioContextRef = useRef(null);
  const lastPhaseMarkerRef = useRef({ label: "", ts: 0 });
  const mediaVideoRef = useRef(null);
  const mediaInputRef = useRef(null);
  const mediaObjectUrlRef = useRef(null);

  const appendTelemetryPoint = (nextHr = latestHrRef.current, nextEmg = latestEmgRef.current) => {
    if (!nextHr && !nextEmg) return;
    setTelemetryHistory((prev) => {
      const point = makeTelemetryPoint(nextHr, nextEmg);
      const previous = prev[prev.length - 1];
      if (
        previous
        && previous.hr === point.hr
        && previous.hrSmoothed === point.hrSmoothed
        && previous.left === point.left
        && previous.right === point.right
        && point.ts - previous.ts < 750
      ) {
        return prev;
      }
      return [...prev, point].slice(-MAX_TELEMETRY_POINTS);
    });
  };

  useEffect(() => {
    fetch(`${API_BASE}/live-capture/status`).then((res) => res.json()).then((data) => {
      setStatus(data);
      const nextHr = data.hr?.latestTelemetry || null;
      const nextEmg = data.emg?.latestTelemetry || null;
      latestHrRef.current = nextHr;
      latestEmgRef.current = nextEmg;
      setHrTelemetry(nextHr);
      setEmgTelemetry(nextEmg);
      setRecording(data.hr?.recording || null);
      setFiles(data.files || null);
      setLiveSession(data.session || null);
      appendTelemetryPoint(nextHr, nextEmg);
    }).catch(() => {});

    const events = new EventSource(`${API_BASE}/live-capture/stream`);
    events.onopen = () => setConnected(true);
    events.onerror = () => setConnected(false);
    events.addEventListener("status", (event) => {
      const data = JSON.parse(event.data);
      const nextHr = data.hr?.latestTelemetry || null;
      const nextEmg = data.emg?.latestTelemetry || null;
      latestHrRef.current = nextHr;
      latestEmgRef.current = nextEmg;
      setStatus(data);
      setHrTelemetry(nextHr);
      setEmgTelemetry(nextEmg);
      setRecording(data.hr?.recording || null);
      setFiles(data.files || null);
      setLiveSession(data.session || null);
      appendTelemetryPoint(nextHr, nextEmg);
    });
    events.addEventListener("hr_telemetry", (event) => {
      const data = JSON.parse(event.data);
      latestHrRef.current = data;
      setHrTelemetry(data);
      appendTelemetryPoint(data, latestEmgRef.current);
    });
    events.addEventListener("emg_telemetry", (event) => {
      const data = JSON.parse(event.data);
      latestEmgRef.current = data;
      setEmgTelemetry(data);
      appendTelemetryPoint(latestHrRef.current, data);
    });
    events.addEventListener("recording", (event) => setRecording(JSON.parse(event.data)));
    events.addEventListener("recording_finalized", (event) => setRecording(JSON.parse(event.data)));
    events.addEventListener("files", (event) => setFiles(JSON.parse(event.data)));
    events.addEventListener("live_session", (event) => setLiveSession(JSON.parse(event.data)));
    events.addEventListener("live_session_imported", (event) => {
      setLiveSession((prev) => ({ ...(prev || {}), lastImportedAt: new Date().toISOString(), lastImportResult: JSON.parse(event.data) }));
    });
    return () => events.close();
  }, []);

  useEffect(() => {
    localStorage.setItem("pulsepoint.captureMode", captureMode);
  }, [captureMode]);

  useEffect(() => {
    if (!presetModalOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setPresetModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [presetModalOpen]);

  useEffect(() => {
    const sessionId = liveSession?.activeSessionId;
    if (!sessionId) {
      setLiveEvents([]);
      setActiveSessionDoc(null);
      return;
    }
    base44.entities.Session.filter({ id: sessionId }).then((rows) => {
      const session = rows[0] || null;
      setActiveSessionDoc(session);
      const events = session?.event_timeline || [];
      setLiveEvents([...events].sort((a, b) => Number(a.time_s || 0) - Number(b.time_s || 0)));
    }).catch(() => {});
  }, [liveSession?.activeSessionId, liveSession?.lastImportedAt]);

  const prediction = useMemo(() => computePrediction(hrTelemetry, emgTelemetry, telemetryHistory), [hrTelemetry, emgTelemetry, telemetryHistory]);
  const recordingActive = Boolean(recording?.active);
  const hrConnected = Boolean(status?.hr?.connected);
  const emgLive = captureMode !== "hr" && recordingActive && isRecent(status?.emg?.lastPollAt || status?.emg?.lastMessageAt);
  const hasHrTrend = telemetryHistory.some((point) => point.hr != null || point.hrSmoothed != null);
  const hasEmgTrend = telemetryHistory.some((point) => point.left != null || point.right != null || point.diff != null);
  const currentHrLevel = hrLevelPercent(hrTelemetry?.currentHr, hrTelemetry?.baselineHr);
  const buildLevel = readNumber(hrTelemetry?.buildConfidence, hrTelemetry?.build_confidence);
  const leftEmgLevel = readNumber(emgTelemetry?.left_pct, emgTelemetry?.level_pct);
  const rightEmgLevel = readNumber(emgTelemetry?.right_pct);
  const captureDigest = activeSessionDoc?.capture_digest || null;
  const recentLiveEvents = useMemo(() => [...liveEvents].sort((a, b) => Number(b.time_s || 0) - Number(a.time_s || 0)).slice(0, 8), [liveEvents]);
  const recentPhaseMarkers = useMemo(() => [...phaseMarkers].reverse().slice(0, 5), [phaseMarkers]);
  const selectedCaptureMode = CAPTURE_MODES.find((mode) => mode.value === captureMode) || CAPTURE_MODES[0];
  const maxHr = useMemo(() => {
    const values = telemetryHistory.map((point) => point.hr).filter((value) => value != null);
    const current = readNumber(hrTelemetry?.currentHr, hrTelemetry?.hr, hrTelemetry?.heartRate);
    if (current != null) values.push(current);
    return values.length ? Math.max(...values) : null;
  }, [hrTelemetry, telemetryHistory]);

  const clearMediaVideo = useCallback(() => {
    if (mediaObjectUrlRef.current) {
      URL.revokeObjectURL(mediaObjectUrlRef.current);
      mediaObjectUrlRef.current = null;
    }
    setMediaVideo(null);
    if (mediaInputRef.current) mediaInputRef.current.value = "";
  }, []);

  const loadMediaFile = useCallback((file) => {
    if (!file || !file.type?.startsWith("video/")) return;
    if (mediaObjectUrlRef.current) URL.revokeObjectURL(mediaObjectUrlRef.current);
    const url = URL.createObjectURL(file);
    mediaObjectUrlRef.current = url;
    setMediaVideo({ url, name: file.name, size: file.size });
  }, []);

  const loadMediaFiles = useCallback((filesList) => {
    const file = Array.from(filesList || []).find((item) => item.type?.startsWith("video/"));
    if (file) loadMediaFile(file);
  }, [loadMediaFile]);

  const openMediaFullscreen = useCallback(async () => {
    const video = mediaVideoRef.current;
    if (!video) return;
    if (video.requestFullscreen) await video.requestFullscreen();
    else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setMediaFullscreen(document.fullscreenElement === mediaVideoRef.current || document.webkitFullscreenElement === mediaVideoRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
  }, []);

  useEffect(() => () => {
    if (mediaObjectUrlRef.current) URL.revokeObjectURL(mediaObjectUrlRef.current);
  }, []);

  const refreshFiles = async () => {
    const res = await fetch(`${API_BASE}/live-capture/refresh-files`, { method: "POST" });
    if (res.ok) setFiles(await res.json());
  };

  const ensureSession = async () => {
    const res = await fetch(`${API_BASE}/live-capture/ensure-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recording }),
    });
    if (res.ok) {
      const data = await res.json();
      setLiveSession(data.session);
      return data.session;
    }
    return null;
  };

  useEffect(() => {
    voiceWakeEnabledRef.current = voiceWakeEnabled;
  }, [voiceWakeEnabled]);

  useEffect(() => {
    annotationRecordingRef.current = annotationRecording;
  }, [annotationRecording]);

  const speechRecognitionSupported = typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const voiceRecordingSupported = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

  const getCurrentSessionTime = useCallback(() => {
    const startMs = Number(recording?.startedAtMs) || (liveSession?.startedAt ? new Date(liveSession.startedAt).getTime() : 0);
    if (!startMs || Number.isNaN(startMs)) return 0;
    return Math.max(0, Math.round((Date.now() - startMs) / 1000));
  }, [liveSession?.startedAt, recording?.startedAtMs]);

  useEffect(() => {
    if (!recordingActive || !telemetryHistory.length) return;
    const strongLabel = prediction.nearClimax >= 75
      ? "Near-climax watch"
      : prediction.recovery >= 70
        ? "Recovery watch"
        : prediction.nearClimax >= 45
          ? "Build intensifying"
          : "";
    if (!strongLabel) return;
    const now = Date.now();
    if (lastPhaseMarkerRef.current.label === strongLabel && now - lastPhaseMarkerRef.current.ts < 30000) return;
    lastPhaseMarkerRef.current = { label: strongLabel, ts: now };
    const lastPoint = telemetryHistory[telemetryHistory.length - 1];
    setPhaseMarkers((prev) => [
      ...prev,
      {
        time_s: getCurrentSessionTime(),
        chartTime: lastPoint.time,
        label: strongLabel,
        confidence: strongLabel.includes("Recovery") ? prediction.recovery : prediction.nearClimax,
        reason: prediction.reason || strongLabel,
      },
    ].slice(-20));
  }, [getCurrentSessionTime, prediction, recordingActive, telemetryHistory]);

  const getAudioContext = useCallback(async () => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      audioContextRef.current = new AudioCtor();
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const playVoiceFeedback = useCallback(async (type) => {
    try {
      const ctx = await getAudioContext();
      if (!ctx) return;
      if (type === "start") playToneSequence(ctx, [660, 880]);
      else if (type === "stop") playToneSequence(ctx, [520, 330]);
      else if (type === "wake") playToneSequence(ctx, [740, 988, 1175]);
    } catch {}
  }, [getAudioContext]);

  const appendVoiceAnnotation = useCallback(async (text, timeS) => {
    const clean = normalizeVoiceAnnotationText(text);
    if (!clean) return;
    const sessionState = liveSession?.activeSessionId ? liveSession : await ensureSession();
    const sessionId = sessionState?.activeSessionId;
    if (!sessionId) throw new Error("No active live session is available for the annotation.");
    const rows = await base44.entities.Session.filter({ id: sessionId });
    const session = rows[0] || {};
    const nextEvent = {
      time_s: Math.max(0, Math.round(Number(timeS) || 0)),
      note: clean,
      category: categorizeVoiceNote(clean),
      annotation_tags: tagVoiceNote(clean),
      ai_annotation: {
        source: "live-voice-local",
        rationale: "Live voice annotation tagged locally for immediate review.",
      },
      source: "live_voice_annotation",
      created_at: new Date().toISOString(),
      hr_bpm: readNumber(latestHrRef.current?.currentHr, latestHrRef.current?.hr),
    };
    const updated = [...(session.event_timeline || []), nextEvent].sort((a, b) => Number(a.time_s || 0) - Number(b.time_s || 0));
    await base44.entities.Session.update(sessionId, { event_timeline: updated });
    setLiveEvents(updated);
    setActiveSessionDoc((prev) => (prev ? { ...prev, event_timeline: updated } : prev));
    setLastVoiceNote(`[${Math.floor(nextEvent.time_s / 60)}:${String(nextEvent.time_s % 60).padStart(2, "0")}] ${clean}`);
  }, [ensureSession, liveSession]);

  const updateActiveSession = useCallback(async (patch) => {
    const sessionState = liveSession?.activeSessionId ? liveSession : await ensureSession();
    const sessionId = sessionState?.activeSessionId;
    if (!sessionId) throw new Error("No active live session is available.");
    await base44.entities.Session.update(sessionId, patch);
    setActiveSessionDoc((prev) => (prev ? { ...prev, ...patch } : prev));
    return sessionId;
  }, [ensureSession, liveSession]);

  const undoLastVoiceAnnotation = useCallback(async () => {
    const sessionId = liveSession?.activeSessionId;
    if (!sessionId) return;
    const rows = await base44.entities.Session.filter({ id: sessionId });
    const session = rows[0] || {};
    const events = [...(session.event_timeline || [])].sort((a, b) => Number(a.time_s || 0) - Number(b.time_s || 0));
    const idx = [...events].reverse().findIndex((event) => event.source === "live_voice_annotation");
    if (idx === -1) {
      setVoiceStatus("No live voice annotation to undo.");
      return;
    }
    const removeIndex = events.length - 1 - idx;
    const removed = events[removeIndex];
    const updated = events.filter((_event, index) => index !== removeIndex);
    await base44.entities.Session.update(sessionId, { event_timeline: updated });
    setLiveEvents(updated);
    setActiveSessionDoc((prev) => (prev ? { ...prev, event_timeline: updated } : prev));
    setVoiceStatus(`Removed last voice note at ${fmtMmSs(removed.time_s)}.`);
  }, [liveSession?.activeSessionId]);

  const applyLiveCommand = useCallback(async (command) => {
    if (!command) return false;
    if (command.type === "stop_listening") {
      setVoiceWakeEnabled(false);
      setVoiceStatus("Wake listening paused.");
      return true;
    }
    if (command.type === "undo_last") {
      await undoLastVoiceAnnotation();
      return true;
    }
    if (command.type === "mark_phase") {
      const timeS = getCurrentSessionTime();
      const chartTime = telemetryHistory[telemetryHistory.length - 1]?.time;
      await updateActiveSession({ [command.key]: timeS });
      setPhaseMarkers((prev) => [...prev, { time_s: timeS, chartTime, label: command.label, kind: command.key, confidence: 100, reason: "Marked by voice command" }].slice(-20));
      setVoiceStatus(`${command.label} marked at ${fmtMmSs(timeS)}.`);
      return true;
    }
    return false;
  }, [getCurrentSessionTime, telemetryHistory, undoLastVoiceAnnotation, updateActiveSession]);

  useEffect(() => {
    applyLiveCommandRef.current = applyLiveCommand;
  }, [applyLiveCommand]);

  const stopWakeListening = useCallback(() => {
    clearTimeout(wakeRestartTimerRef.current);
    wakeRestartTimerRef.current = null;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onstart = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.onend = null;
      try { recognition.stop(); } catch {}
    }
    setWakeListening(false);
  }, []);

  const stopVoiceAnnotation = useCallback(() => {
    clearTimeout(voiceNoteTimeoutRef.current);
    voiceNoteTimeoutRef.current = null;
    if (voiceSilenceRafRef.current) {
      cancelAnimationFrame(voiceSilenceRafRef.current);
      voiceSilenceRafRef.current = null;
    }
    voiceSilenceStartedRef.current = null;
    try { voiceAudioSourceRef.current?.disconnect(); } catch {}
    voiceAudioSourceRef.current = null;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const startWakeListening = useCallback(() => {
    if (!voiceWakeEnabledRef.current || annotationRecordingRef.current || !speechRecognitionSupported) return;
    stopWakeListening();
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onstart = () => {
      setWakeListening(true);
      setVoiceStatus("Listening for “Pulse Point”… say “end” to stop.");
      setVoiceError("");
    };
    recognition.onerror = (event) => {
      const transient = event?.error === "no-speech" || event?.error === "aborted";
      if (!voiceWakeEnabledRef.current || annotationRecordingRef.current) {
        setWakeListening(false);
      }
      if (!transient) {
        setVoiceError(event?.error ? `Wake listener: ${event.error}` : "Wake listener stopped.");
      }
    };
    recognition.onresult = (event) => {
      let heard = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        heard += event.results[i][0]?.transcript || "";
      }
      const normalized = heard.toLowerCase().replace(/[^a-z]+/g, " ").trim();
      if (isEndListeningCommand(normalized)) {
        setVoiceWakeEnabled(false);
        setVoiceStatus("Wake listening stopped.");
        playVoiceFeedback("stop");
        try { recognition.stop(); } catch {}
        return;
      }
      const command = parseLiveCommand(normalized);
      if (command) {
        applyLiveCommandRef.current?.(command).catch((error) => setVoiceError(error.message || String(error)));
        try { recognition.stop(); } catch {}
        return;
      }
      if (normalized.includes("pulse point") || normalized.includes("pulsepoint")) {
        setVoiceStatus("Wake phrase heard. Recording annotation…");
        playVoiceFeedback("wake");
        try { recognition.stop(); } catch {}
        setTimeout(() => {
          if (voiceWakeEnabledRef.current && !annotationRecordingRef.current) {
            startVoiceAnnotation();
          }
        }, 120);
      }
    };
    recognition.onend = () => {
      const shouldRestart = voiceWakeEnabledRef.current && !annotationRecordingRef.current;
      if (shouldRestart) {
        setWakeListening(true);
        wakeRestartTimerRef.current = window.setTimeout(startWakeListening, 900);
      } else {
        setWakeListening(false);
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setWakeListening(false);
      wakeRestartTimerRef.current = window.setTimeout(startWakeListening, 1500);
    }
  }, [playVoiceFeedback, speechRecognitionSupported, stopWakeListening]);

  const startVoiceAnnotation = useCallback(async () => {
    if (!voiceRecordingSupported || annotationRecordingRef.current) return;
    stopWakeListening();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      const recorder = new MediaRecorder(stream, { mimeType });
      voiceChunksRef.current = [];
      voiceNoteTimeRef.current = getCurrentSessionTime();
      const startedAt = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        if (voiceSilenceRafRef.current) {
          cancelAnimationFrame(voiceSilenceRafRef.current);
          voiceSilenceRafRef.current = null;
        }
        voiceSilenceStartedRef.current = null;
        try { voiceAudioSourceRef.current?.disconnect(); } catch {}
        voiceAudioSourceRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        setAnnotationRecording(false);
        setVoiceStatus("Transcribing annotation…");
        try {
          const blob = new Blob(voiceChunksRef.current, { type: mimeType });
          voiceChunksRef.current = [];
          const audioBase64 = await blobToBase64(blob);
          const res = await base44.functions.invoke("whisperSTT", {
            audio_base64: audioBase64,
            mime_type: mimeType,
            prompt: WHISPER_PROMPT,
          });
          const text = normalizeVoiceAnnotationText(res.data?.text);
          if (text) {
            await appendVoiceAnnotation(text, voiceNoteTimeRef.current);
            setVoiceStatus("Annotation saved. Listening for “Pulse Point”… say “end” to stop.");
          } else {
            setVoiceStatus("No speech detected. Listening for “Pulse Point”… say “end” to stop.");
          }
        } catch (error) {
          setVoiceError(error.message || String(error));
          setVoiceStatus("Annotation failed. Listening can continue.");
        } finally {
          if (voiceWakeEnabledRef.current) {
            window.setTimeout(startWakeListening, 600);
          }
        }
      };
      mediaRecorderRef.current = recorder;
      setAnnotationRecording(true);
      setVoiceError("");
      setVoiceStatus("Recording annotation… pause briefly after the note to save.");
      recorder.start();

      try {
        const ctx = await getAudioContext();
        if (ctx) {
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          source.connect(analyser);
          voiceAudioSourceRef.current = source;
          const samples = new Uint8Array(analyser.fftSize);
          const monitorSilence = () => {
            if (recorder.state === "inactive") return;
            analyser.getByteTimeDomainData(samples);
            let sum = 0;
            for (let i = 0; i < samples.length; i += 1) {
              const centered = (samples[i] - 128) / 128;
              sum += centered * centered;
            }
            const rms = Math.sqrt(sum / samples.length);
            const now = Date.now();
            const oldEnough = now - startedAt >= VOICE_NOTE_MIN_MS;
            if (oldEnough && rms < VOICE_NOTE_SILENCE_RMS) {
              if (!voiceSilenceStartedRef.current) voiceSilenceStartedRef.current = now;
              if (now - voiceSilenceStartedRef.current >= VOICE_NOTE_SILENCE_MS) {
                stopVoiceAnnotation();
                return;
              }
            } else {
              voiceSilenceStartedRef.current = null;
            }
            voiceSilenceRafRef.current = requestAnimationFrame(monitorSilence);
          };
          voiceSilenceRafRef.current = requestAnimationFrame(monitorSilence);
        }
      } catch {}

      voiceNoteTimeoutRef.current = window.setTimeout(stopVoiceAnnotation, MAX_VOICE_NOTE_MS);
    } catch (error) {
      setVoiceError(error.message || String(error));
      setAnnotationRecording(false);
      if (voiceWakeEnabledRef.current) window.setTimeout(startWakeListening, 600);
    }
  }, [appendVoiceAnnotation, getAudioContext, getCurrentSessionTime, startWakeListening, stopVoiceAnnotation, stopWakeListening, voiceRecordingSupported]);

  useEffect(() => {
    if (voiceWakeEnabled) startWakeListening();
    else {
      stopWakeListening();
      stopVoiceAnnotation();
      setVoiceStatus("Say “Pulse Point” to start a voice annotation. Say “end” to stop listening.");
    }
    return () => {
      stopWakeListening();
      stopVoiceAnnotation();
      clearTimeout(voiceNoteTimeoutRef.current);
    };
  }, [startWakeListening, stopVoiceAnnotation, stopWakeListening, voiceWakeEnabled]);

  const voiceAnnotationPanel = (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Mic className="h-4 w-4" /> Voice Annotation
          </p>
          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Mic className={`h-4 w-4 ${annotationRecording || wakeListening ? "text-primary" : "text-muted-foreground"}`} />
            <span>{voiceStatus}</span>
          </div>
          {!speechRecognitionSupported && (
            <p className="mt-1 text-xs text-destructive">Wake phrase listening is not supported in this browser. Use Record Now instead.</p>
          )}
          {!voiceRecordingSupported && (
            <p className="mt-1 text-xs text-destructive">Microphone recording is not available in this browser context.</p>
          )}
          {voiceError && <p className="mt-1 text-xs text-destructive">{voiceError}</p>}
          {lastVoiceNote && <p className="mt-1 text-xs text-muted-foreground">Last saved: {lastVoiceNote}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              await getAudioContext();
              if (voiceWakeEnabled) playVoiceFeedback("stop");
              setVoiceWakeEnabled((value) => !value);
            }}
            disabled={!speechRecognitionSupported || !voiceRecordingSupported}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
              voiceWakeEnabled ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-foreground hover:bg-muted/80"
            }`}
          >
            <Mic className="h-3.5 w-3.5" />
            {voiceWakeEnabled ? "Wake Listening On" : "Enable Wake"}
          </button>
          {annotationRecording ? (
            <button
              type="button"
              onClick={stopVoiceAnnotation}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-destructive/15 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/20"
            >
              <MicOff className="h-3.5 w-3.5" /> Stop & Save
            </button>
          ) : (
            <button
              type="button"
              onClick={startVoiceAnnotation}
              disabled={!voiceRecordingSupported}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 disabled:opacity-50"
            >
              <Mic className="h-3.5 w-3.5" /> Record Now
            </button>
          )}
          <button
            type="button"
            onClick={undoLastVoiceAnnotation}
            disabled={!recentLiveEvents.length}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 disabled:opacity-50"
          >
            <Undo2 className="h-3.5 w-3.5" /> Undo Last
          </button>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-border bg-muted/25 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Commands: “Pulse Point”, “end”, “undo last”, “mark climax”, “mark recovery”
        </p>
      </div>
      {recentLiveEvents.length > 0 && (
        <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Live Annotations</p>
            <span className="text-[10px] text-muted-foreground">{liveEvents.length} total</span>
          </div>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {recentLiveEvents.slice(0, captureMode === "media" ? 4 : 8).map((event, index) => (
              <div key={`${event.created_at || event.time_s}-${index}`} className="rounded-lg bg-card/70 px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10px] text-primary">{fmtMmSs(event.time_s)}</span>
                  {asArray(event.annotation_tags || event.category).slice(0, 4).map((tag) => (
                    <span key={tag} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                      {String(tag).replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-foreground">{event.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const mediaPanel = captureMode === "media" ? (
    <div className="rounded-xl border border-border bg-card p-3 md:p-4">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Video className="h-4 w-4" /> Media Review
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Local video playback with live HR context kept in view.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={mediaInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(event) => loadMediaFiles(event.target.files)}
          />
          <button
            type="button"
            onClick={() => mediaInputRef.current?.click()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <UploadCloud className="h-4 w-4" />
            {mediaVideo ? "Change Video" : "Load Video"}
          </button>
          {mediaVideo && (
            <>
              <button
                type="button"
                onClick={openMediaFullscreen}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted/80"
              >
                <Maximize2 className="h-4 w-4" /> Full Screen
              </button>
              <button
                type="button"
                onClick={clearMediaVideo}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              >
                <X className="h-4 w-4" /> Clear
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid min-h-[calc(100vh-15rem)] gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div
          className={`relative flex min-h-[22rem] items-center justify-center overflow-hidden rounded-xl border ${
            mediaDragging ? "border-primary bg-primary/10" : "border-border bg-black"
          }`}
          onDragEnter={(event) => {
            event.preventDefault();
            setMediaDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setMediaDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget === event.target) setMediaDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setMediaDragging(false);
            loadMediaFiles(event.dataTransfer.files);
          }}
        >
          {mediaVideo ? (
            <video
              ref={mediaVideoRef}
              src={mediaVideo.url}
              controls
              playsInline
              className="max-h-[calc(100vh-17rem)] min-h-[22rem] w-full bg-black object-contain"
            />
          ) : (
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              className="flex h-full min-h-[22rem] w-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground hover:text-foreground"
            >
              <UploadCloud className="h-10 w-10 text-primary" />
              <span className="text-base font-semibold text-foreground">Drop a local video here</span>
              <span className="max-w-md text-sm">or use Load Video above to start media review without moving the telemetry page around.</span>
            </button>
          )}
          {mediaVideo && !mediaFullscreen && (
            <div className="pointer-events-none absolute left-3 top-3 max-w-[70%] rounded-lg bg-black/65 px-3 py-2 text-xs text-white backdrop-blur-sm">
              <p className="truncate font-semibold">{mediaVideo.name}</p>
            </div>
          )}
        </div>

        {!mediaFullscreen && (
          <div className="grid content-start gap-3 xl:sticky xl:top-4 xl:max-h-[calc(100vh-9rem)] xl:overflow-hidden">
            <div className="grid grid-cols-2 gap-2">
              <CompactStat label="Current HR" value={fmtNumber(hrTelemetry?.currentHr, 0)} helper="bpm" />
              <CompactStat label="Max HR" value={fmtNumber(maxHr, 0)} helper="session peak" tone="danger" />
              <CompactStat label="Build" value={`${fmtNumber(hrTelemetry?.buildConfidence, 0)}%`} helper={hrTelemetry?.phase || "phase"} />
              <CompactStat label="Watch" value={`${prediction.nearClimax}%`} helper={prediction.label} />
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Real-Time Phase Watch</p>
                  <p className="mt-1 text-xs text-foreground">{prediction.label}</p>
                </div>
                <Brain className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${prediction.nearClimax}%` }} />
              </div>
              {prediction.reason && <p className="mt-2 line-clamp-2 text-[10px] text-muted-foreground">{prediction.reason}</p>}
            </div>

            <TrendPanel title="HR Trend" subtitle="Compact live view" empty={!hasHrTrend} heightClass="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={telemetryHistory} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
                  <XAxis dataKey="time" hide />
                  <YAxis hide domain={["dataMin - 4", "dataMax + 4"]} />
                  <Tooltip content={<ChartTooltip />} />
                  {phaseMarkers.map((marker, index) => marker.chartTime ? (
                    <ReferenceLine
                      key={`${marker.label}-${marker.chartTime}-media-${index}`}
                      x={marker.chartTime}
                      stroke={phaseMarkerColor(marker.label)}
                      strokeDasharray="4 3"
                      ifOverflow="extendDomain"
                    />
                  ) : null)}
                  <Line type="monotone" dataKey="baseline" name="Baseline" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" strokeWidth={1.25} dot={false} connectNulls />
                  <Line type="monotone" dataKey="hrSmoothed" name="Smoothed" stroke="hsl(var(--chart-2))" strokeWidth={1.75} dot={false} connectNulls />
                  <Line type="monotone" dataKey="hr" name="HR" stroke="hsl(var(--primary))" strokeWidth={2.25} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </TrendPanel>

            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quick Phase Marks</p>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {[
                  { key: "pre_climax_offset_s", label: "Pre" },
                  { key: "climax_offset_s", label: "Climax" },
                  { key: "recovery_offset_s", label: "Recovery" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => applyLiveCommand({ type: "mark_phase", key: item.key, label: item.label === "Pre" ? "Pre-climax" : item.label })}
                    className="rounded-lg bg-muted px-2 py-1.5 text-[10px] font-semibold text-foreground hover:bg-muted/80"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <PageHeader
          title="Live Capture"
          subtitle="Real-time HR, EMG, OBS recording state, and prediction telemetry"
          icon={Radio}
        />
        <button
          type="button"
          onClick={() => setPresetModalOpen(true)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted/50 md:mt-1"
        >
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <span>{selectedCaptureMode.label}</span>
        </button>
      </div>

      {presetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/20 p-4 pt-20 md:p-6 md:pt-24" onMouseDown={() => setPresetModalOpen(false)}>
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-card p-4 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Capture Preset</p>
                <p className="mt-1 text-sm text-muted-foreground">Choose the live capture view without moving the workspace around.</p>
              </div>
              <button
                type="button"
                onClick={() => setPresetModalOpen(false)}
                className="rounded-lg bg-muted p-2 text-muted-foreground hover:text-foreground"
                aria-label="Close preset selector"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {CAPTURE_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => {
                    setCaptureMode(mode.value);
                    setPresetModalOpen(false);
                  }}
                  className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                    captureMode === mode.value
                      ? "border-primary bg-primary/12 text-foreground"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <span className="block text-sm font-semibold">{mode.label}</span>
                  <span className="mt-1 block text-xs">{mode.helper}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {mediaPanel}

      {voiceAnnotationPanel}

      {captureMode !== "media" && (
        <>
      <div className={`grid gap-3 ${emgLive ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        <MetricCard icon={<Radio className="w-4 h-4" />} label="PulsePoint Stream" value={connected ? "Live" : "Offline"} helper="App telemetry bridge" active={connected} />
        <MetricCard icon={<HeartPulse className="w-4 h-4" />} label="HR Relay" value={hrConnected ? "Connected" : "Waiting"} helper={status?.hr?.url || "ws://127.0.0.1:8765"} active={hrConnected} />
        {emgLive && <MetricCard icon={<Activity className="w-4 h-4" />} label="EMG Feed" value="Live" helper={status?.emg?.textDir || "EMG text files"} active />}
        <MetricCard icon={<Video className="w-4 h-4" />} label="OBS Recording" value={recordingActive ? "Recording" : "Stopped"} helper={recording?.filename || "No active capture"} active={recordingActive} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <FileText className="w-4 h-4" /> Live Session
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {liveSession?.activeSessionId
                ? liveSession.importing
                  ? "Finalizing telemetry and attaching capture files…"
                  : liveSession.active
                    ? "Recording into a new PulsePoint session shell."
                    : "Capture session ready for review and detail entry."
                : "A new session will be created automatically when OBS recording starts."}
            </p>
            {liveSession?.lastImportError && (
              <p className="mt-1 text-xs text-destructive">{liveSession.lastImportError}</p>
            )}
            {liveSession?.lastImportResult && (
              <p className="mt-1 text-xs text-muted-foreground">
                HR rows {liveSession.lastImportResult.hr_rows || 0}
                {liveSession.lastImportResult.emg_attached ? " · EMG attached" : " · EMG pending"}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!liveSession?.activeSessionId && (
              <button
                type="button"
                onClick={ensureSession}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Create Session Shell
              </button>
            )}
            {liveSession?.activeSessionId && (
              <Link
                to={`/sessions/${liveSession.activeSessionId}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted/80"
              >
                <ExternalLink className="h-4 w-4" /> Open Session
              </Link>
            )}
          </div>
        </div>
        {captureDigest && (
          <div className="mt-4 grid gap-3 border-t border-border pt-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-lg border border-border bg-muted/25 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Post-Capture Review</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Duration</p>
                  <p className="text-lg font-bold text-foreground">{captureDigest.duration_text || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg HR</p>
                  <p className="text-lg font-bold text-foreground">{captureDigest.avg_hr || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Peak HR</p>
                  <p className="text-lg font-bold text-foreground">{captureDigest.peak_hr || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Rows</p>
                  <p className="text-lg font-bold text-foreground">{captureDigest.hr_rows || 0}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(captureDigest.findings || []).slice(0, 8).map((finding) => (
                  <span key={finding} className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
                    {finding}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/25 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Review Queue</p>
              <div className="mt-2 space-y-1.5">
                {(captureDigest.review_items || []).map((item) => (
                  <div key={item} className="flex gap-2 text-xs text-muted-foreground">
                    <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <CircleDot className="w-4 h-4" /> Live Telemetry
          </h3>
          <span className="text-[10px] text-muted-foreground">
            HR {fmtTime(status?.hr?.lastMessageAt)}{emgLive ? ` · EMG ${fmtTime(status?.emg?.lastMessageAt || status?.emg?.lastPollAt)}` : ""}
          </span>
        </div>

        <div className={`grid gap-3 sm:grid-cols-2 ${emgLive ? "lg:grid-cols-4" : "lg:grid-cols-2"}`}>
          <MetricCard icon={<HeartPulse className="w-4 h-4" />} label="Current HR" value={fmtNumber(hrTelemetry?.currentHr, 0)} helper="beats per minute" active={hrTelemetry?.currentHr != null} level={currentHrLevel} />
          <MetricCard icon={<Zap className="w-4 h-4" />} label="Build Confidence" value={`${fmtNumber(hrTelemetry?.buildConfidence, 0)}%`} helper={hrTelemetry?.phase || "No HR phase"} active={Number(hrTelemetry?.buildConfidence) > 40} level={buildLevel} />
          {emgLive && (
            <>
              <MetricCard icon={<Activity className="w-4 h-4" />} label="Left EMG" value={`${fmtNumber(emgTelemetry?.left_pct ?? emgTelemetry?.level_pct)}%`} helper="normalized activation" active={(emgTelemetry?.left_pct ?? emgTelemetry?.level_pct) != null} level={leftEmgLevel} />
              <MetricCard icon={<Activity className="w-4 h-4" />} label="Right EMG" value={`${fmtNumber(emgTelemetry?.right_pct)}%`} helper={`diff ${fmtNumber(emgTelemetry?.diff_pct)}%`} active={emgTelemetry?.right_pct != null} level={rightEmgLevel} />
            </>
          )}
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <Brain className="w-4 h-4" /> Real-Time Phase Watch
              </p>
              <p className="mt-1 text-sm text-foreground">{prediction.label}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-right">
              <div className="rounded-lg bg-primary/10 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">Near-Climax</p>
                <p className="text-2xl font-bold text-foreground">{prediction.nearClimax}%</p>
              </div>
              <div className="rounded-lg bg-chart-2/10 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-chart-2 font-semibold">Recovery</p>
                <p className="text-2xl font-bold text-foreground">{prediction.recovery}%</p>
              </div>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${prediction.nearClimax}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { key: "pre_climax_offset_s", label: "Mark Pre-Climax" },
              { key: "climax_offset_s", label: "Mark Climax" },
              { key: "recovery_offset_s", label: "Mark Recovery" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => applyLiveCommand({ type: "mark_phase", key: item.key, label: item.label.replace("Mark ", "") })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/80"
              >
                <Flag className="h-3.5 w-3.5" />
                {item.label}
              </button>
            ))}
          </div>
          {recentPhaseMarkers.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {recentPhaseMarkers.map((marker, index) => (
                <div key={`${marker.label}-${marker.time_s}-${index}`} className="rounded-lg border border-border bg-card/70 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground">{marker.label}</p>
                    <span className="font-mono text-[10px] text-muted-foreground">{fmtMmSs(marker.time_s)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{marker.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <TrendPanel title="Heart Rate Trend" subtitle="Current, smoothed, and baseline HR" empty={!hasHrTrend} heightClass="h-72 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={telemetryHistory} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.45} />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} domain={["dataMin - 4", "dataMax + 4"]} width={34} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {phaseMarkers.map((marker, index) => marker.chartTime ? (
                <ReferenceLine
                  key={`${marker.label}-${marker.chartTime}-${index}`}
                  x={marker.chartTime}
                  stroke={phaseMarkerColor(marker.label)}
                  strokeDasharray="4 3"
                  ifOverflow="extendDomain"
                  label={{ value: marker.label, position: "top", fill: phaseMarkerColor(marker.label), fontSize: 10 }}
                />
              ) : null)}
              <Line type="monotone" dataKey="baseline" name="Baseline" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" strokeWidth={1.5} dot={false} connectNulls />
              <Line type="monotone" dataKey="hrSmoothed" name="Smoothed" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="hr" name="HR" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </TrendPanel>

        {emgLive && (
          <TrendPanel title="EMG Activation" subtitle="Left, right, and side-to-side differential" empty={!hasEmgTrend} heightClass="h-64 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={telemetryHistory} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.45} />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} domain={[0, 100]} width={34} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="left" name="Left" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} connectNulls />
                <Line type="monotone" dataKey="right" name="Right" stroke="hsl(var(--chart-2))" strokeWidth={2.5} dot={false} connectNulls />
                <Line type="monotone" dataKey="diff" name="Diff" stroke="hsl(var(--chart-4))" strokeWidth={1.75} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </TrendPanel>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <FileText className="w-4 h-4" /> Capture Files
          </h3>
          <button
            onClick={refreshFiles}
            className="rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="mr-1 inline h-3.5 w-3.5" /> Refresh
          </button>
        </div>
        <div className={`grid gap-3 ${emgLive ? "md:grid-cols-2" : ""}`}>
          <FileCard title="Latest Heart Rate CSV" file={files?.latestHrCsv} />
          {emgLive && <FileCard title="Latest EMG CSV" file={files?.latestEmgCsv} />}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
