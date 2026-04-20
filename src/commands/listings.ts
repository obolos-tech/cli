/**
 * Job listing commands: list, info, create, bid, accept, cancel.
 *
 * Listings are the off-chain negotiation layer that sits in front of ACP.
 * When a bid is accepted, the accept command can create an ACP job on-chain
 * (best-effort; falls back to backend-only).
 */

import { defineCommand } from '../registry.js';
import type { Command } from '../registry.js';
import { userError } from '../runtime/errors.js';
import { getAccount } from '../runtime/wallet.js';
import { createJobOnChain, ZERO_ADDRESS } from '../runtime/acp.js';
import { c, statusColor, formatDate, shortenAddr, shortenId } from '../runtime/display.js';

async function walletHeader(config: { privateKey: string | null }): Promise<Record<string, string>> {
  if (!config.privateKey) throw userError('No wallet configured. Run `obolos setup`.');
  const acc = await getAccount(config as any);
  return { 'x-wallet-address': acc.address };
}

// ─── listing.list ───────────────────────────────────────────────────────────

export const listingListCmd = defineCommand({
  name: 'listing.list',
  summary: 'Browse open job listings.',
  input: {
    status: { type: 'string', description: 'Filter by status', enum: ['open', 'negotiating', 'accepted', 'cancelled'] },
    client: { type: 'string', description: 'Filter by client address' },
    limit: { type: 'number', description: 'Max results', default: 20 },
  },
  examples: ['obolos listing list --status=open'],
  mcp: { expose: true, readOnly: true },
  async run(input, ctx) {
    const params = new URLSearchParams();
    if (input.status) params.set('status', String(input.status));
    if (input.client) params.set('client', String(input.client));
    params.set('limit', String(input.limit));
    const data = await ctx.http.get<any>(`/api/listings?${params}`);
    return { listings: data.listings || data.data || [], total: data.pagination?.total ?? 0 };
  },
  format(out) {
    if (out.listings.length === 0) return `${c.yellow}No listings found.${c.reset}`;
    const lines = [
      '', `${c.bold}${c.cyan}Job Listings${c.reset} ${c.dim}— ${out.total} listings${c.reset}`, '',
    ];
    for (const l of out.listings) {
      const min = l.min_budget != null ? `$${Number(l.min_budget).toFixed(2)}` : '?';
      const max = l.max_budget != null ? `$${Number(l.max_budget).toFixed(2)}` : '?';
      lines.push(`  ${shortenId(l.id).padEnd(12)} ${(l.title || 'Untitled').slice(0, 26).padEnd(28)} ${statusColor((l.status || 'open').padEnd(12))}  ${(min + '-' + max).padEnd(20)} bids:${l.bid_count ?? l.bids?.length ?? 0}  ${shortenAddr(l.client_address || l.client)}`);
    }
    return lines.join('\n');
  },
});

// ─── listing.info ───────────────────────────────────────────────────────────

export const listingInfoCmd = defineCommand({
  name: 'listing.info',
  summary: 'Get listing details and all bids.',
  input: { id: { type: 'string', description: 'Listing id', positional: 0, required: true } },
  examples: ['obolos listing info abc123'],
  mcp: { expose: true, readOnly: true },
  async run(input, ctx) {
    const data = await ctx.http.get<any>(`/api/listings/${encodeURIComponent(String(input.id))}`);
    return data.listing || data;
  },
  format(l) {
    const lines = [
      '', `${c.bold}${c.cyan}${l.title || 'Untitled Listing'}${c.reset}`,
      `${c.dim}${'─'.repeat(60)}${c.reset}`,
      `  ${c.bold}ID:${c.reset}     ${l.id}`,
      `  ${c.bold}Status:${c.reset} ${statusColor(l.status || 'open')}`,
      `  ${c.bold}Client:${c.reset} ${l.client_address || '—'}`,
    ];
    if (l.min_budget != null || l.max_budget != null) {
      const min = l.min_budget != null ? `$${Number(l.min_budget).toFixed(2)}` : '?';
      const max = l.max_budget != null ? `$${Number(l.max_budget).toFixed(2)}` : '?';
      lines.push(`  ${c.bold}Budget:${c.reset} ${c.green}${min} – ${max} USDC${c.reset}`);
    }
    if (l.deadline) lines.push(`  ${c.bold}Deadline:${c.reset} ${formatDate(l.deadline)}`);
    if (l.description) lines.push('', `  ${l.description}`);
    const bids = l.bids || [];
    if (bids.length > 0) {
      lines.push('', `  ${c.bold}Bids (${bids.length})${c.reset}`);
      for (const b of bids) {
        const price = b.price != null ? `$${Number(b.price).toFixed(2)}` : '—';
        lines.push(`    ${shortenId(b.id)} ${shortenAddr(b.provider_address)} ${c.green}${price}${c.reset}  ${b.delivery_time ? b.delivery_time + 'h' : ''}  ${c.dim}${(b.message || '').slice(0, 40)}${c.reset}`);
      }
    }
    return lines.join('\n');
  },
});

