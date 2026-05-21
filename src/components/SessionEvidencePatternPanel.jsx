import { Activity, BookOpen, Brain, CheckCircle2, HeartPulse, Route, Sparkles, Video } from "lucide-react";

function fmtMmSs(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const total = Math.max(0, Math.round(Number(value)));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function pct(value, max) {
  if (!max) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

function getHRValue(row) {
  const value = Number(row?.hr_smoothed ?? row?.hr);
  return Number.isFinite(value) ? value : null;
}

function numericFrom(value) {
  const match = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
  const parsed = match ? Number(match[0]) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function evidenceLevel(score) {
  if (score >= 75) return { label: "Strong", tone: "text-primary", bg: "bg-primary/10" };
  if (score >= 45) return { label: "Moderate", tone: "text-chart-4", bg: "bg-chart-4/10" };
  return { label: "Light", tone: "text-muted-foreground", bg: "bg-muted" };
}

function EvidencePill({ icon, label, value, active }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${active ? "bg-primary/10 text-primary" : "bg-muted/60 text-muted-foreground"}`}>
      {icon}
      <div>
        <p className="text-[10px] uppercase tracking-wider font-semibold">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

export default function SessionEvidencePatternPanel({ session, timelineRows = [], userProfile, sessionJournal }) {
  const events = (session.event_timeline || []).filter((event) => String(event?.note || "").trim());
  const hrValues = timelineRows.map(getHRValue).filter((value) => value != null);
  const durationS = Math.max(
    Number(session.duration_minutes || 0) * 60,
    ...timelineRows.map((row) => Number(row.time_offset_s) || 0),
    ...events.map((event) => Number(event.time_s) || 0),
    0
  );
  const hasJournal = Boolean(sessionJournal?.experience_narrative || sessionJournal?.physiological_observations || sessionJournal?.insights);
  const hasMarkers = session.pre_climax_offset_s != null || session.climax_offset_s != null || session.recovery_offset_s != null;
  const hasVideo = Boolean(session.video_url || session.video_file_url || session.video_filename || session.video_path);
  const evidenceScore = Math.round(
    pct(hrValues.length, 80) * 0.32 +
    pct(events.length, 12) * 0.32 +
    (hasMarkers ? 16 : 0) +
    (hasJournal ? 12 : 0) +
    (hasVideo ? 8 : 0)
  );
  const level = evidenceLevel(evidenceScore);
  const hrMin = hrValues.length ? Math.round(Math.min(...hrValues)) : null;
  const hrMax = hrValues.length ? Math.round(Math.max(...hrValues)) : null;
  const buildDuration = session.pre_climax_offset_s != null && session.climax_offset_s != null
    ? Math.max(0, Math.round(session.climax_offset_s - session.pre_climax_offset_s))
    : null;
  const recoveryDelay = session.recovery_offset_s != null && session.climax_offset_s != null
    ? Math.max(0, Math.round(session.recovery_offset_s - session.climax_offset_s))
    : null;

  const matchedMethods = (session.methods || [])
    .filter((method) => {
      const preferred = userProfile?.preferred_stimulation;
      const preferredText = Array.isArray(preferred) ? preferred.join(" ") : String(preferred || "");
      return preferredText.toLowerCase().includes(String(method).toLowerCase());
    })
    .slice(0, 3);

  const restingHr = numericFrom(userProfile?.resting_hr);
  const avgHr = numericFrom(session.avg_hr);
  const patternNotes = [
    userProfile?.arousal_response_style ? `Profile style: ${userProfile.arousal_response_style}` : null,
    matchedMethods.length ? `Preferred method match: ${matchedMethods.join(", ")}` : null,
    userProfile?.typical_build_duration && buildDuration != null ? `Build window: ${fmtMmSs(buildDuration)} versus profile note "${userProfile.typical_build_duration}"` : null,
    restingHr != null && avgHr != null ? `Average HR was ${Math.round(avgHr - restingHr)} bpm above saved resting HR` : null,
    recoveryDelay != null ? `Recovery onset is marked ${fmtMmSs(recoveryDelay)} after climax` : null,
  ].filter(Boolean);

  const storyline = [
    hrValues.length ? { label: "Baseline and HR range", value: `${hrMin}–${hrMax} bpm`, time: "HR" } : null,
    events[0] ? { label: "First logged event", value: events[0].note, time: fmtMmSs(events[0].time_s) } : null,
    session.pre_climax_offset_s != null ? { label: "Pre-climax marker", value: "Final approach marker available", time: fmtMmSs(session.pre_climax_offset_s) } : null,
    session.climax_offset_s != null ? { label: "Climax marker", value: "Release/climax anchor available", time: fmtMmSs(session.climax_offset_s) } : null,
    session.recovery_offset_s != null ? { label: "Recovery marker", value: "Post-climax transition marker available", time: fmtMmSs(session.recovery_offset_s) } : null,
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" /> Evidence & Pattern Memory
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            A quick read on how much context this session gives the analysis engine.
          </p>
        </div>
        <div className={`rounded-lg px-3 py-2 text-right ${level.bg}`}>
          <p className={`text-[10px] uppercase tracking-wider font-semibold ${level.tone}`}>Evidence Strength</p>
          <p className="text-xl font-bold text-foreground">{level.label} <span className="text-sm text-muted-foreground">{evidenceScore}%</span></p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <EvidencePill icon={<HeartPulse className="w-4 h-4" />} label="HR Data" value={hrValues.length ? `${hrValues.length} points` : "None"} active={hrValues.length > 0} />
        <EvidencePill icon={<Route className="w-4 h-4" />} label="Events" value={`${events.length} notes`} active={events.length > 0} />
        <EvidencePill icon={<Activity className="w-4 h-4" />} label="Markers" value={hasMarkers ? "Present" : "Missing"} active={hasMarkers} />
        <EvidencePill icon={<BookOpen className="w-4 h-4" />} label="Journal" value={hasJournal ? "Linked" : "None"} active={hasJournal} />
        <EvidencePill icon={<Video className="w-4 h-4" />} label="Video" value={hasVideo ? "Available" : "Not linked"} active={hasVideo} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Storyline Anchors</p>
          <div className="space-y-2">
            {storyline.length ? storyline.map((item, index) => (
              <div key={`${item.label}-${index}`} className="grid grid-cols-[52px_1fr] gap-2 text-sm">
                <span className="font-mono text-primary">{item.time}</span>
                <span className="text-foreground/85">
                  <span className="font-medium text-foreground">{item.label}:</span> {String(item.value).slice(0, 180)}
                </span>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">Add HR data, event notes, or markers to build a clearer storyline.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5" /> Personal Pattern Hooks
          </p>
          {patternNotes.length ? (
            <ul className="space-y-2">
              {patternNotes.map((note, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-foreground/85">
                  <CheckCircle2 className="mt-0.5 w-3.5 h-3.5 shrink-0 text-primary" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Add profile details or phase markers to make cross-session pattern matching more specific.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
