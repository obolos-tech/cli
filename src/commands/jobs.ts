/**
 * ACP Job commands: list, info, create, fund, submit, complete, reject.
 *
 * On-chain actions are best-effort: if the tx fails, the backend record is
 * still updated so the job can proceed off-chain. Each command returns a
 * structured result including any txHash and the updated job.
 */

import { defineCommand } from '../registry.js';
import type { Command } from '../registry.js';
import { userError } from '../runtime/errors.js';
import { getAccount } from '../runtime/wallet.js';
import {
  createJobOnChain, fundOnChain, submitOnChain, completeOnChain, rejectOnChain,
} from '../runtime/acp.js';
import { c, statusColor, formatDate, shortenAddr, shortenId, parseRelativeTime } from '../runtime/display.js';

async function walletHeader(config: { privateKey: string | null }): Promise<Record<string, string>> {
  if (!config.privateKey) throw userError('No wallet configured. Run `obolos setup`.');
  const acc = await getAccount(config as any);
  return { 'x-wallet-address': acc.address };
}

// ─── job.list ───────────────────────────────────────────────────────────────

export const jobListCmd = defineCommand({
  name: 'job.list',
  summary: 'List ACP jobs with optional filters.',
  input: {
    status: { type: 'string', description: 'Filter by status', enum: ['open', 'funded', 'submitted', 'completed', 'rejected', 'expired'] },
    client: { type: 'string', description: 'Filter by client address (0x...)' },
    provider: { type: 'string', description: 'Filter by provider address (0x...)' },
    limit: { type: 'number', description: 'Max results', default: 20 },
  },
  examples: ['obolos job list --status=open', 'obolos job list --client=0xabc... --json'],
  mcp: { expose: true, readOnly: true },
  async run(input, ctx) {
    const params = new URLSearchParams();
    if (input.status) params.set('status', String(input.status));
    if (input.client) params.set('client', String(input.client));
    if (input.provider) params.set('provider', String(input.provider));
    params.set('limit', String(input.limit));
    const data = await ctx.http.get<any>(`/api/jobs?${params}`);
    return { jobs: data.jobs || data.data || [], total: data.pagination?.total ?? (data.jobs?.length ?? 0) };
  },
  format(out) {
    if (out.jobs.length === 0) return `${c.yellow}No jobs found.${c.reset}`;
    const lines = [
      '',
      `${c.bold}${c.cyan}ACP Jobs${c.reset} ${c.dim}— ${out.total} jobs${c.reset}`,
      '',
      `  ${c.bold}${'ID'.padEnd(12)} ${'Title'.padEnd(30)} ${'Status'.padEnd(12)} ${'Budget'.padEnd(12)} ${'Client'.padEnd(14)} ${'Provider'.padEnd(14)} Created${c.reset}`,
      `  ${c.dim}${'─'.repeat(110)}${c.reset}`,
    ];
    for (const job of out.jobs) {
      const id = shortenId(job.id || '').padEnd(12);
      const title = (job.title || 'Untitled').slice(0, 28).padEnd(30);
      const st = statusColor((job.status || 'open').padEnd(10));
      const budget = (job.budget != null ? `$${Number(job.budget).toFixed(2)}` : '—').padEnd(12);
      const cl = shortenAddr(job.client).padEnd(14);
      const prov = (job.provider ? shortenAddr(job.provider) : 'Open').padEnd(14);
      lines.push(`  ${id} ${title} ${st}  ${budget} ${cl} ${prov} ${formatDate(job.created_at || job.createdAt)}`);
    }
    return lines.join('\n');
  },
});

// ─── job.info ───────────────────────────────────────────────────────────────

export const jobInfoCmd = defineCommand({
  name: 'job.info',
  summary: 'Show full job details + available actions.',
  input: { id: { type: 'string', description: 'Job id', positional: 0, required: true } },
  examples: ['obolos job info abc123'],
  mcp: { expose: true, readOnly: true },
  async run(input, ctx) {
    const data = await ctx.http.get<any>(`/api/jobs/${encodeURIComponent(String(input.id))}`);
    return data.job || data;
  },
  format(job) {
    const lines = [
      '',
      `${c.bold}${c.cyan}${job.title || 'Untitled Job'}${c.reset}`,
      `${c.dim}${'─'.repeat(60)}${c.reset}`,
      `  ${c.bold}ID:${c.reset}          ${job.id}`,
      `  ${c.bold}Status:${c.reset}      ${statusColor(job.status || 'open')}`,
      `  ${c.bold}Client:${c.reset}      ${job.client || '—'}`,
      `  ${c.bold}Evaluator:${c.reset}   ${job.evaluator || '—'}`,
      `  ${c.bold}Provider:${c.reset}    ${job.provider || `${c.dim}Open${c.reset}`}`,
    ];
    if (job.budget != null) lines.push(`  ${c.bold}Budget:${c.reset}      ${c.green}$${Number(job.budget).toFixed(2)} USDC${c.reset}`);
    if (job.description) lines.push('', `  ${c.bold}Description:${c.reset}`, `  ${job.description}`);
    if (job.deliverable) lines.push(`  ${c.bold}Deliverable:${c.reset} ${c.cyan}${job.deliverable}${c.reset}`);
    return lines.join('\n');
  },
});

