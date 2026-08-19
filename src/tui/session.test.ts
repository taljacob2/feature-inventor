import { describe, expect, it } from "vitest";
import { isEnterKeypress, isPrintableKeypressInput } from "./session.js";

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

  it("recognizes named and Windows-style Enter keypress representations immediately", () => {
    expect(isEnterKeypress(undefined, { name: "return" })).toBe(true);
    expect(isEnterKeypress(undefined, { name: "enter" })).toBe(true);
    expect(isEnterKeypress("\r")).toBe(true);
    expect(isEnterKeypress("\n")).toBe(true);
    expect(isEnterKeypress(undefined, { sequence: "\r" })).toBe(true);
    expect(isEnterKeypress(undefined, { sequence: "\n" })).toBe(true);
    expect(isEnterKeypress(undefined, { name: "left", sequence: "\u001b[D" })).toBe(false);
    expect(isEnterKeypress("B", { name: "b" })).toBe(false);
  });
});
