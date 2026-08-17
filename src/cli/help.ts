export interface HelpTopic {
  name: string;
  summary: string;
  usage: string;
  examples: string[];
}

const TOPIC_GROUPS = [
  {
    title: "Start safely",
    commands: [
      ["overview", "See repository health, queue, and next safe action"],
      ["doctor", "Validate repository, manifest, Git, and policy prerequisites"],
      ["plan", "Inspect the approved candidate queue without starting work"],
      ["propose", "Create an immutable governed proposal; no runtime starts"],
    ],
  },
  {
    title: "Understand repository context",
    commands: [
      ["index status|build|report", "Manage the local commit-pinned repository index"],
      ["index heatmap", "Inspect one explicit structural or historical evidence lens"],
      ["index context", "Create a bounded source-linked context pack"],
      ["docs validate", "Validate the committed repository map and feature registry"],
    ],
  },
  {
    title: "Govern a proposal and run",
    commands: [
      ["run", "Launch one proposal through a selected runtime adapter"],
      ["watch|recover", "Observe or recover a governed runtime lifecycle"],
      ["verify|review|finalize", "Record evidence and complete the review lifecycle"],
      ["journal|recap", "Inspect append-only lifecycle evidence and summaries"],
    ],
  },
  {
    title: "Compatibility and administration",
    commands: [
      ["status", "Compatibility alias for overview"],
      ["manus run|claude run", "Compatibility runtime aliases; prefer run --runtime"],
      ["schedule handoff", "Write a proposal-pinned non-executing scheduler handoff"],
      ["stop|daemon", "Stop a run or inspect the retired legacy daemon boundary"],
    ],
  },
] as const;

const TOPICS: Record<string, HelpTopic> = {
  overview: {
    name: "overview",
    summary: "Show repository health, the governed queue, recent activity, and the next safe step.",
    usage: "feature-inventor overview [--format human|json|plain]",
    examples: ["feature-inventor overview", "feature-inventor overview --format json"],
  },
  doctor: {
    name: "doctor",
    summary: "Run non-mutating preflight checks before planning or launching work.",
    usage: "feature-inventor doctor [--format human|json|plain] [--cwd PATH]",
    examples: ["feature-inventor doctor", "feature-inventor doctor --cwd ../target-repository --format json"],
  },
  propose: {
    name: "propose",
    summary: "Create an immutable proposal and initial journal. It never starts an agent or changes target source.",
    usage: "feature-inventor propose [--context-pack PATH] [--no-auto-index] [--format human|json|plain]",
    examples: ["feature-inventor propose", "feature-inventor propose --no-auto-index", "feature-inventor propose --context-pack .feature-inventor/index/v1/COMMIT/context/PACK.json"],
  },
  run: {
    name: "run",
    summary: "Launch exactly one approved proposal through a registered runtime adapter.",
    usage: "feature-inventor run --runtime ADAPTER_ID --run RUN_ID [options]",
    examples: ["feature-inventor run --runtime manus --run RUN_ID", "feature-inventor run --runtime claude --run RUN_ID"],
  },
  index: {
    name: "index",
    summary: "Build and inspect deterministic local repository intelligence.",
    usage: "feature-inventor index status|build|report|heatmap|context [options]",
    examples: ["feature-inventor index build", "feature-inventor index context --feature governed-run --pack change"],
  },
};

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
  for (const group of TOPIC_GROUPS) {
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
  lines.push("  feature-inventor overview");
  lines.push("  feature-inventor doctor");
  lines.push("  feature-inventor propose");
  lines.push("  feature-inventor run --runtime manus --run RUN_ID");
  lines.push("");
  lines.push("Run `feature-inventor help <command>` for focused guidance. No command starts a runtime unless you explicitly invoke `run`.");
  return `${lines.join("\n")}\n`;
}

export function formatCommandHelp(command: string): string | null {
  const topic = TOPICS[command];
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
