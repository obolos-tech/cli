/**
 * ANP commands (Agent Negotiation Protocol): list, info, create, bid, accept, verify.
 * Advanced primitives (message/thread/amend/checkpoint) remain on the legacy
 * path until this group stabilizes.
 */

import { defineCommand } from '../registry.js';
import type { Command } from '../registry.js';
import {
  signListing, signBid, signAccept,
  signMessage, signAmendment, signAmendmentAcceptance,
  signCheckpoint, signCheckpointApproval,
} from '../runtime/anp.js';
import { parseTimeToSeconds, c, statusColor, formatDate, shortenAddr } from '../runtime/display.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function usdFromMicros(raw: any): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n / 1e6 : null;
}

// ─── anp.list ──────────────────────────────────────────────────────────────

export const anpListCmd = defineCommand({
  name: 'anp.list',
  summary: 'Browse ANP (Agent Negotiation Protocol) listings.',
  input: {
    status: { type: 'string', description: 'Filter by status', enum: ['open', 'negotiating', 'accepted', 'cancelled'] },
    limit: { type: 'number', description: 'Max results', default: 20 },
  },
  examples: ['obolos anp list --status=open'],
  mcp: { expose: true, readOnly: true },
  async run(input, ctx) {
    const params = new URLSearchParams();
    if (input.status) params.set('status', String(input.status));
    params.set('limit', String(input.limit));
    const data = await ctx.http.get<any>(`/api/anp/listings?${params}`);
    return { listings: data.listings || data.data || [], total: data.pagination?.total ?? 0 };
  },
  format(out) {
    if (out.listings.length === 0) return `${c.yellow}No ANP listings found.${c.reset}`;
    const lines = ['', `${c.bold}${c.cyan}ANP Listings${c.reset} ${c.dim}— ${out.total}${c.reset}`, ''];
    for (const l of out.listings) {
      const min = usdFromMicros(l.minBudget ?? l.min_budget) ?? l.minBudgetUsd;
      const max = usdFromMicros(l.maxBudget ?? l.max_budget) ?? l.maxBudgetUsd;
      const budget = `${min != null ? `$${min.toFixed(0)}` : '?'}-${max != null ? `$${max.toFixed(0)}` : '?'}`;
      lines.push(`  ${(l.cid || l.id || '').slice(0, 16).padEnd(18)} ${(l.title || '').slice(0, 26).padEnd(28)} ${budget.padEnd(16)} ${statusColor((l.status || 'open').padEnd(12))}  bids:${l.bidCount ?? l.bid_count ?? 0}  ${shortenAddr(l.client || l.signer)}`);
    }
    return lines.join('\n');
  },
});

// ─── anp.info ──────────────────────────────────────────────────────────────

export const anpInfoCmd = defineCommand({
  name: 'anp.info',
  summary: 'Get ANP listing details + bids + signature info.',
  input: { cid: { type: 'string', description: 'Listing CID', positional: 0, required: true } },
  examples: ['obolos anp info sha256-abc...'],
  mcp: { expose: true, readOnly: true },
  async run(input, ctx) {
    const data = await ctx.http.get<any>(`/api/anp/listings/${encodeURIComponent(String(input.cid))}`);
    return data.listing || data;
  },
  format(l) {
    const min = usdFromMicros(l.minBudget ?? l.min_budget) ?? l.minBudgetUsd;
    const max = usdFromMicros(l.maxBudget ?? l.max_budget) ?? l.maxBudgetUsd;
    const lines = [
      '', `${c.bold}${c.cyan}${l.title || 'Untitled'}${c.reset}`,
      `${c.dim}${'─'.repeat(60)}${c.reset}`,
      `  ${c.bold}CID:${c.reset}    ${l.cid || l.id}`,
      `  ${c.bold}Status:${c.reset} ${statusColor(l.status || 'open')}`,
      `  ${c.bold}Client:${c.reset} ${l.client || l.signer || '—'}`,
    ];
    if (min != null || max != null) {
      lines.push(`  ${c.bold}Budget:${c.reset} ${c.green}$${(min ?? 0).toFixed(2)} – $${(max ?? 0).toFixed(2)} USDC${c.reset}`);
    }
    if (l.description) lines.push('', `  ${l.description}`);
    const bids = l.bids || [];
    if (bids.length > 0) {
      lines.push('', `  ${c.bold}Bids (${bids.length})${c.reset}`);
      for (const b of bids) {
        const priceUsd = usdFromMicros(b.price) ?? b.priceUsd;
        lines.push(`    ${(b.cid || b.id || '').slice(0, 16)} ${shortenAddr(b.provider || b.signer)} ${c.green}$${(priceUsd ?? 0).toFixed(2)}${c.reset}`);
      }
    }
    return lines.join('\n');
  },
});

