import { describe, expect, it } from "vitest";
import { decodeTuiRawInput, isEnterKeypress, isPrintableKeypressInput } from "./session.js";

describe("TUI raw terminal input", () => {
  it("ignores undefined composition-like payloads without treating them as confirmation text", () => {
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

  it("recognizes named and raw Enter representations immediately", () => {
    expect(isEnterKeypress(undefined, { name: "return" })).toBe(true);
    expect(isEnterKeypress(undefined, { name: "enter" })).toBe(true);
    expect(isEnterKeypress("\r")).toBe(true);
    expect(isEnterKeypress("\n")).toBe(true);
    expect(isEnterKeypress(undefined, { sequence: "\r" })).toBe(true);
    expect(isEnterKeypress(undefined, { sequence: "\n" })).toBe(true);
    expect(isEnterKeypress(undefined, { name: "left", sequence: "\u001b[D" })).toBe(false);
    expect(isEnterKeypress("B", { name: "b" })).toBe(false);
  });

  it("decodes raw CR, LF, and CRLF into first-class Enter events", () => {
    for (const payload of ["\r", "\n", "\r\n", Buffer.from("\r"), Buffer.from("\n"), Buffer.from("\r\n")]) {
      const events = decodeTuiRawInput(payload);
      expect(events).toHaveLength(1);
      expect(isEnterKeypress(events[0]!.input, events[0]!.key)).toBe(true);
    }
  });

  it("decodes palette navigation and text without emitting phantom Enter events", () => {
    expect(decodeTuiRawInput("\u001b[A")).toEqual([{ input: undefined, key: { name: "up", sequence: "\u001b[A" } }]);
    expect(decodeTuiRawInput("\u001b[B")).toEqual([{ input: undefined, key: { name: "down", sequence: "\u001b[B" } }]);
    expect(decodeTuiRawInput("\u001b")).toEqual([{ input: undefined, key: { name: "escape", sequence: "\u001b" } }]);
    expect(decodeTuiRawInput("overview").map((event) => event.input).join("")).toBe("overview");
    expect(decodeTuiRawInput("\u0003")).toEqual([{ input: undefined, key: { name: "c", ctrl: true, sequence: "\u0003" } }]);
  });
});
