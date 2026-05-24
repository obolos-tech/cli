/**
 * ERC-8004 identity commands.
 *
 * Lets a CLI/MCP-driven agent mint + manage its own on-chain identity
 * on the canonical IdentityRegistry. The user's configured private key
 * signs the register/setAgentURI tx directly so THEY own the agentId —
 * Obolos's backend only handles IPFS pinning of the card + verifying
 * the receipt + persisting the canonical row.
 *
 * Reads (get, feedback) work against any agent; writes (register,
 * update) need the user's wallet to be the agent owner.
 */

import { defineCommand } from '../registry.js';
import type { Command } from '../registry.js';
import { userError, paymentError } from '../runtime/errors.js';
import { getAccount, getClients, requirePrivateKey } from '../runtime/wallet.js';
import { c } from '../runtime/display.js';

// Canonical ERC-8004 IdentityRegistry on Base mainnet (UUPS proxy,
// same address on ~30 chains). The fork lives in
// src/abi/erc8004/addresses.ts on the server.
const IDENTITY_REGISTRY_BASE = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;

// Minimal ABI — only the writes the CLI sends + the Registered event
// the server parses on the receipt. Kept inline so the CLI doesn't
// need a JSON loader.
const IDENTITY_ABI = [
  {
    type: 'function',
    name: 'register',
    inputs: [{ name: 'agentURI', type: 'string' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setAgentURI',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'newURI', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'Registered',
    inputs: [
      { indexed: true, name: 'agentId', type: 'uint256' },
      { indexed: false, name: 'agentURI', type: 'string' },
      { indexed: true, name: 'owner', type: 'address' },
    ],
  },
] as const;

function buildCard(opts: {
  name: string;
  description?: string;
  url?: string;
  walletAddress: string;
}): Record<string, unknown> {
  return {
    schema: 'obolos.agentcard.v1',
    name: opts.name,
    description: opts.description ?? '',
    url: opts.url ?? '',
    wallet: opts.walletAddress,
    createdAt: new Date().toISOString(),
  };
}

// ─── identity.register ──────────────────────────────────────────────────────

export const identityRegisterCmd = defineCommand({
  name: 'identity.register',
  summary: 'Mint a new ERC-8004 identity owned by your configured wallet.',
  description:
    'Builds an agent card, pins it to IPFS via the Obolos backend, then signs ' +
    'the IdentityRegistry register(uri) tx from your wallet. The caller becomes ' +
    'the agent owner. Costs Base mainnet gas (a few cents).',
  input: {
    name: { type: 'string', description: 'Agent display name', required: true },
    description: { type: 'string', description: 'One-line agent description', default: '' },
    url: { type: 'string', description: 'Optional public URL for the agent', default: '' },
  },
  examples: [
    `obolos identity register --name "ConfirmoBot" --description "Pays in CZK-pegged stables"`,
  ],
  mcp: { expose: true, destructive: true },

  async run(input, ctx) {
    if (!ctx.config.privateKey) {
      throw paymentError('No wallet configured. Run `obolos setup` first.');
    }

    const account = await getAccount(ctx.config);
    const card = buildCard({
      name: String(input.name),
      description: String(input.description ?? ''),
      url: String(input.url ?? ''),
      walletAddress: account.address,
    });

    // 1. Pin the card to IPFS via the backend.
    const pinned = await ctx.http.post<{ cid: string; hash: string; uri: string; size: number }>(
      '/api/erc8004/card/pin',
      card,
      { 'x-wallet-address': account.address },
    );

    // 2. Sign + send register(uri) from the user's wallet.
    const { walletClient, publicClient } = await getClients(ctx.config);
    const txHash = await walletClient.writeContract({
      address: IDENTITY_REGISTRY_BASE,
      abi: IDENTITY_ABI,
      functionName: 'register',
      args: [pinned.uri],
      account,
      chain: walletClient.chain,
    });

    // Wait for the receipt so the backend can find the Registered event.
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    // 3. Confirm with the backend — parses receipt, persists canonical row.
    const confirmed = await ctx.http.post<{ agentId: string; agentURI: string; cid: string; txHash: string }>(
      '/api/erc8004/identity/confirm',
      { txHash, cid: pinned.cid, cardJson: card },
      { 'x-wallet-address': account.address },
    );

    return {
      agentId: confirmed.agentId,
      owner: account.address,
      cid: pinned.cid,
      uri: pinned.uri,
      txHash,
      basescan: `https://basescan.org/tx/${txHash}`,
    };
  },

  format(out: any) {
    return [
      '',
      `${c.bold}${c.cyan}✓ Identity minted${c.reset}`,
      `${c.dim}${'─'.repeat(60)}${c.reset}`,
      `  ${c.bold}Agent ID:${c.reset}     ${out.agentId}`,
      `  ${c.bold}Owner:${c.reset}        ${out.owner}`,
      `  ${c.bold}IPFS CID:${c.reset}     ${out.cid}`,
      `  ${c.bold}URI:${c.reset}          ${out.uri}`,
      `  ${c.bold}Tx hash:${c.reset}      ${out.txHash}`,
      `  ${c.bold}Basescan:${c.reset}     ${c.dim}${out.basescan}${c.reset}`,
    ].join('\n');
  },
});

// ─── identity.update ────────────────────────────────────────────────────────

export const identityUpdateCmd = defineCommand({
  name: 'identity.update',
  summary: "Update an existing agent's card (pins new card, calls setAgentURI).",
  description:
    'Replaces the agent card by pinning a new version to IPFS and calling ' +
    'setAgentURI from your wallet. Your wallet must own the agentId.',
  input: {
    agentId: { type: 'string', description: 'Agent id (numeric)', positional: 0, required: true },
    name: { type: 'string', description: 'New display name', required: true },
    description: { type: 'string', description: 'New description', default: '' },
    url: { type: 'string', description: 'Optional public URL', default: '' },
  },
  examples: [
    `obolos identity update 6192 --name "ConfirmoBot v2" --description "now also handles invoicing"`,
  ],
  mcp: { expose: true, destructive: true },

  async run(input, ctx) {
    if (!ctx.config.privateKey) {
      throw paymentError('No wallet configured. Run `obolos setup` first.');
    }
    if (!input.agentId) throw userError('Missing agentId');

    const agentIdBig = BigInt(String(input.agentId));
    const account = await getAccount(ctx.config);

    const card = buildCard({
      name: String(input.name),
      description: String(input.description ?? ''),
      url: String(input.url ?? ''),
      walletAddress: account.address,
    });

    // Pin via backend (same card/pin endpoint — it doesn't require register).
    const pinned = await ctx.http.post<{ cid: string; hash: string; uri: string; size: number }>(
      '/api/erc8004/card/pin',
      card,
      { 'x-wallet-address': account.address },
    );

    const { walletClient, publicClient } = await getClients(ctx.config);
    const txHash = await walletClient.writeContract({
      address: IDENTITY_REGISTRY_BASE,
      abi: IDENTITY_ABI,
      functionName: 'setAgentURI',
      args: [agentIdBig, pinned.uri],
      account,
      chain: walletClient.chain,
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    // Record the new card version with the backend.
    const confirmed = await ctx.http.post<{ ok: true; cid: string; version: number }>(
      '/api/erc8004/card/update',
      { agentId: String(input.agentId), txHash, cid: pinned.cid, cardJson: card },
      { 'x-wallet-address': account.address },
    );

    return {
      agentId: String(input.agentId),
      newCid: pinned.cid,
      newUri: pinned.uri,
      version: confirmed.version,
      txHash,
      basescan: `https://basescan.org/tx/${txHash}`,
    };
  },

  format(out: any) {
    return [
      '',
      `${c.bold}${c.cyan}✓ Identity updated${c.reset}`,
      `${c.dim}${'─'.repeat(60)}${c.reset}`,
      `  ${c.bold}Agent ID:${c.reset}     ${out.agentId}`,
      `  ${c.bold}New version:${c.reset}  ${out.version ?? '?'}`,
      `  ${c.bold}IPFS CID:${c.reset}     ${out.newCid}`,
      `  ${c.bold}URI:${c.reset}          ${out.newUri}`,
      `  ${c.bold}Tx hash:${c.reset}      ${out.txHash}`,
      `  ${c.bold}Basescan:${c.reset}     ${c.dim}${out.basescan}${c.reset}`,
    ].join('\n');
  },
});

// ─── identity.get ───────────────────────────────────────────────────────────

function looksLikeAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

export const identityGetCmd = defineCommand({
  name: 'identity.get',
  summary: 'Fetch an agent identity by numeric agentId or wallet address.',
  description:
    'Returns the merged on-chain + DB + IPFS view of an agent. Accepts either ' +
    'a numeric agent id or a 0x… wallet address.',
  input: {
    target: {
      type: 'string',
      description: 'Numeric agent id OR 0x… wallet address',
      positional: 0,
      required: true,
    },
  },
  examples: [
    'obolos identity get 6192',
    'obolos identity get 0x03347c32aDCFD59643a746ec64951fC1B6313c3b',
  ],
  mcp: { expose: true, readOnly: true },

  async run(input, ctx) {
    const target = String(input.target).trim();
    if (looksLikeAddress(target)) {
      return ctx.http.get<unknown>(`/api/erc8004/agent/by-wallet/${target}`);
    }
    if (!/^\d+$/.test(target)) {
      throw userError(`'${target}' is neither a numeric agent id nor a 0x… address`);
    }
    return ctx.http.get<unknown>(`/api/erc8004/agent/${target}`);
  },

  format(out: any) {
    if (!out || typeof out !== 'object') return JSON.stringify(out, null, 2);
    const lines: string[] = [
      '',
      `${c.bold}${c.cyan}Agent${c.reset}`,
      `${c.dim}${'─'.repeat(60)}${c.reset}`,
    ];
    if (out.agentId !== undefined) lines.push(`  ${c.bold}ID:${c.reset}            ${out.agentId}`);
    if (out.owner) lines.push(`  ${c.bold}Owner:${c.reset}         ${out.owner}`);
    if (out.wallet) lines.push(`  ${c.bold}Wallet:${c.reset}        ${out.wallet}`);
    if (out.agentURI) lines.push(`  ${c.bold}URI:${c.reset}           ${out.agentURI}`);
    if (out.card?.name) lines.push(`  ${c.bold}Name:${c.reset}          ${out.card.name}`);
    if (out.card?.description) lines.push(`  ${c.bold}Description:${c.reset}   ${out.card.description}`);
    if (out.card?.url) lines.push(`  ${c.bold}URL:${c.reset}           ${out.card.url}`);
    return lines.join('\n');
  },
});

// ─── identity.feedback ──────────────────────────────────────────────────────

export const identityFeedbackCmd = defineCommand({
  name: 'identity.feedback',
  summary: 'Read on-chain reputation feedback for an agent.',
  input: {
    agentId: { type: 'string', description: 'Numeric agent id', positional: 0, required: true },
  },
  examples: ['obolos identity feedback 6192'],
  mcp: { expose: true, readOnly: true },

  async run(input, ctx) {
    const agentId = String(input.agentId).trim();
    if (!/^\d+$/.test(agentId)) throw userError('agentId must be numeric');
    return ctx.http.get<unknown>(`/api/erc8004/agent/${agentId}/feedback`);
  },

  format(out: any) {
    if (Array.isArray(out)) {
      if (out.length === 0) return `${c.dim}No on-chain feedback yet.${c.reset}`;
      const lines: string[] = ['', `${c.bold}${c.cyan}On-chain feedback${c.reset}`, `${c.dim}${'─'.repeat(60)}${c.reset}`];
      for (const fb of out) {
        const score = fb.scoreValue !== undefined ? `${fb.scoreValue}/100` : '?';
        lines.push(`  ${c.bold}#${fb.feedbackIndex ?? '?'}${c.reset}  score=${score}  tag1=${fb.tag1 ?? ''}  client=${fb.clientAddress ?? ''}`);
      }
      return lines.join('\n');
    }
    return JSON.stringify(out, null, 2);
  },
});

// Silence the unused-import lint — `requirePrivateKey` is exported by
// wallet.ts and referenced indirectly via getAccount; keep it imported
// to document the dependency without TypeScript flagging it.
void requirePrivateKey;

export const identityCommands: Command[] = [
  identityRegisterCmd,
  identityUpdateCmd,
  identityGetCmd,
  identityFeedbackCmd,
] as Command[];
