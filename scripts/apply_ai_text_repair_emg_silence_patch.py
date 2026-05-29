from pathlib import Path

panel_path = Path("src/components/SessionAIPanel.jsx")
repair_path = Path("src/utils/aiTextRepair.js")

missing = [str(path) for path in [panel_path, repair_path] if not path.exists()]
if missing:
    raise SystemExit("Run this from the PulsePoint-Standalone repo root. Missing: " + ", ".join(missing))

panel = panel_path.read_text(encoding="utf-8")
repair = repair_path.read_text(encoding="utf-8")

if "AI_TEXT_REPAIR_EMG_SILENCE_V1" in panel or "AI_TEXT_REPAIR_EMG_SILENCE_V1" in repair:
    print("AI text repair / EMG silence v1 already appears to be applied. No changes made.")
    raise SystemExit(0)

panel_backup = panel_path.with_suffix(".jsx.bak-ai-text-repair-emg-silence-v1")
repair_backup = repair_path.with_suffix(".js.bak-ai-text-repair-emg-silence-v1")
panel_backup.write_text(panel, encoding="utf-8")
repair_backup.write_text(repair, encoding="utf-8")

repair_new = '''// AI_TEXT_REPAIR_EMG_SILENCE_V1

function looksLikeCharacterSplitLines(nonEmptyLines) {
  if (nonEmptyLines.length < 24) return false;
  const singleCharLines = nonEmptyLines.filter((line) => line.length === 1).length;
  const veryShortLines = nonEmptyLines.filter((line) => line.length <= 2).length;
  const shortishLines = nonEmptyLines.filter((line) => line.length <= 4).length;
  return (
    (singleCharLines / nonEmptyLines.length >= 0.5 && veryShortLines / nonEmptyLines.length >= 0.72) ||
    (veryShortLines / nonEmptyLines.length >= 0.8 && shortishLines / nonEmptyLines.length >= 0.92)
  );
}

function joinCharacterSplitLines(nonEmptyLines) {
  return nonEmptyLines
    .join("")
    .replace(/\s+/g, " ")
    .replace(/([.!?])([A-Z])/g, "$1 $2")
    .replace(/([,:;])([A-Z])/g, "$1 $2")
    .trim();
}

export function repairCharacterSplitParagraph(text) {
  if (typeof text !== "string") return text;

  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.map((line) => line.trim()).filter(Boolean);
  if (looksLikeCharacterSplitLines(nonEmpty)) return joinCharacterSplitLines(nonEmpty);

  return text;
}

function flattenCharacterSplitArray(items) {
  if (!Array.isArray(items) || items.length < 24) return null;
  const strings = items.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  if (strings.length !== items.length) return null;
  if (!looksLikeCharacterSplitLines(strings)) return null;
  return [joinCharacterSplitLines(strings)];
}

export function normalizeAITextList(value) {
  if (value == null) return [];
  if (typeof value === "string") {
    const repaired = repairCharacterSplitParagraph(value).trim();
    return repaired ? [repaired] : [];
  }
  if (!Array.isArray(value)) return [];

  const flattened = flattenCharacterSplitArray(value);
  if (flattened) return flattened;

  return value
    .flatMap((item) => {
      if (typeof item === "string") return [repairCharacterSplitParagraph(item).trim()].filter(Boolean);
      if (Array.isArray(item)) return normalizeAITextList(item);
      if (item && typeof item === "object") {
        const text = item.text || item.content || item.summary || item.analysis || item.description;
        return typeof text === "string" ? [repairCharacterSplitParagraph(text).trim()].filter(Boolean) : [];
      }
      return [];
    })
    .filter(Boolean);
}

export function repairAITextBlocks(value) {
  if (typeof value === "string") return repairCharacterSplitParagraph(value);

  if (Array.isArray(value)) {
    const flattened = flattenCharacterSplitArray(value);
    if (flattened) return flattened;
    return value.map((item) => repairAITextBlocks(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, repairAITextBlocks(item)])
    );
  }

  return value;
}
'''
repair_path.write_text(repair_new, encoding="utf-8")

panel = panel.replace(
'''import { repairAITextBlocks, repairCharacterSplitParagraph } from "@/utils/aiTextRepair";''',
'''import { normalizeAITextList, repairAITextBlocks, repairCharacterSplitParagraph } from "@/utils/aiTextRepair";''',
1,
)

