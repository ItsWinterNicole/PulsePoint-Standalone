import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '../config.js';

const captureRoot = path.resolve(dataDir, 'debug', 'ai-forensics');

export function isAIForensicsEnabled() {
  return String(process.env.AI_FORENSICS || '').toLowerCase() === 'true';
}

function safeSegment(value = 'run') {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 72) || 'run';
}

function safeFileName(value = 'artifact.json') {
  return String(value).replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 96) || 'artifact.json';
}

function capturePath(captureId) {
  const resolved = path.resolve(captureRoot, safeSegment(captureId));
  if (!resolved.startsWith(`${captureRoot}${path.sep}`)) {
    throw new Error('Invalid AI forensic capture path');
  }
  return resolved;
}

export function startAIForensicCapture(meta = {}) {
  if (!isAIForensicsEnabled()) return null;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const captureId = `${timestamp}-${safeSegment(meta.sessionId || meta.experiment)}-${crypto.randomUUID().slice(0, 8)}`;
  fs.mkdirSync(capturePath(captureId), { recursive: true });
  writeAIForensicArtifact(captureId, '00-meta.json', {
    captured_at: new Date().toISOString(),
    ...meta,
  });
  return captureId;
}

export function writeAIForensicArtifact(captureId, fileName, value) {
  if (!captureId || !isAIForensicsEnabled()) return;
  const directory = capturePath(captureId);
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, safeFileName(fileName));
  const contents = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  fs.writeFileSync(filePath, contents, 'utf8');
}

export function saveAIForensicFinal(captureId, payload) {
  if (!captureId || !isAIForensicsEnabled()) return false;
  writeAIForensicArtifact(captureId, '90-final-ai-analysis-before-save.json', payload);
  return true;
}
