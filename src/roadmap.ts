function stripFencedCodeBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, "");
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extracts the open (unchecked) list items from a `## <sectionName>` section.
 *
 * The heading match requires that, after the section name, the line either
 * ends immediately or continues into a parenthetical suffix like
 * `## Now (this run's candidates, cheapest first)` — not a bare `\b` word
 * boundary. A word boundary alone would let `## Next` false-match the start
 * of an unrelated `## Next Steps` heading (a space is also a word boundary),
 * silently returning the wrong section's items. See ROADMAP.md's "Bug: ...
 * backlog section counts" retry note for the incident this fixes.
 */
function parseSection(markdown: string, sectionName: string): string[] {
  const headingPattern = new RegExp(
    `## ${escapeRegExp(sectionName)}(?:[ \\t]*\\([^\\n]*)?[ \\t]*\\n([\\s\\S]*?)(?=\\n## |\\n?$)`,
  );
  const match = stripFencedCodeBlocks(markdown).match(headingPattern);
  if (!match) return [];

  const items: string[] = [];
  let lastItemIsOpen = false;
  for (const line of match[1].split("\n")) {
    const bullet = line.match(/^- \[([ x])\]\s*(.*)$/);
    if (bullet) {
      const isChecked = bullet[1] === "x";
      if (isChecked) {
        lastItemIsOpen = false;
      } else {
        items.push(bullet[2].trim());
        lastItemIsOpen = true;
      }
    } else if (lastItemIsOpen && line.trim() !== "") {
      // Continuation of a wrapped, unchecked list item.
      items[items.length - 1] += " " + line.trim();
    }
  }
  return items;
}

export function parseNowSection(roadmapMd: string): string[] {
  return parseSection(roadmapMd, "Now");
}

/**
 * Extracts the open (unchecked) item titles from the Next section, in
 * document order. Used by `status` to preview upcoming work when the Now
 * section is empty (see `printStatus`'s "Up next" block).
 */
export function parseNextSection(roadmapMd: string): string[] {
  return parseSection(roadmapMd, "Next");
}

export interface BacklogCounts {
  next: number;
  later: number;
  horizon: number;
}

/** Counts of open (unchecked) items in the Next/Later/Horizon sections. */
export function parseBacklogCounts(roadmapMd: string): BacklogCounts {
  return {
    next: parseSection(roadmapMd, "Next").length,
    later: parseSection(roadmapMd, "Later").length,
    horizon: parseSection(roadmapMd, "Horizon").length,
  };
}

/**
 * Requires the heading to start with a YYYY-MM-DD date (CHANGELOG.md's
 * documented entry format), not just any `## ` line. A bare `## .+` match
 * would also pick up a future non-entry heading (e.g. `## Notes` or
 * `## Deprecated`) added outside a fenced block, silently treating it as a
 * "shipped" entry — the same class of over-eager boundary match that caused
 * the Next/Next-Steps collision in `parseSection` above, just for a
 * different file. See ROADMAP.md's "Audit other regex-based parsing" item.
 */
export function parseChangelogEntries(changelogMd: string, limit = 5): string[] {
  const entries = stripFencedCodeBlocks(changelogMd).match(/^## \d{4}-\d{2}-\d{2}\b.*$/gm) ?? [];
  return entries.slice(0, limit).map((line) => line.replace(/^## /, "").trim());
}
