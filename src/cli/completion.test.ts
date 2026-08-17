import { describe, expect, it, vi } from "vitest";
import { COMMAND_NAMES } from "./command-spec.js";
import { generateCompletion, isCompletionShell, SUPPORTED_SHELLS } from "./completion.js";
import { runCli } from "../cli.js";

describe("shell completion generation", () => {
  it("recognizes exactly the supported portable shell identifiers", () => {
    expect(SUPPORTED_SHELLS).toEqual(["bash", "zsh", "fish", "powershell"]);
    expect(isCompletionShell("bash")).toBe(true);
    expect(isCompletionShell("pwsh")).toBe(false);
  });

  it("emits shell-native completion registration with the shared command vocabulary", () => {
    const bash = generateCompletion("bash");
    const zsh = generateCompletion("zsh");
    const fish = generateCompletion("fish");
    const powershell = generateCompletion("powershell");

    expect(bash).toContain("complete -F _feature_inventor feature-inventor");
    expect(zsh).toContain("compdef _feature_inventor feature-inventor");
    expect(fish).toContain("complete -c feature-inventor -f");
    expect(powershell).toContain("Register-ArgumentCompleter -Native -CommandName feature-inventor");
    for (const command of COMMAND_NAMES) {
      expect(bash).toContain(command);
      expect(zsh).toContain(command);
      expect(fish).toContain(command);
      expect(powershell).toContain(command);
    }
  });

  it("routes the public completion command without writing files or starting a runtime", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runCli(["completion", "fish"]);
    expect(String(write.mock.calls[0]![0])).toContain("fish completion for feature-inventor");
    await expect(runCli(["completion", "unknown-shell"])).rejects.toThrow("Usage: feature-inventor completion");
    write.mockRestore();
  });
});
