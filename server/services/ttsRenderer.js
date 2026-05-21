import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const uploadDir = path.resolve(root, process.env.UPLOAD_DIR || './data/uploads');
const ttsWorkDir = path.resolve(root, process.env.TTS_RENDER_DIR || './data/tts-render-work');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(t); }
}

function clampSpeed(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0.25 && parsed <= 4 ? parsed : 1.0;
}

function normalizeTTSModel(value) {
  const requested = String(value || process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts');
  return ['gpt-4o-mini-tts', 'tts-1-hd', 'tts-1'].includes(requested)
    ? requested
    : 'gpt-4o-mini-tts';
}

function supportsTTSInstructions(model) {
  return !String(model || '').startsWith('tts-1');
}

function normalizeTTSExportFormat(value) {
  const format = String(value || 'mp3').toLowerCase();
  return ['mp3', 'm4a', 'wav'].includes(format) ? format : 'mp3';
}

function ttsExportMime(format) {
  if (format === 'wav') return 'audio/wav';
  if (format === 'm4a') return 'audio/mp4';
  return 'audio/mpeg';
}

function slugifyFilePart(value) {
  return String(value || 'pulsepoint-tts')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'pulsepoint-tts';
}

function q(str) {
  return `'${String(str).replace(/'/g, "'\\''")}'`;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with ${code}: ${stderr || stdout}`));
    });
  });
}

function buildChunkInstructions(baseInstructions, previousContext, supportsInstructionsForModel) {
  const base = String(baseInstructions || '').trim();
  if (!supportsInstructionsForModel) return '';
  const context = String(previousContext || '').trim();
  if (!context) return base;
  return `${base}

CONTEXT ONLY — DO NOT READ:
Previous narration:
"${context}"

Continue seamlessly from the previous narration.
This is the same continuous thought.
Do NOT restart energy, tone, pacing, or emphasis.
Read only the input text.`;
}

async function callOpenAITTS(body, meta) {
  const maxAttempts = Number(process.env.OPENAI_TTS_BACKEND_ATTEMPTS || 3);
  let lastStatus = 502;
  let lastMessage = 'Unknown OpenAI TTS error';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const startedAt = Date.now();
    try {
      const response = await fetchWithTimeout('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, Number(process.env.OPENAI_TTS_TIMEOUT_MS || 45000));
      const latencyMs = Date.now() - startedAt;

      if (response.ok) {
        console.info('[openaiTTS] success', { ...meta, latencyMs, retries: attempt });
        return { response, latencyMs, retries: attempt };
      }

      lastStatus = response.status;
      lastMessage = await response.text();
      const retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
      console.warn('[openaiTTS] upstream error', { ...meta, status: response.status, latencyMs, attempt: attempt + 1, retryable, message: lastMessage.slice(0, 300) });
      if (!retryable || attempt === maxAttempts - 1) break;

      const retryAfter = response.headers.get('retry-after');
      const delay = retryAfter
        ? Math.min(Math.max(Number(retryAfter) * 1000, 1000), 8000)
        : Math.min(900 * 2 ** attempt, 8000) + Math.floor(Math.random() * 400);
      await sleep(delay);
    } catch (error) {
      lastMessage = error.message || String(error);
      console.warn('[openaiTTS] exception', { ...meta, attempt: attempt + 1, message: lastMessage });
      if (attempt === maxAttempts - 1) break;
      await sleep(Math.min(900 * 2 ** attempt, 8000));
    }
  }

  const error = new Error(lastMessage);
  error.status = lastStatus;
  throw error;
}

export async function renderTTSExport(payload = {}, options = {}) {
  let workDir = null;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const jobId = String(options.jobId || payload.jobId || crypto.randomUUID());

  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('Missing OPENAI_API_KEY');
    error.status = 500;
    throw error;
  }

  try {
    const {
      chunks = [],
      title = 'PulsePoint TTS Export',
      voice = 'nova',
      model: requestedModel,
      speed = 1.0,
      instructions = '',
      outputFormat: requestedOutputFormat = 'mp3',
      normalize = false,
    } = payload || {};

    const model = normalizeTTSModel(requestedModel);
    const finalSpeed = clampSpeed(speed);
    const outputFormat = normalizeTTSExportFormat(requestedOutputFormat);
    const supportsInstructionsForModel = supportsTTSInstructions(model);
    const normalizedChunks = (Array.isArray(chunks) ? chunks : [])
      .map((chunk) => ({
        text: String(chunk?.text || '').trim(),
        previousContext: String(chunk?.previousContext || '').trim(),
      }))
      .filter((chunk) => chunk.text);

    if (!normalizedChunks.length) {
      const error = new Error('No TTS chunks provided');
      error.status = 400;
      throw error;
    }
    if (normalizedChunks.length > 120) {
      const error = new Error(`Too many TTS chunks: ${normalizedChunks.length}`);
      error.status = 413;
      throw error;
    }

    onProgress({
      phase: 'starting',
      current: 0,
      total: normalizedChunks.length,
      message: `Preparing ${normalizedChunks.length} chunks...`,
      model,
      voice,
      format: outputFormat,
    });

    await fs.mkdir(uploadDir, { recursive: true });
    await fs.mkdir(ttsWorkDir, { recursive: true });
    workDir = path.join(ttsWorkDir, `${Date.now()}-${crypto.randomUUID()}`);
    await fs.mkdir(workDir, { recursive: true });

    const sourceFiles = [];
    for (let i = 0; i < normalizedChunks.length; i++) {
      if (options.signal?.aborted) throw new Error('Cancelled');
      const chunk = normalizedChunks[i];
      onProgress({
        phase: 'generating',
        current: i,
        total: normalizedChunks.length,
        message: `Generating chunk ${i + 1} of ${normalizedChunks.length}...`,
      });
      const body = {
        model,
        input: chunk.text,
        voice,
        response_format: 'wav',
        speed: finalSpeed,
      };
      const chunkInstructions = buildChunkInstructions(instructions, chunk.previousContext, supportsInstructionsForModel);
      if (chunkInstructions) body.instructions = chunkInstructions;
      const meta = {
        chunkIndex: i,
        charCount: chunk.text.length,
        estimatedDurationSec: Math.max(1, Math.round(chunk.text.split(/\s+/).filter(Boolean).length / 2.25)),
        model,
        voice,
        speed: finalSpeed,
        format: 'wav',
        render: 'server',
        jobId,
      };
      const { response } = await callOpenAITTS(body, meta);
      const buffer = Buffer.from(await response.arrayBuffer());
      const chunkPath = path.join(workDir, `chunk-${String(i).padStart(4, '0')}.wav`);
      await fs.writeFile(chunkPath, buffer);
      sourceFiles.push(chunkPath);
      onProgress({
        phase: 'generating',
        current: i + 1,
        total: normalizedChunks.length,
        message: `Generated chunk ${i + 1} of ${normalizedChunks.length}`,
      });
    }

    if (options.signal?.aborted) throw new Error('Cancelled');
    onProgress({
      phase: 'encoding',
      current: normalizedChunks.length,
      total: normalizedChunks.length,
      message: `Encoding final ${outputFormat.toUpperCase()} with ffmpeg...`,
    });

    const concatPath = path.join(workDir, 'concat.txt');
    await fs.writeFile(concatPath, sourceFiles.map((file) => `file ${q(file.replace(/\\/g, '/'))}`).join('\n'), 'utf8');

    const outputBase = `${slugifyFilePart(title)}-${Date.now()}`;
    const finalFilename = `${outputBase}.${outputFormat}`;
    const finalPath = path.join(uploadDir, finalFilename);
    const filterArgs = normalize
      ? ['-af', 'loudnorm=I=-18:TP=-1.5:LRA=11']
      : [];
    const encodeArgs = outputFormat === 'wav'
      ? (normalize ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'copy'])
      : outputFormat === 'm4a'
        ? ['-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart']
        : ['-c:a', 'libmp3lame', '-b:a', '320k', '-compression_level', '0'];

    await runProcess('ffmpeg', [
      '-hide_banner',
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatPath,
      ...filterArgs,
      ...encodeArgs,
      finalPath,
    ]);

    const stat = await fs.stat(finalPath);
    let durationSeconds = 0;
    try {
      const probe = await runProcess('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        finalPath,
      ]);
      durationSeconds = Math.round(Number(probe.stdout.trim()) || 0);
    } catch {}

    const result = {
      ok: true,
      jobId,
      file_url: `/uploads/${finalFilename}`,
      filename: finalFilename,
      size: stat.size,
      format: outputFormat,
      mime: ttsExportMime(outputFormat),
      duration_seconds: durationSeconds,
      model,
      voice,
      speed: finalSpeed,
      chunks: normalizedChunks.length,
      normalized: Boolean(normalize),
    };

    onProgress({
      phase: 'complete',
      current: normalizedChunks.length,
      total: normalizedChunks.length,
      message: `Complete: ${finalFilename}`,
      file_url: result.file_url,
      filename: result.filename,
      format: outputFormat,
      size: stat.size,
      duration_seconds: durationSeconds,
    });

    return result;
  } finally {
    if (workDir) {
      fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
