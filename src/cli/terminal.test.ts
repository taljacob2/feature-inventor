import { describe, expect, it } from "vitest";
import {
  detectTerminalCapabilities,
  parseGlobalCliArguments,
  resolvePresentation,
  withLegacyJsonArgument,
} from "./terminal.js";

describe("parseGlobalCliArguments", () => {
  it("extracts global presentation controls without changing command-specific arguments", () => {
    const parsed = parseGlobalCliArguments([
      "--cwd",
      "C:\\work\\target",
      "index",
      "heatmap",
      "--by",
      "churn",
      "--format",
      "json",
      "--non-interactive",
    ]);

    expect(parsed.command).toBe("index");
    expect(parsed.commandArgs).toEqual(["heatmap", "--by", "churn"]);
    expect(parsed.options).toMatchObject({
      cwd: expect.stringContaining("C:"),
      format: "json",
      nonInteractive: true,
      color: "auto",
      motion: "auto",
    });
    expect(withLegacyJsonArgument(parsed.commandArgs, parsed.options)).toEqual(["heatmap", "--by", "churn", "--json"]);
  });

  it("supports the legacy JSON shorthand but rejects ambiguous output declarations", () => {
    expect(parseGlobalCliArguments(["overview", "--json"]).options.format).toBe("json");
    expect(() => parseGlobalCliArguments(["overview", "--json", "--format", "human"])).toThrow("cannot be combined");
  });

  it("fails clearly for missing, duplicate, and unsupported global values", () => {
    expect(() => parseGlobalCliArguments(["--cwd"])).toThrow("--cwd requires a value");
    expect(() => parseGlobalCliArguments(["overview", "--color", "rainbow"])).toThrow("--color must be");
    expect(() => parseGlobalCliArguments(["overview", "--motion", "off", "--motion", "reduce"])).toThrow("at most one");
  });
});

describe("terminal capability detection", () => {
  it("uses plain safe defaults in a non-interactive or explicitly no-color terminal", () => {
    const capabilities = detectTerminalCapabilities(
      { TERM: "dumb", NO_COLOR: "1", LANG: "C" },
      { isTTY: false, columns: 0 },
    );
    expect(capabilities).toMatchObject({
      isInteractive: false,
      supportsColor: false,
      supportsUnicode: false,
      motionReduced: false,
      columns: null,
    });
  });

  it("keeps forced color explicit while suppressing it for JSON and plain formats", () => {
    const capabilities = detectTerminalCapabilities({ LANG: "en_US.UTF-8" }, { isTTY: true, columns: 120 });
    const forced = resolvePresentation({ format: "human", color: "always", motion: "auto", nonInteractive: false, cwd: null }, capabilities);
    expect(forced).toMatchObject({ colorEnabled: true, unicodeEnabled: true, motionEnabled: true });

    const json = resolvePresentation({ format: "json", color: "always", motion: "auto", nonInteractive: false, cwd: null }, capabilities);
    expect(json).toMatchObject({ colorEnabled: false, motionEnabled: false });
  });
});
