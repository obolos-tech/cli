/**
 * RunContext is passed to every Command.run(). Commands MUST NOT write to
 * stdout/stderr directly — return structured output from run(), and the
 * runtime picks pretty (format()) or JSON rendering based on ctx.json.
 *
 * This invariant is what lets the same command serve both a human in a
 * terminal and an MCP client that needs a stable JSON envelope.
 */

import type { HttpClient } from './http.js';
import type { ObolosConfig } from './config.js';

export type OutputMode = 'pretty' | 'json';

export interface RunContext {
  config: ObolosConfig;
  http: HttpClient;
  source: 'cli' | 'mcp';
  json: boolean;
  dryRun: boolean;
}

export function renderJson(output: unknown): string {
  return JSON.stringify(output, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}
