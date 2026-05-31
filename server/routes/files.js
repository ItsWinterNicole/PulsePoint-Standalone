import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { uploadDir } from '../config.js';
import { runProcess, runProcessBinary, slugifyFilePart } from '../services/ttsCore.js';

export const filesRouter = express.Router();
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${crypto.randomUUID()}-${safe}`);
  },
});
const upload = multer({ storage });

function summarizeMotion(samples, fps) {
  if (samples.length < 2) {
    return {
      method: 'local_frame_difference',
      frame_count: samples.length,
      motion_level: 'unknown',
      average_motion: null,
      peak_motion: null,
      active_motion_pct: null,
      pause_candidates: [],
      note: 'Not enough decoded frames to estimate motion.',
    };
  }
  const diffs = [];
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const current = samples[i];
    let total = 0;
    const len = Math.min(prev.length, current.length);
    for (let j = 0; j < len; j += 1) total += Math.abs(current[j] - prev[j]);
    diffs.push(total / (len * 255));
  }
  const average = diffs.reduce((sum, value) => sum + value, 0) / diffs.length;
  const peak = Math.max(...diffs);
  const threshold = Math.max(0.018, average * 0.7);
  const active = diffs.filter((value) => value >= threshold).length;
  const pauseCandidates = [];
  let runStart = null;
  diffs.forEach((value, index) => {
    const isQuiet = value < threshold * 0.55;
    if (isQuiet && runStart == null) runStart = index;
    if ((!isQuiet || index === diffs.length - 1) && runStart != null) {
      const runEnd = isQuiet && index === diffs.length - 1 ? index : index - 1;
      const duration = (runEnd - runStart + 1) / fps;
      if (duration >= 0.8) {
        pauseCandidates.push({
          startSeconds: Number((runStart / fps).toFixed(2)),
          endSeconds: Number(((runEnd + 1) / fps).toFixed(2)),
          durationSeconds: Number(duration.toFixed(2)),
        });
      }
      runStart = null;
    }
  });
  const activePct = Math.round((active / diffs.length) * 100);
  const motionLevel = average < 0.018 ? 'low' : average < 0.05 ? 'moderate' : 'high';
  return {
    method: 'local_frame_difference',
    frame_count: samples.length,
    sample_rate_fps: fps,
    motion_level: motionLevel,
    average_motion: Number(average.toFixed(4)),
    peak_motion: Number(peak.toFixed(4)),
    active_motion_pct: activePct,
    pause_candidates: pauseCandidates.slice(0, 6),
    note: 'Motion is estimated locally from downscaled grayscale frame differences. It is useful for relative speed, pause, and intensity changes, not for confirming technique or intent by itself.',
  };
}

async function buildMotionSummary(sourcePath, start, duration) {
  const width = 160;
  const height = 90;
  const fps = Math.max(2, Math.min(6, Math.round(18 / Math.max(duration, 1))));
  const frameSize = width * height;
  const { stdout } = await runProcessBinary('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-ss', String(start),
    '-t', String(duration),
    '-i', sourcePath,
    '-map', '0:v:0',
    '-an',
    '-vf', `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=gray`,
    '-f', 'rawvideo',
    'pipe:1',
  ]);
  const samples = [];
  for (let offset = 0; offset + frameSize <= stdout.length; offset += frameSize) {
    samples.push(stdout.subarray(offset, offset + frameSize));
  }
  return summarizeMotion(samples, fps);
}

filesRouter.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ file_url: fileUrl, url: fileUrl, filename: req.file.originalname, size: req.file.size });
});

filesRouter.post('/video-clip-preview', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video uploaded' });

  const sourcePath = req.file.path;
  const start = Math.max(0, Number(req.body?.startSeconds || 0));
  const requestedEnd = Number(req.body?.endSeconds || start + 8);
  const end = Math.max(start + 0.25, requestedEnd);
  const duration = Math.min(30, Math.max(0.25, end - start));
  const label = slugifyFilePart(req.body?.label || req.file.originalname || 'video-clip');
  const stem = `${Date.now()}-${crypto.randomUUID()}-${label}`;
  const clipFilename = `${stem}.mp4`;
  const clipPath = path.join(uploadDir, clipFilename);
  const frameCount = Math.max(1, Math.min(18, Number(req.body?.frameCount || 12)));
  const framePattern = path.join(uploadDir, `${stem}-frame-%02d.jpg`);

  try {
    await runProcess('ffmpeg', [
      '-hide_banner',
      '-y',
      '-ss', String(start),
      '-t', String(duration),
      '-i', sourcePath,
      '-map', '0:v:0',
      '-an',
      '-vf', 'scale=min(960\\,iw):-2',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      clipPath,
    ]);

    await runProcess('ffmpeg', [
      '-hide_banner',
      '-y',
      '-ss', String(start),
      '-t', String(duration),
      '-i', sourcePath,
      '-vf', `fps=${frameCount / duration},scale=min(960\\,iw):-2`,
      '-frames:v', String(frameCount),
      '-q:v', '3',
      framePattern,
    ]);

    const files = await fsp.readdir(uploadDir);
    const frameFiles = files
      .filter((file) => file.startsWith(`${stem}-frame-`) && file.endsWith('.jpg'))
      .sort()
      .slice(0, frameCount);
    const frames = await Promise.all(frameFiles.map(async (filename, index) => {
      const framePath = path.join(uploadDir, filename);
      const bytes = await fsp.readFile(framePath);
      const time = start + (duration * (frameFiles.length <= 1 ? 0 : index / (frameFiles.length - 1)));
      return {
        filename,
        file_url: `/uploads/${filename}`,
        url: `/uploads/${filename}`,
        mimeType: 'image/jpeg',
        data: bytes.toString('base64'),
        frameTimeSeconds: Number(time.toFixed(2)),
        frameIndex: index + 1,
      };
    }));

    const motionSummary = await buildMotionSummary(sourcePath, start, duration).catch((error) => ({
      method: 'local_frame_difference',
      motion_level: 'unknown',
      error: error?.message || 'Could not estimate motion',
      note: 'Motion summary was unavailable for this clip; use the sampled frames only.',
    }));

    const stat = await fsp.stat(clipPath);
    res.json({
      ok: true,
      source_deleted: true,
      clip_url: `/uploads/${clipFilename}`,
      url: `/uploads/${clipFilename}`,
      filename: clipFilename,
      mimeType: 'video/mp4',
      size: stat.size,
      startSeconds: start,
      endSeconds: start + duration,
      durationSeconds: duration,
      motion_summary: motionSummary,
      frames,
    });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Could not generate video clip preview' });
  } finally {
    fsp.unlink(sourcePath).catch(() => {});
  }
});
