/**
 * Wallet / payment commands: call, balance.
 */

import { defineCommand } from '../registry.js';
import type { Command } from '../registry.js';
import { callWithPayment } from '../runtime/payment.js';
import { getUsdcBalance } from '../runtime/wallet.js';

const c = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m' };

export const callCmd = defineCommand({
  name: 'call',
  summary: 'Call an x402 API through the Obolos proxy, paying in USDC if required.',
  description:
    'If the API returns 402 Payment Required, the wallet signs an EIP-3009 TransferWithAuthorization ' +
    'and the request is retried. Supports v1 "exact" and v2 "x402x-router-settlement" schemes.',
  input: {
    id: { type: 'string', description: 'API id', positional: 0, required: true },
    method: { type: 'string', description: 'HTTP method', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET' },
    body: { type: 'json', description: 'Request body as JSON (object or string)' },
  },
  examples: [
    'obolos call ext-abc123',
    `obolos call ext-abc123 --method POST --body '{"prompt":"hi"}'`,
    'obolos call ext-abc123 --json',
  ],
  mcp: { expose: true, destructive: true },

  async run(input, ctx) {
    return callWithPayment(ctx.config, String(input.id), {
      method: input.method as string,
      body: input.body,
    });
  },

  format(out) {
    const color = out.status < 300 ? c.green : out.status < 400 ? c.yellow : c.red;
    const lines: string[] = [
      `${color}${out.status} ${out.statusText}${c.reset}`,
      out.paid ? `${c.dim}(paid via x402)${c.reset}` : `${c.dim}(no payment required)${c.reset}`,
      '',
    ];
    if (typeof out.body === 'string') {
      lines.push(out.body.slice(0, 2000));
    } else {
      lines.push(JSON.stringify(out.body, null, 2));
    }
    return lines.join('\n');
  },
});

export const balanceCmd = defineCommand({
  name: 'balance',
  summary: 'Show connected wallet address and USDC balance on Base.',
  input: {},
  examples: ['obolos balance', 'obolos balance --json'],
  mcp: { expose: true, readOnly: true },

  async run(_input, ctx) {
    const { address, balance } = await getUsdcBalance(ctx.config);
    return { address, balance, asset: 'USDC', chain: 'base', chainId: 8453 };
  },

  format(out) {
    return [
      '',
      `${c.bold}Wallet:${c.reset}  ${out.address}`,
      `${c.bold}Balance:${c.reset} ${c.green}${out.balance} USDC${c.reset}`,
      `${c.bold}Network:${c.reset} Base (Chain ID: 8453)`,
    ].join('\n');
  },
});

export const walletCommands: Command[] = [callCmd, balanceCmd] as Command[];
