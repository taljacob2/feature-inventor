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
  it("counts open items in Next/Later/Horizon without confusing a colliding heading", () => {
    // "## Next Steps" sits right where a bare word-boundary match on "## Next"
    // would false-match it (a space is a word boundary too) — this is the
    // exact fixture the ROADMAP.md retry note asked for.
    const roadmapWithCollision = `# Roadmap

## Now

- [ ] Do the first thing — S/M — why it matters

## Next

- [ ] Real next item one — M/M — why
- [ ] Real next item two — M/M — why
- [x] Already done, doesn't count

## Next Steps

- [ ] This belongs to an unrelated heading and must not be counted as "Next"

## Later (harder, uncertain effort)

- [ ] One later item — L/L — why

## Horizon (speculative)

- [ ] One horizon item — why
- [ ] Another horizon item — why
`;

    expect(parseBacklogCounts(roadmapWithCollision)).toEqual({
      next: 2,
      later: 1,
      horizon: 2,
    });
  });

  it("returns zero counts when a section is absent", () => {
    expect(parseBacklogCounts("# Roadmap\n\n## Now\n\n- [ ] Something\n")).toEqual({
      next: 0,
      later: 0,
      horizon: 0,
    });
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

  it("ignores a non-entry '## ' heading that isn't date-prefixed", () => {
    // A future "## Notes" or "## Deprecated" section (outside a fenced
    // block) must not be mistaken for a shipped entry — the same class of
    // over-eager heading match as the Next/Next-Steps collision, just here
    // it's "any ## line" instead of a name collision.
    const withStrayHeading = `# Changelog

## Notes

Some commentary that isn't an entry.

## 2026-08-01 — Real entry
- Notes here
`;
    expect(parseChangelogEntries(withStrayHeading)).toEqual(["2026-08-01 — Real entry"]);
  });
});
