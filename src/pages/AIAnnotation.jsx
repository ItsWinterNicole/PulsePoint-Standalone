import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Clapperboard, Loader2, Sparkles } from "lucide-react";
import moment from "moment";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import AIVideoPassPanel from "../components/AIVideoPassPanel";
import LinkedLocalVideoManager from "../components/LinkedLocalVideoManager";

function sessionLabel(session) {
  if (!session) return "Select a session";
  const date = session.date ? moment(session.date).format("MMM D, YYYY") : "Undated";
  const time = session.start_time ? ` ${session.start_time}` : "";
  const duration = session.duration_minutes ? ` · ${session.duration_minutes}m` : "";
  const videoCount = (session.linked_local_videos || []).length ? ` · ${session.linked_local_videos.length} linked` : "";
  return `${date}${time}${duration}${videoCount}`;
}

export default function AIAnnotation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(id || "");
  const [session, setSession] = useState(null);
  const [timelineRows, setTimelineRows] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState("");
  const [cursorSeconds, setCursorSeconds] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadingSessions(true);
    base44.entities.Session.list("-date", 250)
      .then((rows) => {
        if (cancelled) return;
        setSessions(rows);
        if (!selectedId && rows[0]?.id) setSelectedId(rows[0].id);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Could not load sessions.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSessions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    const nextId = id || selectedId;
    if (!nextId) return;
    if (nextId !== selectedId) setSelectedId(nextId);
    let cancelled = false;
    setLoadingSession(true);
    setError("");
    Promise.all([
      base44.entities.Session.filter({ id: nextId }),
      base44.entities.HeartRateTimeline.filter({ session: nextId }, "time_offset_s", 10000),
    ])
      .then(([sessionRows, rows]) => {
        if (cancelled) return;
        setSession(sessionRows[0] || null);
        setTimelineRows(rows || []);
        setCursorSeconds(0);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Could not load the selected session.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, selectedId]);

  const linkedLocalVideos = useMemo(() => session?.linked_local_videos || [], [session]);

  const handleSessionChange = (nextId) => {
    setSelectedId(nextId);
    navigate(`/sessions/${nextId}/ai-annotation`);
  };

  const updateLinkedVideos = async (nextVideos) => {
    if (!session?.id) return;
    await base44.entities.Session.update(session.id, { linked_local_videos: nextVideos });
    setSession((current) => (current ? { ...current, linked_local_videos: nextVideos } : current));
    setSessions((current) => current.map((item) => (
      item.id === session.id ? { ...item, linked_local_videos: nextVideos } : item
    )));
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Sarah annotation workbench</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <Sparkles className="h-5 w-5 text-primary" /> AI Assisted Annotation
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Run video and audio passes against linked local recordings, review Sarah&apos;s findings, and accept them into the session timeline and AI details.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {session?.id && (
            <Button asChild variant="outline" className="h-9">
              <Link to={`/sessions/${session.id}`}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Session Details
              </Link>
            </Button>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_auto]">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Session</span>
            <select
              value={selectedId}
              disabled={loadingSessions}
              onChange={(event) => handleSessionChange(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              {!selectedId && <option value="">Select a session</option>}
              {sessions.map((item) => (
                <option key={item.id} value={item.id}>{sessionLabel(item)}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2 text-xs text-muted-foreground">
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
              <span className="font-mono text-primary">{timelineRows.length}</span> telemetry rows
            </div>
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
              <span className="font-mono text-primary">{linkedLocalVideos.length}</span> linked videos
            </div>
          </div>
        </div>
        {error && <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      </section>

      {loadingSession && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading annotation workspace...
        </div>
      )}

      {!loadingSession && session && (
        <>
          <section className="rounded-xl border border-border bg-card p-4">
            <LinkedLocalVideoManager
              videos={linkedLocalVideos}
              title="Linked Original Videos"
              helper="Choose the source recordings Sarah should review. Store path/fingerprint metadata only; raw video stays local."
              onChange={updateLinkedVideos}
            />
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Clapperboard className="h-4 w-4 text-primary" /> Video and Audio Passes
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pick the recording and view type, then run passes from the cursor or smart windows. Cursor is currently {Math.floor(cursorSeconds / 60)}:{String(Math.round(cursorSeconds % 60)).padStart(2, "0")}.
                </p>
              </div>
            </div>
            <AIVideoPassPanel
              session={session}
              timelineRows={timelineRows}
              linkedLocalVideos={linkedLocalVideos}
              onSessionUpdate={(updated) => setSession((current) => ({ ...(current || {}), ...updated }))}
              onCursorChange={setCursorSeconds}
            />
          </section>
        </>
      )}

      {!loadingSession && !session && (
        <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Select a session with linked local video to start an AI assisted annotation pass.
        </div>
      )}
    </div>
  );
}