// ─── anp.create ────────────────────────────────────────────────────────────

export const anpCreateCmd = defineCommand({
  name: 'anp.create',
  summary: 'Sign and publish an ANP ListingIntent (EIP-712).',
  description:
    'Creates a cryptographically-signed listing document. Other agents can verify it offline ' +
    'and submit signed bids. No on-chain tx until settlement.',
  input: {
    title: { type: 'string', description: 'Listing title', required: true },
    description: { type: 'string', description: 'Detailed description' },
    'min-budget': { type: 'number', description: 'Min budget in USDC', default: 0 },
    'max-budget': { type: 'number', description: 'Max budget in USDC', default: 0 },
    deadline: { type: 'string', description: 'Bidding deadline ("7d", "24h")', default: '7d' },
    duration: { type: 'string', description: 'Job duration ("3d", "48h")', default: '3d' },
    evaluator: { type: 'string', description: 'Preferred evaluator address' },
  },
  examples: [`obolos anp create --title "Analyze data" --min-budget 5 --max-budget 50 --deadline 7d`],
  mcp: { expose: true, destructive: true },
  async run(input, ctx) {
    const signed = await signListing(ctx.config, {
      title: String(input.title),
      description: String(input.description || ''),
      minBudgetUsd: Number(input['min-budget']),
      maxBudgetUsd: Number(input['max-budget']),
      deadlineSeconds: parseTimeToSeconds(String(input.deadline)),
      jobDurationSeconds: parseTimeToSeconds(String(input.duration)),
      preferredEvaluator: input.evaluator as string | undefined,
    });
    const data = await ctx.http.post<any>('/api/anp/publish', signed.document);
    const result = data.listing || data;
    return { cid: result.cid || result.id, signer: signed.signer, signature: signed.signature };
  },
  format(out) {
    return ['', `${c.green}ANP listing published.${c.reset}`,
      `  ${c.bold}CID:${c.reset}       ${out.cid}`,
      `  ${c.bold}Signer:${c.reset}    ${out.signer}`,
      `  ${c.bold}Signature:${c.reset} ${c.dim}${out.signature.slice(0, 20)}...${c.reset}`,
      '', `${c.dim}Others can bid: obolos anp bid ${out.cid} --price 25 --delivery 48h${c.reset}`].join('\n');
  },
});

// ─── anp.bid ───────────────────────────────────────────────────────────────

export const anpBidCmd = defineCommand({
  name: 'anp.bid',
  summary: 'Sign and publish an ANP BidIntent against a listing.',
  input: {
    cid: { type: 'string', description: 'Listing CID', positional: 0, required: true },
    price: { type: 'number', description: 'Price in USDC', required: true },
    delivery: { type: 'string', description: 'Delivery time ("48h", "3d")', default: '24h' },
    message: { type: 'string', description: 'Message to the client' },
  },
  examples: [`obolos anp bid sha256-abc... --price 25 --delivery 48h --message "I can do this"`],
  mcp: { expose: true, destructive: true },
  async run(input, ctx) {
    const listingDoc = await ctx.http.get<any>(`/api/anp/objects/${encodeURIComponent(String(input.cid))}`);
    const signed = await signBid(ctx.config, listingDoc, {
      listingCid: String(input.cid),
      priceUsd: Number(input.price),
      deliverySeconds: parseTimeToSeconds(String(input.delivery)),
      message: input.message as string | undefined,
    });
    const data = await ctx.http.post<any>('/api/anp/publish', signed.document);
    const result = data.bid || data;
    return { cid: result.cid || result.id, listingCid: input.cid, price: input.price, signer: signed.signer, signature: signed.signature };
  },
  format(out) {
    return ['', `${c.green}ANP bid published.${c.reset}`,
      `  ${c.bold}CID:${c.reset}     ${out.cid}`,
      `  ${c.bold}Listing:${c.reset} ${out.listingCid}`,
      `  ${c.bold}Price:${c.reset}   ${c.green}$${Number(out.price).toFixed(2)} USDC${c.reset}`,
      `  ${c.bold}Signer:${c.reset}  ${out.signer}`,
      '', `${c.dim}Client can accept: obolos anp accept ${out.listingCid} --bid ${out.cid}${c.reset}`].join('\n');
  },
});

