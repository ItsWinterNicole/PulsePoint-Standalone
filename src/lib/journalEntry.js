const JOURNAL_KEYS = [
  "title",
  "emotional_reflection",
  "physiological_observations",
  "experience_narrative",
  "key_moments",
  "insights",
  "next_session_intentions",
];

export function normalizeJournalEntry(value) {
  if (!value || typeof value !== "object") return null;
  const source = value.generated_entry && typeof value.generated_entry === "object"
    ? value.generated_entry
    : value;

  const normalized = {
    title: source.title || value.title || "",
    emotional_reflection: source.emotional_reflection || "",
    physiological_observations: source.physiological_observations || "",
    experience_narrative: source.experience_narrative || "",
    key_moments: Array.isArray(source.key_moments) ? source.key_moments.filter(Boolean) : [],
    insights: source.insights || "",
    next_session_intentions: source.next_session_intentions || "",
  };

  return JOURNAL_KEYS.some((key) => {
    const item = normalized[key];
    return Array.isArray(item) ? item.length > 0 : String(item || "").trim();
  }) ? normalized : null;
}

export function journalHasStoryline(value) {
  const normalized = normalizeJournalEntry(value);
  return Boolean(
    normalized?.emotional_reflection ||
    normalized?.physiological_observations ||
    normalized?.experience_narrative ||
    normalized?.insights ||
    normalized?.next_session_intentions ||
    normalized?.key_moments?.length
  );
}
