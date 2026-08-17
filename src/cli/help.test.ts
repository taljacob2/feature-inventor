import { describe, expect, it } from "vitest";
import { formatCommandHelp, formatTopLevelHelp, formatUnknownHelpTopic } from "./help.js";

describe("CLI help", () => {
  it("groups the primary governed workflow and documents global presentation controls", () => {
    const help = formatTopLevelHelp();
    expect(help).toContain("START SAFELY");
    expect(help).toContain("overview");
    expect(help).toContain("GOVERN A PROPOSAL AND RUN");
    expect(help).toContain("--format human|json|plain");
    expect(help).toContain("--non-interactive");
    expect(help).toContain("No command starts a runtime unless you explicitly invoke `run`.");
  });

  it("provides focused help for common commands and a useful unknown-topic fallback", () => {
    expect(formatCommandHelp("propose")).toContain("Create an immutable proposal");
    expect(formatCommandHelp("propose")).toContain("--no-auto-index");
    expect(formatCommandHelp("index")).toContain("index status|build|report|heatmap|context");
    expect(formatCommandHelp("missing-command")).toBeNull();
    expect(formatUnknownHelpTopic("missing-command")).toContain("Unknown help topic: missing-command");
  });
});
