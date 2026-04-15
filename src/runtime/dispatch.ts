/**
 * Dispatcher: look up a command by name/alias, parse its argv against the
 * schema, build a RunContext, run, then render with format() or JSON.
 *
 * Returns { handled: true, exitCode } when the registry owns the command;
 * returns { handled: false } so the legacy switch in index.ts can handle
 * commands that haven't been ported yet.
 */

import { registry } from '../commands/index.js';
import { parseArgs } from './argv.js';
import { loadConfig } from './config.js';
import { createHttpClient } from './http.js';
import { renderJson } from './output.js';
import { CliError } from './errors.js';
import { toJsonSchema } from '../schema/json-schema.js';

export interface DispatchResult {
  handled: boolean;
  exitCode?: number;
}

export async function dispatch(command: string, argv: string[]): Promise<DispatchResult> {
  // Try `group.sub` first if the first argv token is not a flag.
  // Lets us route `obolos reputation check 42` → reputation.check with argv ["42"].
  let cmd = registry.resolve(command);
  let remaining = argv;
  if (argv[0] && !argv[0].startsWith('-')) {
    const combined = `${command}.${argv[0]}`;
    const grouped = registry.resolve(combined);
    if (grouped) { cmd = grouped; remaining = argv.slice(1); }
    else if (command === 'rep' || command === 'reputation') {
      const aliased = registry.resolve(`reputation.${argv[0]}`);
      if (aliased) { cmd = aliased; remaining = argv.slice(1); }
    }
    else if (command === 'j' || command === 'job') {
      const aliased = registry.resolve(`job.${argv[0]}`);
      if (aliased) { cmd = aliased; remaining = argv.slice(1); }
    }
    else if (command === 'l' || command === 'listing') {
      const aliased = registry.resolve(`listing.${argv[0]}`);
      if (aliased) { cmd = aliased; remaining = argv.slice(1); }
    }
    else if (command === 'anp') {
      const aliased = registry.resolve(`anp.${argv[0]}`);
      if (aliased) { cmd = aliased; remaining = argv.slice(1); }
    }
  }
  if (!cmd) return { handled: false };
  argv = remaining;

  try {
    const parsed = parseArgs(cmd.input, argv);

    if (parsed.help) {
      process.stdout.write(renderHelp(cmd) + '\n');
      return { handled: true, exitCode: 0 };
    }

    const config = loadConfig();
    const ctx = {
      config,
      http: createHttpClient(config.apiUrl),
      source: 'cli' as const,
      json: parsed.json,
      dryRun: parsed.dryRun,
    };

    const output = await cmd.run(parsed.input as never, ctx);

    if (parsed.json || !cmd.format) {
      process.stdout.write(renderJson(output) + '\n');
    } else {
      process.stdout.write(cmd.format(output, ctx) + '\n');
    }
    return { handled: true, exitCode: 0 };
  } catch (err) {
    if (err instanceof CliError) {
      process.stderr.write(`Error: ${err.message}\n`);
      return { handled: true, exitCode: err.code };
    }
    throw err;
  }
}

function renderHelp(cmd: ReturnType<typeof registry.resolve> & {}): string {
  const lines: string[] = [
    `obolos ${cmd.name} — ${cmd.summary}`,
    '',
  ];
  if (cmd.description) lines.push(cmd.description, '');

  const fields = Object.entries(cmd.input) as Array<[string, import('../registry.js').FieldDef]>;
  if (fields.length > 0) {
    lines.push('Arguments:');
    for (const [name, field] of fields) {
      const prefix = field.positional !== undefined ? `  <${name}>` : `  --${name}`;
      const req = field.required ? ' (required)' : '';
      const def = field.default !== undefined ? ` [default: ${JSON.stringify(field.default)}]` : '';
      const en = field.enum ? ` (${field.enum.join('|')})` : '';
      lines.push(`${prefix.padEnd(24)} ${field.description}${req}${def}${en}`);
    }
    lines.push('');
  }

  lines.push('Options:');
  lines.push('  --json               Machine-readable output');
  lines.push('  --dry-run            Preview destructive actions without executing');
  lines.push('  -h, --help           Show this help');

  if (cmd.examples?.length) {
    lines.push('', 'Examples:');
    for (const ex of cmd.examples) lines.push(`  ${ex}`);
  }

  lines.push('', 'JSON schema (for MCP / scripting):');
  lines.push(JSON.stringify(toJsonSchema(cmd.input), null, 2));

  return lines.join('\n');
}
