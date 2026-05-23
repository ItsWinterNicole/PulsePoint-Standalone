function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripLegacyHtml(value) {
  return decodeEntities(String(value || "")
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, "_$2_")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, ""));
}

export function richTextToCanonicalText(value) {
  const text = String(value || "");
  const plain = /<[a-z][\s\S]*>/i.test(text) ? stripLegacyHtml(text) : text;
  return plain
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function richTextToPlainText(value) {
  return richTextToCanonicalText(value)
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1");
}

function formatInlineText(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>");
}

export function canonicalTextToEditorHtml(value) {
  const text = richTextToCanonicalText(value);
  if (!text) return "";

  const blocks = text.split(/\n{2,}/);
  return blocks.map((block) => {
    const lines = block.split("\n");
    if (lines.every((line) => /^- /.test(line))) {
      return `<ul>${lines.map((line) => `<li>${formatInlineText(line.slice(2))}</li>`).join("")}</ul>`;
    }
    if (lines.every((line) => /^\d+\. /.test(line))) {
      return `<ol>${lines.map((line) => `<li>${formatInlineText(line.replace(/^\d+\. /, ""))}</li>`).join("")}</ol>`;
    }
    return `<p>${formatInlineText(lines.join("\n")).replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

function serializeInlineNode(node) {
  if (node.type === "hardBreak") return "\n";
  if (node.type !== "text") return "";
  return (node.marks || []).reduce((text, mark) => {
    if (mark.type === "bold") return `**${text}**`;
    if (mark.type === "italic") return `_${text}_`;
    return text;
  }, node.text || "");
}

function serializeBlock(node) {
  const inline = (node.content || []).map(serializeInlineNode).join("");
  if (node.type === "paragraph") return inline;
  if (node.type === "bulletList") {
    return (node.content || []).map((item) => `- ${serializeBlock(item)}`).join("\n");
  }
  if (node.type === "orderedList") {
    return (node.content || []).map((item, index) => `${index + 1}. ${serializeBlock(item)}`).join("\n");
  }
  if (node.type === "listItem") {
    return (node.content || []).map(serializeBlock).filter(Boolean).join("\n");
  }
  return (node.content || []).map(serializeBlock).filter(Boolean).join("\n");
}

export function editorJsonToCanonicalText(doc) {
  return richTextToCanonicalText((doc?.content || []).map(serializeBlock).filter(Boolean).join("\n\n"));
}
