/**
 * Parse argv against an InputSchema. Supports:
 *   --flag value
 *   --flag=value
 *   -a value           (via field.alias)
 *   positional args    (via field.positional index)
 *   --flag (boolean)
 *
 * Returns a typed input object + leftover tokens (e.g. the trailing `--` bag).
 */

import type { InputSchema } from '../registry.js';
import { userError } from './errors.js';

export interface ParsedArgs {
  input: Record<string, unknown>;
  json: boolean;
  help: boolean;
  dryRun: boolean;
}

export function parseArgs(schema: InputSchema, argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  let json = false;
  let help = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--json') { json = true; continue; }
    if (tok === '--help' || tok === '-h') { help = true; continue; }
    if (tok === '--dry-run') { dryRun = true; continue; }

    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      if (eq !== -1) {
        flags[tok.slice(2, eq)] = tok.slice(eq + 1);
      } else {
        const name = tok.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[name] = next;
          i++;
        } else {
          flags[name] = true;
        }
      }
      continue;
    }

    if (tok.startsWith('-') && tok.length === 2) {
      const short = tok.slice(1);
      const name = Object.keys(schema).find(k => schema[k].alias === short);
      if (!name) throw userError(`Unknown flag: ${tok}`);
      const next = argv[i + 1];
      if (schema[name].type === 'boolean') {
        flags[name] = true;
      } else if (next !== undefined && !next.startsWith('-')) {
        flags[name] = next;
        i++;
      } else {
        throw userError(`Flag ${tok} requires a value`);
      }
      continue;
    }

    positionals.push(tok);
  }

  const input: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(schema)) {
    let raw: string | boolean | undefined;
    if (field.positional !== undefined) {
      raw = positionals[field.positional];
    } else {
      raw = flags[name];
    }

    if (raw === undefined) {
      if (field.required && !help) throw userError(`Missing required: ${field.positional !== undefined ? name : `--${name}`}`);
      if (field.default !== undefined) input[name] = field.default;
      continue;
    }

    input[name] = coerce(name, field.type, raw, field.enum);
  }

  return { input, json, help, dryRun };
}

function coerce(name: string, type: string, raw: string | boolean, enums?: readonly string[]): unknown {
  if (type === 'boolean') return raw === true || raw === 'true';
  if (type === 'number') {
    const n = Number(raw);
    if (Number.isNaN(n)) throw userError(`--${name} must be a number, got: ${String(raw)}`);
    return n;
  }
  if (type === 'json') {
    if (typeof raw !== 'string') throw userError(`--${name} must be a JSON string`);
    try { return JSON.parse(raw); } catch { throw userError(`--${name} is not valid JSON`); }
  }
  const s = String(raw);
  if (enums && !enums.includes(s)) throw userError(`--${name} must be one of: ${enums.join(', ')}`);
  return s;
}
