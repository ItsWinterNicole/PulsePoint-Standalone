export function repairCharacterSplitParagraph(text) {
  if (typeof text !== "string") return text;

  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.map((line) => line.trim()).filter(Boolean);
  const singleCharLines = nonEmpty.filter((line) => line.length === 1).length;
  const shortLines = nonEmpty.filter((line) => line.length <= 2).length;
  const looksCharacterSplit =
    nonEmpty.length >= 40 &&
    singleCharLines / nonEmpty.length >= 0.65 &&
    shortLines / nonEmpty.length >= 0.85;

  if (!looksCharacterSplit) return text;

  return nonEmpty
    .join("")
    .replace(/\s+/g, " ")
    .replace(/([.!?])([A-Z])/g, "$1 $2")
    .trim();
}

export function repairAITextBlocks(value) {
  if (typeof value === "string") return repairCharacterSplitParagraph(value);

  if (Array.isArray(value)) {
    return value.map((item) => repairAITextBlocks(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, repairAITextBlocks(item)])
    );
  }

  return value;
}