panel = panel.replace(
'''const BODY_STATE_INTERPRETIVE_STYLE_V1 = `
BODY-STATE INTERPRETIVE STYLE - RESTORE PULSEPOINT FEEL:
''',
'''const EMG_SILENCE_RULE_V1 = `
EMG DATA SILENCE RULE - HIGH PRIORITY:
- EMG is optional session evidence. If EMG DATA is not provided in this prompt, do not mention EMG at all.
- Do not say EMG was missing, unavailable, not recorded, absent, or would be helpful unless the person explicitly asks about missing data.
- Do not compare HR to EMG, recommend EMG calibration, discuss EMG limitations, or include an EMG section unless EMG DATA is present.
- If EMG DATA is present, interpret it carefully as normalized relative activation only, not absolute force.
`;

const BODY_STATE_INTERPRETIVE_STYLE_V1 = `
BODY-STATE INTERPRETIVE STYLE - RESTORE PULSEPOINT FEEL:
''',
1,
)

panel = panel.replace(
'''${AI_SESSION_TYPE_GROUNDING_V1}
${BODY_STATE_INTERPRETIVE_STYLE_V1}
''',
'''${AI_SESSION_TYPE_GROUNDING_V1}
${EMG_SILENCE_RULE_V1}
${BODY_STATE_INTERPRETIVE_STYLE_V1}
''',
1,
)

panel = panel.replace(
'''          emg_analysis: { type: "array", items: { type: "string" }, description: "EMG signal quality, activation patterns, L/R comparison, EMG vs HR, calibration notes — only if EMG data present" },
''',
'''          ...(emgSummary ? {
            emg_analysis: { type: "array", items: { type: "string" }, description: "EMG signal quality, activation patterns, L/R comparison, EMG vs HR, calibration notes. Only use because EMG DATA is present." },
          } : {}),
''',
1,
)

panel = panel.replace(
'''        const arousalItems = result.arousal_arc || result.phase_analysis || [];
        const eventItems = result.event_analysis || result.hr_analysis || [];
        const emgItems = result.emg_analysis || [];
''',
'''        const arousalItems = normalizeAITextList(result.arousal_arc || result.phase_analysis);
        const eventItems = normalizeAITextList(result.event_analysis || result.hr_analysis);
        const emgItems = emgRows.length ? normalizeAITextList(result.emg_analysis) : [];
        const notableItems = normalizeAITextList(result.notable_findings);
        const recommendationItems = normalizeAITextList(result.recommendations);
''',
1,
)

panel = panel.replace(
'''          result.summary,
          ...arousalItems,
          ...eventItems,
          ...emgItems,
          ...(result.notable_findings || []),
          ...(result.recommendations || []),
        ]
          .filter(Boolean)
          .map(repairCharacterSplitParagraph);
''',
'''          ...normalizeAITextList(result.summary),
          ...arousalItems,
          ...eventItems,
          ...emgItems,
          ...notableItems,
          ...recommendationItems,
        ]
          .filter(Boolean)
          .map(repairCharacterSplitParagraph);
''',
1,
)

panel = panel.replace(
'''        if (result.summary) sections.push({ label: null, color: "primary", items: [result.summary], start: idx++ });
''',
'''        const summaryItems = normalizeAITextList(result.summary);
        if (summaryItems.length) { sections.push({ label: null, color: "primary", items: summaryItems, start: idx }); idx += summaryItems.length; }
''',
1,
)

panel = panel.replace(
'''        if (result.notable_findings?.length) { sections.push({ label: isTechnical ? "Notable Findings" : "Patterns & Hypotheses", color: "chart-4", icon: <Zap className="w-3.5 h-3.5" />, items: result.notable_findings, start: idx }); idx += result.notable_findings.length; }
        if (result.recommendations?.length) { sections.push({ label: isTechnical ? "Recommendations" : "Recommendations & Experiments", color: "accent", icon: <Lightbulb className="w-3.5 h-3.5" />, items: result.recommendations, start: idx }); }
''',
'''        if (notableItems.length) { sections.push({ label: isTechnical ? "Notable Findings" : "Patterns & Hypotheses", color: "chart-4", icon: <Zap className="w-3.5 h-3.5" />, items: notableItems, start: idx }); idx += notableItems.length; }
        if (recommendationItems.length) { sections.push({ label: isTechnical ? "Recommendations" : "Recommendations & Experiments", color: "accent", icon: <Lightbulb className="w-3.5 h-3.5" />, items: recommendationItems, start: idx }); }
''',
1,
)

panel_path.write_text(panel, encoding="utf-8")
print("Applied AI text repair / EMG silence v1.")
print("Changed:")
print("- src/utils/aiTextRepair.js now repairs both newline-split strings and arrays of one-character strings")
print("- SessionAIPanel normalizes all rendered AI text lists before display/TTS")
print("- SessionAIPanel suppresses EMG rendering when no EMG rows exist")
print("- Prompt now explicitly says absent EMG should not be mentioned at all")
print(f"Backups written to {panel_backup} and {repair_backup}")
