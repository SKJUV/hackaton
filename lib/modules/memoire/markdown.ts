/** Rendu Markdown minimal et sûr côté serveur (copie de components/workspace/ui.tsx, module client). */
function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(s: string) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[(S\d+)\]/g, '<span class="ws-cite">$1</span>');
}

/** Rendu Markdown minimal et sûr (le texte est échappé avant transformation). */
export function markdownToHtml(md: string): string {
  const lines = escapeHtml(md).split("\n");
  const out: string[] = [];
  let list: "ul" | null = null;
  let table: string[][] | null = null;
  const flushList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  const flushTable = () => {
    if (!table) return;
    const [head, ...rows] = table.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c.trim())));
    out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    table = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\|.*\|$/.test(line.trim())) {
      flushList();
      table = table ?? [];
      table.push(line.trim().slice(1, -1).split("|").map((c) => c.trim()));
      continue;
    }
    flushTable();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushList();
      out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`);
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (!list) {
        list = "ul";
        out.push("<ul>");
      }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+(\[ \]\s*)?/, (_m, box) => (box ? "☐ " : "")))}</li>`);
    } else if (/^&gt;\s?/.test(line)) {
      flushList();
      out.push(`<blockquote>${inline(line.replace(/^&gt;\s?/, ""))}</blockquote>`);
    } else if (!line.trim()) {
      flushList();
    } else {
      flushList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  flushList();
  flushTable();
  return out.join("\n");
}
