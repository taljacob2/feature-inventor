import { COMMAND_NAMES, COMMAND_OPTIONS, GLOBAL_OPTIONS, SUBCOMMANDS } from "./command-spec.js";

export const SUPPORTED_SHELLS = ["bash", "zsh", "fish", "powershell"] as const;
export type CompletionShell = typeof SUPPORTED_SHELLS[number];

function words(values: readonly string[]): string {
  return values.join(" ");
}

function bashSubcommandCases(): string {
  return Object.entries(SUBCOMMANDS)
    .map(([command, values]) => `    ${command}) subcommands="${words(values)}" ;;`)
    .join("\n");
}

function bashOptionCases(): string {
  return Object.entries(COMMAND_OPTIONS)
    .map(([command, values]) => `    ${command}) options="${words(values)} $global_options" ;;`)
    .join("\n");
}

function generateBash(): string {
  return `# bash completion for feature-inventor
_feature_inventor() {
  local cur command subcommands options
  cur="${"${COMP_WORDS[COMP_CWORD]}"}"
  command="${"${COMP_WORDS[1]}"}"
  local commands="${words(COMMAND_NAMES)}"
  local global_options="${words(GLOBAL_OPTIONS)}"

  if [ "${"$COMP_CWORD"}" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${"$commands"}" -- "${"$cur"}") )
    return 0
  fi

  case "$command" in
${bashSubcommandCases()}
  esac
  if [ "${"$COMP_CWORD"}" -eq 2 ] && [ -n "${"$subcommands"}" ]; then
    COMPREPLY=( $(compgen -W "${"$subcommands"}" -- "${"$cur"}") )
    return 0
  fi

  options="$global_options"
  case "$command" in
${bashOptionCases()}
  esac
  COMPREPLY=( $(compgen -W "${"$options"}" -- "${"$cur"}") )
}
complete -F _feature_inventor feature-inventor
`;
}

function zshValues(values: readonly string[]): string {
  return values.map((value) => `'${value}:${value}'`).join(" ");
}

function zshCases(): string {
  return Object.entries(SUBCOMMANDS)
    .map(([command, values]) => `    ${command}) _values 'subcommand' ${zshValues(values)} ;;`)
    .join("\n");
}

function generateZsh(): string {
  return `#compdef feature-inventor

_feature_inventor() {
  local state
  _arguments -C \\
    '1:command:->command' \\
    '*::argument:->argument'

  case $state in
    command)
      _values 'command' ${zshValues(COMMAND_NAMES)}
      ;;
    argument)
      case $words[2] in
${zshCases()}
      esac
      ;;
  esac
}

compdef _feature_inventor feature-inventor
`;
}

function fishCommandLines(): string {
  return COMMAND_NAMES
    .filter((command) => command !== "help")
    .map((command) => `complete -c feature-inventor -n '__fish_use_subcommand' -a '${command}' -d '${command}'`)
    .join("\n");
}

function fishSubcommandLines(): string {
  return Object.entries(SUBCOMMANDS)
    .flatMap(([command, values]) => values.map((value) => `complete -c feature-inventor -n '__fish_seen_subcommand_from ${command}' -a '${value}' -d '${value}'`))
    .join("\n");
}

function fishOptionLines(): string {
  const global = GLOBAL_OPTIONS.filter((option) => option.startsWith("--"));
  const globalLines = global.map((option) => `complete -c feature-inventor -l '${option.slice(2)}'`).join("\n");
  const commandLines = Object.entries(COMMAND_OPTIONS)
    .flatMap(([command, values]) => values.map((option) => `complete -c feature-inventor -n '__fish_seen_subcommand_from ${command}' -l '${option.slice(2)}'`))
    .join("\n");
  return `${globalLines}\n${commandLines}`;
}

function generateFish(): string {
  return `# fish completion for feature-inventor
complete -c feature-inventor -f
${fishCommandLines()}
${fishSubcommandLines()}
${fishOptionLines()}
`;
}

function powershellArray(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(", ");
}

function powershellOptions(): string {
  const entries = Object.entries(COMMAND_OPTIONS)
    .map(([command, options]) => `    '${command}' { @(${powershellArray(options)}) }`)
    .join("\n");
  return `switch ($command) {\n${entries}\n    default { @() }\n  }`;
}

function generatePowerShell(): string {
  return `# PowerShell completion for feature-inventor
Register-ArgumentCompleter -Native -CommandName feature-inventor -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)

  $commands = @(${powershellArray(COMMAND_NAMES)})
  $globalOptions = @(${powershellArray(GLOBAL_OPTIONS)})
  $arguments = @($commandAst.CommandElements | Select-Object -Skip 1 | ForEach-Object { $_.Extent.Text })
  $command = if ($arguments.Count -gt 0) { $arguments[0] } else { '' }

  if ($arguments.Count -le 1 -and $wordToComplete -notlike '--*') {
    $candidates = $commands
  } else {
    $candidates = $globalOptions + (${powershellOptions()})
  }

  $candidates | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
  }
}
`;
}

export function isCompletionShell(value: string): value is CompletionShell {
  return (SUPPORTED_SHELLS as readonly string[]).includes(value);
}

/** Generates a shell-native script. It does not install or evaluate the script. */
export function generateCompletion(shell: CompletionShell): string {
  switch (shell) {
    case "bash": return generateBash();
    case "zsh": return generateZsh();
    case "fish": return generateFish();
    case "powershell": return generatePowerShell();
  }
}