// ─── listing.create ─────────────────────────────────────────────────────────

export const listingCreateCmd = defineCommand({
  name: 'listing.create',
  summary: 'Post a job listing for agents to bid on.',
  input: {
    title: { type: 'string', description: 'Listing title', required: true },
    description: { type: 'string', description: 'Detailed description' },
    'min-budget': { type: 'number', description: 'Minimum budget in USDC' },
    'max-budget': { type: 'number', description: 'Maximum budget in USDC' },
    deadline: { type: 'string', description: 'Bidding deadline ("7d", ISO date)' },
    duration: { type: 'number', description: 'Expected job duration in hours' },
    evaluator: { type: 'string', description: 'Preferred evaluator address' },
    hook: { type: 'string', description: 'Hook contract address' },
  },
  examples: [`obolos listing create --title "Parse CSV" --max-budget 10 --deadline 7d`],
  mcp: { expose: true, destructive: true },
  async run(input, ctx) {
    const headers = await walletHeader(ctx.config);
    const payload: Record<string, any> = { title: input.title };
    if (input.description) payload.description = input.description;
    if (input['min-budget'] != null) payload.min_budget = input['min-budget'];
    if (input['max-budget'] != null) payload.max_budget = input['max-budget'];
    if (input.deadline) payload.deadline = input.deadline;
    if (input.duration) payload.job_duration = input.duration;
    if (input.evaluator) payload.preferred_evaluator = input.evaluator;
    if (input.hook) payload.hook_address = input.hook;
    const data = await ctx.http.post<any>('/api/listings', payload, headers);
    return data.listing || data;
  },
  format(l) {
    return ['', `${c.green}Listing created.${c.reset}`,
      `  ${c.bold}ID:${c.reset}     ${l.id}`,
      `  ${c.bold}Status:${c.reset} ${statusColor(l.status || 'open')}`,
      '', `${c.dim}Providers can bid: obolos listing bid ${l.id} --price 5.00${c.reset}`].join('\n');
  },
});

// ─── listing.bid ────────────────────────────────────────────────────────────

export const listingBidCmd = defineCommand({
  name: 'listing.bid',
  summary: 'Submit a bid on a listing.',
  input: {
    id: { type: 'string', description: 'Listing id', positional: 0, required: true },
    price: { type: 'number', description: 'Your price in USDC', required: true },
    delivery: { type: 'number', description: 'Delivery time in hours' },
    message: { type: 'string', description: 'Pitch to the client' },
    'proposal-hash': { type: 'string', description: 'Hash of detailed proposal' },
  },
  examples: [`obolos listing bid abc123 --price 5.00 --delivery 24 --message "Can do in 12h"`],
  mcp: { expose: true, destructive: true },
  async run(input, ctx) {
    const headers = await walletHeader(ctx.config);
    const payload: Record<string, any> = { price: input.price };
    if (input.delivery) payload.delivery_time = input.delivery;
    if (input.message) payload.message = input.message;
    if (input['proposal-hash']) payload.proposal_hash = input['proposal-hash'];
    const data = await ctx.http.post<any>(`/api/listings/${encodeURIComponent(String(input.id))}/bid`, payload, headers);
    return { bid: data.bid || data, price: input.price, delivery: input.delivery, message: input.message };
  },
  format(out) {
    const lines = ['', `${c.green}Bid submitted.${c.reset}`,
      `  ${c.bold}Bid ID:${c.reset} ${out.bid.id}`,
      `  ${c.bold}Price:${c.reset}  ${c.green}$${Number(out.price).toFixed(2)} USDC${c.reset}`];
    if (out.delivery) lines.push(`  ${c.bold}Delivery:${c.reset} ${out.delivery}h`);
    return lines.join('\n');
  },
});

// ─── listing.accept ────────────────────────────────────────────────────────

