#!/usr/bin/env node
/**
 * Enforces the core Command invariant: run() MUST return structured data and
 * MUST NOT write to stdout/stderr. Only format() renders text, and even then
 * it returns a string — the runtime does the write.
 *
 * This keeps MCP output clean (no ANSI bleed into JSON) and makes commands
 * unit-testable without stdio capture.
 *
 * Scans cli/src/commands/**\/*.ts for forbidden patterns and exits non-zero
 * on any hit. Run manually: `node scripts/lint-stdout-purity.mjs`.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('../src/commands/', import.meta.url));

const FORBIDDEN = [
  { pattern: /\bconsole\.(log|error|warn|info|debug)\b/, why: 'console.* writes to stdio — return data from run() or render via format()' },
  { pattern: /\bprocess\.stdout\.write\b/, why: 'process.stdout.write is the runtime\'s job — return from run()' },
  { pattern: /\bprocess\.stderr\.write\b/, why: 'throw a CliError instead of writing to stderr' },
  { pattern: /\bprocess\.exit\b/, why: 'throw a CliError instead of calling process.exit' },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf-8');
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(line)) offenders.push({ file: relative(process.cwd(), file), line: i + 1, code: line.trim(), why });
    }
  }
}

if (offenders.length === 0) {
  console.error(`[stdout-purity] ok — ${walk(ROOT).length} command files, 0 violations`);
  process.exit(0);
}

console.error(`[stdout-purity] ${offenders.length} violation(s):\n`);
for (const o of offenders) {
  console.error(`  ${o.file}:${o.line}`);
  console.error(`    ${o.code}`);
  console.error(`    → ${o.why}\n`);
}
process.exit(1);
