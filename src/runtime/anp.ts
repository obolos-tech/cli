/**
 * ANP (Agent Negotiation Protocol) runtime: EIP-712 signing helpers for
 * listings, bids, and acceptances. Delegates hashing to @obolos_tech/anp-sdk.
 *
 * Advanced primitives (messages, amendments, checkpoints) stay in the
 * legacy switch for now — port them here as they're ported to the registry.
 */

import type { ObolosConfig } from './config.js';
import { getClients } from './wallet.js';
import {
  ANP_TYPES, getANPDomain, computeContentHash as sdkContentHash,
  hashListingIntent, hashBidIntent, hashAmendmentIntent, hashCheckpointIntent,
} from '@obolos_tech/anp-sdk';

const ANP_SETTLEMENT = '0xfEa362Bf569e97B20681289fB4D4a64CEBDFa792' as const;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
export const ANP_DOMAIN = getANPDomain(8453, ANP_SETTLEMENT);

export function generateNonce(): bigint {
  return BigInt(Math.floor(Math.random() * 2 ** 32));
}

export const computeContentHash = sdkContentHash;
export const hashListingStruct = hashListingIntent;
export const hashBidStruct = hashBidIntent;
export const hashAmendmentStruct = hashAmendmentIntent;
export const hashCheckpointStruct = hashCheckpointIntent;

export async function computeJobHash(jobId: string): Promise<`0x${string}`> {
  return computeContentHash({ jobId });
}

export const ROLE_CLIENT = 0 as const;
export const ROLE_PROVIDER = 1 as const;
export const ROLE_EVALUATOR = 2 as const;

export async function signMessage(
  config: ObolosConfig,
  params: { jobId: string; body: string; role: 'client' | 'provider' | 'evaluator' },
) {
  const { account, walletClient } = await getClients(config);
  const roleMap = { client: ROLE_CLIENT, provider: ROLE_PROVIDER, evaluator: ROLE_EVALUATOR };
  const role = roleMap[params.role];
  const jobHash = await computeJobHash(params.jobId);
  const contentHash = await computeContentHash({ body: params.body, attachments: [] });
  const nonce = generateNonce();
  const signature = await walletClient.signTypedData({
    account, domain: ANP_DOMAIN, types: { MessageIntent: ANP_TYPES.MessageIntent },
    primaryType: 'MessageIntent', message: { jobHash, contentHash, role, nonce },
  });
  return {
    signature, signer: account.address.toLowerCase(),
    document: {
      protocol: 'anp/v1' as const, type: 'message' as const,
      data: { jobId: params.jobId, jobHash, body: params.body, role, nonce: Number(nonce) },
      signer: account.address.toLowerCase(), signature, timestamp: Date.now(),
    },
  };
}

export async function signAmendment(
  config: ObolosConfig,
  params: {
    jobId: string; originalBidHash: string; reason: string;
    newPriceUsd?: number; newDeliverySeconds?: number; scopeDelta?: string;
  },
) {
  const { account, walletClient } = await getClients(config);
  const jobHash = await computeJobHash(params.jobId);
  const newPrice = BigInt(Math.floor((params.newPriceUsd || 0) * 1e6));
  const newDeliveryTime = BigInt(params.newDeliverySeconds || 0);
  const contentHash = await computeContentHash({ reason: params.reason, scopeDelta: params.scopeDelta || '' });
  const nonce = generateNonce();
  const signature = await walletClient.signTypedData({
    account, domain: ANP_DOMAIN, types: { AmendmentIntent: ANP_TYPES.AmendmentIntent },
    primaryType: 'AmendmentIntent',
    message: {
      jobHash, originalBidHash: params.originalBidHash as `0x${string}`,
      newPrice, newDeliveryTime, contentHash, nonce,
    },
  });
  return {
    signature, signer: account.address.toLowerCase(),
    document: {
      protocol: 'anp/v1' as const, type: 'amendment' as const,
      data: {
        jobId: params.jobId, jobHash, originalBidHash: params.originalBidHash,
        newPrice: newPrice.toString(), newDeliveryTime: Number(newDeliveryTime),
        reason: params.reason, scopeDelta: params.scopeDelta || '', nonce: Number(nonce),
      },
      signer: account.address.toLowerCase(), signature, timestamp: Date.now(),
    },
  };
}

