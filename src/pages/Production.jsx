import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Clapperboard, Clock3, Film, Flag, HeartPulse, Layers3, ShieldCheck, Upload } from "lucide-react";
import moment from "moment";
import { base44 } from "@/api/base44Client";
import PageHeader from "../components/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const OVERLAY_LAYERS = [
  { key: "timer", label: "Session timer", icon: Clock3, availability: () => true },
  { key: "current_hr", label: "Current HR", icon: HeartPulse, availability: (state) => state.hasHr },
  { key: "average_hr", label: "Average HR", icon: HeartPulse, availability: (state) => state.hasHr },
  { key: "max_hr", label: "Max HR", icon: HeartPulse, availability: (state) => state.hasHr },
  { key: "hr_trend", label: "Small HR trend graph", icon: HeartPulse, availability: (state) => state.hasHr },
  { key: "event_text", label: "Event marker text", icon: Flag, availability: (state) => state.hasEvents },
  { key: "phase_label", label: "Verified phase label", icon: Flag, availability: (state) => state.hasPhaseMarkers },
  { key: "motion_indicator", label: "Motion activity indicator", icon: Activity, availability: (state) => state.hasMotion },
];

const TEMPLATES = [
  { value: "minimal", label: "Minimal", description: "Low-distraction labels and key metrics only." },
  { value: "compact", label: "Compact telemetry", description: "Compact HUD with telemetry traces and event context." },
  { value: "review", label: "Review overlay style", description: "Review-workstation presentation for evidence playback." },
];

