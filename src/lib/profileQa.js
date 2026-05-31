function parseFindingBullets(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•*-]+/, "").trim())
    .filter(Boolean);
}

export function toSecondPersonFinding(text, firstName = "") {
  let value = String(text || "").trim();
  const name = String(firstName || "").trim();
  if (name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    value = value
      .replace(new RegExp(`\\b${escaped}[’']s\\b`, "gi"), "your")
      .replace(new RegExp(`\\b${escaped}\\s+is\\b`, "gi"), "you are")
      .replace(new RegExp(`\\b${escaped}\\s+has\\b`, "gi"), "you have")
      .replace(new RegExp(`\\b${escaped}\\s+was\\b`, "gi"), "you were")
      .replace(new RegExp(`\\b${escaped}\\s+reports\\b`, "gi"), "you report")
      .replace(new RegExp(`\\b${escaped}\\s+describes\\b`, "gi"), "you describe")
      .replace(new RegExp(`\\b${escaped}\\s+experiences\\b`, "gi"), "you experience")
      .replace(new RegExp(`\\b${escaped}\\s+identifies\\b`, "gi"), "you identify")
      .replace(new RegExp(`\\b${escaped}\\b`, "gi"), "you");
  }

  return value
    .replace(/\bthe user[’']s\b/gi, "your")
    .replace(/\bthe user\s+is\b/gi, "you are")
    .replace(/\bthe user\s+has\b/gi, "you have")
    .replace(/\bthe user\s+reports\b/gi, "you report")
    .replace(/\bthe user\s+describes\b/gi, "you describe")
    .replace(/\bthe user\b/gi, "you")
    .replace(/\bhis or her\b/gi, "your")
    .replace(/\bhis\/her\b/gi, "your")
    .replace(/\bhis\b/gi, "your")
    .replace(/\bher\b/gi, "your")
    .replace(/\bhe has\b/gi, "you have")
    .replace(/\bshe has\b/gi, "you have")
    .replace(/\bhe is\b/gi, "you are")
    .replace(/\bshe is\b/gi, "you are")
    .replace(/\bhe\b/gi, "you")
    .replace(/\bshe\b/gi, "you")
    .replace(/\bhimself\b/gi, "yourself")
    .replace(/\bherself\b/gi, "yourself")
    .replace(/\bhim\b/gi, "you")
    .replace(/\s+/g, " ")
    .replace(/^your\b/, "Your")
    .replace(/^you\b/, "You")
    .trim();
}

function sourceLabelForProfileQaEntry(entry) {
  if (entry.source === "imported_profile_notes") return "Imported";
  if (isVisualReviewProfileQaEntry(entry)) {
    return entry.persistence_status === "review_candidate" || entry.needs_review
      ? "Sarah visual review"
      : entry.source?.includes("video")
        ? "Sarah video review"
        : "Sarah image review";
  }
  return "Auto-saved";
}

export function isVisualReviewProfileQaEntry(entry) {
  return [
    "profile_sarah_image_review",
    "profile_sarah_video_review",
    "profile_sarah_visual_review",
    "session_sarah_image_review",
    "session_sarah_video_review",
    "session_sarah_visual_review",
  ].includes(String(entry?.source || ""));
}

export function parseProfileQaFindingsFromText(text) {
  const source = String(text || "");
  const matches = [...source.matchAll(/\[AI Interview\s*[—-]\s*([^\]]+)\]\s*([\s\S]*?)(?=\n\s*\[AI Interview\s*[—-]|\s*$)/g)];
  return matches.map((match, index) => ({
    id: `imported-${String(match[1]).trim()}-${index}`,
    date: String(match[1]).trim(),
    source: "imported_profile_notes",
    findings: parseFindingBullets(match[2]),
    saved_at: null,
  })).filter((entry) => entry.findings.length);
}

export function normalizeProfileQaFindings(value) {
  const entries = Array.isArray(value) ? value : parseProfileQaFindingsFromText(value);
  const seen = new Set();
  return entries
    .map((entry, index) => ({
      id: entry.id || `profile-qa-${entry.date || "undated"}-${index}`,
      date: entry.date || entry.created_at?.slice?.(0, 10) || entry.saved_at?.slice?.(0, 10) || "Undated",
      source: entry.source || "profile_ai_interview",
      saved_at: entry.saved_at || entry.created_at || null,
      needs_review: Boolean(entry.needs_review),
      persistence_status: entry.persistence_status || "recommended",
      structured_findings: Array.isArray(entry.structured_findings) ? entry.structured_findings : [],
      image_count: Number(entry.image_count || 0),
      frame_count: Number(entry.frame_count || 0),
      media_context: entry.media_context || null,
      findings: Array.isArray(entry.findings) ? entry.findings.map((item) => String(item).trim()).filter(Boolean) : parseFindingBullets(entry.findings),
    }))
    .filter((entry) => entry.findings.length)
    .filter((entry) => {
      const key = `${entry.date}|${entry.findings.join("|").toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const aTime = Date.parse(a.saved_at || a.date) || 0;
      const bTime = Date.parse(b.saved_at || b.date) || 0;
      return bTime - aTime;
    });
}

export function makeProfileQaEntry(findingsText, meta = {}) {
  const now = new Date().toISOString();
  return {
    id: `profile-qa-${now}`,
    date: meta.date || now.slice(0, 10),
    source: meta.source || "profile_ai_interview",
    saved_at: now,
    needs_review: Boolean(meta.needs_review),
    persistence_status: meta.persistence_status || "recommended",
    structured_findings: Array.isArray(meta.structured_findings) ? meta.structured_findings : [],
    frame_count: Number(meta.frame_count || 0),
    media_context: meta.media_context || null,
    image_count: meta.image_count != null
      ? Number(meta.image_count || 0)
      : Array.isArray(meta.conversation)
      ? meta.conversation.reduce((count, message) => count + (Array.isArray(message.imageAttachments) ? message.imageAttachments.length : 0), 0)
      : 0,
    findings: parseFindingBullets(findingsText),
  };
}

export function normalizeFindingKey(finding) {
  return String(finding || "")
    .toLowerCase()
    .replace(/[“”"]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(the|a|an|and|or|but|that|this)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatProfileQaTimestamp(entry) {
  const raw = entry?.saved_at || entry?.date;
  if (!entry?.saved_at && /^\d{4}-\d{2}-\d{2}$/.test(String(raw || ""))) {
    const [year, month, day] = String(raw).split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, day));
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return entry?.date || "Undated";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: entry?.saved_at ? "numeric" : undefined,
    minute: entry?.saved_at ? "2-digit" : undefined,
  }).format(new Date(parsed));
}

export function buildProfileQaFindingCards(entries, firstName = "") {
  const seen = new Map();
  normalizeProfileQaFindings(entries).forEach((entry) => {
    entry.findings.forEach((rawFinding, index) => {
      const finding = toSecondPersonFinding(rawFinding, firstName);
      const key = normalizeFindingKey(finding);
      if (!key) return;
      const existing = seen.get(key);
      if (existing) {
        existing.duplicateCount += 1;
        existing.sources.push(entry.id);
        return;
      }
      seen.set(key, {
        id: `${entry.id}-${index}`,
        finding,
        date: entry.date,
        saved_at: entry.saved_at,
        timestamp: formatProfileQaTimestamp(entry),
        source: entry.source,
        needs_review: entry.needs_review,
        persistence_status: entry.persistence_status,
        image_count: entry.image_count,
        frame_count: entry.frame_count,
        media_context: entry.media_context,
        sourceLabel: sourceLabelForProfileQaEntry(entry),
        duplicateCount: 0,
        sources: [entry.id],
      });
    });
  });
  return Array.from(seen.values()).sort((a, b) => {
    const aTime = Date.parse(a.saved_at || a.date) || 0;
    const bTime = Date.parse(b.saved_at || b.date) || 0;
    return bTime - aTime;
  });
}

export function buildRecentProfileQaFindings(entries, firstName = "", limit = 3) {
  return normalizeProfileQaFindings(entries)
    .flatMap((entry) => entry.findings.map((rawFinding, index) => ({
      id: `${entry.id || "profile-qa"}-recent-${index}`,
      finding: toSecondPersonFinding(rawFinding, firstName),
      date: entry.date,
      saved_at: entry.saved_at,
      timestamp: formatProfileQaTimestamp(entry),
      source: entry.source,
      needs_review: entry.needs_review,
      persistence_status: entry.persistence_status,
      image_count: entry.image_count,
      frame_count: entry.frame_count,
      media_context: entry.media_context,
      sourceLabel: sourceLabelForProfileQaEntry(entry),
      entryId: entry.id,
      order: index,
    })))
    .sort((a, b) => {
      const aTime = Date.parse(a.saved_at || a.date) || 0;
      const bTime = Date.parse(b.saved_at || b.date) || 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.order - b.order;
    })
    .slice(0, limit);
}

function simpleHash(text) {
  let hash = 0;
  const source = String(text || "");
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function extractImageReviewFindingCandidates(text, firstName = "") {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return [];
  const terms = /\b(visible|image|photo|anatom|foreskin|glans|frenulum|meatus|urethra|shaft|skin|retracted|catheter|foley|sleeve|device|marker|sticker|fit|position|angle|lighting|occlusion|review|observable|observed)\b/i;
  const sentences = source
    .match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) || [];
  const candidates = sentences.filter((sentence) => terms.test(sentence)).slice(0, 4);
  const fallback = candidates.length ? candidates : sentences.slice(0, 3);
  return fallback
    .map((sentence) => toSecondPersonFinding(sentence, firstName))
    .filter(Boolean);
}

export function backfillImageReviewFindingsFromChat(messages = [], existingEntries = [], firstName = "") {
  if (!Array.isArray(messages) || !messages.length) return [];
  const existingIds = new Set(existingEntries.map((entry) => entry.id).filter(Boolean));
  const existingKeys = new Set(
    existingEntries.flatMap((entry) => (entry.findings || []).map((finding) => normalizeFindingKey(toSecondPersonFinding(finding, firstName))))
  );
  const backfilled = [];
  const now = Date.now();

  messages.forEach((message, index) => {
    if (message?.role !== "user" || !Array.isArray(message.imageAttachments) || !message.imageAttachments.length) return;
    const replyIndex = messages.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate?.role !== "user" && String(candidate?.text || "").trim());
    if (replyIndex < 0) return;
    const reply = messages[replyIndex];
    const findings = extractImageReviewFindingCandidates(reply.text, firstName);
    const uniqueFindings = findings.filter((finding) => {
      const key = normalizeFindingKey(finding);
      return key && !existingKeys.has(key);
    });
    if (!uniqueFindings.length) return;

    const id = `chat-image-review-${replyIndex}-${simpleHash(reply.text)}`;
    if (existingIds.has(id)) return;
    uniqueFindings.forEach((finding) => existingKeys.add(normalizeFindingKey(finding)));
    backfilled.push({
      id,
      date: new Date(now - Math.max(0, messages.length - replyIndex) * 1000).toISOString().slice(0, 10),
      source: "profile_sarah_image_review",
      saved_at: new Date(now - Math.max(0, messages.length - replyIndex) * 1000).toISOString(),
      needs_review: true,
      persistence_status: "review_candidate",
      structured_findings: [],
      image_count: message.imageAttachments.length,
      findings: uniqueFindings,
    });
  });

  return backfilled;
}
