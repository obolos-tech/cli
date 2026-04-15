/**
 * x402 payment handling — sign EIP-3009 TransferWithAuthorization for a
 * 402 challenge and retry the original request. Supports v1 "exact" scheme
 * and v2 "x402x-router-settlement" (atomic fee split).
 *
 * Extracted from cmdCall so the CLI `call` command and any MCP adapter
 * share the same flow.
 */

import type { ObolosConfig } from './config.js';
import { getClients, USDC_BASE } from './wallet.js';
import { paymentError } from './errors.js';

export interface CallOptions {
  method?: string;
  body?: unknown;
}

export interface CallResult {
  status: number;
  statusText: string;
  contentType: string;
  body: unknown;
  paid: boolean;
}

export async function callWithPayment(
  config: ObolosConfig,
  apiId: string,
  opts: CallOptions = {},
): Promise<CallResult> {
  const method = (opts.method ?? 'GET').toUpperCase();
  const url = `${config.apiUrl}/api/proxy/${encodeURIComponent(apiId)}`;
  const fetchOpts: RequestInit = { method };
  if (opts.body !== undefined && method !== 'GET') {
    fetchOpts.headers = { 'Content-Type': 'application/json' };
    fetchOpts.body = JSON.stringify(opts.body);
  }

  let res = await fetch(url, fetchOpts);
  let paid = false;

  if (res.status === 402) {
    if (!config.privateKey) {
      throw paymentError('API requires payment but no wallet is configured. Run `obolos setup`.');
    }
    const paymentInfo = await res.json();
    const { header, value } = await signX402(config, paymentInfo);
    res = await fetch(url, { ...fetchOpts, headers: { ...(fetchOpts.headers || {}), [header]: value } });
    paid = true;
  }

  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('json') ? await res.json() : await res.text();
  return { status: res.status, statusText: res.statusText, contentType, body, paid };
}

async function signX402(config: ObolosConfig, paymentInfo: any): Promise<{ header: string; value: string }> {
  const { keccak256, encodePacked } = await import('viem');
  const { account, walletClient } = await getClients(config);

  const accepts = paymentInfo.accepts?.[0];
  if (!accepts) throw paymentError('No payment options in 402 response');

  const amount = BigInt(accepts.maxAmountRequired || accepts.amount || '0');
  const payTo = accepts.payTo;
  const asset = (accepts.asset || USDC_BASE) as `0x${string}`;
  const scheme = accepts.scheme || 'exact';
  const rawNetwork = accepts.network || 'base';
  const network = rawNetwork.startsWith('eip155:') ? rawNetwork : 'eip155:8453';
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  const domain = {
    name: accepts.extra?.name || 'USD Coin',
    version: accepts.extra?.version || '2',
    chainId: 8453n,
    verifyingContract: asset,
  };
  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ],
  };

  const settlementKey = 'x402x-router-settlement';
  const settlementExt = accepts.extra?.[settlementKey];
  const settlementInfo = settlementExt?.info;

  let nonce: `0x${string}`;
  if (settlementInfo?.settlementRouter && settlementInfo?.salt) {
    nonce = keccak256(encodePacked(
      ['string', 'uint256', 'address', 'address', 'address', 'uint256', 'uint256', 'uint256', 'bytes32', 'address', 'uint256', 'address', 'bytes32'],
      ['X402/settle/v1', 8453n, settlementInfo.settlementRouter as `0x${string}`, asset,
       account.address, amount, 0n, deadline, settlementInfo.salt as `0x${string}`,
       (settlementInfo.finalPayTo || payTo) as `0x${string}`, BigInt(settlementInfo.facilitatorFee || '0'),
       settlementInfo.hook as `0x${string}`, keccak256(settlementInfo.hookData as `0x${string}`)],
    ));
  } else {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    nonce = `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
  }

  const signature = await walletClient.signTypedData({
    account, domain, types, primaryType: 'TransferWithAuthorization',
    message: { from: account.address, to: payTo as `0x${string}`, value: amount, validAfter: 0n, validBefore: deadline, nonce },
  });

  const authorization = { from: account.address, to: payTo, value: amount.toString(), validAfter: '0', validBefore: deadline.toString(), nonce };

  if (paymentInfo.x402Version === 2) {
    const payload: Record<string, unknown> = {
      x402Version: 2, scheme, network, payload: { signature, authorization }, accepted: { ...accepts, network },
    };
    if (settlementExt) payload.extensions = { [settlementKey]: settlementExt };
    return { header: 'payment-signature', value: Buffer.from(JSON.stringify(payload)).toString('base64') };
  }
  const payload = { x402Version: 1, scheme, network, payload: { signature, authorization } };
  return { header: 'x-payment', value: Buffer.from(JSON.stringify(payload)).toString('base64') };
}
