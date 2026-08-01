import { describe, expect, it } from "vitest";
import { parseChangelogEntries, parseNowSection } from "./roadmap.js";

const SAMPLE_ROADMAP = `# Roadmap

## Now (this run's candidates, cheapest first)

- [ ] Do the first thing — S/M — why it matters
- [ ] Do the second thing — S/S — why it matters

## Next

- [ ] Do a later thing — M/M — why it matters
`;

const SAMPLE_CHANGELOG = `# Changelog

## 2026-08-02 — Shipped feature two
- Notes here

## 2026-08-01 — Shipped feature one
- Notes here
`;

describe("parseNowSection", () => {
  it("extracts only items from the Now section", () => {
    expect(parseNowSection(SAMPLE_ROADMAP)).toEqual([
      "Do the first thing — S/M — why it matters",
      "Do the second thing — S/S — why it matters",
    ]);
  });

  it("returns an empty array when there is no Now section", () => {
    expect(parseNowSection("# Roadmap\n\nnothing here\n")).toEqual([]);
  });

  it("joins a list item that wraps across multiple physical lines", () => {
    const wrapped = `# Roadmap

## Now

- [ ] First part of a long item
      continues here — S/M — details
- [ ] A short item

## Next
`;
    expect(parseNowSection(wrapped)).toEqual([
      "First part of a long item continues here — S/M — details",
      "A short item",
    ]);
  });

  it("excludes checked items, including their wrapped continuation lines", () => {
    const mixed = `# Roadmap

## Now

- [x] Already done item
      with a wrapped continuation line that should not leak in
- [ ] Still open item
- [x] Another done one

## Next
`;
    expect(parseNowSection(mixed)).toEqual(["Still open item"]);
  });
});

describe("parseChangelogEntries", () => {
  it("extracts entry titles most-recent-first, respecting the limit", () => {
    expect(parseChangelogEntries(SAMPLE_CHANGELOG, 1)).toEqual([
      "2026-08-02 — Shipped feature two",
    ]);
  });

  it("returns an empty array for an empty changelog", () => {
    expect(parseChangelogEntries("# Changelog\n\nNo entries yet.\n")).toEqual([]);
  });

  it("ignores '## ' lines inside fenced code blocks (e.g. a template example)", () => {
    const withTemplate = `# Changelog

Format:

\`\`\`
## YYYY-MM-DD — <feature title>
- Notes:
\`\`\`

No entries yet.
`;
    expect(parseChangelogEntries(withTemplate)).toEqual([]);
  });
});
