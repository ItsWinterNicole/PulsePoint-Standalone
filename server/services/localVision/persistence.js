import crypto from 'node:crypto';
import { db, nowIso } from '../../db.js';

export function saveLocalVisionResult({ request, videoPath, engine, analysisType = 'window', result }) {
  const now = nowIso();
  const id = crypto.randomUUID();
  const modelName = typeof result?.model === 'object' ? result.model.name : result?.model;
  db.prepare(`
    INSERT INTO local_vision_results(id, session_id, record_type, video_path, start_ms, end_ms, engine, model_name, analysis_type, result_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    request.sessionId,
    request.recordType,
    videoPath,
    request.startMs,
    request.endMs,
    engine,
    modelName || null,
    analysisType,
    JSON.stringify(result),
    now,
    now,
  );
  return {
    id,
    created_at: now,
  };
}

export function listLocalVisionResults({ sessionId, recordType, limit = 20 } = {}) {
  const boundedLimit = Math.max(1, Math.min(100, Number(limit || 20)));
  const rows = sessionId
    ? db.prepare(`
      SELECT * FROM local_vision_results
      WHERE session_id = ? AND (? = '' OR record_type = ?)
      ORDER BY created_at DESC
      LIMIT ?
    `).all(sessionId, recordType || '', recordType || '', boundedLimit)
    : db.prepare(`
      SELECT * FROM local_vision_results
      ORDER BY created_at DESC
      LIMIT ?
    `).all(boundedLimit);
  return rows.map((row) => ({
    id: row.id,
    session_id: row.session_id,
    record_type: row.record_type,
    video_path: row.video_path,
    start_ms: row.start_ms,
    end_ms: row.end_ms,
    engine: row.engine,
    model_name: row.model_name,
    analysis_type: row.analysis_type,
    created_at: row.created_at,
    updated_at: row.updated_at,
    result: (() => {
      try { return JSON.parse(row.result_json); } catch { return null; }
    })(),
  }));
}
