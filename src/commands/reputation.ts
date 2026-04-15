/**
 * Reputation commands: check, compare.
 */

import { defineCommand } from '../registry.js';
import type { Command } from '../registry.js';
import { userError } from '../runtime/errors.js';

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', red: '\x1b[31m', gray: '\x1b[90m',
};

function scoreBar(score: number): string {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const filled = Math.floor(pct / 5);
  const color = pct >= 70 ? c.green : pct >= 40 ? c.yellow : c.red;
  return `${color}${'█'.repeat(filled)}${c.dim}${'░'.repeat(20 - filled)}${c.reset} ${String(pct).padStart(3)}/100`;
}
function tierColor(tier: string): string {
  switch ((tier || '').toLowerCase()) {
    case 'trusted': case 'high':   return `${c.green}${tier}${c.reset}`;
    case 'medium': case 'ok':      return `${c.yellow}${tier}${c.reset}`;
    case 'low': case 'unverified': return `${c.red}${tier}${c.reset}`;
    default:                       return `${c.gray}${tier}${c.reset}`;
  }
}
function verdict(pass: boolean): string {
  return pass ? `${c.green}PASS${c.reset}` : `${c.red}FAIL${c.reset}`;
}

export const reputationCheckCmd = defineCommand({
  name: 'reputation.check',
  summary: 'Check agent trust score across reputation providers.',
  input: {
    agentId: { type: 'string', description: 'Agent id (numeric)', positional: 0, required: true },
    chain: { type: 'string', description: 'Chain slug', default: 'base' },
  },
  examples: ['obolos reputation check 16907', 'obolos rep check 16907 --chain ethereum'],
  mcp: { expose: true, readOnly: true },

  async run(input, ctx) {
    if (!input.agentId) throw userError('Missing agentId');
    return ctx.http.get<any>(
      `/api/anp/reputation/${encodeURIComponent(String(input.agentId))}?chain=${encodeURIComponent(String(input.chain))}`,
    );
  },

  format(data) {
    const combined = data.combined || {};
    const lines: string[] = [
      '',
      `${c.bold}${c.cyan}Reputation Report${c.reset}  ${c.dim}Agent ${data.agentId ?? ''}${c.reset}`,
      `${c.dim}${'─'.repeat(60)}${c.reset}`,
      `  ${c.bold}Combined Score:${c.reset}  ${scoreBar(combined.score ?? 0)}`,
      `  ${c.bold}Tier:${c.reset}            ${tierColor(combined.tier ?? 'unknown')}`,
      `  ${c.bold}Verdict:${c.reset}         ${verdict(combined.pass ?? false)}`,
      `  ${c.bold}Chain:${c.reset}           ${data.chain ?? ''}`,
    ];
    if (data.address) lines.push(`  ${c.bold}Address:${c.reset}         ${data.address}`);
    if (combined.hasSybilFlags) lines.push('', `  ${c.red}${c.bold}⚠ Sybil flags detected${c.reset}`);
    for (const s of data.scores ?? []) {
      lines.push('', `  ${c.bold}${s.provider}${c.reset}`);
      lines.push(`    Score:   ${scoreBar(s.score ?? 0)}`);
      lines.push(`    Tier:    ${tierColor(s.tier ?? 'unknown')}`);
      lines.push(`    Verdict: ${verdict(s.pass ?? false)}`);
    }
    return lines.join('\n');
  },
});

export const reputationCompareCmd = defineCommand({
  name: 'reputation.compare',
  summary: 'Compare reputation for multiple agents in parallel.',
  description: 'Pass agent ids as positional args. Optional prefix with chain: `ethereum:456 base:123`.',
  input: {
    agents: { type: 'string', description: 'Space-separated agent ids (prefix chain with "chain:")', required: true },
  },
  examples: ['obolos rep compare "123 456 789"', 'obolos rep compare "base:123 ethereum:456"'],
  mcp: { expose: true, readOnly: true },

  async run(input, ctx) {
    const tokens = String(input.agents).trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 2) throw userError('Provide at least 2 agent ids');
    const parsed = tokens.map(t => {
      const parts = t.split(':');
      const id = Number(parts.length === 2 ? parts[1] : parts[0]);
      if (Number.isNaN(id)) throw userError(`Invalid agent id: ${t}`);
      return { agentId: id, chain: parts.length === 2 ? parts[0] : 'base' };
    });
    const results = await Promise.all(parsed.map(a =>
      ctx.http.get<any>(`/api/anp/reputation/${a.agentId}?chain=${encodeURIComponent(a.chain)}`)
        .then(r => ({ ...r, _input: a }))
        .catch(err => ({ _input: a, error: err.message }))
    ));
    return { results: results.sort((a: any, b: any) => (b.combined?.score ?? -1) - (a.combined?.score ?? -1)) };
  },

  format(out) {
    const lines: string[] = [
      '',
      `${c.bold}${c.cyan}Reputation Comparison${c.reset}`,
      `${c.dim}${'─'.repeat(70)}${c.reset}`,
    ];
    out.results.forEach((r: any, i: number) => {
      const rank = `${i + 1}.`.padEnd(4);
      const agent = String(r._input.agentId).padEnd(10);
      const chain = r._input.chain.padEnd(10);
      if (r.error) {
        lines.push(`  ${rank}${agent}${chain}${c.red}Error: ${r.error}${c.reset}`);
        return;
      }
      const combined = r.combined || {};
      lines.push(`  ${rank}${agent}${chain}${scoreBar(combined.score ?? 0)}  ${tierColor(combined.tier ?? 'unknown')}  ${verdict(combined.pass ?? false)}`);
    });
    return lines.join('\n');
  },
});

export const reputationCommands: Command[] = [reputationCheckCmd, reputationCompareCmd] as Command[];