// ─── job.create ─────────────────────────────────────────────────────────────

export const jobCreateCmd = defineCommand({
  name: 'job.create',
  summary: 'Create an ACP job on-chain and register it in the backend.',
  description: 'Creates a job with the caller as client. Evaluator is required. Provider may be omitted for open jobs.',
  input: {
    title: { type: 'string', description: 'Job title', required: true },
    description: { type: 'string', description: 'Detailed description' },
    evaluator: { type: 'string', description: 'Evaluator address (0x...)', required: true },
    provider: { type: 'string', description: 'Specific provider address (optional)' },
    budget: { type: 'number', description: 'Budget in USDC' },
    expires: { type: 'string', description: 'Expiry ("24h", "7d", or ISO date)', default: '7d' },
  },
  examples: [`obolos job create --title "Analyze data" --evaluator 0xABC --budget 5.00 --expires 7d`],
  mcp: { expose: true, destructive: true },
  async run(input, ctx) {
    const headers = await walletHeader(ctx.config);
    const expiredAt = Math.floor(new Date(parseRelativeTime(String(input.expires))).getTime() / 1000);
    let chainJobId: string | null = null, chainTxHash: string | null = null;
    try {
      const result = await createJobOnChain(ctx.config, {
        provider: input.provider as string | undefined,
        evaluator: String(input.evaluator),
        expiredAt,
        description: (input.description as string) || String(input.title),
      });
      chainJobId = result.chainJobId;
      chainTxHash = result.txHash;
    } catch (err: any) {
      // fall through to backend-only
      return { warning: `On-chain creation failed: ${err.message}`, job: await postBackend() };
    }
    return { chainJobId, chainTxHash, job: await postBackend() };

    async function postBackend() {
      const payload: Record<string, any> = { title: input.title, evaluator: input.evaluator };
      if (input.description) payload.description = input.description;
      if (input.provider) payload.provider = input.provider;
      if (input.budget != null) payload.budget = input.budget;
      payload.expires_at = parseRelativeTime(String(input.expires));
      if (chainJobId) payload.chain_job_id = chainJobId;
      if (chainTxHash) payload.chain_tx_hash = chainTxHash;
      const data = await ctx.http.post<any>('/api/jobs', payload, headers);
      return data.job || data;
    }
  },
  format(out) {
    const lines = ['', `${c.green}Job created.${c.reset}`];
    if (out.warning) lines.push(`${c.yellow}${out.warning}${c.reset}`);
    lines.push(`  ${c.bold}ID:${c.reset}       ${out.job.id}`);
    if (out.chainJobId) lines.push(`  ${c.bold}Chain ID:${c.reset} ${out.chainJobId}`);
    if (out.chainTxHash) lines.push(`  ${c.bold}Tx:${c.reset}       ${c.cyan}${out.chainTxHash}${c.reset}`);
    lines.push(`  ${c.bold}Status:${c.reset}   ${statusColor(out.job.status || 'open')}`);
    lines.push('', `${c.dim}Next: obolos job fund ${out.job.id}${c.reset}`);
    return lines.join('\n');
  },
});

// ─── job.fund ───────────────────────────────────────────────────────────────

export const jobFundCmd = defineCommand({
  name: 'job.fund',
  summary: 'Fund the escrow for a job (approves USDC + calls fund() on ACP).',
  input: { id: { type: 'string', description: 'Job id', positional: 0, required: true } },
  examples: ['obolos job fund abc123'],
  mcp: { expose: true, destructive: true },
  async run(input, ctx) {
    const headers = await walletHeader(ctx.config);
    const existing = await ctx.http.get<any>(`/api/jobs/${encodeURIComponent(String(input.id))}`);
    const job = existing.job || existing;
    let txHash: string | null = null, warning: string | null = null;
    if (job.chain_job_id && job.budget != null) {
      try { txHash = await fundOnChain(ctx.config, job.chain_job_id, String(job.budget)); }
      catch (err: any) { warning = `On-chain funding failed: ${err.message}`; }
    }
    const payload: Record<string, any> = {};
    if (txHash) payload.tx_hash = txHash;
    if (job.chain_job_id) payload.chain_job_id = job.chain_job_id;
    const data = await ctx.http.post<any>(`/api/jobs/${encodeURIComponent(String(input.id))}/fund`, payload, headers);
    return { job: data.job || data, txHash, warning };
  },
  format(out) {
    const lines = ['', `${c.green}Job funded.${c.reset}`];
    if (out.warning) lines.push(`${c.yellow}${out.warning}${c.reset}`);
    lines.push(`  ${c.bold}Status:${c.reset} ${statusColor(out.job.status || 'funded')}`);
    if (out.txHash) lines.push(`  ${c.bold}Tx:${c.reset}     ${c.cyan}${out.txHash}${c.reset}`);
    return lines.join('\n');
  },
});

