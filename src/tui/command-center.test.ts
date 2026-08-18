import { describe, expect, it } from "vitest";
import { COMMAND_NAMES } from "../cli/command-spec.js";
import { parseTuiCommand, parseTuiCommandInput, toTuiCommandAction } from "./command-center.js";

describe("TUI governed command center", () => {
  it("splits quoted values into an argv vector without shell evaluation", () => {
    expect(parseTuiCommandInput('approve run-1 --reviewer maintainer --note "Reviewed scope and checks."')).toEqual([
      "approve",
      "run-1",
      "--reviewer",
      "maintainer",
      "--note",
      "Reviewed scope and checks.",
    ]);
  });

  it("runs inspection commands immediately but gives lifecycle-changing commands a preview and exact typed phrase", () => {
    const overview = parseTuiCommand("overview");
    expect(overview.requiresConfirmation).toBe(false);

    const run = parseTuiCommand("run --runtime manus --run run-1");
    expect(run.requiresConfirmation).toBe(true);
    expect(run.confirmationPhrase).toBe("EXECUTE RUN");
    expect(toTuiCommandAction(run).command).toEqual(["run", "--runtime", "manus", "--run", "run-1"]);

    const stop = parseTuiCommand("stop --cancel");
    expect(stop.requiresConfirmation).toBe(true);
    expect(stop.confirmationPhrase).toBe("EXECUTE STOP");
  });

  it("accepts every declared top-level command name for the command center while leaving detailed CLI validation intact", () => {
    for (const command of COMMAND_NAMES) {
      if (command === "tui") continue;
      expect(parseTuiCommand(command).command[0]).toBe(command);
    }
  });

  it("rejects nested sessions, --cwd escapes, shell operators, invalid quotes, and unknown commands", () => {
    expect(() => parseTuiCommand("tui")).toThrow("Nested TUI sessions");
    expect(() => parseTuiCommand("overview --cwd ../other")).toThrow("--cwd");
    expect(() => parseTuiCommand("run --runtime manus && stop")).toThrow("shell operators");
    expect(() => parseTuiCommand("not-a-command")).toThrow("Unsupported Feature Inventor command");
    expect(() => parseTuiCommandInput('approve run-1 --note "unfinished')).toThrow("unterminated");
  });
});