export async function signAmendmentAcceptance(
  config: ObolosConfig, jobId: string, amendmentCid: string, amendmentDoc: any,
) {
  const { account, walletClient } = await getClients(config);
  const ad = amendmentDoc.data || amendmentDoc;
  const contentHash = await computeContentHash({ reason: ad.reason, scopeDelta: ad.scopeDelta || '' });
  const amendmentHash = hashAmendmentStruct({
    jobHash: ad.jobHash as `0x${string}`,
    originalBidHash: ad.originalBidHash as `0x${string}`,
    newPrice: BigInt(ad.newPrice),
    newDeliveryTime: BigInt(ad.newDeliveryTime),
    contentHash,
    nonce: BigInt(ad.nonce),
  });
  const nonce = generateNonce();
  const signature = await walletClient.signTypedData({
    account, domain: ANP_DOMAIN, types: { AmendmentAcceptance: ANP_TYPES.AmendmentAcceptance },
    primaryType: 'AmendmentAcceptance', message: { amendmentHash, nonce },
  });
  return {
    signature, signer: account.address.toLowerCase(),
    document: {
      protocol: 'anp/v1' as const, type: 'amendment_acceptance' as const,
      data: { jobId, amendmentCid, amendmentHash, nonce: Number(nonce) },
      signer: account.address.toLowerCase(), signature, timestamp: Date.now(),
    },
  };
}

export async function signCheckpoint(
  config: ObolosConfig,
  params: { jobId: string; milestoneIndex: number; deliverable: string; notes?: string },
) {
  const { account, walletClient } = await getClients(config);
  const jobHash = await computeJobHash(params.jobId);
  const contentHash = await computeContentHash({ deliverable: params.deliverable, notes: params.notes || '' });
  const nonce = generateNonce();
  const signature = await walletClient.signTypedData({
    account, domain: ANP_DOMAIN, types: { CheckpointIntent: ANP_TYPES.CheckpointIntent },
    primaryType: 'CheckpointIntent',
    message: { jobHash, milestoneIndex: params.milestoneIndex, contentHash, nonce },
  });
  return {
    signature, signer: account.address.toLowerCase(),
    document: {
      protocol: 'anp/v1' as const, type: 'checkpoint' as const,
      data: {
        jobId: params.jobId, jobHash, milestoneIndex: params.milestoneIndex,
        deliverable: params.deliverable, notes: params.notes || '', nonce: Number(nonce),
      },
      signer: account.address.toLowerCase(), signature, timestamp: Date.now(),
    },
  };
}

export async function signCheckpointApproval(
  config: ObolosConfig, jobId: string, checkpointCid: string, checkpointDoc: any,
) {
  const { account, walletClient } = await getClients(config);
  const cd = checkpointDoc.data || checkpointDoc;
  const contentHash = await computeContentHash({ deliverable: cd.deliverable, notes: cd.notes || '' });
  const checkpointHash = hashCheckpointStruct({
    jobHash: cd.jobHash as `0x${string}`,
    milestoneIndex: cd.milestoneIndex,
    contentHash,
    nonce: BigInt(cd.nonce),
  });
  const nonce = generateNonce();
  const signature = await walletClient.signTypedData({
    account, domain: ANP_DOMAIN, types: { CheckpointApproval: ANP_TYPES.CheckpointApproval },
    primaryType: 'CheckpointApproval', message: { checkpointHash, nonce },
  });
  return {
    signature, signer: account.address.toLowerCase(),
    document: {
      protocol: 'anp/v1' as const, type: 'checkpoint_approval' as const,
      data: { jobId, checkpointCid, checkpointHash, nonce: Number(nonce) },
      signer: account.address.toLowerCase(), signature, timestamp: Date.now(),
    },
  };
}

export async function signListing(
  config: ObolosConfig,
  params: {
    title: string; description: string;
    minBudgetUsd: number; maxBudgetUsd: number;
    deadlineSeconds: number; jobDurationSeconds: number;
    preferredEvaluator?: string;
  },
) {
  const { account, walletClient } = await getClients(config);
  const contentHash = await computeContentHash({ title: params.title, description: params.description });
  const nonce = generateNonce();
  const now = Math.floor(Date.now() / 1000);
  const msg = {
    contentHash,
    minBudget: BigInt(Math.floor(params.minBudgetUsd * 1e6)),
    maxBudget: BigInt(Math.floor(params.maxBudgetUsd * 1e6)),
    deadline: BigInt(now + params.deadlineSeconds),
    jobDuration: BigInt(params.jobDurationSeconds),
    preferredEvaluator: (params.preferredEvaluator || ZERO_ADDRESS) as `0x${string}`,
    nonce,
  };
  const signature = await walletClient.signTypedData({
    account, domain: ANP_DOMAIN, types: { ListingIntent: ANP_TYPES.ListingIntent },
    primaryType: 'ListingIntent', message: msg,
  });
  return {
    signature, signer: account.address.toLowerCase(),
    message: msg,
    document: {
      protocol: 'anp/v1' as const, type: 'listing' as const,
      data: {
        title: params.title, description: params.description,
        minBudget: msg.minBudget.toString(), maxBudget: msg.maxBudget.toString(),
        deadline: Number(msg.deadline), jobDuration: Number(msg.jobDuration),
        preferredEvaluator: msg.preferredEvaluator, nonce: Number(nonce),
      },
      signer: account.address.toLowerCase(), signature, timestamp: Date.now(),
    },
  };
}

