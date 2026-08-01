function stripFencedCodeBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, "");
}

export function parseNowSection(roadmapMd: string): string[] {
  const match = stripFencedCodeBlocks(roadmapMd).match(/## Now\b[^\n]*\n([\s\S]*?)(?=\n## |\n?$)/);
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

export function parseChangelogEntries(changelogMd: string, limit = 5): string[] {
  const entries = stripFencedCodeBlocks(changelogMd).match(/^## .+$/gm) ?? [];
  return entries.slice(0, limit).map((line) => line.replace(/^## /, "").trim());
}