export const listingAcceptCmd = defineCommand({
  name: 'listing.accept',
  summary: 'Accept a bid — creates the ACP job on-chain with budget set, then records it on the backend.',
  input: {
    id: { type: 'string', description: 'Listing id', positional: 0, required: true },
    bid: { type: 'string', description: 'Bid id to accept', required: true },
    'off-chain': { type: 'boolean', description: 'Accept without broadcasting to ACP (trust-based)', default: false },
  },
  examples: ['obolos listing accept abc123 --bid bid456'],
  mcp: { expose: true, destructive: true },
  async run(input, ctx) {
    const headers = await walletHeader(ctx.config);
    const listingData = await ctx.http.get<any>(`/api/listings/${encodeURIComponent(String(input.id))}`);
    const listing = listingData.listing || listingData;
    const acceptedBid = (listing.bids || []).find((b: any) => b.id === input.bid);
    if (!acceptedBid) throw new Error(`Bid ${input.bid} not found on listing ${input.id}`);

    let chainJobId: string | null = null;
    let chainTxHash: string | null = null;
    let setBudgetTxHash: string | null = null;

    if (!input['off-chain']) {
      if (!ctx.config.privateKey) {
        throw new Error(
          `No wallet configured. On-chain-by-default requires a signer; run \`obolos setup\`\n` +
          `or pass --off-chain to accept without on-chain escrow (trust-based).`,
        );
      }
      const clientAddr = (await getAccount(ctx.config)).address;
      const durationHours = acceptedBid.delivery_time || listing.job_duration || 168;
      const expiredAt = Math.floor((Date.now() + durationHours * 3600000) / 1000);
      const description = `${listing.title}: ${listing.description || ''}`.slice(0, 500);

      // createJob + setBudget in one helper so `obolos job fund` will
      // succeed immediately after this without a BudgetNotSet revert.
      const result = await createJobOnChain(ctx.config, {
        provider: acceptedBid.provider_address,
        evaluator: listing.preferred_evaluator || clientAddr,
        expiredAt,
        description,
        budgetUsd: acceptedBid.price != null ? String(acceptedBid.price) : undefined,
      });
      chainJobId = result.chainJobId;
      chainTxHash = result.txHash;
      setBudgetTxHash = result.setBudgetTxHash;

      if (!chainJobId) {
        throw new Error(
          `ACP.createJob broadcast but no JobCreated event parsed — refusing to mark the backend accepted.\n` +
          `Check Basescan for tx ${chainTxHash}.`,
        );
      }
    }

    const payload: Record<string, any> = { bid_id: input.bid };
    if (chainJobId) payload.acp_job_id = chainJobId;
    if (chainTxHash) payload.chain_tx_hash = chainTxHash;
    const data = await ctx.http.post<any>(`/api/listings/${encodeURIComponent(String(input.id))}/accept`, payload, headers);
    return {
      listing: data.listing || data,
      jobId: data.job_id,
      chainJobId,
      chainTxHash,
      setBudgetTxHash,
      warning: input['off-chain'] ? 'Accepted off-chain (trust-based). No USDC escrow.' : null,
    };
  },
  format(out) {
    const lines = ['', `${c.green}Bid accepted.${c.reset}`];
    if (out.warning) lines.push(`${c.yellow}${out.warning}${c.reset}`);
    if (out.jobId) lines.push(`  ${c.bold}Job ID:${c.reset}      ${out.jobId}`);
    if (out.chainJobId) lines.push(`  ${c.bold}Chain ID:${c.reset}    ${out.chainJobId}`);
    if (out.chainTxHash) lines.push(`  ${c.bold}createJob tx:${c.reset} ${c.cyan}${out.chainTxHash}${c.reset}`);
    if (out.setBudgetTxHash) lines.push(`  ${c.bold}setBudget tx:${c.reset} ${c.cyan}${out.setBudgetTxHash}${c.reset}`);
    lines.push('', `${c.dim}Next: obolos job fund ${out.jobId || '<job-id>'}${c.reset}`);
    return lines.join('\n');
  },
});

// ─── listing.cancel ────────────────────────────────────────────────────────

export const listingCancelCmd = defineCommand({
  name: 'listing.cancel',
  summary: 'Cancel an open listing.',
  input: { id: { type: 'string', description: 'Listing id', positional: 0, required: true } },
  examples: ['obolos listing cancel abc123'],
  mcp: { expose: true, destructive: true },
  async run(input, ctx) {
    const headers = await walletHeader(ctx.config);
    const data = await ctx.http.post<any>(`/api/listings/${encodeURIComponent(String(input.id))}/cancel`, {}, headers);
    return data.listing || data;
  },
  format(l) {
    return `${c.yellow}Listing cancelled.${c.reset}  ${c.bold}Status:${c.reset} ${statusColor(l.status || 'cancelled')}`;
  },
});

export const listingCommands: Command[] = [
  listingListCmd, listingInfoCmd, listingCreateCmd, listingBidCmd, listingAcceptCmd, listingCancelCmd,
] as Command[];