export async function signBid(
  config: ObolosConfig,
  listingDoc: any,
  params: { listingCid: string; priceUsd: number; deliverySeconds: number; message?: string },
) {
  const { account, walletClient } = await getClients(config);
  const ld = listingDoc.data || listingDoc;
  const listingContentHash = await computeContentHash({ title: ld.title, description: ld.description });
  const listingHash = hashListingStruct({
    contentHash: listingContentHash,
    minBudget: BigInt(ld.minBudget || '0'),
    maxBudget: BigInt(ld.maxBudget || '0'),
    deadline: BigInt(ld.deadline || '0'),
    jobDuration: BigInt(ld.jobDuration || '0'),
    preferredEvaluator: (ld.preferredEvaluator || ZERO_ADDRESS) as `0x${string}`,
    nonce: BigInt(ld.nonce || '0'),
  });
  const contentHash = await computeContentHash({ message: params.message || '', proposalCid: '' });
  const nonce = generateNonce();
  const msg = {
    listingHash,
    contentHash,
    price: BigInt(Math.floor(params.priceUsd * 1e6)),
    deliveryTime: BigInt(params.deliverySeconds),
    nonce,
  };
  const signature = await walletClient.signTypedData({
    account, domain: ANP_DOMAIN, types: { BidIntent: ANP_TYPES.BidIntent },
    primaryType: 'BidIntent', message: msg,
  });
  return {
    signature, signer: account.address.toLowerCase(),
    document: {
      protocol: 'anp/v1' as const, type: 'bid' as const,
      data: {
        listingCid: params.listingCid, listingHash,
        price: msg.price.toString(), deliveryTime: Number(msg.deliveryTime),
        message: params.message || '', nonce: Number(nonce),
      },
      signer: account.address.toLowerCase(), signature, timestamp: Date.now(),
    },
  };
}

export async function signAccept(
  config: ObolosConfig, listingCid: string, bidCid: string, listingDoc: any, bidDoc: any,
) {
  const { account, walletClient } = await getClients(config);
  const ld = listingDoc.data || listingDoc;
  const bd = bidDoc.data || bidDoc;
  const listingContentHash = await computeContentHash({ title: ld.title, description: ld.description });
  const listingHash = hashListingStruct({
    contentHash: listingContentHash,
    minBudget: BigInt(ld.minBudget || '0'),
    maxBudget: BigInt(ld.maxBudget || '0'),
    deadline: BigInt(ld.deadline || '0'),
    jobDuration: BigInt(ld.jobDuration || '0'),
    preferredEvaluator: (ld.preferredEvaluator || ZERO_ADDRESS) as `0x${string}`,
    nonce: BigInt(ld.nonce || '0'),
  });
  const bidContentHash = await computeContentHash({ message: bd.message || '', proposalCid: bd.proposalCid || '' });
  const bidHash = hashBidStruct({
    listingHash: (bd.listingHash || listingHash) as `0x${string}`,
    contentHash: bidContentHash,
    price: BigInt(bd.price || '0'),
    deliveryTime: BigInt(bd.deliveryTime || '0'),
    nonce: BigInt(bd.nonce || '0'),
  });
  const nonce = generateNonce();
  const signature = await walletClient.signTypedData({
    account, domain: ANP_DOMAIN, types: { AcceptIntent: ANP_TYPES.AcceptIntent },
    primaryType: 'AcceptIntent', message: { listingHash, bidHash, nonce },
  });
  return {
    signature, signer: account.address.toLowerCase(),
    document: {
      protocol: 'anp/v1' as const, type: 'acceptance' as const,
      data: { listingCid, bidCid, listingHash, bidHash, nonce: Number(nonce) },
      signer: account.address.toLowerCase(), signature, timestamp: Date.now(),
    },
  };
}
