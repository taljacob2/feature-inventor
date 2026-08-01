import { describe, expect, it } from "vitest";
import { parseStopFlag, serializeStopFlag } from "./stop-flag.js";

describe("stop-flag", () => {
  it("round-trips through serialize/parse", () => {
    const content = { requestedAt: "2026-08-01T00:00:00.000Z" };
    expect(parseStopFlag(serializeStopFlag(content))).toEqual(content);
  });

  it("returns null for invalid JSON", () => {
    expect(parseStopFlag("not json")).toBeNull();
  });

  it("returns null when requestedAt is missing", () => {
    expect(parseStopFlag(JSON.stringify({ foo: "bar" }))).toBeNull();
  });

  it("returns null when requestedAt is the wrong type", () => {
    expect(parseStopFlag(JSON.stringify({ requestedAt: 12345 }))).toBeNull();
  });
});
