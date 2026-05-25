import { useMemo } from "react";
import { Activity, Crosshair } from "lucide-react";
import SideBalanceGauge from "./SideBalanceGauge";

function nearest(rows, timeS) {
  if (!Array.isArray(rows) || !rows.length || !Number.isFinite(Number(timeS))) return null;
  return rows.reduce((closest, row) => (
    Math.abs(Number(row.time_s) - Number(timeS)) < Math.abs(Number(closest.time_s) - Number(timeS))
      ? row
      : closest
  ), rows[0]);
}

function formatTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function Readout({ label, value, tone = "text-foreground", overlay = false }) {
  return (
    <div className={`rounded-lg border p-2.5 ${overlay ? "border-white/10 bg-black/35" : "border-border bg-muted/20"}`}>
      <p className={`text-[9px] font-semibold uppercase tracking-wider ${overlay ? "text-white/65" : "text-muted-foreground"}`}>{label}</p>
      <p className={`mt-1 font-mono text-base font-bold ${tone}`}>{value ?? "--"}</p>
    </div>
  );
}

export default function MotionPlaybackReadout({ summary, playbackTime, currentHR, overlay = false }) {
  const motion = useMemo(
    () => nearest(summary?.derived_timeline, playbackTime),
    [playbackTime, summary?.derived_timeline],
  );
  const cadence = useMemo(
    () => nearest(summary?.hand_cadence_timeline, playbackTime),
    [playbackTime, summary?.hand_cadence_timeline],
  );
  if (!summary) return null;

  const left = Number(motion?.left_lower_body_activity);
  const right = Number(motion?.right_lower_body_activity);
  const total = (Number.isFinite(left) ? left : 0) + (Number.isFinite(right) ? right : 0);
  const index = total > 0 ? ((left || 0) - (right || 0)) / total : null;
  const balance = index == null || Math.abs(index) <= 0.1
    ? "Similar"
    : `${index > 0 ? "Left" : "Right"} higher`;

  return (
    <div className={`space-y-2 rounded-lg border p-3 ${overlay ? "border-white/15 bg-black/65 shadow-xl backdrop-blur-sm" : "border-primary/20 bg-primary/[0.04]"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider ${overlay ? "text-cyan-300" : "text-primary"}`}>
          <Activity className="h-3.5 w-3.5" />
          Current Motion Telemetry
        </p>
        <span className="flex items-center gap-1 font-mono text-xs font-semibold text-rose-400">
          <Crosshair className="h-3 w-3" />
          {formatTime(playbackTime)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {currentHR != null && <Readout label="Heart Rate" value={`${currentHR} bpm`} tone="text-rose-400" overlay={overlay} />}
        <Readout label="Balance" value={balance} tone={overlay ? "text-white" : "text-foreground"} overlay={overlay} />
        <Readout label="Left Foot / Leg" value={motion?.left_lower_body_activity ?? "--"} tone="text-cyan-300" overlay={overlay} />
        <Readout label="Right Foot / Leg" value={motion?.right_lower_body_activity ?? "--"} tone="text-amber-300" overlay={overlay} />
        <Readout label="Hands" value={motion?.hand_activity ?? "--"} tone="text-violet-300" overlay={overlay} />
        <Readout
          label="Cadence Proxy"
          value={cadence?.movement_cycles_per_minute_estimate != null ? `${cadence.movement_cycles_per_minute_estimate}/min` : "--"}
          tone="text-violet-300"
          overlay={overlay}
        />
      </div>
      {overlay && (
        <SideBalanceGauge
          left={motion?.left_lower_body_activity}
          right={motion?.right_lower_body_activity}
          title="Side Balance Now"
        />
      )}
      <p className={`text-[10px] leading-relaxed ${overlay ? "text-white/60" : "text-muted-foreground"}`}>
        Motion-derived playback values; cadence is a visible rhythm proxy, not confirmed technique or force.
      </p>
    </div>
  );
}
