/**
 * Command registry — the single source of truth for every CLI capability.
 *
 * Each Command is:
 *   1. Parsed into argv for the CLI (see runtime/argv.ts)
 *   2. Exposed as an MCP tool via the mcp-server adapter
 *   3. Rendered for `--help` using summary/description/examples/input
 *
 * Invariants:
 *   - run() returns structured data; never writes to stdout.
 *   - format() is pure (output -> string). --json bypasses it.
 *   - input schema is JSON-serializable (no transforms, no refinements).
 */

import type { RunContext } from './runtime/output.js';

export type FieldType = 'string' | 'number' | 'boolean' | 'json';

export interface FieldDef {
  type: FieldType;
  description: string;
  required?: boolean;
  default?: unknown;
  enum?: readonly string[];
  positional?: number;
  alias?: string;
}

export type InputSchema = Record<string, FieldDef>;

export type InputOf<S extends InputSchema> = {
  [K in keyof S]: S[K]['type'] extends 'string' ? string
    : S[K]['type'] extends 'number' ? number
    : S[K]['type'] extends 'boolean' ? boolean
    : unknown;
};

export interface CommandMcpMeta {
  expose?: boolean;
  readOnly?: boolean;
  destructive?: boolean;
}

export interface Command<S extends InputSchema = InputSchema, O = unknown> {
  name: string;
  summary: string;
  description?: string;
  input: S;
  examples?: string[];
  mcp?: CommandMcpMeta;
  run(input: InputOf<S>, ctx: RunContext): Promise<O>;
  format?(output: O, ctx: RunContext): string;
}

/** Helper that preserves Output inference without making callers spell the generic. */
export function defineCommand<S extends InputSchema, O>(cmd: Command<S, O>): Command<S, O> {
  return cmd;
}

export class Registry {
  private readonly byName = new Map<string, Command<any, any>>();
  private readonly aliases = new Map<string, string>();

  add(cmd: Command<any, any>, aliases: string[] = []): this {
    if (this.byName.has(cmd.name)) throw new Error(`Duplicate command: ${cmd.name}`);
    this.byName.set(cmd.name, cmd);
    for (const a of aliases) this.aliases.set(a, cmd.name);
    return this;
  }

  resolve(nameOrAlias: string): Command<any, any> | undefined {
    return this.byName.get(nameOrAlias) ?? this.byName.get(this.aliases.get(nameOrAlias) ?? '');
  }

  all(): Command<any, any>[] {
    return Array.from(this.byName.values());
  }

  group(prefix: string): Command<any, any>[] {
    return this.all().filter(c => c.name.startsWith(prefix + '.') || c.name === prefix);
  }
}
