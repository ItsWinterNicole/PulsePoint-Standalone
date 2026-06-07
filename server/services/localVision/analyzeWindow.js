import path from 'node:path';
import { getEntity } from '../../db.js';
import { normalizeLocalVisionRequest } from './schema.js';
import { sampleLocalVisionFrames } from './frameSampler.js';
import { callLocalQwenBatch } from './localVisionClient.js';
import { deriveLocalVisionResult } from './stateMachine.js';
import { saveLocalVisionResult } from './persistence.js';

const BODY_RECORD_TYPES = new Set(['body_exploration', 'foley', 'foley_procedure', 'adult_body_exploration', 'masturbation']);

function recordEntityForType(recordType) {
  return BODY_RECORD_TYPES.has(String(recordType || '').toLowerCase()) ? 'BodyExploration' : 'Session';
}

function linkedVideos(record) {
  return Array.isArray(record?.linked_local_videos) ? record.linked_local_videos : [];
}

function samePath(a, b) {
  if (!a || !b) return false;
  return path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();
}

export function getTrustedRecordAndVideo(request) {
  const primaryEntity = recordEntityForType(request.recordType);
  const fallbackEntity = primaryEntity === 'Session' ? 'BodyExploration' : 'Session';
  const record = getEntity(primaryEntity, request.sessionId) || getEntity(fallbackEntity, request.sessionId);
  if (!record) {
    const error = new Error('Could not find the selected session/body exploration record for local vision.');
    error.status = 404;
    throw error;
  }
  const video = linkedVideos(record).find((item) => samePath(item.path, request.videoPath));
  if (!video) {
    const error = new Error('Local vision only analyzes videos already linked to this record.');
    error.status = 403;
    throw error;
  }
  return { record, video };
}

export async function analyzeLocalVisionWindow(body, { signal, onProgress } = {}) {
  const request = normalizeLocalVisionRequest(body);
  if (!request.sessionId) {
    const error = new Error('sessionId is required for local vision analysis.');
    error.status = 400;
    throw error;
  }
  if (!request.videoPath) {
    const error = new Error('videoPath is required for local vision analysis.');
    error.status = 400;
    throw error;
  }

  onProgress?.({ phase: 'validating', current: 0, total: 4, message: 'Validating linked local video...' });
  const { video } = getTrustedRecordAndVideo(request);
  if (signal?.aborted) throw new Error('Cancelled');

  onProgress?.({ phase: 'sampling', current: 1, total: 4, message: 'Sampling local video frames...' });
  const sampled = await sampleLocalVisionFrames({
    videoPath: video.path,
    sessionId: request.sessionId,
    startMs: request.startMs,
    endMs: request.endMs,
    samplePolicy: request.samplePolicy,
    onProgress: (progress) => onProgress?.({
      current: progress.current ?? 1,
      total: progress.total ?? 4,
      ...progress,
    }),
  });
  if (signal?.aborted) throw new Error('Cancelled');

  onProgress?.({
    phase: 'local_qwen25vl',
    current: 2,
    total: 4,
    message: 'Calling local Qwen2.5-VL service on localhost...',
    frame_count: sampled.frames.length,
  });
  const extracted = await callLocalQwenBatch({
    questions: request.questions,
    frames: sampled.frames,
    recordType: request.recordType,
    signal,
  });
  if (signal?.aborted) throw new Error('Cancelled');

  onProgress?.({ phase: 'deriving', current: 3, total: 4, message: 'Applying deterministic visual gates...' });
  const result = deriveLocalVisionResult({
    request,
    frames: sampled.frames,
    questions: request.questions,
    answers: extracted.answers,
    engine: request.engine,
    model: extracted.model,
    warnings: [...sampled.warnings, ...extracted.warnings],
  });
  const saved = saveLocalVisionResult({
    request,
    videoPath: video.path,
    engine: request.engine,
    analysisType: 'window',
    result,
  });
  onProgress?.({ phase: 'complete', current: 4, total: 4, message: 'Local vision analysis complete.' });
  return {
    ...result,
    id: saved.id,
    created_at: saved.created_at,
  };
}
