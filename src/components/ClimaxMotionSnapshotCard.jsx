import { Activity, Gauge, Scale } from "lucide-react";
import { summarizeMotionAroundClimax } from "@/lib/motionInsights";

function formatTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function metric(value, suffix = "") {
  return value == null ? "--" : `${Math.round(value)}${suffix}`;
}

function sideLabel(snapshot) {
  if (snapshot.sidePattern === "left") return "Left higher";
  if (snapshot.sidePattern === "right") return "Right higher";
  return "Broadly similar";
}

function Item({ label, value, tone = "text-foreground" }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-lg font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

export default function ClimaxMotionSnapshotCard({ session, compact = false }) {
  const snapshot = summarizeMotionAroundClimax(session);
  if (!snapshot) return null;

  return (
    <div className={`rounded-xl border border-violet-500/20 bg-violet-500/[0.04] ${compact ? "p-3" : "p-4"} space-y-3`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-300">
            <Activity className="h-4 w-4" />
            Motion At Marked Climax
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Motion-derived view from {formatTime(snapshot.windowStartS)} to {formatTime(snapshot.windowEndS)} (30 seconds before and after the marked climax).
          </p>
        </div>
        <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
          Observational only
        </span>
      </div>

      <div className={`grid gap-2 grid-cols-2 ${compact ? "" : "md:grid-cols-4 xl:grid-cols-7"}`}>
        <Item label="Left Body Avg" value={metric(snapshot.leftAverage)} tone="text-cyan-300" />
        <Item label="Right Body Avg" value={metric(snapshot.rightAverage)} tone="text-amber-300" />
        <Item label="Side Balance" value={sideLabel(snapshot)} />
        <Item label="Hands Avg" value={metric(snapshot.handAverage)} tone="text-violet-300" />
        <Item label="Hands Max" value={metric(snapshot.handMaximum)} tone="text-violet-300" />
        <Item label="Cadence Avg" value={metric(snapshot.cadenceAverage, "/min")} tone="text-violet-300" />
        <Item label="Cadence Max" value={metric(snapshot.cadenceMaximum, "/min")} tone="text-violet-300" />
      </div>

      <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" />
        Hand cadence is a visible rhythmic-movement proxy, not confirmed stroke technique, force, or physiological cause.
        <Scale className="sr-only" />
      </p>
    </div>
  );
}