// ─── anp.accept ────────────────────────────────────────────────────────────

export const anpAcceptCmd = defineCommand({
  name: 'anp.accept',
  summary: 'Sign and publish an ANP AcceptIntent, finalizing the agreement.',
  input: {
    cid: { type: 'string', description: 'Listing CID', positional: 0, required: true },
    bid: { type: 'string', description: 'Bid CID to accept', required: true },
  },
  examples: ['obolos anp accept sha256-listing... --bid sha256-bid...'],
  mcp: { expose: true, destructive: true },
  async run(input, ctx) {
    const [listingDoc, bidDoc] = await Promise.all([
      ctx.http.get<any>(`/api/anp/objects/${encodeURIComponent(String(input.cid))}`),
      ctx.http.get<any>(`/api/anp/objects/${encodeURIComponent(String(input.bid))}`),
    ]);
    const signed = await signAccept(ctx.config, String(input.cid), String(input.bid), listingDoc, bidDoc);
    const data = await ctx.http.post<any>('/api/anp/publish', signed.document);
    const result = data.accept || data;
    return { cid: result.cid || result.id, listingCid: input.cid, bidCid: input.bid, signer: signed.signer, signature: signed.signature };
  },
  format(out) {
    return ['', `${c.green}Bid accepted. ANP agreement published.${c.reset}`,
      `  ${c.bold}CID:${c.reset}     ${out.cid}`,
      `  ${c.bold}Listing:${c.reset} ${out.listingCid}`,
      `  ${c.bold}Bid:${c.reset}     ${out.bidCid}`,
      `  ${c.bold}Signer:${c.reset}  ${out.signer}`,
    ].join('\n');
  },
});

// ─── anp.verify ────────────────────────────────────────────────────────────

export const anpVerifyCmd = defineCommand({
  name: 'anp.verify',
  summary: 'Verify an ANP document (signature, content hash, chain refs).',
  input: { cid: { type: 'string', description: 'Document CID', positional: 0, required: true } },
  examples: ['obolos anp verify sha256-abc...'],
  mcp: { expose: true, readOnly: true },
  async run(input, ctx) {
    return ctx.http.get<any>(`/api/anp/verify/${encodeURIComponent(String(input.cid))}`);
  },
  format(d) {
    const valid = d.valid || d.verified;
    const lines = [
      '', `${c.bold}${c.cyan}ANP Document Verification${c.reset}`,
      `${c.dim}${'─'.repeat(60)}${c.reset}`,
      `  ${c.bold}Type:${c.reset}      ${d.type || '—'}`,
      `  ${c.bold}Signer:${c.reset}    ${d.signer || '—'}`,
      `  ${c.bold}Signature:${c.reset} ${valid ? c.green + 'Valid' + c.reset : c.red + 'Invalid' + c.reset}`,
    ];
    if (d.content_valid != null) lines.push(`  ${c.bold}Content:${c.reset}   ${d.content_valid ? c.green + 'Matches' + c.reset : c.red + 'Mismatch' + c.reset}`);
    return lines.join('\n');
  },
});

// ─── anp.message ───────────────────────────────────────────────────────────

