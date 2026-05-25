import { useMemo } from "react";
import { Clapperboard, Crosshair, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import HRTimelineChart from "./HRTimelineChart";
import EMGTimelineChart from "./EMGTimelineChart";
import SavedMotionSummaryCard from "./SavedMotionSummaryCard";
import ClimaxMotionSnapshotCard from "./ClimaxMotionSnapshotCard";

function formatTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function nearest(rows, time, key) {
  if (!rows?.length || !Number.isFinite(Number(time))) return null;
  return rows.reduce((closest, row) => (
    Math.abs(Number(row[key]) - Number(time)) < Math.abs(Number(closest[key]) - Number(time)) ? row : closest
  ), rows[0]);
}

function Metric({ label, value, tone = "text-foreground" }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-sm font-semibold ${tone}`}>{value ?? "--"}</p>
    </div>
  );
}

export default function SessionTelemetryDashboard({
  session,
  timelineRows = [],
  emgRows = [],
  nearClimaxEvents = [],
  highlightRange,
  selectedEventIndex,
  onSelectEventIndex,
  inspectionTime,
  onInspectionTimeChange,
  onMarkersChange,
  onOpenReview,
}) {
  const events = session.event_timeline || [];
  const hrPoint = useMemo(() => nearest(timelineRows, inspectionTime, "time_offset_s"), [inspectionTime, timelineRows]);
  const motionPoint = useMemo(
    () => nearest(session.motion_analysis_summary?.derived_timeline || [], inspectionTime, "time_s"),
    [inspectionTime, session.motion_analysis_summary],
  );
  const cadencePoint = useMemo(
    () => nearest(session.motion_analysis_summary?.hand_cadence_timeline || [], inspectionTime, "time_s"),
    [inspectionTime, session.motion_analysis_summary],
  );
  const nearestEvent = useMemo(() => nearest(events, inspectionTime, "time_s"), [events, inspectionTime]);
  const baseline = Number(hrPoint?.baseline_hr);
  const currentHR = Number(hrPoint?.hr);
  const balanceTotal = Number(motionPoint?.left_lower_body_activity || 0) + Number(motionPoint?.right_lower_body_activity || 0);
  const balance = balanceTotal > 0
    ? (Number(motionPoint?.left_lower_body_activity || 0) - Number(motionPoint?.right_lower_body_activity || 0)) / balanceTotal
    : null;
  const balanceText = balance == null || Math.abs(balance) <= 0.1 ? "Similar" : `${balance > 0 ? "Left" : "Right"} higher`;
  const durationS = timelineRows.length
    ? Math.max(...timelineRows.map((row) => Number(row.time_offset_s) || 0))
    : Number(session.duration_minutes || 0) * 60;

  return (
    <section id="session-telemetry" className="scroll-mt-24 rounded-2xl border border-primary/20 bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <HeartPulse className="h-4 w-4" />
            Unified Evidence Dashboard
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Heart rate, saved motion, cadence, EMG, and events on one inspection cursor.
          </p>
        </div>
        {onOpenReview && (
          <Button type="button" variant="outline" size="sm" onClick={onOpenReview} className="gap-1.5">
            <Clapperboard className="h-3.5 w-3.5" />
            Review against video
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-muted/10 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-rose-400" />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inspector</p>
          <span className="ml-auto font-mono text-lg font-bold text-rose-400">{formatTime(inspectionTime)}</span>
        </div>
        {durationS > 0 && (
          <input
            type="range"
            min={0}
            max={durationS}
            step={1}
            value={Math.min(durationS, Math.max(0, Number(inspectionTime) || 0))}
            onChange={(event) => onInspectionTimeChange(Number(event.target.value))}
            className="w-full accent-rose-400"
            aria-label="Inspect session timestamp"
          />
        )}
        <div className="grid gap-2 grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
          <Metric label="HR" value={Number.isFinite(currentHR) ? `${Math.round(currentHR)} bpm` : "--"} tone="text-rose-400" />
          <Metric label="Smoothed" value={Number.isFinite(Number(hrPoint?.hr_smoothed)) ? `${Math.round(Number(hrPoint.hr_smoothed))} bpm` : "--"} />
          <Metric label="Baseline Delta" value={Number.isFinite(currentHR) && Number.isFinite(baseline) ? `${currentHR - baseline >= 0 ? "+" : ""}${Math.round(currentHR - baseline)}` : "--"} />
          <Metric label="Left Lower Body" value={motionPoint?.left_lower_body_activity ?? "--"} tone="text-primary" />
          <Metric label="Right Lower Body" value={motionPoint?.right_lower_body_activity ?? "--"} tone="text-amber-400" />
          <Metric label="Hands" value={motionPoint?.hand_activity ?? "--"} tone="text-violet-400" />
          <Metric label="Cadence" value={cadencePoint?.movement_cycles_per_minute_estimate != null ? `${cadencePoint.movement_cycles_per_minute_estimate}/min` : "--"} tone="text-violet-400" />
          <Metric label="Balance" value={balanceText} />
        </div>
        {nearestEvent && (
          <button
            type="button"
            onClick={() => onSelectEventIndex?.(events.indexOf(nearestEvent))}
            className="w-full rounded-lg border border-border bg-card/70 px-3 py-2 text-left text-sm hover:border-primary/40"
          >
            <span className="mr-2 font-mono text-xs font-semibold text-primary">{formatTime(nearestEvent.time_s)}</span>
            <span className="text-muted-foreground">Nearest event: </span>
            <span className="text-foreground">{nearestEvent.note || "Untitled event"}</span>
          </button>
        )}
      </div>

      <ClimaxMotionSnapshotCard session={session} />

      {timelineRows.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Heart Rate And Phase Markers</p>
          <HRTimelineChart
            rows={timelineRows}
            savedMarkers={{
              pre_climax_offset_s: session.pre_climax_offset_s,
              climax_offset_s: session.climax_offset_s,
              recovery_offset_s: session.recovery_offset_s,
            }}
            onMarkersChange={onMarkersChange}
            highlightRange={highlightRange}
            noClimax={!!session.no_climax}
            nearClimaxEvents={nearClimaxEvents}
            events={events}
            selectedEventIndex={selectedEventIndex}
            onSelectEventIndex={onSelectEventIndex}
            initialWindow="full"
            inspectionTime={inspectionTime}
            onInspectionTimeChange={onInspectionTimeChange}
          />
        </div>
      )}

      {session.motion_analysis_summary && (
        <SavedMotionSummaryCard
          summary={session.motion_analysis_summary}
          playbackTime={inspectionTime}
          onSeek={onInspectionTimeChange}
          chartOnly
          interactionLabel="Saved movement and cadence traces aligned to this session; click to move the inspection cursor."
        />
      )}

      {emgRows.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">EMG Correlation</p>
          <EMGTimelineChart
            rows={emgRows}
            channelMode={session.emg_channels || "single"}
            events={events}
            savedMarkers={{
              pre_climax_offset_s: session.pre_climax_offset_s,
              climax_offset_s: session.climax_offset_s,
              recovery_offset_s: session.recovery_offset_s,
            }}
            timelineRows={timelineRows}
            inspectionTime={inspectionTime}
            onInspectionTimeChange={onInspectionTimeChange}
          />
        </div>
      )}
    </section>
  );
}
