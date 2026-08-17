import { describe, expect, it } from "vitest";
import { isPrintableKeypressInput } from "./session.js";

describe("TUI keypress input safety", () => {
  it("ignores an undefined Windows keypress payload without throwing or treating it as confirmation text", () => {
    expect(() => isPrintableKeypressInput(undefined)).not.toThrow();
    expect(isPrintableKeypressInput(undefined)).toBe(false);
    expect(isPrintableKeypressInput(null)).toBe(false);
    expect(isPrintableKeypressInput({ name: "return" })).toBe(false);
  });

  it("accepts only a single printable text character", () => {
    expect(isPrintableKeypressInput("B")).toBe(true);
    expect(isPrintableKeypressInput(" ")).toBe(true);
    expect(isPrintableKeypressInput("")).toBe(false);
    expect(isPrintableKeypressInput("BUILD")).toBe(false);
    expect(isPrintableKeypressInput("\u007f")).toBe(false);
  });
});
