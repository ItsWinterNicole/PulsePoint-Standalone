import fs from 'node:fs/promises';
import path from 'node:path';
import { uploadDir, ttsRenderDir } from '../config.js';
import {
  buildChunkInstructions,
  callOpenAITTS,
  clampSpeed,
  normalizeTTSExportFormat,
  normalizeTTSModel,
  q,
  runProcess,
  slugifyFilePart,
  supportsTTSInstructions,
  ttsExportMime,
} from './ttsCore.js';
import { writeChapterSidecars } from './audioChapters.js';

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
      chapters = [],
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
    await fs.mkdir(ttsRenderDir, { recursive: true });
    workDir = path.join(ttsRenderDir, `${Date.now()}-${crypto.randomUUID()}`);
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

    let chapterMeta = null;
    try {
      chapterMeta = await writeChapterSidecars({
        uploadDir,
        outputBase,
        audioFilename: finalFilename,
        title,
        chapters,
        durationSeconds,
      });
    } catch (error) {
      console.warn('[renderTTSExport] chapter sidecars failed', error);
    }

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
      ...(chapterMeta || {
        has_chapters: false,
        chapter_format: 'unavailable',
        chapter_count: 0,
        chapters_embedded: false,
        sidecar_chapters_available: false,
      }),
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
