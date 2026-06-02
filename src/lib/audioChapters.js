const DEFAULT_WORDS_PER_MINUTE = 155;
const MIN_CHAPTER_GAP_MS = 45000;
const MAX_CHAPTERS = 36;

function wordCount(text) {
  return String(text || "").split(/\s+/).filter(Boolean).length;
}

function stripMarkdown(text) {
  return String(text || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, (match) => match.replace(/^\[|\]\([^)]*\)$/g, ""))
    .replace(/[*_`>#~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[-:;\s]+|[-:;\s]+$/g, "")
    .slice(0, 88);
}

function chapterId(index) {
  return `chapter-${String(index + 1).padStart(3, "0")}`;
}

function inferHeading(paragraph, fallbackTitle, index) {
  const raw = String(paragraph || "").trim();
  if (!raw) return index === 0 ? fallbackTitle : null;

  const firstLine = raw.split(/\n+/).find(Boolean) || raw;
  const headingMatch =
    firstLine.match(/^#{1,4}\s+(.+)$/) ||
    firstLine.match(/^\*\*([^*]{3,90})\*\*:?\s*$/) ||
    firstLine.match(/^([A-Z][A-Za-z0-9 /&()'-]{2,80}):\s/) ||
    firstLine.match(/^([A-Z][A-Z0-9 /&()'-]{4,80})$/);

  if (headingMatch?.[1]) return titleCase(stripMarkdown(headingMatch[1]));

  const cleaned = titleCase(stripMarkdown(firstLine));
  const words = wordCount(cleaned);
  if (words > 0 && words <= 8 && cleaned.length <= 72 && !/[.!?]$/.test(cleaned)) {
    return cleaned;
  }

  return index === 0 ? fallbackTitle : null;
}

function clampChapterTitle(title, fallback) {
  const cleaned = titleCase(stripMarkdown(title));
  return cleaned || fallback || "Audio Narration";
}

export function formatChapterTimestamp(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function cueTimestamp(ms = 0) {
  const totalFrames = Math.max(0, Math.floor((Number(ms || 0) / 1000) * 75));
  const minutes = Math.floor(totalFrames / (60 * 75));
  const seconds = Math.floor((totalFrames % (60 * 75)) / 75);
  const frames = totalFrames % 75;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

function cueEscape(value) {
  return String(value || "").replace(/"/g, "'");
}

export function normalizeAudioChapters(chapters = [], durationSeconds = 0) {
  const durationMs = Math.max(0, Math.round(Number(durationSeconds || 0) * 1000));
  const normalized = (Array.isArray(chapters) ? chapters : [])
    .map((chapter, index) => ({
      id: chapter.id || chapterId(index),
      title: clampChapterTitle(chapter.title, `Chapter ${index + 1}`),
      startMs: Math.max(0, Math.round(Number(chapter.startMs || 0))),
      endMs: Number.isFinite(Number(chapter.endMs)) ? Math.max(0, Math.round(Number(chapter.endMs))) : null,
      source: chapter.source || "tts_chunk",
      description: chapter.description || "",
      confidence: chapter.confidence === "explicit" ? "explicit" : "estimated",
    }))
    .filter((chapter) => chapter.title)
    .sort((a, b) => a.startMs - b.startMs);

  const deduped = [];
  for (const chapter of normalized) {
    const previous = deduped[deduped.length - 1];
    if (previous && Math.abs(previous.startMs - chapter.startMs) < 1000) {
      if (chapter.title.length > previous.title.length) previous.title = chapter.title;
      continue;
    }
    deduped.push(chapter);
  }

  if (!deduped.length) {
    deduped.push({
      id: chapterId(0),
      title: "Audio Narration",
      startMs: 0,
      endMs: durationMs || null,
      source: "tts_chunk",
      description: "",
      confidence: "estimated",
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

export function buildAudioChapterBundle({
  title = "Audio Narration",
  audioFilename = "",
  paragraphs = [],
  durationSeconds = 0,
  source = "analysis_section",
} = {}) {
  const safeTitle = clampChapterTitle(title, "Audio Narration");
  const cleanedParagraphs = (Array.isArray(paragraphs) ? paragraphs : [])
    .map((paragraph) => stripMarkdown(paragraph))
    .filter(Boolean);
  const totalWords = cleanedParagraphs.reduce((sum, paragraph) => sum + Math.max(1, wordCount(paragraph)), 0);
  const estimatedDurationMs = durationSeconds
    ? Math.round(Number(durationSeconds) * 1000)
    : Math.max(60000, Math.round((totalWords / DEFAULT_WORDS_PER_MINUTE) * 60000));

  const candidates = [];
  let cursorWords = 0;
  cleanedParagraphs.forEach((paragraph, index) => {
    const heading = inferHeading(paragraph, safeTitle, index);
    const paragraphWords = Math.max(1, wordCount(paragraph));
    const startMs = totalWords ? Math.round((cursorWords / totalWords) * estimatedDurationMs) : 0;
    const last = candidates[candidates.length - 1];
    if (heading && (!last || startMs - last.startMs >= MIN_CHAPTER_GAP_MS || index === 0)) {
      candidates.push({
        title: heading,
        startMs,
        source,
        confidence: durationSeconds ? "estimated" : "estimated",
      });
    }
    cursorWords += paragraphWords;
  });

  if (estimatedDurationMs >= 8 * 60000 && candidates.length < 3) {
    const intervalMs = 4 * 60000;
    for (let ms = intervalMs; ms < estimatedDurationMs - 60000; ms += intervalMs) {
      candidates.push({
        title: `Part ${Math.floor(ms / intervalMs) + 1}`,
        startMs: ms,
        source: "tts_chunk",
        confidence: "estimated",
      });
    }
  }

  const chapters = normalizeAudioChapters(candidates, estimatedDurationMs / 1000);
  return {
    version: 1,
    title: safeTitle,
    audioFilename,
    generatedAt: new Date().toISOString(),
    timing: durationSeconds ? "estimated_from_text_scaled_to_audio_duration" : "estimated_from_text",
    chapters,
  };
}

export function chaptersToCue(bundle, filename = "") {
  const title = cueEscape(bundle?.title || "Audio Narration");
  const audioFilename = cueEscape(filename || bundle?.audioFilename || "audio.mp3");
  const lines = [
    `TITLE "${title}"`,
    `FILE "${audioFilename}" MP3`,
  ];
  (bundle?.chapters || []).forEach((chapter, index) => {
    lines.push(`  TRACK ${String(index + 1).padStart(2, "0")} AUDIO`);
    lines.push(`    TITLE "${cueEscape(chapter.title)}"`);
    lines.push(`    INDEX 01 ${cueTimestamp(chapter.startMs)}`);
  });
  return `${lines.join("\n")}\n`;
}

export function chaptersToText(bundle) {
  const lines = [
    bundle?.title || "Audio Narration",
    "",
    ...(bundle?.chapters || []).map((chapter) => `${formatChapterTimestamp(chapter.startMs)} ${chapter.title}`),
  ];
  return `${lines.join("\n")}\n`;
}

export function downloadChapterSidecars(bundle, audioFilename = "audio.mp3") {
  const base = String(audioFilename || "audio.mp3").replace(/\.[^.]+$/, "");
  const files = [
    {
      name: `${base}.chapters.json`,
      type: "application/json",
      text: JSON.stringify({ ...bundle, audioFilename }, null, 2),
    },
    {
      name: `${base}.cue`,
      type: "application/x-cue",
      text: chaptersToCue({ ...bundle, audioFilename }, audioFilename),
    },
    {
      name: `${base}.chapters.txt`,
      type: "text/plain",
      text: chaptersToText({ ...bundle, audioFilename }),
    },
  ];

  files.forEach((file, index) => {
    window.setTimeout(() => {
      const url = URL.createObjectURL(new Blob([file.text], { type: file.type }));
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, index * 120);
  });
}