// ─── job.submit ─────────────────────────────────────────────────────────────

export const jobSubmitCmd = defineCommand({
  name: 'job.submit',
  summary: 'Submit work for a funded job (hashes deliverable and calls submit()).',
  input: {
    id: { type: 'string', description: 'Job id', positional: 0, required: true },
    deliverable: { type: 'string', description: 'Hash, CID, or URL of the work product', required: true },
  },
  examples: ['obolos job submit abc123 --deliverable ipfs://Qm...'],
  mcp: { expose: true, destructive: true },
  async run(input, ctx) {
    const headers = await walletHeader(ctx.config);
    const existing = await ctx.http.get<any>(`/api/jobs/${encodeURIComponent(String(input.id))}`);
    const existingJob = existing.job || existing;
    let txHash: string | null = null, warning: string | null = null;
    if (existingJob.chain_job_id) {
      try { txHash = await submitOnChain(ctx.config, existingJob.chain_job_id, String(input.deliverable)); }
      catch (err: any) { warning = `On-chain submit failed: ${err.message}`; }
    }
    const payload: Record<string, any> = { deliverable: input.deliverable };
    if (txHash) payload.tx_hash = txHash;
    const data = await ctx.http.post<any>(`/api/jobs/${encodeURIComponent(String(input.id))}/submit`, payload, headers);
    return { job: data.job || data, deliverable: input.deliverable, txHash, warning };
  },
  format(out) {
    const lines = ['', `${c.green}Work submitted.${c.reset}`];
    if (out.warning) lines.push(`${c.yellow}${out.warning}${c.reset}`);
    lines.push(`  ${c.bold}Status:${c.reset}      ${statusColor(out.job.status || 'submitted')}`);
    lines.push(`  ${c.bold}Deliverable:${c.reset} ${c.cyan}${out.deliverable}${c.reset}`);
    if (out.txHash) lines.push(`  ${c.bold}Tx:${c.reset}          ${c.cyan}${out.txHash}${c.reset}`);
    return lines.join('\n');
  },
});

// ─── job.complete + job.reject ─────────────────────────────────────────────

function terminalCmd(name: 'complete' | 'reject'): Command {
  return defineCommand({
    name: `job.${name}`,
    summary: name === 'complete'
      ? 'Evaluator approves a submission; escrow released to provider.'
      : 'Evaluator rejects a submission; escrow refunded to client.',
    input: {
      id: { type: 'string', description: 'Job id', positional: 0, required: true },
      reason: { type: 'string', description: 'Optional reason text (hashed on-chain)' },
    },
    examples: [`obolos job ${name} abc123 --reason "..."`],
    mcp: { expose: true, destructive: true },
    async run(input, ctx) {
      const headers = await walletHeader(ctx.config);
      const existing = await ctx.http.get<any>(`/api/jobs/${encodeURIComponent(String(input.id))}`);
      const existingJob = existing.job || existing;
      let txHash: string | null = null, warning: string | null = null;
      if (existingJob.chain_job_id) {
        try {
          const fn = name === 'complete' ? completeOnChain : rejectOnChain;
          txHash = await fn(ctx.config, existingJob.chain_job_id, input.reason as string | undefined);
        } catch (err: any) { warning = `On-chain ${name} failed: ${err.message}`; }
      }
      const payload: Record<string, any> = {};
      if (input.reason) payload.reason = input.reason;
      if (txHash) payload.tx_hash = txHash;
      const data = await ctx.http.post<any>(`/api/jobs/${encodeURIComponent(String(input.id))}/${name}`, payload, headers);
      return { job: data.job || data, txHash, warning, reason: input.reason };
    },
    format(out: any) {
      const verb = name === 'complete' ? 'completed' : 'rejected';
      const color = name === 'complete' ? c.green : c.red;
      const lines = ['', `${color}Job ${verb}.${c.reset}`];
      if (out.warning) lines.push(`${c.yellow}${out.warning}${c.reset}`);
      lines.push(`  ${c.bold}Status:${c.reset} ${statusColor(out.job.status || verb)}`);
      if (out.reason) lines.push(`  ${c.bold}Reason:${c.reset} ${out.reason}`);
      if (out.txHash) lines.push(`  ${c.bold}Tx:${c.reset}     ${c.cyan}${out.txHash}${c.reset}`);
      return lines.join('\n');
    },
  }) as Command;
}

export const jobCompleteCmd = terminalCmd('complete');
export const jobRejectCmd = terminalCmd('reject');

export const jobCommands: Command[] = [
  jobListCmd, jobInfoCmd, jobCreateCmd, jobFundCmd, jobSubmitCmd, jobCompleteCmd, jobRejectCmd,
] as Command[];
