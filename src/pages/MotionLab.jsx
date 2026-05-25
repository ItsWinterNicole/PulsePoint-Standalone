import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, ListPlus, Maximize2, Minimize2, Play, ShieldCheck, Trash2, Video } from "lucide-react";
import moment from "moment";
import { base44 } from "@/api/base44Client";
import PageHeader from "../components/PageHeader";
import LocalMotionAnalysisPanel from "../components/LocalMotionAnalysisPanel";
import SavedMotionSummaryCard from "../components/SavedMotionSummaryCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getMotionEvidenceSummary } from "@/utils/sessionMotionEvidence";

const FEED_ROLES = [
  { value: "composite", label: "Composite / Picture-in-Picture" },
  { value: "lower_body", label: "Feet / Lower Body Camera" },
  { value: "main", label: "Main Focus Camera" },
  { value: "lateral", label: "Lateral Angle" },
];
const MOTION_LAB_PREVIEW_PREFERENCES_KEY = "pulsepoint.motionLab.previewPreferences.v1";
const DEFAULT_FLOATING_PREVIEW_WIDTH = 608;
const DEFAULT_FLOATING_PREVIEW_POSITION = { x: 16, y: 64 };

function clampFloatingPreviewWidth(value) {
  const viewportMax = typeof window === "undefined" ? DEFAULT_FLOATING_PREVIEW_WIDTH : Math.max(320, window.innerWidth - 32);
  const parsed = Number(value);
  return Math.min(viewportMax, Math.max(320, Number.isFinite(parsed) ? parsed : DEFAULT_FLOATING_PREVIEW_WIDTH));
}

function clampFloatingPreviewPosition(position, width = DEFAULT_FLOATING_PREVIEW_WIDTH, height = 220) {
  if (typeof window === "undefined") return DEFAULT_FLOATING_PREVIEW_POSITION;
  const x = Number(position?.x);
  const y = Number(position?.y);
  const maxX = Math.max(8, window.innerWidth - clampFloatingPreviewWidth(width) - 8);
  const maxY = Math.max(8, window.innerHeight - Math.max(100, Number(height) || 220) - 8);
  return {
    x: Math.min(maxX, Math.max(8, Number.isFinite(x) ? x : DEFAULT_FLOATING_PREVIEW_POSITION.x)),
    y: Math.min(maxY, Math.max(8, Number.isFinite(y) ? y : DEFAULT_FLOATING_PREVIEW_POSITION.y)),
  };
}

function readPreviewPreferences() {
  if (typeof window === "undefined") {
    return { floating: false, width: DEFAULT_FLOATING_PREVIEW_WIDTH, position: DEFAULT_FLOATING_PREVIEW_POSITION };
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MOTION_LAB_PREVIEW_PREFERENCES_KEY) || "{}");
    const width = clampFloatingPreviewWidth(parsed.width);
    return {
      floating: parsed.floating === true,
      width,
      position: clampFloatingPreviewPosition(parsed.position, width),
    };
  } catch {
    return { floating: false, width: DEFAULT_FLOATING_PREVIEW_WIDTH, position: DEFAULT_FLOATING_PREVIEW_POSITION };
  }
}

function labelForSession(session) {
  return `${moment(session.date).format("MMM D, YYYY")}${session.start_time ? ` · ${session.start_time}` : ""}${session.duration_minutes ? ` · ${session.duration_minutes}m` : ""}`;
}