export const anpMessageCmd = defineCommand({
  name: 'anp.message',
  summary: 'Send a signed in-job message (EIP-712 MessageIntent).',
  input: {
    job: { type: 'string', description: 'Job id', positional: 0, required: true },
    message: { type: 'string', description: 'Message body', required: true },
    role: { type: 'string', description: 'Your role', enum: ['client', 'provider', 'evaluator'], default: 'client' },
  },
  examples: [`obolos anp message job123 --message "Starting task" --role provider`],
  mcp: { expose: true, destructive: true },
  async run(input, ctx) {
    const signed = await signMessage(ctx.config, {
      jobId: String(input.job),
      body: String(input.message),
      role: String(input.role) as 'client' | 'provider' | 'evaluator',
    });
    const data = await ctx.http.post<any>('/api/anp/publish', signed.document);
    return { cid: data.cid, jobId: input.job, role: input.role, signer: signed.signer };
  },
  format(out) {
    return ['', `${c.green}Message sent.${c.reset}`,
      `  ${c.bold}CID:${c.reset}    ${out.cid}`,
      `  ${c.bold}Job:${c.reset}    ${out.jobId}`,
      `  ${c.bold}Role:${c.reset}   ${out.role}`,
      `  ${c.bold}Signer:${c.reset} ${out.signer}`].join('\n');
  },
});

// ─── anp.thread ────────────────────────────────────────────────────────────

export const anpThreadCmd = defineCommand({
  name: 'anp.thread',
  summary: 'View the signed message thread for a job.',
  input: { job: { type: 'string', description: 'Job id', positional: 0, required: true } },
  examples: ['obolos anp thread job123'],
  mcp: { expose: true, readOnly: true },
  async run(input, ctx) {
    const data = await ctx.http.get<any>(`/api/anp/jobs/${encodeURIComponent(String(input.job))}/thread`);
    return { jobId: input.job, messages: data.messages || [] };
  },
  format(out) {
    if (out.messages.length === 0) return `${c.yellow}No messages for job ${out.jobId}.${c.reset}`;
    const lines = ['', `${c.bold}${c.cyan}Job Thread${c.reset} ${c.dim}— ${out.messages.length} messages${c.reset}`, ''];
    const roleColors: Record<string, string> = { client: c.blue, provider: c.green, evaluator: c.yellow };
    for (const msg of out.messages) {
      const rc = roleColors[msg.roleName] || c.dim;
      lines.push(`  ${rc}${c.bold}[${msg.roleName}]${c.reset} ${c.dim}${msg.createdAt}${c.reset}`);
      lines.push(`  ${msg.body}`);
      lines.push(`  ${c.dim}CID: ${msg.cid}${c.reset}`);
      lines.push('');
    }
    return lines.join('\n');
  },
});

// ─── anp.amend ─────────────────────────────────────────────────────────────

export const anpAmendCmd = defineCommand({
  name: 'anp.amend',
  summary: 'Propose a scope/price amendment for an active job (EIP-712 AmendmentIntent).',
  input: {
    job: { type: 'string', description: 'Job id', positional: 0, required: true },
    'bid-hash': { type: 'string', description: 'Original bid struct hash (0x...)', required: true },
    reason: { type: 'string', description: 'Why the amendment is needed', required: true },
    price: { type: 'number', description: 'New price in USDC (optional)' },
    delivery: { type: 'string', description: 'New delivery time ("48h", "3d")' },
    'scope-delta': { type: 'string', description: 'Description of scope change' },
  },
  examples: [`obolos anp amend job123 --bid-hash 0xabc --reason "scope grew" --price 35`],
  mcp: { expose: true, destructive: true },
  async run(input, ctx) {
    const signed = await signAmendment(ctx.config, {
      jobId: String(input.job),
      originalBidHash: String(input['bid-hash']),
      reason: String(input.reason),
      newPriceUsd: input.price as number | undefined,
      newDeliverySeconds: input.delivery ? parseTimeToSeconds(String(input.delivery)) : undefined,
      scopeDelta: input['scope-delta'] as string | undefined,
    });
    const data = await ctx.http.post<any>('/api/anp/publish', signed.document);
    return { cid: data.cid, jobId: input.job, price: input.price, delivery: input.delivery, reason: input.reason };
  },
  format(out) {
    const lines = ['', `${c.green}Amendment proposed.${c.reset}`,
      `  ${c.bold}CID:${c.reset}    ${out.cid}`,
      `  ${c.bold}Job:${c.reset}    ${out.jobId}`,
      `  ${c.bold}Reason:${c.reset} ${out.reason}`];
    if (out.price != null) lines.push(`  ${c.bold}New Price:${c.reset}    $${out.price} USDC`);
    if (out.delivery) lines.push(`  ${c.bold}New Delivery:${c.reset} ${out.delivery}`);
    lines.push('', `${c.dim}Counterparty: obolos anp accept-amend ${out.jobId} --amendment ${out.cid}${c.reset}`);
    return lines.join('\n');
  },
});

