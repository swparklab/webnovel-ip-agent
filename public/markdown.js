/* Tiny, dependency-free Markdown renderer for agent output.
   Supports: # ## ### headings, tables, - / 1. lists, **bold**, *italic*,
   `code`, > blockquote, --- rules, and paragraphs. HTML is escaped first. */
(function () {
  "use strict";

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function inline(text) {
    let t = esc(text);
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return t;
  }

  function splitRow(line) {
    let s = line.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|")) s = s.slice(0, -1);
    return s.split("|").map((c) => c.trim());
  }

  function isTableSep(line) {
    return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes("-");
  }

  function renderMarkdown(md) {
    const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let i = 0;
    let para = [];

    const flushPara = () => {
      if (para.length) {
        out.push(`<p>${inline(para.join(" "))}</p>`);
        para = [];
      }
    };

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Table: a row, followed by a separator row.
      if (trimmed.startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        flushPara();
        const header = splitRow(lines[i]);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          rows.push(splitRow(lines[i]));
          i += 1;
        }
        const thead = `<thead><tr>${header.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead>`;
        const tbody = `<tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody>`;
        out.push(`<div class="table-wrap"><table class="data-table">${thead}${tbody}</table></div>`);
        continue;
      }

      if (!trimmed) {
        flushPara();
        i += 1;
        continue;
      }

      // Horizontal rule.
      if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
        flushPara();
        out.push("<hr />");
        i += 1;
        continue;
      }

      // Headings.
      const h = trimmed.match(/^(#{1,4})\s+(.*)$/);
      if (h) {
        flushPara();
        // Agents emit `##` as their primary section header — render it as the
        // prominent h3. ### -> h4, #### -> h5. (# is rare, also h3.)
        const depth = h[1].length;
        const level = depth <= 2 ? 3 : depth === 3 ? 4 : 5;
        out.push(`<h${level}>${inline(h[2])}</h${level}>`);
        i += 1;
        continue;
      }

      // Blockquote.
      if (trimmed.startsWith(">")) {
        flushPara();
        const quote = [];
        while (i < lines.length && lines[i].trim().startsWith(">")) {
          quote.push(lines[i].trim().replace(/^>\s?/, ""));
          i += 1;
        }
        out.push(`<blockquote>${inline(quote.join(" "))}</blockquote>`);
        continue;
      }

      // Unordered list.
      if (/^[-*]\s+/.test(trimmed)) {
        flushPara();
        const items = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
          items.push(`<li>${inline(lines[i].trim().replace(/^[-*]\s+/, ""))}</li>`);
          i += 1;
        }
        out.push(`<ul>${items.join("")}</ul>`);
        continue;
      }

      // Ordered list.
      if (/^\d+\.\s+/.test(trimmed)) {
        flushPara();
        const items = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          items.push(`<li>${inline(lines[i].trim().replace(/^\d+\.\s+/, ""))}</li>`);
          i += 1;
        }
        out.push(`<ol>${items.join("")}</ol>`);
        continue;
      }

      para.push(trimmed);
      i += 1;
    }
    flushPara();
    return out.join("\n");
  }

  window.renderMarkdown = renderMarkdown;
})();
