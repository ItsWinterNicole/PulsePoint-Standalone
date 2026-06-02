import { splitSentencesPreservingDecimals } from "@/utils/aiTextRepair";
import TTSReader from "./TTSReader";

export function renderSentenceHighlightedText(text, activeSentenceIdx = -1, onSentenceClick) {
  const sentences = splitSentencesPreservingDecimals(text);
  return sentences.map((sentence, index) => (
    <span
      key={`${index}-${sentence.slice(0, 24)}`}
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        onSentenceClick?.(index);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onSentenceClick?.(index);
      }}
      className={`rounded-sm px-0.5 transition-colors ${activeSentenceIdx === index ? "bg-primary/20 text-foreground" : "hover:bg-muted/40"}`}
    >
      {sentence}{index < sentences.length - 1 ? " " : ""}
    </span>
  ));
}

function colorWithAlpha(color, alpha) {
  if (!color) return `hsl(var(--primary) / ${alpha})`;
  if (color.startsWith("hsl(var(")) return color.replace(/\)\)$/, `) / ${alpha})`);
  if (color.startsWith("hsl(") || color.startsWith("rgb(")) return color;
  if (color.startsWith("#")) {
    const clean = color.slice(1);
    if (clean.length === 3) {
      const expanded = clean.split("").map((char) => char + char).join("");
      return `#${expanded}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
    }
    if (clean.length === 6) return `${color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
    return color;
  }
  return color;
}

function SectionHeader({ section }) {
  if (!section?.label && !section?.title) return null;
  return (
    <p
      className="mb-1.5 mt-4 flex items-center gap-1.5 border-t border-border pt-3 text-xs font-semibold uppercase tracking-wider"
      style={{ color: section.color || "hsl(var(--primary))" }}
    >
      {section.icon}{section.label || section.title}
    </p>
  );
}

export default function AIOutputReader({
  paragraphs,
  paragraphMeta = [],
  sessionId,
  title,
  sessionDate,
  sourceGeneratedAt,
  summaryColor = "hsl(var(--primary))",
}) {
  const safeParagraphs = (paragraphs || []).filter(Boolean);

  return (
    <TTSReader
      sessionId={sessionId}
      title={title}
      sessionDate={sessionDate}
      sourceGeneratedAt={sourceGeneratedAt}
      paragraphs={safeParagraphs}
      renderParagraph={(text, idx, isActive, isBuffering, activeSentenceIdx, startFromSentence) => {
        const meta = paragraphMeta[idx] || {};
        const section = meta.sec || meta.section || meta;
        const isSummary = meta.type === "summary" || meta.type === "overview" || meta.type === "title" || idx === 0 && !section?.label;
        const color = section?.color || (isSummary ? summaryColor : "hsl(var(--primary))");
        const sectionKey = section?.key || section?.label || section?.title || `section-${idx}`;
        const firstSectionIndex = paragraphMeta.findIndex((item) => {
          const itemSection = item?.sec || item?.section || item;
          const itemKey = itemSection?.key || itemSection?.label || itemSection?.title;
          return (item.type === "section" || item.type === "phase" || item.type === "quality")
            && itemKey === sectionKey;
        });
        const isFirstInSection = !isSummary && firstSectionIndex === idx;

        if (isSummary) {
          return (
            <p
              className="rounded-r-md border-l-2 py-1 pl-3 text-base font-medium leading-relaxed transition-all duration-200"
              style={{
                borderColor: isActive ? color : colorWithAlpha(color, 0.5),
                background: isActive ? colorWithAlpha(color, 0.12) : isBuffering ? colorWithAlpha(color, 0.07) : "transparent",
                color: "hsl(var(--foreground))",
              }}
            >
              {isBuffering && (
                <span className="mr-2 inline-block h-3 w-3 rounded-full border-2 border-t-transparent align-[-1px] animate-spin" style={{ borderColor: color, borderTopColor: "transparent" }} />
              )}
              {renderSentenceHighlightedText(text, activeSentenceIdx, startFromSentence)}
            </p>
          );
        }

        return (
          <div>
            {isFirstInSection && <SectionHeader section={section} />}
            <li
              className="list-none rounded-r-md border-l-2 py-1.5 pl-3 text-sm leading-relaxed transition-all duration-200"
              style={{
                borderColor: isActive ? color : colorWithAlpha(color, 0.45),
                background: isActive ? colorWithAlpha(color, 0.1) : isBuffering ? colorWithAlpha(color, 0.06) : "transparent",
                color: "hsl(var(--foreground))",
              }}
            >
              {isBuffering && (
                <span className="mr-2 inline-block h-3 w-3 rounded-full border-2 border-t-transparent align-[-1px] animate-spin" style={{ borderColor: color, borderTopColor: "transparent" }} />
              )}
              {renderSentenceHighlightedText(text, activeSentenceIdx, startFromSentence)}
            </li>
          </div>
        );
      }}
    />
  );
}