// ─── anp.accept-amend ─────────────────────────────────────────────────────

export const anpAcceptAmendCmd = defineCommand({
  name: 'anp.accept-amend',
  summary: 'Sign and publish acceptance of a pending amendment.',
  input: {
    job: { type: 'string', description: 'Job id', positional: 0, required: true },
    amendment: { type: 'string', description: 'Amendment CID', required: true },
  },
  examples: ['obolos anp accept-amend job123 --amendment sha256-...'],
  mcp: { expose: true, destructive: true },
  async run(input, ctx) {
    const amendDoc = await ctx.http.get<any>(`/api/anp/objects/${encodeURIComponent(String(input.amendment))}`);
    const signed = await signAmendmentAcceptance(ctx.config, String(input.job), String(input.amendment), amendDoc);
    const data = await ctx.http.post<any>('/api/anp/publish', signed.document);
    return { cid: data.cid, jobId: input.job, amendmentCid: input.amendment };
  },
  format(out) {
    return ['', `${c.green}Amendment accepted.${c.reset}`,
      `  ${c.bold}CID:${c.reset}           ${out.cid}`,
      `  ${c.bold}Amendment:${c.reset}     ${out.amendmentCid}`,
      `  ${c.bold}Job:${c.reset}           ${out.jobId}`].join('\n');
  },
});

// ─── anp.amendments ────────────────────────────────────────────────────────

export const anpAmendmentsCmd = defineCommand({
  name: 'anp.amendments',
  summary: 'List all proposed amendments for a job.',
  input: { job: { type: 'string', description: 'Job id', positional: 0, required: true } },
  examples: ['obolos anp amendments job123'],
  mcp: { expose: true, readOnly: true },
  async run(input, ctx) {
    const data = await ctx.http.get<any>(`/api/anp/jobs/${encodeURIComponent(String(input.job))}/amendments`);
    return { jobId: input.job, amendments: data.amendments || [] };
  },
  format(out) {
    if (out.amendments.length === 0) return `${c.yellow}No amendments for job ${out.jobId}.${c.reset}`;
    const lines = ['', `${c.bold}${c.cyan}Amendments${c.reset} ${c.dim}— ${out.amendments.length}${c.reset}`, ''];
    for (const a of out.amendments) {
      const st = a.accepted ? `${c.green}Accepted${c.reset}` : `${c.yellow}Pending${c.reset}`;
      lines.push(`  ${c.bold}${a.cid}${c.reset}  ${st}`);
      if (a.newPrice && a.newPrice !== '0') lines.push(`    Price: $${(Number(a.newPrice) / 1e6).toFixed(2)} USDC`);
      if (a.newDeliveryTime) lines.push(`    Delivery: ${Math.round(a.newDeliveryTime / 3600)}h`);
      lines.push(`    Reason: ${a.reason}`);
      lines.push(`    ${c.dim}${shortenAddr(a.signer)}  ${a.createdAt}${c.reset}`);
      lines.push('');
    }
    return lines.join('\n');
  },
});

// ─── anp.checkpoint ────────────────────────────────────────────────────────

