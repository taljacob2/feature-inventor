import { COMMAND_GROUPS, COMMAND_TOPICS, type CommandTopic } from "./command-spec.js";

export type HelpTopic = CommandTopic;

function heading(value: string): string {
  return value.toUpperCase();
}

export function formatTopLevelHelp(): string {
  const lines = [
    "Feature Inventor",
    "Governed, evidence-backed repository improvement for one target at a time.",
    "",
    "Usage: feature-inventor <command> [options]",
    "",
  ];
  for (const group of COMMAND_GROUPS) {
    lines.push(heading(group.title));
    for (const [command, summary] of group.commands) lines.push(`  ${command.padEnd(24)} ${summary}`);
    lines.push("");
  }
  lines.push("GLOBAL OPTIONS");
  lines.push("  --format human|json|plain   Select output mode; --json remains a compatibility shorthand");
  lines.push("  --color auto|always|never   Control terminal color without changing machine output");
  lines.push("  --motion auto|reduce|off    Control optional terminal progress motion");
  lines.push("  --non-interactive            Refuse interactive prompts when commands add them in future releases");
  lines.push("  --cwd PATH                   Use a repository without changing the shell working directory");
  lines.push("");
  lines.push("EXAMPLES");
  lines.push("  feature-inventor init");
  lines.push("  feature-inventor overview");
  lines.push("  feature-inventor doctor");
  lines.push("  feature-inventor propose");
  lines.push("  feature-inventor run --runtime manus --run RUN_ID");
  lines.push("");
  lines.push("Run `feature-inventor help <command>` for focused guidance. No command starts a runtime unless you explicitly invoke `run`.");
  return `${lines.join("\n")}\n`;
}

export function formatCommandHelp(command: string): string | null {
  const topic = COMMAND_TOPICS[command];
  if (!topic) return null;
  return [
    `Feature Inventor ${topic.name}`,
    topic.summary,
    "",
    "USAGE",
    `  ${topic.usage}`,
    "",
    "EXAMPLES",
    ...topic.examples.map((example) => `  ${example}`),
    "",
    "Use --format json for scripts. Human output never changes proposal approval, runtime, or review gates.",
    "",
  ].join("\n");
}

export function formatUnknownHelpTopic(command: string): string {
  return `Unknown help topic: ${command}\n\n${formatTopLevelHelp()}`;
}
