import { describe, expect, it } from "vitest";
import {
  appendFeatureLogEntries,
  parseFeatureLogEntries,
  serializeFeatureLogEntry,
  type FeatureLogEntry,
} from "./feature-log.js";

const SHIPPED_ENTRY: FeatureLogEntry = {
  date: "2026-08-01",
  title: "Clean error + non-zero exit in cli.ts",
  ice: { impact: 6, confidence: 8, ease: 9, composite: 7.7 },
  status: "shipped",
  commitSha: "abc1234",
  verificationConcerns: "",
};

const ABANDONED_ENTRY: FeatureLogEntry = {
  date: "2026-08-01",
  title: "Generic multi-repo support",
  ice: { impact: 3, confidence: 4, ease: 2, composite: 3 },
  status: "abandoned",
  reason: "out of scope per VISION.md",
};

describe("serializeFeatureLogEntry", () => {
  it("produces a single-line JSON record", () => {
    const line = serializeFeatureLogEntry(SHIPPED_ENTRY);
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual(SHIPPED_ENTRY);
  });
});

describe("appendFeatureLogEntries", () => {
  it("writes entries to empty content, one JSON object per line", () => {
    const result = appendFeatureLogEntries("", [SHIPPED_ENTRY, ABANDONED_ENTRY]);
    const lines = result.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual(SHIPPED_ENTRY);
    expect(JSON.parse(lines[1])).toEqual(ABANDONED_ENTRY);
  });

  it("appends to existing content without disturbing prior lines", () => {
    const existing = appendFeatureLogEntries("", [SHIPPED_ENTRY]);
    const result = appendFeatureLogEntries(existing, [ABANDONED_ENTRY]);
    expect(parseFeatureLogEntries(result)).toEqual([SHIPPED_ENTRY, ABANDONED_ENTRY]);
  });

  it("adds a missing trailing newline before appending", () => {
    const existingNoNewline = serializeFeatureLogEntry(SHIPPED_ENTRY); // no trailing \n
    const result = appendFeatureLogEntries(existingNoNewline, [ABANDONED_ENTRY]);
    expect(parseFeatureLogEntries(result)).toEqual([SHIPPED_ENTRY, ABANDONED_ENTRY]);
  });

  it("returns existing content unchanged when there are no new entries", () => {
    const existing = appendFeatureLogEntries("", [SHIPPED_ENTRY]);
    expect(appendFeatureLogEntries(existing, [])).toBe(existing);
  });
});

describe("parseFeatureLogEntries", () => {
  it("returns an empty array for empty content", () => {
    expect(parseFeatureLogEntries("")).toEqual([]);
  });

  it("round-trips a reverted entry with all optional fields", () => {
    const reverted: FeatureLogEntry = {
      date: "2026-08-02",
      title: "Something risky",
      ice: { impact: 8, confidence: 5, ease: 6, composite: 6.3 },
      status: "reverted",
      reason: "failed independent verification: tests didn't cover the change",
      commitSha: "def5678",
      verificationConcerns: "diff touched unrelated files",
    };
    const content = appendFeatureLogEntries("", [reverted]);
    expect(parseFeatureLogEntries(content)).toEqual([reverted]);
  });

  it("round-trips an entry with a selfAssessment block", () => {
    const withSelfAssessment: FeatureLogEntry = {
      ...SHIPPED_ENTRY,
      selfAssessment: {
        creativity: "creative",
        difficulty: "medium",
        confident: true,
        wantedHumanGuidance: false,
        knowledgeGaps: "wasn't sure how the Workflow tool's fs restrictions applied here",
        modelFit: "right-sized",
      },
    };
    const content = appendFeatureLogEntries("", [withSelfAssessment]);
    expect(parseFeatureLogEntries(content)).toEqual([withSelfAssessment]);
  });

  it("skips an entry with an invalid selfAssessment (bad enum value)", () => {
    const content = JSON.stringify({
      ...SHIPPED_ENTRY,
      selfAssessment: {
        creativity: "wildly-inventive", // not a valid Creativity value
        difficulty: "medium",
        confident: true,
        wantedHumanGuidance: false,
        modelFit: "right-sized",
      },
    });
    expect(parseFeatureLogEntries(content)).toEqual([]);
  });

  it("treats an entry with no selfAssessment as valid (field is optional)", () => {
    expect(parseFeatureLogEntries(appendFeatureLogEntries("", [SHIPPED_ENTRY]))).toEqual([SHIPPED_ENTRY]);
  });

  it("skips blank lines and lines that fail to parse as JSON", () => {
    const content = [
      serializeFeatureLogEntry(SHIPPED_ENTRY),
      "",
      "not valid json {{{",
      serializeFeatureLogEntry(ABANDONED_ENTRY),
      "   ",
    ].join("\n");
    expect(parseFeatureLogEntries(content)).toEqual([SHIPPED_ENTRY, ABANDONED_ENTRY]);
  });

  it("skips a JSON line that parses but is missing required fields", () => {
    const content = [
      serializeFeatureLogEntry(SHIPPED_ENTRY),
      JSON.stringify({ title: "missing everything else" }),
    ].join("\n");
    expect(parseFeatureLogEntries(content)).toEqual([SHIPPED_ENTRY]);
  });

  it("skips a line with an invalid status value", () => {
    const content = JSON.stringify({
      date: "2026-08-01",
      title: "bad status",
      ice: { impact: 1, confidence: 1, ease: 1, composite: 1 },
      status: "in-progress",
    });
    expect(parseFeatureLogEntries(content)).toEqual([]);
  });
});
