export interface CommandTopic {
  name: string;
  summary: string;
  usage: string;
  examples: string[];
  options?: readonly string[];
  subcommands?: readonly string[];
}

export interface CommandGroup {
  title: string;
  commands: readonly [string, string][];
}

export const GLOBAL_OPTIONS = [
  "--format",
  "--json",
  "--color",
  "--motion",
  "--non-interactive",
  "--cwd",
  "--help",
  "-h",
] as const;

export const COMMAND_GROUPS: readonly CommandGroup[] = [
  {
    title: "Start safely",
    commands: [
      ["init", "Create an explicit local target manifest; guided or scriptable"],
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
      ["completion", "Print an installable Bash, Zsh, Fish, or PowerShell completion script"],
      ["stop|daemon", "Stop a run or inspect the retired legacy daemon boundary"],
    ],
  },
] as const;

export const COMMAND_TOPICS: Readonly<Record<string, CommandTopic>> = {
  init: {
    name: "init",
    summary: "Create a local, operator-owned target manifest without starting a runtime.",
    usage: "feature-inventor init [--repository URL --default-branch BRANCH --goal TEXT --check COMMAND] [--non-interactive] [--force]",
    examples: [
      "feature-inventor init",
      "feature-inventor init --non-interactive --repository https://github.com/OWNER/REPO.git --default-branch main --goal \"Improve onboarding\" --check \"npm test\"",
    ],
    options: ["--repository", "--default-branch", "--goal", "--check", "--max-files", "--no-indexing", "--force"],
  },
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
    options: ["--context-pack", "--no-auto-index"],
  },
  run: {
    name: "run",
    summary: "Launch exactly one approved proposal through a registered runtime adapter.",
    usage: "feature-inventor run --runtime ADAPTER_ID --run RUN_ID [options]",
    examples: ["feature-inventor run --runtime manus --run RUN_ID", "feature-inventor run --runtime claude --run RUN_ID"],
    options: ["--runtime", "--run"],
  },
  index: {
    name: "index",
    summary: "Build and inspect deterministic local repository intelligence.",
    usage: "feature-inventor index status|build|report|heatmap|context [options]",
    examples: ["feature-inventor index build", "feature-inventor index context --feature governed-run --pack change"],
    subcommands: ["status", "build", "report", "heatmap", "context"],
  },
  completion: {
    name: "completion",
    summary: "Print an installable completion script for one supported shell.",
    usage: "feature-inventor completion bash|zsh|fish|powershell",
    examples: ["feature-inventor completion bash", "feature-inventor completion powershell"],
    subcommands: ["bash", "zsh", "fish", "powershell"],
  },
};

export const COMMAND_NAMES = [
  "init", "overview", "status", "doctor", "docs", "index", "plan", "propose", "journal", "watch", "recover",
  "capture", "verify", "review", "finalize", "run", "manus", "claude", "schedule", "recap", "stop", "daemon", "completion", "help",
] as const;

export const SUBCOMMANDS: Readonly<Record<string, readonly string[]>> = {
  docs: ["validate"],
  index: ["status", "build", "report", "heatmap", "context"],
  manus: ["run"],
  claude: ["run"],
  schedule: ["handoff"],
  daemon: ["clean"],
  completion: ["bash", "zsh", "fish", "powershell"],
};

export const COMMAND_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  init: COMMAND_TOPICS.init.options ?? [],
  propose: COMMAND_TOPICS.propose.options ?? [],
  run: COMMAND_TOPICS.run.options ?? [],
  index: ["--by", "--limit", "--feature", "--flow", "--path", "--command", "--pack", "--max-tokens"],
  watch: ["--run"],
  recover: ["--run"],
  capture: ["--run"],
  verify: ["--run", "--check"],
  review: ["--run"],
  finalize: ["--run"],
  journal: ["--run"],
  recap: ["--since", "--all", "--peek"],
  stop: ["--cancel"],
};