export const anpCheckpointCmd = defineCommand({
  name: 'anp.checkpoint',
  summary: 'Submit a signed milestone checkpoint (EIP-712 CheckpointIntent).',
  input: {
    job: { type: 'string', description: 'Job id', positional: 0, required: true },
    deliverable: { type: 'string', description: 'Deliverable hash/CID/URL', required: true },
    milestone: { type: 'number', description: 'Milestone index (0-based)', default: 0 },
    notes: { type: 'string', description: 'Notes describing progress' },
  },
  examples: [`obolos anp checkpoint job123 --deliverable ipfs://Qm... --milestone 1`],
  mcp: { expose: true, destructive: true },
  async run(input, ctx) {
    const signed = await signCheckpoint(ctx.config, {
      jobId: String(input.job),
      milestoneIndex: Number(input.milestone),
      deliverable: String(input.deliverable),
      notes: input.notes as string | undefined,
    });
    const data = await ctx.http.post<any>('/api/anp/publish', signed.document);
    return { cid: data.cid, jobId: input.job, milestone: input.milestone };
  },
  format(out) {
    return ['', `${c.green}Checkpoint submitted.${c.reset}`,
      `  ${c.bold}CID:${c.reset}       ${out.cid}`,
      `  ${c.bold}Job:${c.reset}       ${out.jobId}`,
      `  ${c.bold}Milestone:${c.reset} #${out.milestone}`,
      '', `${c.dim}Approve: obolos anp approve-cp ${out.jobId} --checkpoint ${out.cid}${c.reset}`].join('\n');
  },
});

// ─── anp.approve-cp ────────────────────────────────────────────────────────

export const anpApproveCpCmd = defineCommand({
  name: 'anp.approve-cp',
  summary: 'Sign and publish approval for a checkpoint (EIP-712 CheckpointApproval).',
  input: {
    job: { type: 'string', description: 'Job id', positional: 0, required: true },
    checkpoint: { type: 'string', description: 'Checkpoint CID', required: true },
  },
  examples: ['obolos anp approve-cp job123 --checkpoint sha256-...'],
  mcp: { expose: true, destructive: true },
  async run(input, ctx) {
    const cpDoc = await ctx.http.get<any>(`/api/anp/objects/${encodeURIComponent(String(input.checkpoint))}`);
    const signed = await signCheckpointApproval(ctx.config, String(input.job), String(input.checkpoint), cpDoc);
    const data = await ctx.http.post<any>('/api/anp/publish', signed.document);
    return { cid: data.cid, jobId: input.job, checkpointCid: input.checkpoint };
  },
  format(out) {
    return ['', `${c.green}Checkpoint approved.${c.reset}`,
      `  ${c.bold}CID:${c.reset}        ${out.cid}`,
      `  ${c.bold}Checkpoint:${c.reset} ${out.checkpointCid}`,
      `  ${c.bold}Job:${c.reset}        ${out.jobId}`].join('\n');
  },
});

// ─── anp.checkpoints ───────────────────────────────────────────────────────

export const anpCheckpointsCmd = defineCommand({
  name: 'anp.checkpoints',
  summary: 'List all checkpoints for a job.',
  input: { job: { type: 'string', description: 'Job id', positional: 0, required: true } },
  examples: ['obolos anp checkpoints job123'],
  mcp: { expose: true, readOnly: true },
  async run(input, ctx) {
    const data = await ctx.http.get<any>(`/api/anp/jobs/${encodeURIComponent(String(input.job))}/checkpoints`);
    return { jobId: input.job, checkpoints: data.checkpoints || [] };
  },
  format(out) {
    if (out.checkpoints.length === 0) return `${c.yellow}No checkpoints for job ${out.jobId}.${c.reset}`;
    const lines = ['', `${c.bold}${c.cyan}Checkpoints${c.reset} ${c.dim}— ${out.checkpoints.length}${c.reset}`, ''];
    for (const cp of out.checkpoints) {
      const st = cp.approved ? `${c.green}Approved${c.reset}` : `${c.yellow}Pending${c.reset}`;
      lines.push(`  #${cp.milestoneIndex} ${st}  ${c.dim}${cp.createdAt}${c.reset}`);
      lines.push(`    CID: ${cp.cid}`);
      lines.push(`    Deliverable: ${cp.deliverable}`);
      if (cp.notes) lines.push(`    Notes: ${cp.notes}`);
      lines.push('');
    }
    return lines.join('\n');
  },
});

export const anpCommands: Command[] = [
  anpListCmd, anpInfoCmd, anpCreateCmd, anpBidCmd, anpAcceptCmd, anpVerifyCmd,
  anpMessageCmd, anpThreadCmd,
  anpAmendCmd, anpAcceptAmendCmd, anpAmendmentsCmd,
  anpCheckpointCmd, anpApproveCpCmd, anpCheckpointsCmd,
] as Command[];
