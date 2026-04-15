#!/usr/bin/env node
/**
 * Obolos CLI entrypoint.
 *
 * All commands live in `cli/src/commands/` and are registered in
 * `cli/src/commands/index.ts`. This file only dispatches argv and renders
 * top-level help. See `cli/src/registry.ts` for the Command contract.
 */

import { dispatch } from './runtime/dispatch.js';
import { registry } from './commands/index.js';

const args = process.argv.slice(2);
const command = args[0];
const commandArgs = args.slice(1);

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', red: '\x1b[31m', yellow: '\x1b[33m',
};

function showHelp() {
  const groups: Record<string, string[]> = {};
  for (const cmd of registry.all()) {
    const [group] = cmd.name.split('.');
    (groups[group] ||= []).push(cmd.name);
  }

  process.stdout.write(`
${c.bold}${c.cyan}obolos${c.reset} — Commerce infrastructure for autonomous work on Base

${c.bold}Usage:${c.reset}
  obolos <command> [options]
  obolos <group> <subcommand> [options]

${c.bold}Top-level commands:${c.reset}
${registry.all().filter(c => !c.name.includes('.')).map(c => `  ${c.name.padEnd(14)} ${c.summary}`).join('\n')}

${c.bold}Groups:${c.reset}
${Object.entries(groups).filter(([, cmds]) => cmds.some(n => n.includes('.'))).map(([g, cmds]) => `  ${g.padEnd(14)} ${cmds.filter(n => n.includes('.')).length} subcommands  (obolos ${g} --help)`).join('\n')}

${c.bold}Output:${c.reset}
  --json          Machine-readable JSON (stable schema, use this when scripting)
  --dry-run       Preview destructive actions without executing
  -h, --help      Show command help (includes JSON schema for MCP/scripting)

${c.bold}Config:${c.reset}
  ~/.obolos/config.json (mode 0600) or OBOLOS_PRIVATE_KEY / OBOLOS_API_URL env vars.
  Run ${c.cyan}obolos setup --generate${c.reset} to create a new wallet.

${c.bold}MCP:${c.reset}
  Every command above is also exposed as an MCP tool by @obolos_tech/mcp-server.
  Run ${c.cyan}obolos setup-mcp${c.reset} for install + configuration instructions.

${c.bold}Docs:${c.reset} https://obolos.tech
`);
}

function showGroupHelp(group: string): boolean {
  const subcommands = registry.all().filter(c => c.name.startsWith(`${group}.`));
  if (subcommands.length === 0) return false;
  process.stdout.write(`
${c.bold}${c.cyan}obolos ${group}${c.reset}

${c.bold}Subcommands:${c.reset}
${subcommands.map(c => `  ${c.name.slice(group.length + 1).padEnd(16)} ${c.summary}`).join('\n')}

Run ${c.cyan}obolos ${group} <subcommand> --help${c.reset} for subcommand details.
`);
  return true;
}

async function main() {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    return;
  }

  // Group help: `obolos job --help` / `obolos anp --help`.
  if (commandArgs.length === 0 || commandArgs[0] === '--help' || commandArgs[0] === '-h') {
    if (showGroupHelp(command)) return;
  }

  const result = await dispatch(command, commandArgs);
  if (result.handled) {
    if (result.exitCode && result.exitCode !== 0) process.exit(result.exitCode);
    return;
  }

  process.stderr.write(`${c.red}Unknown command: ${command}${c.reset}\n`);
  showHelp();
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`${c.red}Error: ${err.message}${c.reset}\n`);
  process.exit(1);
});
