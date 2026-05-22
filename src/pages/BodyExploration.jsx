import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, Plus, ScanSearch } from "lucide-react";
import moment from "moment";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function ExplorationCard({ exploration }) {
  return (
    <Link to={`/exploration/${exploration.id}`} className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{exploration.title || exploration.exploration_type || "Body Exploration"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {exploration.date ? moment(exploration.date).format("MMM D, YYYY") : "Undated"}
            {exploration.start_time ? ` · ${exploration.start_time}` : ""}
            {exploration.duration_minutes ? ` · ${exploration.duration_minutes}m` : ""}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(exploration.methods || []).slice(0, 4).map((method) => <Badge key={method} variant="secondary" className="text-[10px]">{method}</Badge>)}
        {exploration.avg_hr || exploration.max_hr ? <Badge variant="outline" className="gap-1 text-[10px]"><Activity className="h-3 w-3" /> HR</Badge> : null}
        {exploration.emg_enabled ? <Badge variant="outline" className="text-[10px]">EMG</Badge> : null}
      </div>
      {(exploration.findings || exploration.notes) && <p className="mt-3 line-clamp-2 text-xs leading-5 text-foreground/80">{exploration.findings || exploration.notes}</p>}
    </Link>
  );
}

export default function BodyExploration() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    base44.entities.BodyExploration.list("-date", 100).then(setItems).catch(() => setItems([]));
  }, []);

  return (
    <div>
      <PageHeader
        title="Body Exploration"
        subtitle="Instrumentation, body mapping, and non-climax physiological experimentation"
        icon={ScanSearch}
        action={<Link to="/exploration/new"><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New</Button></Link>}
      />
      <div className="space-y-3 px-4 pb-8">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-foreground">
            Track body exploration and instrumentation records separately from climax-oriented sessions while keeping heart-rate data, optional EMG, notes, and AI findings available.
          </p>
        </div>
        {!items && <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading exploration records...</div>}
        {items?.length === 0 && <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No body exploration records yet.</div>}
        <div className="grid gap-3 lg:grid-cols-2">
          {(items || []).map((item) => <ExplorationCard key={item.id} exploration={item} />)}
        </div>
      </div>
    </div>
  );
}