function formatBytes(bytes) {
  if (!Number.isFinite(Number(bytes))) return "--";
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(bytes);
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds))) return "Reading metadata...";
  const total = Math.round(Number(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function sessionLabel(session) {
  return `${moment(session.date).format("MMM D, YYYY")}${session.start_time ? ` · ${session.start_time}` : ""}${session.duration_minutes ? ` · ${session.duration_minutes}m` : ""}`;
}

export default function Production() {
  const fileInputRef = useRef(null);
  const objectUrlRef = useRef("");
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedSession, setSelectedSession] = useState(null);
  const [hasHrTimeline, setHasHrTimeline] = useState(false);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [sourceVideo, setSourceVideo] = useState(null);
  const [selectedLayers, setSelectedLayers] = useState(["timer"]);
  const [template, setTemplate] = useState("compact");

  useEffect(() => {
    base44.entities.Session.list("-date", 300)
      .then((rows) => setSessions(rows))
      .finally(() => setLoadingSessions(false));
  }, []);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const availability = useMemo(() => ({
    hasHr: hasHrTimeline,
    hasEvents: Array.isArray(selectedSession?.event_timeline) && selectedSession.event_timeline.length > 0,
    hasPhaseMarkers: ["pre_climax_offset_s", "climax_offset_s", "recovery_offset_s"]
      .some((key) => Number.isFinite(Number(selectedSession?.[key]))),
    hasMotion: !!selectedSession?.motion_analysis_summary,
  }), [hasHrTimeline, selectedSession]);

  const selectSession = async (id) => {
    const session = sessions.find((row) => row.id === id) || null;
    setSelectedSessionId(id);
    setSelectedSession(session);
    setHasHrTimeline(false);
    setSelectedLayers(["timer"]);
    if (!session) return;
    setLoadingAvailability(true);
    try {
      const hrRows = await base44.entities.HeartRateTimeline.filter({ session: id }, "time_offset_s", 1);
      setHasHrTimeline(Array.isArray(hrRows) && hrRows.length > 0);
    } finally {
      setLoadingAvailability(false);
    }
  };

  const selectVideo = (file) => {
    if (!file) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setSourceVideo({
      name: file.name,
      size: file.size,
      type: file.type || "Local video",
      duration: null,
      objectUrl,
    });
  };

  const toggleLayer = (key) => {
    setSelectedLayers((current) => (
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key]
    ));
  };

  const chosenLayerNames = OVERLAY_LAYERS
    .filter((layer) => selectedLayers.includes(layer.key))
    .map((layer) => layer.label);

  return (
    <div>
      <PageHeader title="Production Renderer" subtitle="Prepare a telemetry-overlay video export from a local source recording" />
      <div className="space-y-4 px-4 pb-8">
        <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">Source video stays local to this browser session.</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                This production workspace currently prepares an overlay layout only. It does not upload source video, save local paths, or render an output file yet.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)_23rem]">
          <aside className="space-y-4">
            <section className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <Film className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Production Source</p>
              </div>
              {loadingSessions ? (
                <p className="text-sm text-muted-foreground">Loading sessions...</p>
              ) : (
                <Select value={selectedSessionId} onValueChange={selectSession}>
                  <SelectTrigger><SelectValue placeholder="Choose a session..." /></SelectTrigger>
                  <SelectContent>
                    {sessions.map((session) => (
                      <SelectItem key={session.id} value={session.id}>{sessionLabel(session)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Upload className="h-4 w-4" />
                {sourceVideo ? "Change source video" : "Select local source video"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(event) => {
                  selectVideo(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              {sourceVideo && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/15 p-3 text-xs">
                  <p className="truncate font-medium text-foreground" title={sourceVideo.name}>{sourceVideo.name}</p>
                  <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                    <span>Size</span><span className="text-right font-mono text-foreground">{formatBytes(sourceVideo.size)}</span>
                    <span>Duration</span><span className="text-right font-mono text-foreground">{formatDuration(sourceVideo.duration)}</span>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Template</p>
              </div>
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {TEMPLATES.find((item) => item.value === template)?.description}
              </p>
            </section>
          </aside>

          <main className="space-y-4">
            <section className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Preview Workspace</p>
                <span className="rounded-full border border-border bg-muted/20 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Local preview
                </span>
              </div>
              {sourceVideo ? (
                <div className="relative overflow-hidden rounded-lg border border-border bg-black">
                  <video
                    src={sourceVideo.objectUrl}
                    controls
                    playsInline
                    className="aspect-video max-h-[58vh] w-full object-contain"
                    onLoadedMetadata={(event) => setSourceVideo((current) => current
                      ? { ...current, duration: event.currentTarget.duration }
                      : current)}
                  />
                  <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-white/15 bg-black/60 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/75">
                    {TEMPLATES.find((item) => item.value === template)?.label}
                  </div>
                </div>
              ) : (
                <div className="flex aspect-video max-h-[58vh] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/10 text-center text-muted-foreground">
                  <Clapperboard className="h-8 w-8" />
                  <p className="text-sm font-medium">Select a local source video for preview</p>
                  <p className="text-xs">Finished rendering will be implemented in a later production pass.</p>
                </div>
              )}
              <div className="rounded-lg border border-border bg-muted/10 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Selected Overlay Layers</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {chosenLayerNames.map((label) => (
                    <span key={label} className="rounded-full border border-primary/25 bg-primary/[0.07] px-2 py-1 text-[10px] font-medium text-primary">{label}</span>
                  ))}
                  {chosenLayerNames.length === 0 && <span className="text-xs text-muted-foreground">No overlay layers selected.</span>}
                </div>
              </div>
            </section>
          </main>

          <aside className="space-y-4">
            <section className="space-y-3 rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Telemetry Layers</p>
              {!selectedSession && (
                <p className="rounded-lg border border-border bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
                  Select a session to see available telemetry layers.
                </p>
              )}
              {selectedSession && loadingAvailability && <p className="text-xs text-muted-foreground">Checking saved telemetry...</p>}
              <div className="space-y-1.5">
                {OVERLAY_LAYERS.map((layer) => {
                  const Icon = layer.icon;
                  const available = !!selectedSession && layer.availability(availability);
                  const active = selectedLayers.includes(layer.key);
                  return (
                    <label
                      key={layer.key}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                        available ? "border-border bg-muted/10 hover:border-primary/30" : "border-border/60 bg-muted/[0.05] text-muted-foreground/60"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" />
                        {layer.label}
                      </span>
                      <input
                        type="checkbox"
                        checked={active}
                        disabled={!available}
                        onChange={() => toggleLayer(layer.key)}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                    </label>
                  );
                })}
              </div>
              {selectedSession && (
                <div className="space-y-1 rounded-lg bg-muted/15 px-3 py-2 text-[10px] text-muted-foreground">
                  <p>HR telemetry: {availability.hasHr ? "Available" : "Not available"}</p>
                  <p>Event notes: {availability.hasEvents ? "Available" : "Not available"}</p>
                  <p>Phase markers: {availability.hasPhaseMarkers ? "Available" : "Not available"}</p>
                  <p>Saved motion: {availability.hasMotion ? "Available" : "Not available"}</p>
                </div>
              )}
            </section>

            <section className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Render</p>
              <button
                type="button"
                disabled
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground opacity-45"
              >
                <Clapperboard className="h-4 w-4" />
                Render Production Video
              </button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Rendering backend not implemented yet. A later PR will connect an FFmpeg render job and output progress.
              </p>
              <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                Future render progress will appear here.
              </div>
            </section>

            <section className="space-y-2 rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Previous Outputs</p>
              <p className="rounded-lg bg-muted/15 px-3 py-4 text-center text-xs text-muted-foreground">
                Rendered production outputs will appear here in a future release.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
