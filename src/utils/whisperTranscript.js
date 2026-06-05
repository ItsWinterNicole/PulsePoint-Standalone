const WHISPER_OUTRO_PATTERNS = [
  /\bthank you for watching\b/gi,
  /\bthanks for watching\b/gi,
  /\bthank you for listening\b/gi,
  /\bthanks for listening\b/gi,
  /\bdon't forget to (?:like|subscribe|like and subscribe)\b/gi,
  /\bplease (?:like|subscribe|like and subscribe)\b/gi,
  /\blike and subscribe\b/gi,
  /\bsubscribe for more\b/gi,
  /\bsee you (?:next time|in the next video)\b/gi,
  /\bthis has been (?:a )?(?:recording|presentation|video)\b/gi,
];

const TRAILING_COMMAND_PATTERN = /(?:^|[\s.,!?;:])(stop|end)[\s.!?]*$/i;

export function cleanWhisperTranscript(rawText) {
  let text = String(rawText || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";

  text = text.replace(TRAILING_COMMAND_PATTERN, "").trim();

  for (const pattern of WHISPER_OUTRO_PATTERNS) {
    text = text.replace(pattern, " ");
  }

  return text
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s.,!?;:]+|[\s.,!?;:]+$/g, "")
    .trim();
}

export function isOnlyWhisperHallucination(rawText) {
  const original = String(rawText || "").trim();
  if (!original) return true;
  return !cleanWhisperTranscript(original);
}
