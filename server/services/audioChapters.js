import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_CHAPTERS = 60;

function cleanTitle(value, fallback = 'Audio Narration') {
  const cleaned = String(value || '')
    .replace(/[*_`>#~]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[-:;\s]+|[-:;\s]+$/g, '')
    .trim()
    .slice(0, 88);
  return cleaned || fallback;
}

function chapterId(index) {
  return `chapter-${String(index + 1).padStart(3, '0')}`;
}

function cueTimestamp(ms = 0) {
  const totalFrames = Math.max(0, Math.floor((Number(ms || 0) / 1000) * 75));
  const minutes = Math.floor(totalFrames / (60 * 75));
  const seconds = Math.floor((totalFrames % (60 * 75)) / 75);
  const frames = totalFrames % 75;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

function textTimestamp(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function cueEscape(value) {
  return String(value || '').replace(/"/g, "'");
}

export function normalizeAudioChapters(chapters = [], durationSeconds = 0) {
  const durationMs = Math.max(0, Math.round(Number(durationSeconds || 0) * 1000));
  const normalized = (Array.isArray(chapters) ? chapters : [])
    .map((chapter, index) => ({
      id: chapter.id || chapterId(index),
      title: cleanTitle(chapter.title, `Chapter ${index + 1}`),
      startMs: Math.max(0, Math.round(Number(chapter.startMs || 0))),
      endMs: Number.isFinite(Number(chapter.endMs)) ? Math.max(0, Math.round(Number(chapter.endMs))) : null,
      source: chapter.source || 'tts_chunk',
      description: String(chapter.description || ''),
      confidence: chapter.confidence === 'explicit' ? 'explicit' : 'estimated',
    }))
    .filter((chapter) => chapter.title)
    .sort((a, b) => a.startMs - b.startMs);

  const deduped = [];
  for (const chapter of normalized) {
    const previous = deduped[deduped.length - 1];
    if (previous && Math.abs(previous.startMs - chapter.startMs) < 1000) continue;
    deduped.push(chapter);
  }

  if (!deduped.length) {
    deduped.push({
      id: chapterId(0),
      title: 'Audio Narration',
      startMs: 0,
      endMs: durationMs || null,
      source: 'tts_chunk',
      description: '',
      confidence: 'estimated',
    });
  }

  deduped[0].startMs = 0;
  deduped.forEach((chapter, index) => {
    chapter.id = chapterId(index);
    const next = deduped[index + 1];
    chapter.endMs = next ? Math.max(chapter.startMs, next.startMs - 1) : (durationMs || chapter.endMs || null);
  });

  return deduped.slice(0, MAX_CHAPTERS);
}

export function chaptersToCue(bundle = {}, audioFilename = 'audio.mp3') {
  const lines = [
    `TITLE "${cueEscape(bundle.title || 'Audio Narration')}"`,
    `FILE "${cueEscape(audioFilename)}" MP3`,
  ];
  (bundle.chapters || []).forEach((chapter, index) => {
    lines.push(`  TRACK ${String(index + 1).padStart(2, '0')} AUDIO`);
    lines.push(`    TITLE "${cueEscape(chapter.title)}"`);
    lines.push(`    INDEX 01 ${cueTimestamp(chapter.startMs)}`);
  });
  return `${lines.join('\n')}\n`;
}

export function chaptersToText(bundle = {}) {
  const lines = [
    bundle.title || 'Audio Narration',
    '',
    ...(bundle.chapters || []).map((chapter) => `${textTimestamp(chapter.startMs)} ${chapter.title}`),
  ];
  return `${lines.join('\n')}\n`;
}

export async function writeChapterSidecars({
  uploadDir,
  outputBase,
  audioFilename,
  title,
  chapters,
  durationSeconds,
} = {}) {
  const normalizedChapters = normalizeAudioChapters(chapters, durationSeconds);
  const generatedAt = new Date().toISOString();
  const bundle = {
    version: 1,
    title: cleanTitle(title),
    audioFilename,
    generatedAt,
    timing: 'estimated_from_text_scaled_to_audio_duration',
    chapters: normalizedChapters,
  };

  const jsonFilename = `${outputBase}.chapters.json`;
  const cueFilename = `${outputBase}.cue`;
  const textFilename = `${outputBase}.chapters.txt`;
  await fs.writeFile(path.join(uploadDir, jsonFilename), JSON.stringify(bundle, null, 2), 'utf8');
  await fs.writeFile(path.join(uploadDir, cueFilename), chaptersToCue(bundle, audioFilename), 'utf8');
  await fs.writeFile(path.join(uploadDir, textFilename), chaptersToText(bundle), 'utf8');

  return {
    has_chapters: normalizedChapters.length > 0,
    chapter_format: 'sidecar',
    chapter_count: normalizedChapters.length,
    chapter_source: 'tts_export',
    chapter_generated_at: generatedAt,
    chapters_embedded: false,
    sidecar_chapters_available: true,
    chapter_json_url: `/uploads/${jsonFilename}`,
    chapter_cue_url: `/uploads/${cueFilename}`,
    chapter_txt_url: `/uploads/${textFilename}`,
    chapters: normalizedChapters,
  };
}
