import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "../components/PageHeader";
import VideoSyncPlayer from "../components/VideoSyncPlayer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import moment from "moment";

export default function VideoPlayer() {
  const [sessions, setSessions] = useState([]);
  const [explorations, setExplorations] = useState([]);
  const [recordType, setRecordType] = useState("session");
  const [selectedId, setSelectedId] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [timelineRows, setTimelineRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);

  useEffect(() => {
    Promise.all([
      base44.entities.Session.list("-date", 200).catch(() => []),
      base44.entities.BodyExploration.list("-date", 200).catch(() => []),
    ]).then(([sessionRows, explorationRows]) => {
      setSessions(sessionRows);
      setExplorations(explorationRows);
      setLoading(false);
    });
  }, []);

  const handleRecordTypeChange = (type) => {
    setRecordType(type);
    setSelectedId("");
    setSelectedRecord(null);
    setTimelineRows([]);
  };

  const handleSelectRecord = async (id) => {
    setSelectedId(id);
    setSelectedRecord(null);
    setTimelineRows([]);
    if (!id) return;
    setLoadingSession(true);
    const entity = recordType === "body_exploration" ? base44.entities.BodyExploration : base44.entities.Session;
    const [recordList, rows] = await Promise.all([
      entity.filter({ id }),
      base44.entities.HeartRateTimeline.filter({ session: id }, "time_offset_s", 10000),
    ]);
    setSelectedRecord(recordList[0] || null);
    setTimelineRows(rows);
    setLoadingSession(false);
  };
  const records = recordType === "body_exploration" ? explorations : sessions;

  return (
    <div>
      <PageHeader title="Video Sync Player" subtitle="Load a local video and sync it with HR data and event notes" />

      <div className="px-4 pb-8 space-y-4">
        {/* Record picker */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Record</p>
            <div className="inline-flex rounded-lg border border-border bg-background p-1">
              <button type="button" onClick={() => handleRecordTypeChange("session")} className={`rounded-md px-3 py-1 text-xs font-medium ${recordType === "session" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Sessions</button>
              <button type="button" onClick={() => handleRecordTypeChange("body_exploration")} className={`rounded-md px-3 py-1 text-xs font-medium ${recordType === "body_exploration" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Body Exploration</button>
            </div>
          </div>
          {loading ? (
            <div className="h-10 flex items-center">
              <span className="text-sm text-muted-foreground">Loading records…</span>
            </div>
          ) : (
            <Select value={selectedId} onValueChange={handleSelectRecord}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder={recordType === "body_exploration" ? "Choose a body exploration record…" : "Choose a session…"} />
              </SelectTrigger>
              <SelectContent>
                {records.map((record) => (
                  <SelectItem key={record.id} value={record.id}>
                    {recordType === "body_exploration" && (record.title || record.exploration_type) ? `${record.title || record.exploration_type} · ` : ""}
                    {moment(record.date).format("MMM D, YYYY")}
                    {record.start_time ? ` · ${record.start_time}` : ""}
                    {record.duration_minutes ? ` · ${record.duration_minutes}m` : ""}
                    {recordType === "session" && record.no_climax ? " · NC" : ""}
                    {(record.event_timeline || []).length > 0 ? ` · ${record.event_timeline.length} events` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Loading state */}
        {loadingSession && (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Player */}
        {selectedRecord && !loadingSession && (
          <VideoSyncPlayer key={`${recordType}:${selectedRecord.id}`} session={selectedRecord} timelineRows={timelineRows} recordType={recordType} />
        )}

        {/* Empty state */}
        {!selectedId && !loading && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">Select a session or body exploration record above to load the video sync player</p>
          </div>
        )}
      </div>
    </div>
  );
}
