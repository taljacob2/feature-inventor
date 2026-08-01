import { describe, expect, it } from "vitest";
import { parseBacklogCounts, parseChangelogEntries, parseNowSection } from "./roadmap.js";

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

describe("parseBacklogCounts", () => {
  const ROADMAP_WITH_BACKLOG = `# Roadmap

## Now

- [ ] Do the first thing — S/M — why it matters

## Next

- [ ] Next item one — why it matters
- [x] Already done next item
- [ ] Next item two
      continues here — why it matters

## Later

- [ ] Later item one — why it matters

## Horizon

- [ ] Horizon item one — why it matters
- [ ] Horizon item two — why it matters
`;

  it("counts open items in each of Next/Later/Horizon independently", () => {
    expect(parseBacklogCounts(ROADMAP_WITH_BACKLOG)).toEqual({
      next: 2,
      later: 1,
      horizon: 2,
    });
  });

  it("returns zero counts when a section is missing or has no open items", () => {
    const noBacklog = `# Roadmap

## Now

- [ ] Something — S/S — why it matters
`;
    expect(parseBacklogCounts(noBacklog)).toEqual({ next: 0, later: 0, horizon: 0 });
  });

  it("does not confuse a heading like 'Next Steps' with 'Next' due to word-boundary matching", () => {
    const trickyHeading = `# Roadmap

## Now

- [ ] Something — S/S — why it matters

## Next

- [ ] Real next item

## Later

- [ ] A later item
`;
    expect(parseBacklogCounts(trickyHeading)).toEqual({ next: 1, later: 1, horizon: 0 });
  });

  it("ignores '## Next'-like lines inside fenced code blocks", () => {
    const withTemplate = `# Roadmap

## Now

- [ ] Something — S/S — why it matters

## Next

\`\`\`
## Next
- [ ] fake item inside a code block
\`\`\`

- [ ] Real item

## Later
`;
    expect(parseBacklogCounts(withTemplate)).toEqual({ next: 1, later: 0, horizon: 0 });
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
