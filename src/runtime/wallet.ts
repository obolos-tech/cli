/**
 * Wallet helpers — lazy viem imports so commands that never touch a wallet
 * don't pay the import cost.
 */

import { paymentError } from './errors.js';
import type { ObolosConfig } from './config.js';

export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
export const BASE_CHAIN_ID = 8453;

export function requirePrivateKey(config: ObolosConfig): string {
  if (!config.privateKey) {
    throw paymentError('No wallet configured. Run `obolos setup` first.');
  }
  return config.privateKey.startsWith('0x') ? config.privateKey : `0x${config.privateKey}`;
}

export async function getAccount(config: ObolosConfig) {
  const { privateKeyToAccount } = await import('viem/accounts');
  return privateKeyToAccount(requirePrivateKey(config) as `0x${string}`);
}

export async function getClients(config: ObolosConfig): Promise<any> {
  const { createPublicClient, createWalletClient, http } = await import('viem');
  const { base } = await import('viem/chains');
  const account = await getAccount(config);
  return {
    account,
    publicClient: createPublicClient({ chain: base, transport: http() }),
    walletClient: createWalletClient({ account, chain: base, transport: http() }),
  };
}

export async function getUsdcBalance(config: ObolosConfig): Promise<{ address: string; balance: string; raw: bigint }> {
  const { formatUnits } = await import('viem');
  const { publicClient, account } = await getClients(config);
  const raw = (await publicClient.readContract({
    address: USDC_BASE,
    abi: [{
      inputs: [{ name: 'account', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view', type: 'function',
    }],
    functionName: 'balanceOf',
    args: [account.address],
  })) as bigint;
  return { address: account.address, balance: formatUnits(raw, 6), raw };
}
