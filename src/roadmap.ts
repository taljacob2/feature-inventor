function stripFencedCodeBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, "");
}

/**
 * Extracts the open (unchecked) list items from a single `## <headingName>`
 * section of a roadmap-style markdown document, joining wrapped continuation
 * lines back onto the item they belong to and excluding checked (`[x]`)
 * items entirely (including their wrapped continuation lines).
 */
function parseSection(roadmapMd: string, headingName: string): string[] {
  const headingPattern = new RegExp(`\\n## ${headingName}\\b[^\\n]*\\n`);
  const stripped = stripFencedCodeBlocks(roadmapMd);
  const withLeadingNewline = stripped.startsWith("\n") ? stripped : "\n" + stripped;
  const headingMatch = withLeadingNewline.match(headingPattern);
  if (!headingMatch || headingMatch.index === undefined) return [];

  const bodyStart = headingMatch.index + headingMatch[0].length;
  const rest = withLeadingNewline.slice(bodyStart);
  const nextHeadingMatch = rest.match(/\n## /);
  const body = nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest;

  const items: string[] = [];
  let lastItemIsOpen = false;
  for (const line of body.split("\n")) {
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
 * Counts open (unchecked) items in each of the Next/Later/Horizon backlog
 * sections, so the overall shape/health of the backlog is visible without
 * opening ROADMAP.md directly.
 */
export function parseBacklogCounts(roadmapMd: string): { next: number; later: number; horizon: number } {
  return {
    next: parseSection(roadmapMd, "Next").length,
    later: parseSection(roadmapMd, "Later").length,
    horizon: parseSection(roadmapMd, "Horizon").length,
  };
}

export function parseChangelogEntries(changelogMd: string, limit = 5): string[] {
  const entries = stripFencedCodeBlocks(changelogMd).match(/^## .+$/gm) ?? [];
  return entries.slice(0, limit).map((line) => line.replace(/^## /, "").trim());
}
