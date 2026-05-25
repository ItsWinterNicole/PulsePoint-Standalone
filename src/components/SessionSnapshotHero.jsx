import { Activity, Clock, Gauge, HeartPulse, ListChecks, Scale, Timer } from "lucide-react";

function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds))) return "--";
  const rounded = Math.max(0, Math.round(Number(seconds)));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function categories(event) {
  return Array.isArray(event?.category) ? event.category : [event?.category].filter(Boolean);
}

function pauseTiming(events, durationS) {
  let pausedAt = null;
  let pausedS = 0;
  [...events].sort((a, b) => Number(a.time_s) - Number(b.time_s)).forEach((event) => {
    const values = categories(event);
    if ((values.includes("stimulation_paused") || values.includes("motion_pause")) && pausedAt == null) {
      pausedAt = Number(event.time_s);
    }
    if ((values.includes("stimulation_resumed") || values.includes("motion_resume")) && pausedAt != null) {
      pausedS += Math.max(0, Number(event.time_s) - pausedAt);
      pausedAt = null;
    }
  });
  return {
    pausedS,
    activeS: Number.isFinite(durationS) ? Math.max(0, durationS - pausedS) : null,
  };
}

function qualityLabel(summary) {
  const indicators = Object.values(summary?.quality_indicators || {});
  if (!indicators.length) return "--";
  if (indicators.includes("weak") || indicators.includes("limited")) return "Weak";
  if (indicators.includes("moderate")) return "Moderate";
  return "Strong";
}

function biasLabel(summary) {
  const balance = summary?.asymmetry_summary;
  if (!balance || balance.predominantSide === "balanced" || Number(balance.predominantPct) < 55) return "No clear lead";
  return `${balance.predominantSide === "left" ? "Left" : "Right"} ${balance.predominantPct}%`;
}

function SnapshotMetric({ icon: Icon, label, value, tone = "text-foreground" }) {
  return (
    <div className="rounded-xl border border-border bg-card/70 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`mt-2 font-mono text-xl font-bold ${tone}`}>{value ?? "--"}</p>
    </div>
  );
}

export default function SessionSnapshotHero({ session, timelineRows = [], motionSummary }) {
  const durationS = Number.isFinite(Number(session.duration_minutes)) ? Number(session.duration_minutes) * 60 : null;
  const events = session.event_timeline || [];
  const timing = pauseTiming(events, durationS);
  const hrs = timelineRows.map((row) => Number(row.hr)).filter(Number.isFinite);
  const peakHR = session.max_hr || (hrs.length ? Math.round(Math.max(...hrs)) : null);
  const avgHR = session.avg_hr || (hrs.length ? Math.round(hrs.reduce((sum, hr) => sum + hr, 0) / hrs.length) : null);
  const cadence = motionSummary?.hand_movement_summary?.movement_cycles_per_minute_estimate;

  return (
    <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-card p-4 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Session Snapshot</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">What happened at a glance</h2>
        </div>
        <p className="text-xs text-muted-foreground">Primary review metrics and saved observational motion evidence</p>
      </div>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        <SnapshotMetric icon={Gauge} label={session.no_climax ? "Peak Arousal" : "Intensity"} value={session.intensity != null ? `${session.intensity}/10` : "--"} tone="text-primary" />
        <SnapshotMetric icon={Activity} label="Build" value={session.build_quality != null ? `${session.build_quality}/10` : "--"} />
        <SnapshotMetric icon={Clock} label="Duration" value={durationS != null ? formatDuration(durationS) : "--"} />
        <SnapshotMetric icon={HeartPulse} label="Peak HR" value={peakHR != null ? `${peakHR} bpm` : "--"} tone="text-rose-400" />
        <SnapshotMetric icon={HeartPulse} label="Avg HR" value={avgHR != null ? `${avgHR} bpm` : "--"} />
        <SnapshotMetric icon={ListChecks} label="Events" value={events.length} />
        <SnapshotMetric icon={Timer} label="Active Time" value={timing.activeS != null ? formatDuration(timing.activeS) : "--"} />
        <SnapshotMetric icon={Timer} label="Pause Time" value={timing.pausedS ? formatDuration(timing.pausedS) : "--"} />
        <SnapshotMetric icon={Activity} label="Motion Confidence" value={qualityLabel(motionSummary)} tone="text-emerald-400" />
        <SnapshotMetric icon={Activity} label="Cadence Proxy" value={cadence != null ? `${cadence}/min` : "--"} tone="text-violet-400" />
        <SnapshotMetric icon={Scale} label="Side Bias" value={biasLabel(motionSummary)} />
        <SnapshotMetric icon={HeartPulse} label="HR At Climax" value={session.hr_at_climax != null ? `${session.hr_at_climax} bpm` : "--"} />
      </div>
    </section>
  );
}
