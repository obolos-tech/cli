/**
 * ACP (ERC-8183) on-chain operations: createJob, fund, submit, complete, reject.
 * Callers provide a pre-fetched `chainJobId` (from the backend record) so this
 * module stays stateless.
 */

import type { ObolosConfig } from './config.js';
import { getClients, USDC_BASE } from './wallet.js';

export const ACP_ADDRESS = '0xaF3148696242F7Fb74893DC47690e37950807362' as const;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
export const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export const ACP_ABI = [
  { type: 'function', name: 'createJob', stateMutability: 'nonpayable',
    inputs: [
      { name: 'provider', type: 'address' }, { name: 'evaluator', type: 'address' },
      { name: 'expiredAt', type: 'uint256' }, { name: 'description', type: 'string' },
      { name: 'hook', type: 'address' },
    ],
    outputs: [{ name: 'jobId', type: 'uint256' }] },
  { type: 'function', name: 'setBudget', stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' }, { name: 'amount', type: 'uint256' },
      { name: 'optParams', type: 'bytes' },
    ], outputs: [] },
  { type: 'function', name: 'fund', stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' }, { name: 'expectedBudget', type: 'uint256' },
      { name: 'optParams', type: 'bytes' },
    ], outputs: [] },
  { type: 'function', name: 'submit', stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' }, { name: 'deliverable', type: 'bytes32' },
      { name: 'optParams', type: 'bytes' },
    ], outputs: [] },
  { type: 'function', name: 'complete', stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' }, { name: 'reason', type: 'bytes32' },
      { name: 'optParams', type: 'bytes' },
    ], outputs: [] },
  { type: 'function', name: 'reject', stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' }, { name: 'reason', type: 'bytes32' },
      { name: 'optParams', type: 'bytes' },
    ], outputs: [] },
  { type: 'event', name: 'JobCreated', inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: true },
      { name: 'provider', type: 'address', indexed: false },
      { name: 'evaluator', type: 'address', indexed: false },
      { name: 'expiredAt', type: 'uint256', indexed: false },
    ] },
] as const;

export const ERC20_ABI = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
] as const;

async function chain() { return (await import('viem/chains')).base; }

/**
 * Create an ACP job on-chain AND set the budget in one atomic helper.
 *
 * `createJob` on ACP leaves budget at zero; `fund()` later reverts with
 * BudgetNotSet until a separate `setBudget(jobId, amount, '0x')` call
 * lands. Bundling the two here means the on-chain job is always in a
 * state where `fund` can succeed as soon as the provider and evaluator
 * are set. Skipped only if no budget is supplied (open-ended job).
 */
export async function createJobOnChain(
  config: ObolosConfig,
  params: {
    provider?: string;
    evaluator: string;
    expiredAt: number;
    description: string;
    budgetUsd?: string; // omit → no setBudget call
  },
): Promise<{ txHash: string; chainJobId: string | null; setBudgetTxHash: string | null }> {
  const { decodeEventLog, parseUnits } = await import('viem');
  const { account, publicClient, walletClient } = await getClients(config);
  const txHash = await walletClient.writeContract({
    address: ACP_ADDRESS, abi: ACP_ABI, functionName: 'createJob',
    args: [
      (params.provider || ZERO_ADDRESS) as `0x${string}`,
      params.evaluator as `0x${string}`,
      BigInt(params.expiredAt),
      params.description,
      ZERO_ADDRESS,
    ],
    account, chain: await chain(),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  let chainJobId: string | null = null;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: ACP_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName === 'JobCreated') { chainJobId = ((decoded.args as any).jobId).toString(); break; }
    } catch {}
  }

  // setBudget — must be called before fund() can succeed.
  let setBudgetTxHash: string | null = null;
  if (chainJobId && params.budgetUsd) {
    const amount = parseUnits(params.budgetUsd, 6);
    setBudgetTxHash = await walletClient.writeContract({
      address: ACP_ADDRESS, abi: ACP_ABI, functionName: 'setBudget',
      args: [BigInt(chainJobId), amount, '0x'],
      account, chain: await chain(),
    });
    await publicClient.waitForTransactionReceipt({ hash: setBudgetTxHash });
  }

  return { txHash, chainJobId, setBudgetTxHash };
}

export async function fundOnChain(config: ObolosConfig, chainJobId: string, budgetUsd: string): Promise<string> {
  const { parseUnits } = await import('viem');
  const { account, publicClient, walletClient } = await getClients(config);
  const amount = parseUnits(budgetUsd, 6);
  const allowance = (await publicClient.readContract({
    address: USDC_BASE, abi: ERC20_ABI, functionName: 'allowance',
    args: [account.address, ACP_ADDRESS],
  })) as bigint;
  if (allowance < amount) {
    const approveTx = await walletClient.writeContract({
      address: USDC_BASE, abi: ERC20_ABI, functionName: 'approve',
      args: [ACP_ADDRESS, amount], account, chain: await chain(),
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
  }
  const fundTx = await walletClient.writeContract({
    address: ACP_ADDRESS, abi: ACP_ABI, functionName: 'fund',
    args: [BigInt(chainJobId), amount, '0x'],
    account, chain: await chain(),
  });
  await publicClient.waitForTransactionReceipt({ hash: fundTx });
  return fundTx;
}

async function terminalTx(
  config: ObolosConfig, chainJobId: string, reason: string | undefined, fn: 'complete' | 'reject',
): Promise<string> {
  const { keccak256, toHex } = await import('viem');
  const { account, publicClient, walletClient } = await getClients(config);
  const reasonHash = reason ? (keccak256(toHex(reason)) as `0x${string}`) : ZERO_BYTES32;
  const tx = await walletClient.writeContract({
    address: ACP_ADDRESS, abi: ACP_ABI, functionName: fn,
    args: [BigInt(chainJobId), reasonHash, '0x'],
    account, chain: await chain(),
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
  return tx;
}

export async function submitOnChain(config: ObolosConfig, chainJobId: string, deliverable: string): Promise<string> {
  const { keccak256, toHex } = await import('viem');
  const { account, publicClient, walletClient } = await getClients(config);
  const deliverableHash = keccak256(toHex(deliverable));
  const tx = await walletClient.writeContract({
    address: ACP_ADDRESS, abi: ACP_ABI, functionName: 'submit',
    args: [BigInt(chainJobId), deliverableHash as `0x${string}`, '0x'],
    account, chain: await chain(),
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
  return tx;
}

export const completeOnChain = (c: ObolosConfig, id: string, reason?: string) => terminalTx(c, id, reason, 'complete');
export const rejectOnChain = (c: ObolosConfig, id: string, reason?: string) => terminalTx(c, id, reason, 'reject');