export default function MotionLab() {
  const [searchParams] = useSearchParams();
  const requestedSessionId = searchParams.get("session") || "";
  const videoRef = useRef(null);
  const videoUrlRef = useRef(null);
  const fileInputRef = useRef(null);
  const previewRef = useRef(null);
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedSession, setSelectedSession] = useState(null);
  const [videoSrc, setVideoSrc] = useState("");
  const [videoName, setVideoName] = useState("");
  const [videoFile, setVideoFile] = useState(null);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [feedRole, setFeedRole] = useState("composite");
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewFloating, setPreviewFloating] = useState(() => readPreviewPreferences().floating);
  const [floatingPreviewWidth, setFloatingPreviewWidth] = useState(() => readPreviewPreferences().width);
  const [floatingPreviewPosition, setFloatingPreviewPosition] = useState(() => readPreviewPreferences().position);

  useEffect(() => {
    try {
      window.localStorage.setItem(MOTION_LAB_PREVIEW_PREFERENCES_KEY, JSON.stringify({
        floating: previewFloating,
        width: clampFloatingPreviewWidth(floatingPreviewWidth),
        position: floatingPreviewPosition,
      }));
    } catch {
      // UI preferences are optional; storage restrictions should not block analysis.
    }
  }, [floatingPreviewPosition, floatingPreviewWidth, previewFloating]);

  useEffect(() => {
    const clampAfterResize = () => {
      setFloatingPreviewWidth((current) => clampFloatingPreviewWidth(current));
      setFloatingPreviewPosition((current) => clampFloatingPreviewPosition(
        current,
        floatingPreviewWidth,
        previewRef.current?.getBoundingClientRect().height,
      ));
    };
    window.addEventListener("resize", clampAfterResize);
    return () => window.removeEventListener("resize", clampAfterResize);
  }, [floatingPreviewWidth]);

  useEffect(() => {
    if (!previewFloating) return;
    setFloatingPreviewPosition((current) => clampFloatingPreviewPosition(
      current,
      floatingPreviewWidth,
      previewRef.current?.getBoundingClientRect().height,
    ));
  }, [floatingPreviewWidth, previewFloating]);

  useEffect(() => {
    base44.entities.Session.list("-date", 300)
      .then((rows) => {
        setSessions(rows);
        if (requestedSessionId && rows.some((session) => session.id === requestedSessionId)) {
          setSelectedId(requestedSessionId);
          setSelectedSession(rows.find((session) => session.id === requestedSessionId));
        }
      })
      .finally(() => setLoading(false));
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    };
  }, [requestedSessionId]);

  const selectSession = (id) => {
    setSelectedId(id);
    setSelectedSession(sessions.find((session) => session.id === id) || null);
  };

  const loadVideo = useCallback((file) => {
    if (!file) return;
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    const source = URL.createObjectURL(file);
    videoUrlRef.current = source;
    setVideoFile(file);
    setVideoSrc(source);
    setVideoName(file.name);
    setVideoTime(0);
    setVideoDuration(0);
  }, []);

  const addToQueue = () => {
    if (!selectedSession || !videoFile) return;
    setQueue((existing) => [...existing, {
      id: `${Date.now()}-${existing.length}`,
      sessionId: selectedSession.id,
      sessionLabel: labelForSession(selectedSession),
      feedRole,
      videoFile,
      videoName,
      status: "Ready",
    }]);
  };

  const activateQueueItem = (item) => {
    selectSession(item.sessionId);
    setFeedRole(item.feedRole);
    loadVideo(item.videoFile);
  };

  const updateSessionEverywhere = (nextSession) => {
    setSelectedSession(nextSession);
    setSessions((current) => current.map((session) => session.id === nextSession.id ? { ...session, ...nextSession } : session));
  };

  const saveSummary = async (summary, finalizedMotionEvents = []) => {
    if (!selectedSession?.id) throw new Error("Choose a target session before saving derived motion evidence.");
    const nonMotionEvents = (selectedSession.event_timeline || []).filter((event) => event.source !== "motion_derived");
    const eventTimeline = [...nonMotionEvents, ...(Array.isArray(finalizedMotionEvents) ? finalizedMotionEvents : [])]
      .sort((a, b) => Number(a.time_s) - Number(b.time_s));
    const updated = await base44.entities.Session.update(selectedSession.id, {
      motion_analysis_summary: summary,
      event_timeline: eventTimeline,
    });
    updateSessionEverywhere({ ...updated, motion_analysis_summary: summary, event_timeline: eventTimeline });
    setQueue((current) => current.map((item) => item.sessionId === selectedSession.id && item.videoName === videoName
      ? { ...item, status: "Completed" }
      : item));
  };

  const acceptSuggestions = async (suggestedEvents) => {
    if (!selectedSession?.id) throw new Error("Choose a target session before promoting observations.");
    const existing = selectedSession.event_timeline || [];
    const additions = (Array.isArray(suggestedEvents) ? suggestedEvents : []).filter((candidate) => (
      !existing.some((event) => (
        event.source === "motion_derived"
        && event.motion_evidence?.suggestion_type === candidate.motion_evidence?.suggestion_type
        && Math.abs(Number(event.time_s) - Number(candidate.time_s)) <= 0.75
      ))
    ));
    if (!additions.length) return selectedSession;
    const eventTimeline = [...existing, ...additions].sort((a, b) => Number(a.time_s) - Number(b.time_s));
    const updated = await base44.entities.Session.update(selectedSession.id, { event_timeline: eventTimeline });
    const nextSession = { ...updated, event_timeline: eventTimeline };
    updateSessionEverywhere(nextSession);
    return nextSession;
  };

  const seek = (timeS) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Number(timeS) || 0;
    setVideoTime(Number(timeS) || 0);
  };

  const beginFloatingResize = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startWidth = floatingPreviewWidth;
    const onPointerMove = (moveEvent) => {
      const nextWidth = clampFloatingPreviewWidth(startWidth + moveEvent.clientX - startX);
      setFloatingPreviewWidth(nextWidth);
      setFloatingPreviewPosition((current) => clampFloatingPreviewPosition(
        current,
        nextWidth,
        previewRef.current?.getBoundingClientRect().height,
      ));
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const beginFloatingDrag = (event) => {
    if (!previewFloating) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const startPosition = floatingPreviewPosition;
    const onPointerMove = (moveEvent) => {
      setFloatingPreviewPosition(clampFloatingPreviewPosition({
        x: startPosition.x + moveEvent.clientX - startX,
        y: startPosition.y + moveEvent.clientY - startY,
      }, floatingPreviewWidth, previewRef.current?.getBoundingClientRect().height));
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const evidence = getMotionEvidenceSummary(selectedSession);

  return (
    <div>
      <PageHeader title="Motion Lab" subtitle="Local-only motion detection, configuration, and derived evidence saving" />
      <div className="space-y-4 px-4 pb-8">
        <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">Videos stay local to this browser session.</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Motion Lab saves only derived telemetry, review summaries, and explicitly promoted observations. Raw video, local file paths, frames, and MediaPipe landmarks are not persisted.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[21rem_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Analysis Target</p>
              {loading ? <p className="text-sm text-muted-foreground">Loading sessions...</p> : (
                <Select value={selectedId} onValueChange={selectSession}>
                  <SelectTrigger><SelectValue placeholder="Choose a session..." /></SelectTrigger>
                  <SelectContent>
                    {sessions.map((session) => <SelectItem key={session.id} value={session.id}>{labelForSession(session)}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Select value={feedRole} onValueChange={setFeedRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FEED_ROLES.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm font-medium hover:border-primary/40 hover:text-primary">
                <Video className="h-4 w-4" />
                {videoSrc ? "Change local video" : "Load local video"}
              </button>
              <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={(event) => { loadVideo(event.target.files?.[0]); event.target.value = ""; }} />
              {videoName && <p className="truncate text-xs text-muted-foreground">{videoName}</p>}
              <button type="button" disabled={!selectedSession || !videoFile} onClick={addToQueue} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-40">
                <ListPlus className="h-3.5 w-3.5" /> Stage in processing queue
              </button>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Processing Queue</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Queue items retain local file access only while this page is open. Activate an item and run its configured analysis in the workspace to save the result.
              </p>
              {queue.length === 0 ? <p className="rounded-lg bg-muted/20 p-3 text-xs text-muted-foreground">No videos staged yet.</p> : queue.map((item) => (
                <div key={item.id} className="rounded-lg border border-border bg-muted/10 p-2.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{item.videoName}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{item.sessionLabel}</p>
                    </div>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${item.status === "Completed" ? "bg-emerald-400/10 text-emerald-300" : "bg-primary/10 text-primary"}`}>{item.status}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{FEED_ROLES.find((role) => role.value === item.feedRole)?.label}</p>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => activateQueueItem(item)} className="inline-flex items-center gap-1 rounded-md border border-primary/25 px-2 py-1 text-[10px] text-primary">
                      <Play className="h-3 w-3" /> Activate
                    </button>
                    <button type="button" onClick={() => setQueue((current) => current.filter((value) => value.id !== item.id))} className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section className="space-y-4">
            {videoSrc ? (
              <div
                ref={previewRef}
                className={`rounded-xl border border-border bg-card p-4 space-y-3 ${
                previewFloating
                  ? "fixed z-[60] min-w-[20rem] max-w-[calc(100vw-2rem)] border-primary/35 shadow-2xl"
                  : ""
                }`}
                style={previewFloating ? {
                  width: `min(${floatingPreviewWidth}px, calc(100vw - 2rem))`,
                  left: `${floatingPreviewPosition.x}px`,
                  top: `${floatingPreviewPosition.y}px`,
                } : undefined}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div
                    onPointerDown={beginFloatingDrag}
                    className={`${previewFloating ? "touch-none cursor-move select-none rounded-md border border-transparent px-1.5 py-1 hover:border-primary/20 hover:bg-primary/[0.05]" : ""}`}
                    title={previewFloating ? "Drag to move preview" : undefined}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">Local Processing Preview</p>
                    {previewFloating && <p className="text-[9px] text-muted-foreground">Drag to move</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewFloating((floating) => !floating)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/[0.06] px-2.5 py-1.5 text-xs font-medium text-primary hover:border-primary/45 hover:bg-primary/10"
                    >
                      {previewFloating ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                      {previewFloating ? "Dock preview" : "Float preview"}
                    </button>
                    {selectedSession && (
                      <Link to={`/review-player?session=${encodeURIComponent(selectedSession.id)}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                        Return to Review Player <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
                {previewFloating && (
                  <p className="text-[10px] text-muted-foreground">
                    Drag the header to move; drag the resize grip below to resize. Video seeking remains available in the player controls.
                  </p>
                )}
                <video
                  ref={videoRef}
                  src={videoSrc}
                  controls
                  playsInline
                  className={`${previewFloating ? "max-h-[42vh]" : "max-h-[60vh]"} w-full rounded-lg bg-black object-contain`}
                  onTimeUpdate={(event) => setVideoTime(event.currentTarget.currentTime)}
                  onPlay={() => setVideoPlaying(true)}
                  onPause={() => setVideoPlaying(false)}
                  onLoadedMetadata={(event) => {
                    setVideoDuration(event.currentTarget.duration || 0);
                    setFloatingPreviewPosition((current) => clampFloatingPreviewPosition(
                      current,
                      floatingPreviewWidth,
                      previewRef.current?.getBoundingClientRect().height,
                    ));
                  }}
                />
                {previewFloating && (
                  <button
                    type="button"
                    onPointerDown={beginFloatingResize}
                    className="ml-auto flex h-5 w-20 touch-none cursor-ew-resize items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-[9px] font-semibold uppercase tracking-wider text-primary hover:bg-primary/20"
                    aria-label="Drag to resize floating preview"
                    title="Drag horizontally to resize preview"
                  >
                    Resize
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
                Load a local video to configure and run derived motion analysis.
              </div>
            )}

            {selectedSession?.motion_analysis_summary && evidence.hasSavedTelemetry && (
              <SavedMotionSummaryCard summary={selectedSession.motion_analysis_summary} compact onSeek={videoSrc ? seek : undefined} playbackTime={videoTime} />
            )}

            <LocalMotionAnalysisPanel
              videoSrc={videoSrc}
              videoDuration={videoDuration}
              videoTime={videoTime}
              videoPlaying={videoPlaying}
              selectedSession={selectedSession}
              onSeek={seek}
              onSaveSummary={saveSummary}
              onAcceptSuggestions={acceptSuggestions}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
