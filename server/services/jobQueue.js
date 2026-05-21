import { getEntity, listEntities, upsertEntity } from '../db.js';

const handlers = new Map();
const jobs = new Map();
const queue = [];
const running = new Set();
const concurrency = Math.max(1, Number(process.env.BACKGROUND_JOB_CONCURRENCY || 1));

function nowIso() {
  return new Date().toISOString();
}

function publicJob(job) {
  if (!job) return null;
  const { payload: _payload, abortController: _abortController, ...rest } = job;
  return rest;
}

function saveJob(job) {
  if (!job?.id) return;
  upsertEntity('ProcessingJob', job.id, publicJob(job));
}

function patchJob(job, patch = {}) {
  Object.assign(job, patch, { updatedAt: nowIso() });
  jobs.set(job.id, job);
  saveJob(job);
  return publicJob(job);
}

function patchProgress(job, progress = {}) {
  return patchJob(job, {
    progress: {
      ...(job.progress || {}),
      ...progress,
      updatedAt: nowIso(),
    },
  });
}

function runNext() {
  while (running.size < concurrency && queue.length > 0) {
    const job = queue.shift();
    if (!job || job.status !== 'queued') continue;
    const handler = handlers.get(job.type);
    if (!handler) {
      patchJob(job, {
        status: 'error',
        error: `No background job handler registered for ${job.type}`,
        finishedAt: nowIso(),
      });
      continue;
    }

    running.add(job.id);
    patchJob(job, {
      status: 'running',
      startedAt: nowIso(),
    });
    patchProgress(job, {
      phase: 'running',
      message: job.progress?.message || 'Starting background job...',
    });

    Promise.resolve()
      .then(() => handler(job.payload, {
        jobId: job.id,
        signal: job.abortController.signal,
        updateProgress: (progress) => patchProgress(job, progress),
      }))
      .then((result) => {
        patchJob(job, {
          status: 'complete',
          result,
          error: null,
          finishedAt: nowIso(),
        });
        patchProgress(job, {
          phase: 'complete',
          message: job.progress?.message || 'Complete',
        });
      })
      .catch((error) => {
        const cancelled = job.abortController.signal.aborted;
        patchJob(job, {
          status: cancelled ? 'cancelled' : 'error',
          error: cancelled ? 'Cancelled' : (error?.message || String(error)),
          finishedAt: nowIso(),
        });
        patchProgress(job, {
          phase: cancelled ? 'cancelled' : 'error',
          message: cancelled ? 'Cancelled' : (error?.message || String(error)),
        });
      })
      .finally(() => {
        running.delete(job.id);
        runNext();
      });
  }
}

export function registerJobHandler(type, handler) {
  if (!type || typeof handler !== 'function') throw new Error('registerJobHandler requires type and handler');
  handlers.set(type, handler);
}

export function createJob(type, payload = {}, meta = {}) {
  if (!handlers.has(type)) throw new Error(`Unknown background job type: ${type}`);
  const id = crypto.randomUUID();
  const now = nowIso();
  const job = {
    id,
    type,
    status: 'queued',
    progress: {
      phase: 'queued',
      current: 0,
      total: 0,
      message: 'Queued',
      updatedAt: now,
    },
    result: null,
    error: null,
    meta,
    payload,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    abortController: new AbortController(),
  };
  jobs.set(id, job);
  saveJob(job);
  queue.push(job);
  queueMicrotask(runNext);
  return publicJob(job);
}

export function getJob(id) {
  const job = jobs.get(id);
  if (job) return publicJob(job);
  return getEntity('ProcessingJob', id);
}

export function listJobs({ type, status, limit = 20, meta = {} } = {}) {
  const merged = new Map();
  for (const job of listEntities('ProcessingJob')) {
    if (job?.id) merged.set(job.id, job);
  }
  for (const job of jobs.values()) {
    const pub = publicJob(job);
    if (pub?.id) merged.set(pub.id, pub);
  }

  const statuses = String(status || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const metaEntries = Object.entries(meta || {}).filter(([, value]) => value !== undefined && value !== null && value !== '');

  return [...merged.values()]
    .filter((job) => !type || job.type === type)
    .filter((job) => statuses.length === 0 || statuses.includes(job.status))
    .filter((job) => metaEntries.every(([key, value]) => String(job.meta?.[key] ?? '') === String(value)))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .slice(0, Math.max(1, Math.min(100, Number(limit) || 20)));
}

export function cancelJob(id) {
  const job = jobs.get(id);
  if (!job) return getEntity('ProcessingJob', id);
  if (job.status === 'queued') {
    const index = queue.findIndex((queued) => queued.id === id);
    if (index >= 0) queue.splice(index, 1);
  }
  if (['queued', 'running'].includes(job.status)) {
    job.abortController.abort();
    patchJob(job, {
      status: 'cancelled',
      error: 'Cancelled',
      finishedAt: nowIso(),
    });
    patchProgress(job, {
      phase: 'cancelled',
      message: 'Cancelled',
    });
  }
  return publicJob(job);
}
