import moment from "moment";
import { Link } from "react-router-dom";
import { Activity, ArrowUpRight, Gauge, Scale } from "lucide-react";
import { summarizeClimaxMotionHistory } from "@/lib/motionInsights";

function rounded(value, suffix = "") {
  return value == null ? "--" : `${Math.round(value)}${suffix}`;
}

function leadText(overview) {
  const { left, right, similar } = overview.sideCounts;
  if (!left && !right && !similar) return "No paired samples";
  if (similar >= left && similar >= right) return `${similar} broadly similar`;
  return left > right ? `${left} left higher` : `${right} right higher`;
}

function Tile({ label, value, detail, tone = "text-foreground" }) {
  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-2 font-mono text-xl font-semibold ${tone}`}>{value}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

export default function MotionClimaxOverview({ sessions, title = "Motion Around Marked Climax" }) {
  const overview = summarizeClimaxMotionHistory(sessions);
  if (!overview.snapshots.length) return null;

  const maxSession = overview.highestCadence?.session;
  const imbalanceSession = overview.strongestImbalance?.session;

  return (
    <section className="rounded-xl border border-violet-500/20 bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-300">
            <Activity className="h-4 w-4" />
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Saved motion within 30 seconds of each marked climax. Motion and cadence are observational proxies.
          </p>
        </div>
        <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
          {overview.snapshots.length} session{overview.snapshots.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Cadence Proxy Average"
          value={rounded(overview.averageCadence, "/min")}
          detail={`${overview.withCadence.length} with saved cadence near climax`}
          tone="text-violet-300"
        />
        <Tile
          label="Cadence Proxy Maximum"
          value={rounded(overview.maximumCadence, "/min")}
          detail={maxSession?.date ? moment(maxSession.date).format("MMM D, YYYY") : "No cadence timeline saved"}
          tone="text-violet-300"
        />
        <Tile
          label="Lower-Body Balance"
          value={leadText(overview)}
          detail={`${overview.sideCounts.left} left / ${overview.sideCounts.right} right / ${overview.sideCounts.similar} similar`}
          tone="text-cyan-300"
        />
        <Tile
          label="Strongest Imbalance"
          value={overview.strongestImbalance ? `${Math.round(Math.abs(overview.strongestImbalance.asymmetryIndex) * 100)}%` : "--"}
          detail={imbalanceSession?.date ? moment(imbalanceSession.date).format("MMM D, YYYY") : "No paired lower-body trace"}
          tone="text-amber-300"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p className="flex items-center gap-2">
          <Gauge className="h-3.5 w-3.5 text-violet-300" />
          Cadence reflects visible hand rhythm; lower-body balance compares saved left/right region activity.
        </p>
        {maxSession?.id && (
          <Link to={`/sessions/${maxSession.id}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Review highest cadence window
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <Scale className="sr-only" />
    </section>
  );
}

