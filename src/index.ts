#!/usr/bin/env node
/**
 * Obolos CLI
 *
 * Search, browse, and call x402 APIs from the terminal.
 *
 *   npx @obolos_tech/cli search "token price"
 *   npx @obolos_tech/cli info ext-abc123
 *   npx @obolos_tech/cli call ext-abc123 --body '{"symbol":"ETH"}'
 *   npx @obolos_tech/cli categories
 *   npx @obolos_tech/cli balance
 *   npx @obolos_tech/cli setup-mcp
 *   npx @obolos_tech/cli job list --status=open
 *   npx @obolos_tech/cli job create --title "..." --evaluator 0x...
 *   npx @obolos_tech/cli job info <id>
 *   npx @obolos_tech/cli listing list --status=open
 *   npx @obolos_tech/cli listing create --title "..." --max-budget 10.00
 *   npx @obolos_tech/cli listing bid <id> --price 5.00
 *   npx @obolos_tech/cli anp list --status=open
 *   npx @obolos_tech/cli anp create --title "..." --min-budget 5 --max-budget 50
 *   npx @obolos_tech/cli anp bid <cid> --price 25 --delivery 48h
 *   npx @obolos_tech/cli anp accept <cid> --bid <bid_cid>
 *   npx @obolos_tech/cli anp verify <cid>
 *   npx @obolos_tech/cli reputation check 16907
 *   npx @obolos_tech/cli reputation check 16907 --chain ethereum
 *   npx @obolos_tech/cli reputation compare 123 456 789
 *   npx @obolos_tech/cli rep compare base:123 ethereum:456
 */

import { homedir } from 'os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

const CONFIG_DIR = join(homedir(), '.obolos');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function loadConfig(): Record<string, string> {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveConfig(config: Record<string, string>) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { mode: 0o700 });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

const config = loadConfig();
const OBOLOS_API_URL = process.env.OBOLOS_API_URL || config.api_url || 'https://obolos.tech';
const OBOLOS_PRIVATE_KEY = process.env.OBOLOS_PRIVATE_KEY || config.private_key || '';

// ─── Colors (no deps) ──────────────────────────────────────────────────────

// ─── ACP Contract ABIs (ERC-8183) ─────────────────────────────────────────

const ACP_ADDRESS = '0xaF3148696242F7Fb74893DC47690e37950807362' as const;
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

const ACP_ABI = [
  {
    type: 'function' as const,
    name: 'createJob' as const,
    inputs: [
      { name: 'provider' as const, type: 'address' as const },
      { name: 'evaluator' as const, type: 'address' as const },
      { name: 'expiredAt' as const, type: 'uint256' as const },
      { name: 'description' as const, type: 'string' as const },
      { name: 'hook' as const, type: 'address' as const },
    ],
    outputs: [{ name: 'jobId' as const, type: 'uint256' as const }],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'fund' as const,
    inputs: [
      { name: 'jobId' as const, type: 'uint256' as const },
      { name: 'expectedBudget' as const, type: 'uint256' as const },
      { name: 'optParams' as const, type: 'bytes' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'submit' as const,
    inputs: [
      { name: 'jobId' as const, type: 'uint256' as const },
      { name: 'deliverable' as const, type: 'bytes32' as const },
      { name: 'optParams' as const, type: 'bytes' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'complete' as const,
    inputs: [
      { name: 'jobId' as const, type: 'uint256' as const },
      { name: 'reason' as const, type: 'bytes32' as const },
      { name: 'optParams' as const, type: 'bytes' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'reject' as const,
    inputs: [
      { name: 'jobId' as const, type: 'uint256' as const },
      { name: 'reason' as const, type: 'bytes32' as const },
      { name: 'optParams' as const, type: 'bytes' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'event' as const,
    name: 'JobCreated' as const,
    inputs: [
      { name: 'jobId' as const, type: 'uint256' as const, indexed: true },
      { name: 'client' as const, type: 'address' as const, indexed: true },
      { name: 'provider' as const, type: 'address' as const, indexed: false },
      { name: 'evaluator' as const, type: 'address' as const, indexed: false },
      { name: 'expiredAt' as const, type: 'uint256' as const, indexed: false },
    ],
  },
] as const;

const ERC20_ABI = [
  {
    type: 'function' as const,
    name: 'approve' as const,
    inputs: [
      { name: 'spender' as const, type: 'address' as const },
      { name: 'amount' as const, type: 'uint256' as const },
    ],
    outputs: [{ name: '' as const, type: 'bool' as const }],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'allowance' as const,
    inputs: [
      { name: 'owner' as const, type: 'address' as const },
      { name: 'spender' as const, type: 'address' as const },
    ],
    outputs: [{ name: '' as const, type: 'uint256' as const }],
    stateMutability: 'view' as const,
  },
] as const;

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

function formatPrice(price: number): string {
  return `${c.green}$${price.toFixed(4)}${c.reset} USDC`;
}

// ─── API Client ─────────────────────────────────────────────────────────────

async function apiGet(path: string): Promise<any> {
  const res = await fetch(`${OBOLOS_API_URL}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function apiPost(path: string, body?: any, headers?: Record<string, string>): Promise<any> {
  const res = await fetch(`${OBOLOS_API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const err = await res.json();
      if (err.error) msg = err.error;
      else if (err.message) msg = err.message;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getFlag(args: string[], name: string): string | undefined {
  // Supports --name=value and --name value
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}` && args[i + 1] && !args[i + 1].startsWith('--')) {
      return args[i + 1];
    }
    if (args[i].startsWith(`--${name}=`)) {
      return args[i].slice(`--${name}=`.length);
    }
  }
  return undefined;
}

function getPositional(args: string[], index: number): string | undefined {
  let pos = 0;
  for (const arg of args) {
    if (!arg.startsWith('--')) {
      if (pos === index) return arg;
      pos++;
    }
  }
  return undefined;
}

function shortenAddr(addr: string | undefined | null): string {
  if (!addr) return `${c.dim}—${c.reset}`;
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}...`;
}

function formatDate(iso: string | undefined | null): string {
  if (!iso) return `${c.dim}—${c.reset}`;
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusColor(status: string): string {
  switch (status) {
    case 'open':        return `${c.yellow}${status}${c.reset}`;
    case 'funded':      return `${c.blue}${status}${c.reset}`;
    case 'submitted':   return `${c.cyan}${status}${c.reset}`;
    case 'completed':   return `${c.green}${status}${c.reset}`;
    case 'rejected':    return `${c.red}${status}${c.reset}`;
    case 'expired':     return `${c.gray}${status}${c.reset}`;
    case 'negotiating': return `${c.magenta}${status}${c.reset}`;
    case 'accepted':    return `${c.green}${status}${c.reset}`;
    case 'cancelled':   return `${c.gray}${status}${c.reset}`;
    default:            return status;
  }
}

function parseRelativeTime(input: string): string {
  const match = input.match(/^(\d+)\s*(h|hr|hrs|hour|hours|d|day|days|m|min|mins|minute|minutes)$/i);
  if (!match) {
    // Try parsing as ISO date directly
    const d = new Date(input);
    if (!isNaN(d.getTime())) return d.toISOString();
    throw new Error(`Cannot parse expiry: "${input}". Use formats like "24h", "7d", "1h", or an ISO date.`);
  }
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const now = Date.now();
  let ms = 0;
  if (unit.startsWith('h')) ms = num * 60 * 60 * 1000;
  else if (unit.startsWith('d')) ms = num * 24 * 60 * 60 * 1000;
  else if (unit.startsWith('m')) ms = num * 60 * 1000;
  return new Date(now + ms).toISOString();
}

function resolveWalletAddress(): string {
  const cfg = loadConfig();
  const addr = cfg.wallet_address;
  if (addr) return addr;

  // Derive from private key if available
  if (!OBOLOS_PRIVATE_KEY) {
    console.error(`${c.red}No wallet configured.${c.reset} Run ${c.cyan}obolos setup${c.reset} first.`);
    process.exit(1);
  }
  // We'll derive it lazily — for now return empty and let callers handle async derivation
  return '';
}

async function getWalletAddress(): Promise<string> {
  const cfg = loadConfig();
  if (cfg.wallet_address) return cfg.wallet_address;

  if (!OBOLOS_PRIVATE_KEY) {
    console.error(`${c.red}No wallet configured.${c.reset} Run ${c.cyan}obolos setup${c.reset} first.`);
    process.exit(1);
  }

  const { privateKeyToAccount } = await import('viem/accounts');
  const key = OBOLOS_PRIVATE_KEY.startsWith('0x') ? OBOLOS_PRIVATE_KEY : `0x${OBOLOS_PRIVATE_KEY}`;
  const account = privateKeyToAccount(key as `0x${string}`);
  return account.address;
}

async function getACPClient() {
  const key = OBOLOS_PRIVATE_KEY;
  if (!key) {
    console.error(`${c.red}No wallet configured.${c.reset} Run ${c.cyan}obolos setup${c.reset} first.`);
    process.exit(1);
  }

  const { createPublicClient, createWalletClient, http: viemHttp, parseUnits, keccak256, toHex, decodeEventLog } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { base } = await import('viem/chains');

  const normalizedKey = key.startsWith('0x') ? key : `0x${key}`;
  const account = privateKeyToAccount(normalizedKey as `0x${string}`);
  const publicClient = createPublicClient({ chain: base, transport: viemHttp() });
  const walletClient = createWalletClient({ account, chain: base, transport: viemHttp() });

  return { account, publicClient, walletClient, parseUnits, keccak256, toHex, decodeEventLog };
}

function stateVisualization(status: string): string {
  const states = ['open', 'funded', 'submitted', 'completed'];
  const parts = states.map(s => {
    if (s === status) return `${c.bold}[${s.charAt(0).toUpperCase() + s.slice(1)}]${c.reset}`;
    return `${c.dim}${s.charAt(0).toUpperCase() + s.slice(1)}${c.reset}`;
  });

  // Handle terminal states that branch off
  if (status === 'rejected') {
    const base = states.slice(0, 3).map(s => `${c.dim}${s.charAt(0).toUpperCase() + s.slice(1)}${c.reset}`);
    return `  ${base.join(` ${c.dim}->${c.reset} `)} ${c.dim}->${c.reset} ${c.bold}${c.red}[Rejected]${c.reset}`;
  }
  if (status === 'expired') {
    return `  ${c.bold}${c.gray}[Expired]${c.reset}`;
  }

  return `  ${parts.join(` ${c.dim}->${c.reset} `)}`;
}

// ─── ANP Helpers ─────────────────────────────────────────────────────────────

import { computeContentHash, ANP_TYPES, getANPDomain, hashListingIntent, hashBidIntent, hashAcceptIntent } from '@obolos_tech/anp-sdk';

function parseTimeToSeconds(input: string): number {
  const match = input.match(/^(\d+)\s*(s|sec|secs|second|seconds|h|hr|hrs|hour|hours|d|day|days|m|min|mins|minute|minutes)$/i);
  if (!match) {
    throw new Error(`Cannot parse time: "${input}". Use formats like "48h", "7d", "3d".`);
  }
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('s')) return num;
  if (unit.startsWith('m')) return num * 60;
  if (unit.startsWith('h')) return num * 3600;
  if (unit.startsWith('d')) return num * 86400;
  return num;
}

const ANP_DOMAIN = getANPDomain(8453, '0xfEa362Bf569e97B20681289fB4D4a64CEBDFa792');

async function getANPSigningClient() {
  if (!OBOLOS_PRIVATE_KEY) {
    console.error(`${c.red}No wallet configured.${c.reset} Run ${c.cyan}obolos setup${c.reset} first.`);
    process.exit(1);
  }

  const { createWalletClient, http: viemHttp } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { base } = await import('viem/chains');

  const key = OBOLOS_PRIVATE_KEY.startsWith('0x') ? OBOLOS_PRIVATE_KEY : `0x${OBOLOS_PRIVATE_KEY}`;
  const account = privateKeyToAccount(key as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: base, transport: viemHttp() });

  return { account, walletClient, hashListingStruct: hashListingIntent, hashBidStruct: hashBidIntent, hashAcceptStruct: hashAcceptIntent };
}

function generateNonce(): bigint {
  return BigInt(Math.floor(Math.random() * 2 ** 32));
}

// ─── Commands ───────────────────────────────────────────────────────────────

async function cmdSearch(args: string[]) {
  const query = args.join(' ');
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  params.set('limit', '25');
  params.set('type', 'native');

  const data = await apiGet(`/api/marketplace/apis/search?${params}`);
  const apis = data.apis;

  if (apis.length === 0) {
    console.log(`${c.yellow}No APIs found${query ? ` for "${query}"` : ''}.${c.reset}`);
    return;
  }

  console.log(`\n${c.bold}${c.cyan}Obolos Marketplace${c.reset} ${c.dim}— ${data.pagination.total} APIs found${c.reset}\n`);

  for (const api of apis) {
    const name = (api.name || 'Unnamed').slice(0, 50);
    const price = `$${api.price_per_call.toFixed(4)}`;
    const cat = api.category;
    const id = api.id;

    console.log(`  ${c.bold}${name}${c.reset}`);
    console.log(`    ${c.green}${price}${c.reset}  ${c.dim}${cat}${c.reset}  ${c.cyan}${id}${c.reset}\n`);
  }

  console.log(`${c.dim}Use: obolos info <id> for details, or copy the full ID to call it${c.reset}\n`);
}

async function cmdCategories() {
  const data = await apiGet('/api/marketplace/categories');

  console.log(`\n${c.bold}${c.cyan}API Categories${c.reset}\n`);

  for (const cat of data.categories) {
    const bar = '█'.repeat(Math.min(50, Math.ceil(cat.count / 5)));
    console.log(`  ${cat.name.padEnd(25)} ${c.green}${String(cat.count).padStart(4)}${c.reset} ${c.dim}${bar}${c.reset}`);
  }

  console.log(`\n  ${c.bold}Total:${c.reset} ${data.nativeCount} native + ${data.externalCount} external\n`);
}

async function cmdInfo(args: string[]) {
  const id = args[0];
  if (!id) {
    console.error(`${c.red}Usage: obolos info <api-id>${c.reset}`);
    process.exit(1);
  }

  const api = await apiGet(`/api/marketplace/apis/${encodeURIComponent(id)}`);

  console.log(`\n${c.bold}${c.cyan}${api.name}${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  ${c.bold}ID:${c.reset}        ${api.id}`);
  console.log(`  ${c.bold}Type:${c.reset}      ${api.api_type}`);
  console.log(`  ${c.bold}Price:${c.reset}     ${formatPrice(api.price_per_call)}`);
  console.log(`  ${c.bold}Method:${c.reset}    ${api.http_method}`);
  console.log(`  ${c.bold}Category:${c.reset}  ${api.category}`);
  console.log(`  ${c.bold}Seller:${c.reset}    ${api.seller_name}`);
  console.log(`  ${c.bold}Calls:${c.reset}     ${api.total_calls}`);
  if (api.average_rating) {
    console.log(`  ${c.bold}Rating:${c.reset}    ${api.average_rating.toFixed(1)}/5 (${api.review_count} reviews)`);
  }

  if (api.description) {
    console.log(`\n  ${c.bold}Description:${c.reset}`);
    console.log(`  ${api.description}`);
  }

  if (api.input_schema?.fields && Object.keys(api.input_schema.fields).length > 0) {
    console.log(`\n  ${c.bold}Input Fields:${c.reset}`);
    for (const [name, field] of Object.entries(api.input_schema.fields) as any) {
      const req = field.required ? `${c.red}*${c.reset}` : ' ';
      const ex = field.example ? `${c.dim}(e.g. ${JSON.stringify(field.example)})${c.reset}` : '';
      console.log(`    ${req} ${c.cyan}${name}${c.reset}: ${field.type} ${ex}`);
    }
  }

  if (api.example_request) {
    console.log(`\n  ${c.bold}Example Request:${c.reset}`);
    try {
      console.log(`  ${c.dim}${JSON.stringify(JSON.parse(api.example_request), null, 2).replace(/\n/g, '\n  ')}${c.reset}`);
    } catch {
      console.log(`  ${c.dim}${api.example_request}${c.reset}`);
    }
  }

  if (api.example_response) {
    console.log(`\n  ${c.bold}Example Response:${c.reset}`);
    try {
      const parsed = JSON.parse(api.example_response);
      const formatted = JSON.stringify(parsed, null, 2);
      // Truncate long responses
      const lines = formatted.split('\n');
      if (lines.length > 20) {
        console.log(`  ${c.dim}${lines.slice(0, 20).join('\n  ')}\n  ... (${lines.length - 20} more lines)${c.reset}`);
      } else {
        console.log(`  ${c.dim}${formatted.replace(/\n/g, '\n  ')}${c.reset}`);
      }
    } catch {
      console.log(`  ${c.dim}${api.example_response.slice(0, 500)}${c.reset}`);
    }
  }

  console.log(`\n  ${c.bold}Call:${c.reset} obolos call ${api.id}${api.http_method === 'POST' ? " --body '{...}'" : ''}`);
  console.log(`  ${c.bold}Proxy:${c.reset} ${OBOLOS_API_URL}/api/proxy/${api.id}`);
  if (api.slug) {
    console.log(`  ${c.bold}Slug:${c.reset}  ${OBOLOS_API_URL}/api/${api.slug}`);
  }
  console.log(`\n  ${c.dim}Note: Always use the full URL above. Do NOT call /${api.slug || api.id} directly — the /api/proxy/ or /api/ prefix is required.${c.reset}\n`);
}

async function cmdCall(args: string[]) {
  const id = args[0];
  if (!id) {
    console.error(`${c.red}Usage: obolos call <api-id> [--body '{"key":"value"}'] [--method POST]${c.reset}`);
    process.exit(1);
  }

  // Parse flags
  let method = 'GET';
  let body: any = undefined;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--method' && args[i + 1]) {
      method = args[++i].toUpperCase();
    } else if (args[i] === '--body' && args[i + 1]) {
      try {
        body = JSON.parse(args[++i]);
      } catch {
        console.error(`${c.red}Invalid JSON body${c.reset}`);
        process.exit(1);
      }
    }
  }

  if (!OBOLOS_PRIVATE_KEY) {
    // Free call attempt (for free APIs or to see the 402 response)
    console.log(`${c.yellow}No wallet configured — attempting without payment${c.reset}`);
    console.log(`${c.dim}Run "obolos setup" to configure a wallet for paid APIs${c.reset}`);
  }

  const url = `${OBOLOS_API_URL}/api/proxy/${encodeURIComponent(id)}`;
  const fetchOpts: RequestInit = { method };
  if (body && method !== 'GET') {
    fetchOpts.headers = { 'Content-Type': 'application/json' };
    fetchOpts.body = JSON.stringify(body);
  }

  console.log(`\n${c.dim}${method} ${url}${c.reset}`);

  let res = await fetch(url, fetchOpts);

  if (res.status === 402 && OBOLOS_PRIVATE_KEY) {
    console.log(`${c.yellow}402 Payment Required — signing payment...${c.reset}`);

    let paymentInfo: any;
    try {
      paymentInfo = await res.json();
    } catch {
      console.error(`${c.red}Could not parse 402 response${c.reset}`);
      process.exit(1);
    }

    // Dynamic import viem for signing
    const { createWalletClient, http: viemHttp, keccak256, encodePacked } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');
    const { base } = await import('viem/chains');

    const key = OBOLOS_PRIVATE_KEY.startsWith('0x')
      ? OBOLOS_PRIVATE_KEY
      : `0x${OBOLOS_PRIVATE_KEY}`;
    const account = privateKeyToAccount(key as `0x${string}`);
    const client = createWalletClient({ account, chain: base, transport: viemHttp() });

    const accepts = paymentInfo.accepts?.[0];
    if (!accepts) {
      console.error(`${c.red}No payment options in 402 response${c.reset}`);
      process.exit(1);
    }

    const amount = BigInt(accepts.maxAmountRequired || accepts.amount || '0');
    const payTo = accepts.payTo;
    const asset = accepts.asset || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const scheme = accepts.scheme || 'exact';
    const rawNetwork = accepts.network || 'base';
    const network = rawNetwork.startsWith('eip155:') ? rawNetwork : 'eip155:8453';
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

    // EIP-712 domain must match the USDC contract's domain (not "x402")
    const domain = {
      name: accepts.extra?.name || 'USD Coin',
      version: accepts.extra?.version || '2',
      chainId: 8453n,
      verifyingContract: asset as `0x${string}`,
    };

    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };

    // Check for v2 router settlement extension
    const settlementKey = 'x402x-router-settlement';
    const settlementExt = accepts.extra?.[settlementKey];
    const settlementInfo = settlementExt?.info;

    // Determine nonce: commitment hash for router settlement, random otherwise
    let nonce: `0x${string}`;
    if (settlementInfo?.settlementRouter && settlementInfo?.salt) {
      nonce = keccak256(
        encodePacked(
          ['string', 'uint256', 'address', 'address', 'address', 'uint256', 'uint256', 'uint256', 'bytes32', 'address', 'uint256', 'address', 'bytes32'],
          [
            'X402/settle/v1',
            8453n,
            settlementInfo.settlementRouter as `0x${string}`,
            asset as `0x${string}`,
            account.address,
            BigInt(amount),
            0n,
            deadline,
            settlementInfo.salt as `0x${string}`,
            (settlementInfo.finalPayTo || payTo) as `0x${string}`,
            BigInt(settlementInfo.facilitatorFee || '0'),
            settlementInfo.hook as `0x${string}`,
            keccak256(settlementInfo.hookData as `0x${string}`),
          ],
        ),
      );
    } else {
      const nonceBytes = new Uint8Array(32);
      crypto.getRandomValues(nonceBytes);
      nonce = `0x${Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
    }

    const signature = await client.signTypedData({
      account,
      domain,
      types,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: account.address,
        to: payTo as `0x${string}`,
        value: BigInt(amount),
        validAfter: 0n,
        validBefore: deadline,
        nonce,
      },
    });

    const authorization = {
      from: account.address,
      to: payTo,
      value: amount.toString(),
      validAfter: '0',
      validBefore: deadline.toString(),
      nonce,
    };

    let encoded: string;
    let headerName: string;

    if (paymentInfo.x402Version === 2) {
      const paymentPayload: Record<string, unknown> = {
        x402Version: 2,
        scheme,
        network,
        payload: { signature, authorization },
        accepted: { ...accepts, network },
      };
      if (settlementExt) {
        paymentPayload.extensions = { [settlementKey]: settlementExt };
      }
      encoded = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
      headerName = 'payment-signature';
    } else {
      const paymentPayload = {
        x402Version: 1,
        scheme,
        network,
        payload: { signature, authorization },
      };
      encoded = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
      headerName = 'x-payment';
    }

    console.log(`${c.green}Payment signed. Retrying...${c.reset}`);

    res = await fetch(url, {
      ...fetchOpts,
      headers: {
        ...(fetchOpts.headers || {}),
        [headerName]: encoded,
      },
    });
  }

  // Display response
  const status = res.status;
  const statusColor = status < 300 ? c.green : status < 400 ? c.yellow : c.red;
  console.log(`${statusColor}${status} ${res.statusText}${c.reset}\n`);

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('json')) {
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } else {
    const text = await res.text();
    console.log(text.slice(0, 2000));
  }
  console.log();
}

async function cmdBalance() {
  if (!OBOLOS_PRIVATE_KEY) {
    console.error(`${c.red}No wallet configured.${c.reset} Run ${c.cyan}obolos setup${c.reset} first.`);
    process.exit(1);
  }

  const { createPublicClient, http: viemHttp, formatUnits } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { base } = await import('viem/chains');

  const key = OBOLOS_PRIVATE_KEY.startsWith('0x') ? OBOLOS_PRIVATE_KEY : `0x${OBOLOS_PRIVATE_KEY}`;
  const account = privateKeyToAccount(key as `0x${string}`);
  const client = createPublicClient({ chain: base, transport: viemHttp() });

  const balance = await client.readContract({
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    abi: [{ inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }],
    functionName: 'balanceOf',
    args: [account.address],
  });

  console.log(`\n${c.bold}Wallet:${c.reset}  ${account.address}`);
  console.log(`${c.bold}Balance:${c.reset} ${c.green}${formatUnits(balance, 6)} USDC${c.reset}`);
  console.log(`${c.bold}Network:${c.reset} Base (Chain ID: 8453)\n`);
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function cmdSetup(args: string[]) {
  console.log(`\n${c.bold}${c.cyan}Obolos Wallet Setup${c.reset}\n`);

  const existing = loadConfig();

  if (args.includes('--generate')) {
    // Generate a new wallet
    const { privateKeyToAccount, generatePrivateKey } = await import('viem/accounts');
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);

    existing.private_key = key;
    saveConfig(existing);

    console.log(`${c.green}New wallet generated and saved!${c.reset}\n`);
    console.log(`  ${c.bold}Address:${c.reset}  ${account.address}`);
    console.log(`  ${c.bold}Config:${c.reset}   ${CONFIG_FILE}\n`);
    console.log(`${c.yellow}Next steps:${c.reset}`);
    console.log(`  1. Fund this address with USDC on Base`);
    console.log(`     Send USDC to: ${c.cyan}${account.address}${c.reset}`);
    console.log(`  2. Check your balance: ${c.dim}obolos balance${c.reset}`);
    console.log(`  3. Call an API:        ${c.dim}obolos call <api-id> --body '{...}'${c.reset}\n`);
    return;
  }

  if (args.includes('--show')) {
    if (existing.private_key) {
      const { privateKeyToAccount } = await import('viem/accounts');
      const key = existing.private_key.startsWith('0x') ? existing.private_key : `0x${existing.private_key}`;
      const account = privateKeyToAccount(key as `0x${string}`);
      console.log(`  ${c.bold}Address:${c.reset}  ${account.address}`);
      console.log(`  ${c.bold}Config:${c.reset}   ${CONFIG_FILE}`);
      console.log(`  ${c.bold}API URL:${c.reset}  ${OBOLOS_API_URL}\n`);
    } else {
      console.log(`  ${c.yellow}No wallet configured.${c.reset}`);
      console.log(`  Run ${c.cyan}obolos setup --generate${c.reset} to create one,`);
      console.log(`  or  ${c.cyan}obolos setup${c.reset} to import an existing key.\n`);
    }
    return;
  }

  // Interactive setup
  console.log(`  Config is saved to ${c.dim}${CONFIG_FILE}${c.reset} (permissions: 600)\n`);

  if (existing.private_key) {
    const { privateKeyToAccount } = await import('viem/accounts');
    const key = existing.private_key.startsWith('0x') ? existing.private_key : `0x${existing.private_key}`;
    const account = privateKeyToAccount(key as `0x${string}`);
    console.log(`  ${c.dim}Current wallet: ${account.address}${c.reset}\n`);
  }

  const keyInput = await prompt(`  Private key (0x...) or "generate" for a new wallet: `);

  if (!keyInput) {
    console.log(`\n${c.yellow}No changes made.${c.reset}\n`);
    return;
  }

  if (keyInput === 'generate') {
    return cmdSetup(['--generate']);
  }

  // Validate the key
  const normalizedKey = keyInput.startsWith('0x') ? keyInput : `0x${keyInput}`;
  try {
    const { privateKeyToAccount } = await import('viem/accounts');
    const account = privateKeyToAccount(normalizedKey as `0x${string}`);

    existing.private_key = normalizedKey;
    saveConfig(existing);

    console.log(`\n${c.green}Wallet saved!${c.reset}\n`);
    console.log(`  ${c.bold}Address:${c.reset}  ${account.address}`);
    console.log(`  ${c.bold}Config:${c.reset}   ${CONFIG_FILE}\n`);
    console.log(`  Check your balance: ${c.dim}obolos balance${c.reset}\n`);
  } catch (err: any) {
    console.error(`\n${c.red}Invalid private key: ${err.message}${c.reset}\n`);
    process.exit(1);
  }
}

async function cmdSetupMcp() {
  console.log(`\n${c.bold}${c.cyan}Obolos MCP Server Setup${c.reset}\n`);
  console.log(`${c.bold}Install:${c.reset}`);
  console.log(`  npm install -g @obolos_tech/mcp-server\n`);

  console.log(`${c.bold}For Claude Code (global — all projects):${c.reset}`);
  console.log(`  claude mcp add obolos ${c.yellow}--scope user${c.reset} -e OBOLOS_PRIVATE_KEY=0xyour_key -- obolos-mcp\n`);
  console.log(`${c.bold}For Claude Code (current project only):${c.reset}`);
  console.log(`  claude mcp add obolos -e OBOLOS_PRIVATE_KEY=0xyour_key -- obolos-mcp\n`);

  console.log(`${c.bold}Or use npx (no install):${c.reset}`);
  console.log(`  claude mcp add obolos ${c.yellow}--scope user${c.reset} -e OBOLOS_PRIVATE_KEY=0xyour_key -- npx @obolos_tech/mcp-server\n`);

  console.log(`  ${c.dim}Scope reference:${c.reset}`);
  console.log(`  ${c.dim}  (default)       Current project only${c.reset}`);
  console.log(`  ${c.dim}  --scope user    All projects on your machine${c.reset}`);
  console.log(`  ${c.dim}  --scope project Shared via .mcp.json (checked into git)${c.reset}\n`);

  console.log(`${c.bold}For Claude Desktop / Cursor / Windsurf:${c.reset}`);
  console.log(`  Add to your MCP config:\n`);
  console.log(`  ${c.dim}{`);
  console.log(`    "mcpServers": {`);
  console.log(`      "obolos": {`);
  console.log(`        "command": "npx",`);
  console.log(`        "args": ["@obolos_tech/mcp-server"],`);
  console.log(`        "env": {`);
  console.log(`          "OBOLOS_PRIVATE_KEY": "0xyour_private_key"`);
  console.log(`        }`);
  console.log(`      }`);
  console.log(`    }`);
  console.log(`  }${c.reset}\n`);
}

// ─── Job Commands (ERC-8183 ACP) ────────────────────────────────────────────

async function cmdJobList(args: string[]) {
  const params = new URLSearchParams();

  const status = getFlag(args, 'status');
  const client = getFlag(args, 'client');
  const provider = getFlag(args, 'provider');
  const limit = getFlag(args, 'limit') || '20';

  if (status) params.set('status', status);
  if (client) params.set('client', client);
  if (provider) params.set('provider', provider);
  params.set('limit', limit);

  const data = await apiGet(`/api/jobs?${params}`);
  const jobs = data.jobs || data.data || [];

  if (jobs.length === 0) {
    console.log(`${c.yellow}No jobs found.${c.reset}`);
    return;
  }

  const total = data.pagination?.total || data.total || jobs.length;
  console.log(`\n${c.bold}${c.cyan}ACP Jobs${c.reset} ${c.dim}— ${total} jobs${c.reset}\n`);

  // Table header
  console.log(`  ${c.bold}${'ID'.padEnd(12)} ${'Title'.padEnd(30)} ${'Status'.padEnd(12)} ${'Budget'.padEnd(12)} ${'Client'.padEnd(14)} ${'Provider'.padEnd(14)} Created${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(110)}${c.reset}`);

  for (const job of jobs) {
    const id = shortenId(job.id || '');
    const title = (job.title || 'Untitled').slice(0, 28).padEnd(30);
    const st = statusColor((job.status || 'open').padEnd(10));
    const budget = job.budget != null ? `$${Number(job.budget).toFixed(2)}`.padEnd(12) : `${c.dim}—${c.reset}`.padEnd(12);
    const cl = shortenAddr(job.client).padEnd(14);
    const prov = job.provider ? shortenAddr(job.provider).padEnd(14) : `${c.dim}Open${c.reset}`.padEnd(14);
    const created = formatDate(job.created_at || job.createdAt);

    console.log(`  ${id.padEnd(12)} ${title} ${st}  ${budget} ${cl} ${prov} ${created}`);
  }

  console.log(`\n${c.dim}Use: obolos job info <id> for full details${c.reset}\n`);
}

async function cmdJobCreate(args: string[]) {
  const title = getFlag(args, 'title');
  const description = getFlag(args, 'description');
  const evaluator = getFlag(args, 'evaluator');
  const provider = getFlag(args, 'provider');
  const budget = getFlag(args, 'budget');
  const expires = getFlag(args, 'expires');

  if (!title) {
    console.error(`${c.red}Usage: obolos job create --title "..." --description "..." --evaluator 0x... [--provider 0x...] [--budget 1.00] [--expires 24h]${c.reset}`);
    process.exit(1);
  }

  if (!evaluator) {
    console.error(`${c.red}--evaluator is required. Provide the evaluator address (0x...).${c.reset}`);
    process.exit(1);
  }

  const walletAddress = await getWalletAddress();

  // Create job on-chain first
  let chainJobId: string | null = null;
  let chainTxHash: string | null = null;

  try {
    const acp = await getACPClient();

    // Parse expiry to unix timestamp (default: 7 days)
    let expiredAt: number;
    if (expires) {
      const parsed = parseRelativeTime(expires);
      expiredAt = Math.floor(new Date(parsed).getTime() / 1000);
    } else {
      expiredAt = Math.floor((Date.now() + 7 * 86400000) / 1000);
    }

    console.log(`\n  ${c.dim}Creating job on-chain...${c.reset}`);

    const txHash = await acp.walletClient.writeContract({
      address: ACP_ADDRESS,
      abi: ACP_ABI,
      functionName: 'createJob',
      args: [
        (provider || ZERO_ADDRESS) as `0x${string}`,
        evaluator as `0x${string}`,
        BigInt(expiredAt),
        description || title,
        ZERO_ADDRESS,
      ],
      account: acp.account,
      chain: (await import('viem/chains')).base,
    });

    console.log(`  ${c.dim}Waiting for confirmation...${c.reset}`);
    const receipt = await acp.publicClient.waitForTransactionReceipt({ hash: txHash });

    // Extract jobId from JobCreated event
    for (const log of receipt.logs) {
      try {
        const decoded = acp.decodeEventLog({
          abi: ACP_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'JobCreated') {
          chainJobId = ((decoded.args as any).jobId).toString();
          break;
        }
      } catch {}
    }

    chainTxHash = txHash;
    console.log(`  ${c.green}Transaction confirmed: ${txHash}${c.reset}`);
    if (chainJobId) {
      console.log(`  ${c.green}Chain job ID: ${chainJobId}${c.reset}`);
    }
  } catch (err: any) {
    console.error(`  ${c.yellow}On-chain creation failed: ${err.message}${c.reset}`);
    console.error(`  ${c.dim}Falling back to backend-only...${c.reset}`);
  }

  const payload: Record<string, any> = {
    title,
    evaluator,
  };

  if (description) payload.description = description;
  if (provider) payload.provider = provider;
  if (budget) payload.budget = parseFloat(budget);
  if (expires) payload.expires_at = parseRelativeTime(expires);
  if (chainJobId) payload.chain_job_id = chainJobId;
  if (chainTxHash) payload.chain_tx_hash = chainTxHash;

  const data = await apiPost('/api/jobs', payload, {
    'x-wallet-address': walletAddress,
  });

  const job = data.job || data;

  console.log(`\n${c.green}Job created successfully!${c.reset}\n`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  ${c.bold}ID:${c.reset}          ${job.id}`);
  if (chainJobId) {
    console.log(`  ${c.bold}Chain ID:${c.reset}    ${chainJobId}`);
  }
  console.log(`  ${c.bold}Title:${c.reset}       ${job.title}`);
  if (job.description) {
    console.log(`  ${c.bold}Description:${c.reset} ${job.description}`);
  }
  console.log(`  ${c.bold}Status:${c.reset}      ${statusColor(job.status || 'open')}`);
  console.log(`  ${c.bold}Client:${c.reset}      ${job.client || walletAddress}`);
  console.log(`  ${c.bold}Evaluator:${c.reset}   ${job.evaluator}`);
  if (job.provider) {
    console.log(`  ${c.bold}Provider:${c.reset}    ${job.provider}`);
  }
  if (job.budget != null) {
    console.log(`  ${c.bold}Budget:${c.reset}      ${c.green}$${Number(job.budget).toFixed(2)} USDC${c.reset}`);
  }
  if (job.expires_at) {
    console.log(`  ${c.bold}Expires:${c.reset}     ${formatDate(job.expires_at)}`);
  }
  if (chainTxHash) {
    console.log(`  ${c.bold}Tx:${c.reset}          ${c.cyan}${chainTxHash}${c.reset}`);
  }
  console.log(`\n${c.dim}Next: obolos job fund ${job.id}${c.reset}\n`);
}

async function cmdJobInfo(args: string[]) {
  const id = getPositional(args, 0);
  if (!id) {
    console.error(`${c.red}Usage: obolos job info <id>${c.reset}`);
    process.exit(1);
  }

  const data = await apiGet(`/api/jobs/${encodeURIComponent(id)}`);
  const job = data.job || data;

  console.log(`\n${c.bold}${c.cyan}${job.title || 'Untitled Job'}${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  ${c.bold}ID:${c.reset}          ${job.id}`);
  console.log(`  ${c.bold}Status:${c.reset}      ${statusColor(job.status || 'open')}`);

  // State machine visualization
  console.log(`  ${c.bold}Progress:${c.reset}`);
  console.log(stateVisualization(job.status || 'open'));

  console.log(`  ${c.bold}Client:${c.reset}      ${job.client || `${c.dim}—${c.reset}`}`);
  console.log(`  ${c.bold}Evaluator:${c.reset}   ${job.evaluator || `${c.dim}—${c.reset}`}`);
  console.log(`  ${c.bold}Provider:${c.reset}    ${job.provider || `${c.dim}Open (anyone can claim)${c.reset}`}`);

  if (job.budget != null) {
    console.log(`  ${c.bold}Budget:${c.reset}      ${c.green}$${Number(job.budget).toFixed(2)} USDC${c.reset}`);
  }

  if (job.description) {
    console.log(`\n  ${c.bold}Description:${c.reset}`);
    const descLines = job.description.split('\n');
    for (const line of descLines) {
      console.log(`  ${line}`);
    }
  }

  if (job.deliverable) {
    console.log(`\n  ${c.bold}Deliverable:${c.reset} ${c.cyan}${job.deliverable}${c.reset}`);
  }

  if (job.reason) {
    console.log(`  ${c.bold}Reason:${c.reset}      ${job.reason}`);
  }

  if (job.expires_at) {
    const expiryDate = new Date(job.expires_at);
    const now = new Date();
    const expired = expiryDate < now;
    console.log(`  ${c.bold}Expires:${c.reset}     ${expired ? c.red : c.dim}${formatDate(job.expires_at)}${expired ? ' (expired)' : ''}${c.reset}`);
  }

  console.log(`  ${c.bold}Created:${c.reset}     ${formatDate(job.created_at || job.createdAt)}`);
  if (job.updated_at || job.updatedAt) {
    console.log(`  ${c.bold}Updated:${c.reset}     ${formatDate(job.updated_at || job.updatedAt)}`);
  }

  // Actions hint based on status
  console.log();
  const s = job.status || 'open';
  if (s === 'open') {
    console.log(`  ${c.bold}Actions:${c.reset}`);
    console.log(`    obolos job fund ${job.id}       ${c.dim}Fund the escrow${c.reset}`);
  } else if (s === 'funded') {
    console.log(`  ${c.bold}Actions:${c.reset}`);
    console.log(`    obolos job submit ${job.id} --deliverable <hash>   ${c.dim}Submit work${c.reset}`);
  } else if (s === 'submitted') {
    console.log(`  ${c.bold}Actions:${c.reset}`);
    console.log(`    obolos job complete ${job.id}   ${c.dim}Approve and release funds${c.reset}`);
    console.log(`    obolos job reject ${job.id}     ${c.dim}Reject the submission${c.reset}`);
  }
  console.log();
}

async function cmdJobFund(args: string[]) {
  const id = getPositional(args, 0);
  if (!id) {
    console.error(`${c.red}Usage: obolos job fund <id>${c.reset}`);
    process.exit(1);
  }

  const walletAddress = await getWalletAddress();

  // First fetch the job to show budget info
  const jobData = await apiGet(`/api/jobs/${encodeURIComponent(id)}`);
  const job = jobData.job || jobData;

  console.log(`\n${c.bold}${c.cyan}Fund Job${c.reset}\n`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  ${c.bold}Job:${c.reset}    ${job.title || id}`);
  if (job.budget != null) {
    console.log(`  ${c.bold}Budget:${c.reset} ${c.green}$${Number(job.budget).toFixed(2)} USDC${c.reset}`);
  }
  console.log(`  ${c.bold}Status:${c.reset} ${statusColor(job.status || 'open')}`);
  console.log();

  const chainJobId = job.chain_job_id;
  let txHash: string | null = null;

  if (chainJobId && job.budget != null) {
    try {
      const acp = await getACPClient();
      const budgetStr = String(job.budget);

      // Check USDC allowance and approve if needed
      console.log(`  ${c.dim}Checking USDC allowance...${c.reset}`);
      const amount = acp.parseUnits(budgetStr, 6);

      const allowance = await acp.publicClient.readContract({
        address: USDC_CONTRACT,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [acp.account.address, ACP_ADDRESS],
      });

      if ((allowance as bigint) < amount) {
        console.log(`  ${c.dim}Approving USDC spend...${c.reset}`);
        const approveTx = await acp.walletClient.writeContract({
          address: USDC_CONTRACT,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ACP_ADDRESS, amount],
          account: acp.account,
          chain: (await import('viem/chains')).base,
        });
        await acp.publicClient.waitForTransactionReceipt({ hash: approveTx });
        console.log(`  ${c.green}USDC approved${c.reset}`);
      }

      console.log(`  ${c.dim}Funding escrow on-chain...${c.reset}`);
      const fundTx = await acp.walletClient.writeContract({
        address: ACP_ADDRESS,
        abi: ACP_ABI,
        functionName: 'fund',
        args: [BigInt(chainJobId), amount, '0x'],
        account: acp.account,
        chain: (await import('viem/chains')).base,
      });

      console.log(`  ${c.dim}Waiting for confirmation...${c.reset}`);
      await acp.publicClient.waitForTransactionReceipt({ hash: fundTx });
      txHash = fundTx;
      console.log(`  ${c.green}Transaction confirmed: ${txHash}${c.reset}\n`);
    } catch (err: any) {
      console.error(`  ${c.yellow}On-chain funding failed: ${err.message}${c.reset}`);
      console.error(`  ${c.dim}Recording funding intent in backend...${c.reset}\n`);
    }
  }

  // Update backend
  const fundPayload: Record<string, any> = {};
  if (txHash) fundPayload.tx_hash = txHash;
  if (chainJobId) fundPayload.chain_job_id = chainJobId;

  const data = await apiPost(`/api/jobs/${encodeURIComponent(id)}/fund`, fundPayload, {
    'x-wallet-address': walletAddress,
  });

  const updated = data.job || data;
  console.log(`${c.green}Job funded successfully!${c.reset}`);
  console.log(`  ${c.bold}Status:${c.reset} ${statusColor(updated.status || 'funded')}`);
  if (txHash) {
    console.log(`  ${c.bold}Tx:${c.reset}     ${c.cyan}${txHash}${c.reset}`);
  }
  console.log(`${c.dim}Next: Provider submits work with: obolos job submit ${id} --deliverable <hash>${c.reset}\n`);
}

async function cmdJobSubmit(args: string[]) {
  const id = getPositional(args, 0);
  if (!id) {
    console.error(`${c.red}Usage: obolos job submit <id> --deliverable <hash/CID/URL>${c.reset}`);
    process.exit(1);
  }

  const deliverable = getFlag(args, 'deliverable');
  if (!deliverable) {
    console.error(`${c.red}--deliverable is required. Provide a hash, CID, or URL for the work product.${c.reset}`);
    process.exit(1);
  }

  const walletAddress = await getWalletAddress();

  // Fetch job to get chain_job_id
  const jobData = await apiGet(`/api/jobs/${encodeURIComponent(id)}`);
  const existingJob = jobData.job || jobData;
  const chainJobId = existingJob.chain_job_id;
  let txHash: string | null = null;

  if (chainJobId) {
    try {
      const acp = await getACPClient();
      const deliverableHash = acp.keccak256(acp.toHex(deliverable));

      console.log(`\n  ${c.dim}Submitting work on-chain...${c.reset}`);
      const submitTx = await acp.walletClient.writeContract({
        address: ACP_ADDRESS,
        abi: ACP_ABI,
        functionName: 'submit',
        args: [BigInt(chainJobId), deliverableHash as `0x${string}`, '0x'],
        account: acp.account,
        chain: (await import('viem/chains')).base,
      });

      console.log(`  ${c.dim}Waiting for confirmation...${c.reset}`);
      await acp.publicClient.waitForTransactionReceipt({ hash: submitTx });
      txHash = submitTx;
      console.log(`  ${c.green}Transaction confirmed: ${txHash}${c.reset}`);
    } catch (err: any) {
      console.error(`  ${c.yellow}On-chain submission failed: ${err.message}${c.reset}`);
    }
  }

  const submitPayload: Record<string, any> = { deliverable };
  if (txHash) submitPayload.tx_hash = txHash;

  const data = await apiPost(`/api/jobs/${encodeURIComponent(id)}/submit`, submitPayload, {
    'x-wallet-address': walletAddress,
  });

  const job = data.job || data;

  console.log(`\n${c.green}Work submitted successfully!${c.reset}\n`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  ${c.bold}Job:${c.reset}         ${job.title || id}`);
  console.log(`  ${c.bold}Status:${c.reset}      ${statusColor(job.status || 'submitted')}`);
  console.log(`  ${c.bold}Deliverable:${c.reset} ${c.cyan}${deliverable}${c.reset}`);
  if (txHash) {
    console.log(`  ${c.bold}Tx:${c.reset}          ${c.cyan}${txHash}${c.reset}`);
  }
  console.log(`\n${c.dim}The evaluator will now review and approve or reject the submission.${c.reset}\n`);
}

async function cmdJobComplete(args: string[]) {
  const id = getPositional(args, 0);
  if (!id) {
    console.error(`${c.red}Usage: obolos job complete <id> [--reason "..."]${c.reset}`);
    process.exit(1);
  }

  const reason = getFlag(args, 'reason');
  const walletAddress = await getWalletAddress();

  // Fetch job to get chain_job_id
  const jobData = await apiGet(`/api/jobs/${encodeURIComponent(id)}`);
  const existingJob = jobData.job || jobData;
  const chainJobId = existingJob.chain_job_id;
  let txHash: string | null = null;

  if (chainJobId) {
    try {
      const acp = await getACPClient();
      const reasonHash = reason
        ? acp.keccak256(acp.toHex(reason)) as `0x${string}`
        : ZERO_BYTES32;

      console.log(`\n  ${c.dim}Completing job on-chain...${c.reset}`);
      const completeTx = await acp.walletClient.writeContract({
        address: ACP_ADDRESS,
        abi: ACP_ABI,
        functionName: 'complete',
        args: [BigInt(chainJobId), reasonHash, '0x'],
        account: acp.account,
        chain: (await import('viem/chains')).base,
      });

      console.log(`  ${c.dim}Waiting for confirmation...${c.reset}`);
      await acp.publicClient.waitForTransactionReceipt({ hash: completeTx });
      txHash = completeTx;
      console.log(`  ${c.green}Transaction confirmed: ${txHash}${c.reset}`);
    } catch (err: any) {
      console.error(`  ${c.yellow}On-chain completion failed: ${err.message}${c.reset}`);
    }
  }

  const payload: Record<string, any> = {};
  if (reason) payload.reason = reason;
  if (txHash) payload.tx_hash = txHash;

  const data = await apiPost(`/api/jobs/${encodeURIComponent(id)}/complete`, payload, {
    'x-wallet-address': walletAddress,
  });

  const job = data.job || data;

  console.log(`\n${c.green}Job completed and approved!${c.reset}\n`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  ${c.bold}Job:${c.reset}    ${job.title || id}`);
  console.log(`  ${c.bold}Status:${c.reset} ${statusColor(job.status || 'completed')}`);
  if (reason) {
    console.log(`  ${c.bold}Reason:${c.reset} ${reason}`);
  }
  if (txHash) {
    console.log(`  ${c.bold}Tx:${c.reset}     ${c.cyan}${txHash}${c.reset}`);
  }
  if (job.budget != null) {
    console.log(`\n  ${c.dim}Escrow of $${Number(job.budget).toFixed(2)} USDC released to provider.${c.reset}`);
  }
  console.log();
}

async function cmdJobReject(args: string[]) {
  const id = getPositional(args, 0);
  if (!id) {
    console.error(`${c.red}Usage: obolos job reject <id> [--reason "..."]${c.reset}`);
    process.exit(1);
  }

  const reason = getFlag(args, 'reason');
  const walletAddress = await getWalletAddress();

  // Fetch job to get chain_job_id
  const jobData = await apiGet(`/api/jobs/${encodeURIComponent(id)}`);
  const existingJob = jobData.job || jobData;
  const chainJobId = existingJob.chain_job_id;
  let txHash: string | null = null;

  if (chainJobId) {
    try {
      const acp = await getACPClient();
      const reasonHash = reason
        ? acp.keccak256(acp.toHex(reason)) as `0x${string}`
        : ZERO_BYTES32;

      console.log(`\n  ${c.dim}Rejecting job on-chain...${c.reset}`);
      const rejectTx = await acp.walletClient.writeContract({
        address: ACP_ADDRESS,
        abi: ACP_ABI,
        functionName: 'reject',
        args: [BigInt(chainJobId), reasonHash, '0x'],
        account: acp.account,
        chain: (await import('viem/chains')).base,
      });

      console.log(`  ${c.dim}Waiting for confirmation...${c.reset}`);
      await acp.publicClient.waitForTransactionReceipt({ hash: rejectTx });
      txHash = rejectTx;
      console.log(`  ${c.green}Transaction confirmed: ${txHash}${c.reset}`);
    } catch (err: any) {
      console.error(`  ${c.yellow}On-chain rejection failed: ${err.message}${c.reset}`);
    }
  }

  const payload: Record<string, any> = {};
  if (reason) payload.reason = reason;
  if (txHash) payload.tx_hash = txHash;

  const data = await apiPost(`/api/jobs/${encodeURIComponent(id)}/reject`, payload, {
    'x-wallet-address': walletAddress,
  });

  const job = data.job || data;

  console.log(`\n${c.red}Job rejected.${c.reset}\n`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  ${c.bold}Job:${c.reset}    ${job.title || id}`);
  console.log(`  ${c.bold}Status:${c.reset} ${statusColor(job.status || 'rejected')}`);
  if (reason) {
    console.log(`  ${c.bold}Reason:${c.reset} ${reason}`);
  }
  if (txHash) {
    console.log(`  ${c.bold}Tx:${c.reset}     ${c.cyan}${txHash}${c.reset}`);
  }
  console.log();
}

function showJobHelp() {
  console.log(`
${c.bold}${c.cyan}obolos job${c.reset} — ERC-8183 Agentic Commerce Protocol (ACP) job management

${c.bold}Usage:${c.reset}
  obolos job list [options]              List jobs with optional filters
  obolos job create [options]            Create a new job
  obolos job info <id>                   Get full job details
  obolos job fund <id>                   Fund a job's escrow
  obolos job submit <id> [options]       Submit work for a job
  obolos job complete <id> [options]     Approve a job (evaluator)
  obolos job reject <id> [options]       Reject a job submission

${c.bold}List Options:${c.reset}
  --status=open|funded|submitted|completed|rejected|expired
  --client=0x...                         Filter by client address
  --provider=0x...                       Filter by provider address
  --limit=20                             Max results (default: 20)

${c.bold}Create Options:${c.reset}
  --title "..."                          Job title (required)
  --description "..."                    Job description
  --evaluator 0x...                      Evaluator address (required)
  --provider 0x...                       Specific provider (optional, open if omitted)
  --budget 1.00                          Budget in USDC
  --expires 24h                          Expiry (e.g., "24h", "7d", "1h")

${c.bold}Submit Options:${c.reset}
  --deliverable <hash/CID/URL>           Work product reference (required)

${c.bold}Complete/Reject Options:${c.reset}
  --reason "..."                         Optional reason text

${c.bold}Examples:${c.reset}
  obolos job list --status=open
  obolos job create --title "Analyze dataset" --evaluator 0xABC... --budget 5.00 --expires 7d
  obolos job info abc123
  obolos job fund abc123
  obolos job submit abc123 --deliverable ipfs://Qm...
  obolos job complete abc123 --reason "Looks great"
  obolos job reject abc123 --reason "Missing section 3"
`);
}

async function cmdJob(args: string[]) {
  const subcommand = args[0];
  const subArgs = args.slice(1);

  switch (subcommand) {
    case 'list':
    case 'ls':
      await cmdJobList(subArgs);
      break;
    case 'create':
    case 'new':
      await cmdJobCreate(subArgs);
      break;
    case 'info':
    case 'show':
      await cmdJobInfo(subArgs);
      break;
    case 'fund':
      await cmdJobFund(subArgs);
      break;
    case 'submit':
      await cmdJobSubmit(subArgs);
      break;
    case 'complete':
    case 'approve':
      await cmdJobComplete(subArgs);
      break;
    case 'reject':
      await cmdJobReject(subArgs);
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      showJobHelp();
      break;
    default:
      console.error(`${c.red}Unknown job subcommand: ${subcommand}${c.reset}`);
      showJobHelp();
      process.exit(1);
  }
}

// ─── Listing Commands (Negotiation Layer) ────────────────────────────────────

async function cmdListingList(args: string[]) {
  const params = new URLSearchParams();

  const status = getFlag(args, 'status');
  const client = getFlag(args, 'client');
  const limit = getFlag(args, 'limit') || '20';

  if (status) params.set('status', status);
  if (client) params.set('client', client);
  params.set('limit', limit);

  const data = await apiGet(`/api/listings?${params}`);
  const listings = data.listings || data.data || [];

  if (listings.length === 0) {
    console.log(`${c.yellow}No listings found.${c.reset}`);
    return;
  }

  const total = data.pagination?.total || data.total || listings.length;
  console.log(`\n${c.bold}${c.cyan}Job Listings${c.reset} ${c.dim}— ${total} listings${c.reset}\n`);

  // Table header
  console.log(`  ${c.bold}${'ID'.padEnd(12)} ${'Title'.padEnd(28)} ${'Status'.padEnd(14)} ${'Budget Range'.padEnd(20)} ${'Bids'.padEnd(6)} ${'Client'.padEnd(14)} Deadline${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(110)}${c.reset}`);

  for (const l of listings) {
    const id = shortenId(l.id || '');
    const title = (l.title || 'Untitled').slice(0, 26).padEnd(28);
    const st = statusColor((l.status || 'open').padEnd(12));
    const budgetMin = l.min_budget != null ? `$${Number(l.min_budget).toFixed(2)}` : '?';
    const budgetMax = l.max_budget != null ? `$${Number(l.max_budget).toFixed(2)}` : '?';
    const budget = `${budgetMin}-${budgetMax}`.padEnd(20);
    const bids = String(l.bid_count ?? l.bids?.length ?? 0).padEnd(6);
    const cl = shortenAddr(l.client_address || l.client).padEnd(14);
    const deadline = l.deadline ? formatDate(l.deadline) : `${c.dim}—${c.reset}`;

    console.log(`  ${id.padEnd(12)} ${title} ${st}  ${budget} ${bids} ${cl} ${deadline}`);
  }

  console.log(`\n${c.dim}Use: obolos listing info <id> for full details${c.reset}\n`);
}

async function cmdListingCreate(args: string[]) {
  const title = getFlag(args, 'title');
  const description = getFlag(args, 'description');
  const minBudget = getFlag(args, 'min-budget');
  const maxBudget = getFlag(args, 'max-budget');
  const deadline = getFlag(args, 'deadline');
  const duration = getFlag(args, 'duration');
  const evaluator = getFlag(args, 'evaluator');
  const hook = getFlag(args, 'hook');

  if (!title) {
    console.error(`${c.red}Usage: obolos listing create --title "..." --description "..." [--min-budget 1.00] [--max-budget 10.00] [--deadline 7d] [--duration 24]${c.reset}`);
    process.exit(1);
  }

  const walletAddress = await getWalletAddress();

  const payload: Record<string, any> = { title };
  if (description) payload.description = description;
  if (minBudget) payload.min_budget = minBudget;
  if (maxBudget) payload.max_budget = maxBudget;
  if (deadline) payload.deadline = deadline;
  if (duration) payload.job_duration = parseInt(duration, 10);
  if (evaluator) payload.preferred_evaluator = evaluator;
  if (hook) payload.hook_address = hook;

  const data = await apiPost('/api/listings', payload, {
    'x-wallet-address': walletAddress,
  });

  const listing = data.listing || data;

  console.log(`\n${c.green}Listing created successfully!${c.reset}\n`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  ${c.bold}ID:${c.reset}          ${listing.id}`);
  console.log(`  ${c.bold}Title:${c.reset}       ${listing.title}`);
  if (listing.description) {
    console.log(`  ${c.bold}Description:${c.reset} ${listing.description}`);
  }
  console.log(`  ${c.bold}Status:${c.reset}      ${statusColor(listing.status || 'open')}`);
  console.log(`  ${c.bold}Client:${c.reset}      ${listing.client_address || walletAddress}`);
  if (listing.min_budget != null || listing.max_budget != null) {
    const min = listing.min_budget != null ? `$${Number(listing.min_budget).toFixed(2)}` : '?';
    const max = listing.max_budget != null ? `$${Number(listing.max_budget).toFixed(2)}` : '?';
    console.log(`  ${c.bold}Budget:${c.reset}      ${c.green}${min} – ${max} USDC${c.reset}`);
  }
  if (listing.deadline) {
    console.log(`  ${c.bold}Deadline:${c.reset}    ${formatDate(listing.deadline)}`);
  }
  if (listing.job_duration) {
    console.log(`  ${c.bold}Duration:${c.reset}    ${listing.job_duration}h`);
  }
  console.log(`\n${c.dim}Share this listing with providers. They can bid with: obolos listing bid ${listing.id} --price 5.00${c.reset}\n`);
}

async function cmdListingInfo(args: string[]) {
  const id = getPositional(args, 0);
  if (!id) {
    console.error(`${c.red}Usage: obolos listing info <id>${c.reset}`);
    process.exit(1);
  }

  const data = await apiGet(`/api/listings/${encodeURIComponent(id)}`);
  const listing = data.listing || data;

  console.log(`\n${c.bold}${c.cyan}${listing.title || 'Untitled Listing'}${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  ${c.bold}ID:${c.reset}          ${listing.id}`);
  console.log(`  ${c.bold}Status:${c.reset}      ${statusColor(listing.status || 'open')}`);
  console.log(`  ${c.bold}Client:${c.reset}      ${listing.client_address || `${c.dim}—${c.reset}`}`);

  if (listing.min_budget != null || listing.max_budget != null) {
    const min = listing.min_budget != null ? `$${Number(listing.min_budget).toFixed(2)}` : '?';
    const max = listing.max_budget != null ? `$${Number(listing.max_budget).toFixed(2)}` : '?';
    console.log(`  ${c.bold}Budget:${c.reset}      ${c.green}${min} – ${max} USDC${c.reset}`);
  }

  if (listing.deadline) {
    const deadlineDate = new Date(listing.deadline);
    const now = new Date();
    const expired = deadlineDate < now;
    console.log(`  ${c.bold}Deadline:${c.reset}    ${expired ? c.red : c.dim}${formatDate(listing.deadline)}${expired ? ' (passed)' : ''}${c.reset}`);
  }

  if (listing.job_duration) {
    console.log(`  ${c.bold}Duration:${c.reset}    ${listing.job_duration}h`);
  }

  if (listing.preferred_evaluator) {
    console.log(`  ${c.bold}Evaluator:${c.reset}   ${listing.preferred_evaluator}`);
  }

  if (listing.description) {
    console.log(`\n  ${c.bold}Description:${c.reset}`);
    const descLines = listing.description.split('\n');
    for (const line of descLines) {
      console.log(`  ${line}`);
    }
  }

  console.log(`  ${c.bold}Created:${c.reset}     ${formatDate(listing.created_at || listing.createdAt)}`);

  // Bids
  const bids = listing.bids || [];
  if (bids.length > 0) {
    console.log(`\n  ${c.bold}${c.cyan}Bids (${bids.length})${c.reset}`);
    console.log(`  ${c.dim}${'─'.repeat(56)}${c.reset}`);
    console.log(`  ${c.bold}${'Bid ID'.padEnd(12)} ${'Provider'.padEnd(14)} ${'Price'.padEnd(12)} ${'Delivery'.padEnd(10)} Message${c.reset}`);
    console.log(`  ${c.dim}${'─'.repeat(56)}${c.reset}`);

    for (const bid of bids) {
      const bidId = shortenId(bid.id || '');
      const provider = shortenAddr(bid.provider_address);
      const price = bid.price != null ? `${c.green}$${Number(bid.price).toFixed(2)}${c.reset}` : `${c.dim}—${c.reset}`;
      const delivery = bid.delivery_time ? `${bid.delivery_time}h` : `${c.dim}—${c.reset}`;
      const msg = (bid.message || '').slice(0, 40);

      console.log(`  ${bidId.padEnd(12)} ${provider.padEnd(14)} ${price.padEnd(12)} ${delivery.padEnd(10)} ${c.dim}${msg}${c.reset}`);
    }
  } else {
    console.log(`\n  ${c.dim}No bids yet.${c.reset}`);
  }

  // Actions
  console.log();
  const s = listing.status || 'open';
  if (s === 'open') {
    console.log(`  ${c.bold}Actions:${c.reset}`);
    console.log(`    obolos listing bid ${listing.id} --price 5.00             ${c.dim}Submit a bid${c.reset}`);
    if (bids.length > 0) {
      console.log(`    obolos listing accept ${listing.id} --bid <bid_id>       ${c.dim}Accept a bid${c.reset}`);
    }
    console.log(`    obolos listing cancel ${listing.id}                        ${c.dim}Cancel the listing${c.reset}`);
  }
  console.log();
}

async function cmdListingBid(args: string[]) {
  const listingId = getPositional(args, 0);
  if (!listingId) {
    console.error(`${c.red}Usage: obolos listing bid <listing_id> --price 5.00 [--delivery 24] [--message "..."]${c.reset}`);
    process.exit(1);
  }

  const price = getFlag(args, 'price');
  if (!price) {
    console.error(`${c.red}--price is required. Provide your bid amount in USDC.${c.reset}`);
    process.exit(1);
  }

  const delivery = getFlag(args, 'delivery');
  const message = getFlag(args, 'message');
  const proposalHash = getFlag(args, 'proposal-hash');

  const walletAddress = await getWalletAddress();

  const payload: Record<string, any> = { price };
  if (delivery) payload.delivery_time = parseInt(delivery, 10);
  if (message) payload.message = message;
  if (proposalHash) payload.proposal_hash = proposalHash;

  const data = await apiPost(`/api/listings/${encodeURIComponent(listingId)}/bid`, payload, {
    'x-wallet-address': walletAddress,
  });

  const bid = data.bid || data;

  console.log(`\n${c.green}Bid submitted successfully!${c.reset}\n`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  ${c.bold}Bid ID:${c.reset}      ${bid.id}`);
  console.log(`  ${c.bold}Listing:${c.reset}     ${listingId}`);
  console.log(`  ${c.bold}Price:${c.reset}       ${c.green}$${Number(price).toFixed(2)} USDC${c.reset}`);
  if (delivery) {
    console.log(`  ${c.bold}Delivery:${c.reset}    ${delivery}h`);
  }
  if (message) {
    console.log(`  ${c.bold}Message:${c.reset}     ${message}`);
  }
  console.log(`\n${c.dim}The client will review your bid. You'll be notified if accepted.${c.reset}\n`);
}

async function cmdListingAccept(args: string[]) {
  const listingId = getPositional(args, 0);
  if (!listingId) {
    console.error(`${c.red}Usage: obolos listing accept <listing_id> --bid <bid_id>${c.reset}`);
    process.exit(1);
  }

  const bidId = getFlag(args, 'bid');
  if (!bidId) {
    console.error(`${c.red}--bid is required. Specify the bid ID to accept.${c.reset}`);
    process.exit(1);
  }

  const walletAddress = await getWalletAddress();

  // Create on-chain ACP job if wallet is available
  let chainJobId: string | null = null;
  let chainTxHash: string | null = null;

  try {
    // Fetch listing details to get terms
    const listingData = await apiGet(`/api/listings/${encodeURIComponent(listingId)}`);
    const listing = listingData.listing || listingData;
    const bids = listing.bids || [];
    const acceptedBid = bids.find((b: any) => b.id === bidId);

    if (acceptedBid && OBOLOS_PRIVATE_KEY) {
      const acp = await getACPClient();

      const providerAddress = acceptedBid.provider_address || ZERO_ADDRESS;
      const evaluatorAddress = listing.preferred_evaluator || walletAddress;

      // Default expiry: delivery_time hours or job_duration or 7 days
      const durationHours = acceptedBid.delivery_time || listing.job_duration || 168;
      const expiredAt = Math.floor((Date.now() + durationHours * 3600000) / 1000);

      const description = `${listing.title}: ${listing.description || ''}`.slice(0, 500);

      console.log(`\n  ${c.dim}Creating ACP job on-chain...${c.reset}`);

      const txHash = await acp.walletClient.writeContract({
        address: ACP_ADDRESS,
        abi: ACP_ABI,
        functionName: 'createJob',
        args: [
          providerAddress as `0x${string}`,
          evaluatorAddress as `0x${string}`,
          BigInt(expiredAt),
          description,
          (listing.hook_address || ZERO_ADDRESS) as `0x${string}`,
        ],
        account: acp.account,
        chain: (await import('viem/chains')).base,
      });

      console.log(`  ${c.dim}Waiting for confirmation...${c.reset}`);
      const receipt = await acp.publicClient.waitForTransactionReceipt({ hash: txHash });

      // Extract jobId from JobCreated event
      for (const log of receipt.logs) {
        try {
          const decoded = acp.decodeEventLog({
            abi: ACP_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'JobCreated') {
            chainJobId = ((decoded.args as any).jobId).toString();
            break;
          }
        } catch {}
      }

      chainTxHash = txHash;
      console.log(`  ${c.green}Transaction confirmed: ${txHash}${c.reset}`);
      if (chainJobId) {
        console.log(`  ${c.green}Chain job ID: ${chainJobId}${c.reset}`);
      }
    }
  } catch (err: any) {
    console.error(`  ${c.yellow}On-chain job creation failed: ${err.message}${c.reset}`);
    console.error(`  ${c.dim}Proceeding with backend-only acceptance...${c.reset}`);
  }

  const payload: Record<string, any> = { bid_id: bidId };
  if (chainJobId) payload.acp_job_id = chainJobId;
  if (chainTxHash) payload.chain_tx_hash = chainTxHash;

  const data = await apiPost(`/api/listings/${encodeURIComponent(listingId)}/accept`, payload, {
    'x-wallet-address': walletAddress,
  });

  const listing = data.listing || data;

  console.log(`\n${c.green}Bid accepted! ACP job created.${c.reset}\n`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  ${c.bold}Listing:${c.reset}  ${listing.title || listingId}`);
  console.log(`  ${c.bold}Status:${c.reset}   ${statusColor(listing.status || 'accepted')}`);
  console.log(`  ${c.bold}Bid:${c.reset}      ${bidId}`);
  if (chainJobId) {
    console.log(`  ${c.bold}Chain ID:${c.reset} ${chainJobId}`);
  }
  if (chainTxHash) {
    console.log(`  ${c.bold}Tx:${c.reset}       ${c.cyan}${chainTxHash}${c.reset}`);
  }
  if (listing.job_id || data.job_id) {
    console.log(`  ${c.bold}Job ID:${c.reset}   ${listing.job_id || data.job_id}`);
  }
  console.log(`\n${c.dim}Next: Fund the escrow with: obolos job fund <job-id>${c.reset}\n`);
}

async function cmdListingCancel(args: string[]) {
  const listingId = getPositional(args, 0);
  if (!listingId) {
    console.error(`${c.red}Usage: obolos listing cancel <listing_id>${c.reset}`);
    process.exit(1);
  }

  const walletAddress = await getWalletAddress();

  const data = await apiPost(`/api/listings/${encodeURIComponent(listingId)}/cancel`, {}, {
    'x-wallet-address': walletAddress,
  });

  const listing = data.listing || data;

  console.log(`\n${c.yellow}Listing cancelled.${c.reset}\n`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  ${c.bold}Listing:${c.reset} ${listing.title || listingId}`);
  console.log(`  ${c.bold}Status:${c.reset}  ${statusColor(listing.status || 'cancelled')}`);
  console.log();
}

function showListingHelp() {
  console.log(`
${c.bold}${c.cyan}obolos listing${c.reset} — Agent-to-agent negotiation layer

${c.bold}Usage:${c.reset}
  obolos listing list [options]              Browse open job listings
  obolos listing create [options]            Create a new listing for agents to bid on
  obolos listing info <id>                   Get listing details with all bids
  obolos listing bid <id> [options]          Submit a bid on a listing
  obolos listing accept <id> [options]       Accept a bid (auto-creates ACP job)
  obolos listing cancel <id>                 Cancel a listing

${c.bold}List Options:${c.reset}
  --status=open|negotiating|accepted|cancelled
  --client=0x...                             Filter by client address
  --limit=20                                 Max results (default: 20)

${c.bold}Create Options:${c.reset}
  --title "..."                              Listing title (required)
  --description "..."                        Detailed description
  --min-budget 1.00                          Minimum budget in USDC
  --max-budget 10.00                         Maximum budget in USDC
  --deadline 7d                              Bidding deadline (e.g., "24h", "7d")
  --duration 24                              Expected job duration in hours
  --evaluator 0x...                          Preferred evaluator address
  --hook 0x...                               Hook contract address

${c.bold}Bid Options:${c.reset}
  --price 5.00                               Your proposed price in USDC (required)
  --delivery 24                              Estimated delivery time in hours
  --message "I can do this"                  Pitch to the client
  --proposal-hash <hash>                     Hash of detailed proposal

${c.bold}Accept Options:${c.reset}
  --bid <bid_id>                             Bid ID to accept (required)

${c.bold}Examples:${c.reset}
  obolos listing list --status=open
  obolos listing create --title "Analyze dataset" --description "Parse and summarize CSV" --max-budget 10.00 --deadline 7d
  obolos listing info abc123
  obolos listing bid abc123 --price 5.00 --delivery 24 --message "I can do this in 12h"
  obolos listing accept abc123 --bid bid456
  obolos listing cancel abc123
`);
}

async function cmdListing(args: string[]) {
  const sub = args[0];
  const subArgs = args.slice(1);

  switch (sub) {
    case 'list':
    case 'ls':
      await cmdListingList(subArgs);
      break;
    case 'create':
    case 'new':
      await cmdListingCreate(subArgs);
      break;
    case 'info':
    case 'show':
      await cmdListingInfo(subArgs);
      break;
    case 'bid':
      await cmdListingBid(subArgs);
      break;
    case 'accept':
      await cmdListingAccept(subArgs);
      break;
    case 'cancel':
      await cmdListingCancel(subArgs);
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      showListingHelp();
      break;
    default:
      console.error(`${c.red}Unknown listing subcommand: ${sub}${c.reset}`);
      showListingHelp();
      process.exit(1);
  }
}

// ─── ANP Commands (Agent Negotiation Protocol) ──────────────────────────────

async function cmdAnpList(args: string[]) {
  const params = new URLSearchParams();

  const status = getFlag(args, 'status');
  const limit = getFlag(args, 'limit') || '20';

  if (status) params.set('status', status);
  params.set('limit', limit);

  const data = await apiGet(`/api/anp/listings?${params}`);
  const listings = data.listings || data.data || [];

  if (listings.length === 0) {
    console.log(`${c.yellow}No ANP listings found.${c.reset}`);
    return;
  }

  const total = data.pagination?.total || data.total || listings.length;
  console.log(`\n${c.bold}${c.cyan}ANP Listings${c.reset} ${c.dim}— ${total} listings${c.reset}\n`);

  // Table header
  console.log(`  ${c.bold}${'CID'.padEnd(18)} ${'Title'.padEnd(28)} ${'Budget Range'.padEnd(20)} ${'Status'.padEnd(14)} ${'Bids'.padEnd(6)} Client${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(100)}${c.reset}`);

  for (const l of listings) {
    const cid = (l.cid || l.id || '').slice(0, 16).padEnd(18);
    const title = (l.title || 'Untitled').slice(0, 26).padEnd(28);
    const minUsd = l.minBudgetUsd ?? l.min_budget_usd ?? (l.minBudget ? Number(l.minBudget) / 1e6 : null) ?? (l.min_budget ? Number(l.min_budget) / 1e6 : null);
    const maxUsd = l.maxBudgetUsd ?? l.max_budget_usd ?? (l.maxBudget ? Number(l.maxBudget) / 1e6 : null) ?? (l.max_budget ? Number(l.max_budget) / 1e6 : null);
    const budgetMin = minUsd != null ? `$${minUsd.toFixed(0)}` : '?';
    const budgetMax = maxUsd != null ? `$${maxUsd.toFixed(0)}` : '?';
    const budget = `${budgetMin}-${budgetMax}`.padEnd(20);
    const st = statusColor((l.status || 'open').padEnd(12));
    const bids = String(l.bidCount ?? l.bid_count ?? l.bids?.length ?? 0).padEnd(6);
    const cl = shortenAddr(l.client_address || l.client || l.signer);

    console.log(`  ${cid} ${title} ${budget} ${st}  ${bids} ${cl}`);
  }

  console.log(`\n${c.dim}Use: obolos anp info <cid> for full details${c.reset}\n`);
}

async function cmdAnpInfo(args: string[]) {
  const cid = getPositional(args, 0);
  if (!cid) {
    console.error(`${c.red}Usage: obolos anp info <cid>${c.reset}`);
    process.exit(1);
  }

  const data = await apiGet(`/api/anp/listings/${encodeURIComponent(cid)}`);
  const listing = data.listing || data;

  console.log(`\n${c.bold}${c.cyan}${listing.title || 'Untitled ANP Listing'}${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  ${c.bold}CID:${c.reset}         ${listing.cid || cid}`);
  console.log(`  ${c.bold}Status:${c.reset}      ${statusColor(listing.status || 'open')}`);
  console.log(`  ${c.bold}Client:${c.reset}      ${listing.client || listing.client_address || listing.signer || `${c.dim}—${c.reset}`}`);

  const minRaw = listing.minBudget ?? listing.min_budget;
  const maxRaw = listing.maxBudget ?? listing.max_budget;
  const minUsd = listing.minBudgetUsd ?? (minRaw ? Number(minRaw) / 1e6 : null);
  const maxUsd = listing.maxBudgetUsd ?? (maxRaw ? Number(maxRaw) / 1e6 : null);
  if (minUsd != null || maxUsd != null) {
    const min = minUsd != null ? `$${minUsd.toFixed(2)}` : '?';
    const max = maxUsd != null ? `$${maxUsd.toFixed(2)}` : '?';
    console.log(`  ${c.bold}Budget:${c.reset}      ${c.green}${min} – ${max} USDC${c.reset}`);
  }

  const deadlineRaw = listing.deadline;
  if (deadlineRaw) {
    const ts = Number(deadlineRaw);
    const deadlineDate = new Date(ts > 1e12 ? ts : ts * 1000);
    const now = new Date();
    const expired = deadlineDate < now;
    console.log(`  ${c.bold}Deadline:${c.reset}    ${expired ? c.red : c.dim}${formatDate(deadlineDate.toISOString())}${expired ? ' (passed)' : ''}${c.reset}`);
  }

  if (listing.job_duration || listing.jobDuration) {
    const dur = listing.job_duration || listing.jobDuration;
    console.log(`  ${c.bold}Duration:${c.reset}    ${dur >= 86400 ? `${Math.floor(dur / 86400)}d` : dur >= 3600 ? `${Math.floor(dur / 3600)}h` : `${dur}s`}`);
  }

  if (listing.preferred_evaluator || listing.preferredEvaluator) {
    const ev = listing.preferred_evaluator || listing.preferredEvaluator;
    if (ev !== ZERO_ADDRESS) {
      console.log(`  ${c.bold}Evaluator:${c.reset}   ${ev}`);
    }
  }

  if (listing.description) {
    console.log(`\n  ${c.bold}Description:${c.reset}`);
    const descLines = listing.description.split('\n');
    for (const line of descLines) {
      console.log(`  ${line}`);
    }
  }

  if (listing.content_hash || listing.contentHash) {
    console.log(`  ${c.bold}Content Hash:${c.reset} ${c.dim}${listing.content_hash || listing.contentHash}${c.reset}`);
  }

  if (listing.nonce != null) {
    console.log(`  ${c.bold}Nonce:${c.reset}       ${c.dim}${listing.nonce}${c.reset}`);
  }

  if (listing.signature) {
    console.log(`  ${c.bold}Signature:${c.reset}   ${c.dim}${listing.signature.slice(0, 20)}...${c.reset}`);
  }

  // Bids
  const bids = listing.bids || [];
  if (bids.length > 0) {
    console.log(`\n  ${c.bold}${c.cyan}Bids (${bids.length})${c.reset}`);
    console.log(`  ${c.dim}${'─'.repeat(56)}${c.reset}`);
    console.log(`  ${c.bold}${'CID'.padEnd(18)} ${'Bidder'.padEnd(14)} ${'Price'.padEnd(12)} ${'Delivery'.padEnd(10)} Message${c.reset}`);
    console.log(`  ${c.dim}${'─'.repeat(56)}${c.reset}`);

    for (const bid of bids) {
      const bidCid = (bid.cid || bid.id || '').slice(0, 16).padEnd(18);
      const bidder = shortenAddr(bid.provider || bid.signer || bid.provider_address);
      const priceUsd = bid.priceUsd ?? (bid.price != null ? Number(bid.price) / 1e6 : null);
      const price = priceUsd != null ? `${c.green}$${priceUsd.toFixed(2)}${c.reset}` : `${c.dim}—${c.reset}`;
      const delivery = bid.deliveryTime || bid.delivery_time;
      const deliveryStr = delivery ? (delivery >= 86400 ? `${Math.floor(delivery / 86400)}d` : delivery >= 3600 ? `${Math.floor(delivery / 3600)}h` : `${delivery}s`) : `${c.dim}—${c.reset}`;
      const msg = (bid.message || '').slice(0, 40);

      console.log(`  ${bidCid} ${bidder.padEnd(14)} ${price.padEnd(12)} ${deliveryStr.padEnd(10)} ${c.dim}${msg}${c.reset}`);
    }
  } else {
    console.log(`\n  ${c.dim}No bids yet.${c.reset}`);
  }

  // Actions
  console.log();
  const s = listing.status || 'open';
  if (s === 'open' || s === 'negotiating') {
    console.log(`  ${c.bold}Actions:${c.reset}`);
    console.log(`    obolos anp bid ${cid} --price 5.00                    ${c.dim}Submit a bid${c.reset}`);
    if (bids.length > 0) {
      console.log(`    obolos anp accept ${cid} --bid <bid_cid>              ${c.dim}Accept a bid${c.reset}`);
    }
  }
  console.log(`    obolos anp verify ${cid}                                ${c.dim}Verify document${c.reset}`);
  console.log();
}

async function cmdAnpCreate(args: string[]) {
  const title = getFlag(args, 'title');
  const description = getFlag(args, 'description');
  const minBudget = getFlag(args, 'min-budget');
  const maxBudget = getFlag(args, 'max-budget');
  const deadline = getFlag(args, 'deadline');
  const duration = getFlag(args, 'duration');
  const evaluator = getFlag(args, 'evaluator');

  if (!title) {
    console.error(`${c.red}Usage: obolos anp create --title "..." --description "..." --min-budget 5 --max-budget 50 --deadline 7d --duration 3d [--evaluator 0x...]${c.reset}`);
    process.exit(1);
  }

  const anp = await getANPSigningClient();

  // Compute content hash
  const contentHash = await computeContentHash({ title, description: description || '' });

  // Generate nonce
  const nonce = generateNonce();

  // Parse deadline to unix timestamp (seconds from now)
  let deadlineTs: bigint;
  if (deadline) {
    const secs = parseTimeToSeconds(deadline);
    deadlineTs = BigInt(Math.floor(Date.now() / 1000) + secs);
  } else {
    deadlineTs = BigInt(Math.floor(Date.now() / 1000) + 7 * 86400); // default 7d
  }

  // Parse duration to seconds
  let jobDuration: bigint;
  if (duration) {
    jobDuration = BigInt(parseTimeToSeconds(duration));
  } else {
    jobDuration = BigInt(3 * 86400); // default 3d
  }

  const minBudgetWei = BigInt(Math.floor((minBudget ? parseFloat(minBudget) : 0) * 1e6));
  const maxBudgetWei = BigInt(Math.floor((maxBudget ? parseFloat(maxBudget) : 0) * 1e6));
  const preferredEvaluator = (evaluator || ZERO_ADDRESS) as `0x${string}`;

  const message = {
    contentHash,
    minBudget: minBudgetWei,
    maxBudget: maxBudgetWei,
    deadline: deadlineTs,
    jobDuration: jobDuration,
    preferredEvaluator,
    nonce,
  };

  console.log(`\n  ${c.dim}Signing ListingIntent...${c.reset}`);

  const signature = await anp.walletClient.signTypedData({
    account: anp.account,
    domain: ANP_DOMAIN,
    types: { ListingIntent: ANP_TYPES.ListingIntent },
    primaryType: 'ListingIntent',
    message,
  });

  console.log(`  ${c.green}Signed.${c.reset} Publishing...`);

  const document = {
    protocol: 'anp/v1',
    type: 'listing',
    data: {
      title,
      description: description || '',
      minBudget: minBudgetWei.toString(),
      maxBudget: maxBudgetWei.toString(),
      deadline: Number(deadlineTs),
      jobDuration: Number(jobDuration),
      preferredEvaluator,
      nonce: Number(nonce),
    },
    signer: anp.account.address.toLowerCase(),
    signature,
    timestamp: Date.now(),
  };

  const data = await apiPost('/api/anp/publish', document);
  const result = data.listing || data;

  console.log(`\n${c.green}ANP listing published!${c.reset}\n`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  ${c.bold}CID:${c.reset}         ${result.cid || result.id}`);
  console.log(`  ${c.bold}Title:${c.reset}       ${title}`);
  console.log(`  ${c.bold}Budget:${c.reset}      ${c.green}$${(minBudget || '0')} – $${(maxBudget || '0')} USDC${c.reset}`);
  console.log(`  ${c.bold}Deadline:${c.reset}    ${formatDate(new Date(Number(deadlineTs) * 1000).toISOString())}`);
  console.log(`  ${c.bold}Duration:${c.reset}    ${duration || '3d'}`);
  console.log(`  ${c.bold}Signer:${c.reset}      ${anp.account.address}`);
  console.log(`  ${c.bold}Signature:${c.reset}   ${c.dim}${signature.slice(0, 20)}...${c.reset}`);
  console.log(`\n${c.dim}Agents can bid with: obolos anp bid ${result.cid || result.id} --price 25 --delivery 48h${c.reset}\n`);
}

async function cmdAnpBid(args: string[]) {
  const listingCid = getPositional(args, 0);
  if (!listingCid) {
    console.error(`${c.red}Usage: obolos anp bid <listing_cid> --price 25 --delivery 48h [--message "..."]${c.reset}`);
    process.exit(1);
  }

  const price = getFlag(args, 'price');
  if (!price) {
    console.error(`${c.red}--price is required. Provide your bid amount in USDC.${c.reset}`);
    process.exit(1);
  }

  const delivery = getFlag(args, 'delivery');
  const message = getFlag(args, 'message');

  const anp = await getANPSigningClient();

  // Fetch listing document to compute listingHash
  console.log(`\n  ${c.dim}Fetching listing document...${c.reset}`);
  const listingData = await apiGet(`/api/anp/objects/${encodeURIComponent(listingCid)}`);
  const listingDoc = listingData;
  const ld = listingDoc.data || listingDoc;

  // Recompute listing content hash from title+description, then compute struct hash
  const listingContentHash = await computeContentHash({ title: ld.title, description: ld.description });
  const listingHash = anp.hashListingStruct({
    contentHash: listingContentHash,
    minBudget: BigInt(ld.minBudget || '0'),
    maxBudget: BigInt(ld.maxBudget || '0'),
    deadline: BigInt(ld.deadline || '0'),
    jobDuration: BigInt(ld.jobDuration || '0'),
    preferredEvaluator: (ld.preferredEvaluator || ZERO_ADDRESS) as `0x${string}`,
    nonce: BigInt(ld.nonce || '0'),
  });

  // Compute content hash for bid
  const contentHash = await computeContentHash({ message: message || '', proposalCid: '' });

  const nonce = generateNonce();
  const priceWei = BigInt(Math.floor(parseFloat(price) * 1e6));

  let deliveryTime: bigint;
  if (delivery) {
    deliveryTime = BigInt(parseTimeToSeconds(delivery));
  } else {
    deliveryTime = BigInt(86400); // default 24h
  }

  const bidMessage = {
    listingHash,
    contentHash,
    price: priceWei,
    deliveryTime,
    nonce,
  };

  console.log(`  ${c.dim}Signing BidIntent...${c.reset}`);

  const signature = await anp.walletClient.signTypedData({
    account: anp.account,
    domain: ANP_DOMAIN,
    types: { BidIntent: ANP_TYPES.BidIntent },
    primaryType: 'BidIntent',
    message: bidMessage,
  });

  console.log(`  ${c.green}Signed.${c.reset} Publishing...`);

  const document = {
    protocol: 'anp/v1',
    type: 'bid',
    data: {
      listingCid,
      listingHash,
      price: priceWei.toString(),
      deliveryTime: Number(deliveryTime),
      message: message || '',
      nonce: Number(nonce),
    },
    signer: anp.account.address.toLowerCase(),
    signature,
    timestamp: Date.now(),
  };

  const data = await apiPost('/api/anp/publish', document);
  const result = data.bid || data;

  console.log(`\n${c.green}ANP bid published!${c.reset}\n`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  ${c.bold}CID:${c.reset}         ${result.cid || result.id}`);
  console.log(`  ${c.bold}Listing:${c.reset}     ${listingCid}`);
  console.log(`  ${c.bold}Price:${c.reset}       ${c.green}$${parseFloat(price).toFixed(2)} USDC${c.reset}`);
  console.log(`  ${c.bold}Delivery:${c.reset}    ${delivery || '24h'}`);
  if (message) {
    console.log(`  ${c.bold}Message:${c.reset}     ${message}`);
  }
  console.log(`  ${c.bold}Signer:${c.reset}      ${anp.account.address}`);
  console.log(`  ${c.bold}Signature:${c.reset}   ${c.dim}${signature.slice(0, 20)}...${c.reset}`);
  console.log(`\n${c.dim}The listing owner can accept with: obolos anp accept ${listingCid} --bid ${result.cid || result.id}${c.reset}\n`);
}

async function cmdAnpAccept(args: string[]) {
  const listingCid = getPositional(args, 0);
  if (!listingCid) {
    console.error(`${c.red}Usage: obolos anp accept <listing_cid> --bid <bid_cid>${c.reset}`);
    process.exit(1);
  }

  const bidCid = getFlag(args, 'bid');
  if (!bidCid) {
    console.error(`${c.red}--bid is required. Specify the bid CID to accept.${c.reset}`);
    process.exit(1);
  }

  const anp = await getANPSigningClient();

  // Fetch listing and bid documents
  console.log(`\n  ${c.dim}Fetching listing and bid documents...${c.reset}`);
  const [listingData, bidData] = await Promise.all([
    apiGet(`/api/anp/objects/${encodeURIComponent(listingCid)}`),
    apiGet(`/api/anp/objects/${encodeURIComponent(bidCid)}`),
  ]);

  const ld = listingData.data || listingData;
  const bd = bidData.data || bidData;

  // Recompute listing content hash and struct hash
  const listingContentHash = await computeContentHash({ title: ld.title, description: ld.description });
  const listingHash = anp.hashListingStruct({
    contentHash: listingContentHash,
    minBudget: BigInt(ld.minBudget || '0'),
    maxBudget: BigInt(ld.maxBudget || '0'),
    deadline: BigInt(ld.deadline || '0'),
    jobDuration: BigInt(ld.jobDuration || '0'),
    preferredEvaluator: (ld.preferredEvaluator || ZERO_ADDRESS) as `0x${string}`,
    nonce: BigInt(ld.nonce || '0'),
  });

  // Recompute bid content hash and struct hash
  const bidContentHash = await computeContentHash({ message: bd.message || '', proposalCid: bd.proposalCid || '' });
  const bidHash = anp.hashBidStruct({
    listingHash: (bd.listingHash || listingHash) as `0x${string}`,
    contentHash: bidContentHash,
    price: BigInt(bd.price || '0'),
    deliveryTime: BigInt(bd.deliveryTime || '0'),
    nonce: BigInt(bd.nonce || '0'),
  });

  const nonce = generateNonce();

  const acceptMessage = {
    listingHash,
    bidHash,
    nonce,
  };

  console.log(`  ${c.dim}Signing AcceptIntent...${c.reset}`);

  const signature = await anp.walletClient.signTypedData({
    account: anp.account,
    domain: ANP_DOMAIN,
    types: { AcceptIntent: ANP_TYPES.AcceptIntent },
    primaryType: 'AcceptIntent',
    message: acceptMessage,
  });

  console.log(`  ${c.green}Signed.${c.reset} Publishing...`);

  const document = {
    protocol: 'anp/v1',
    type: 'acceptance',
    data: {
      listingCid,
      bidCid,
      listingHash,
      bidHash,
      nonce: Number(nonce),
    },
    signer: anp.account.address.toLowerCase(),
    signature,
    timestamp: Date.now(),
  };

  const data = await apiPost('/api/anp/publish', document);
  const result = data.accept || data;

  console.log(`\n${c.green}Bid accepted! ANP agreement published.${c.reset}\n`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  ${c.bold}CID:${c.reset}         ${result.cid || result.id}`);
  console.log(`  ${c.bold}Listing:${c.reset}     ${listingCid}`);
  console.log(`  ${c.bold}Bid:${c.reset}         ${bidCid}`);
  console.log(`  ${c.bold}Signer:${c.reset}      ${anp.account.address}`);
  console.log(`  ${c.bold}Signature:${c.reset}   ${c.dim}${signature.slice(0, 20)}...${c.reset}`);
  console.log(`\n${c.dim}The agreement is now verifiable on-chain.${c.reset}\n`);
}

async function cmdAnpVerify(args: string[]) {
  const cid = getPositional(args, 0);
  if (!cid) {
    console.error(`${c.red}Usage: obolos anp verify <cid>${c.reset}`);
    process.exit(1);
  }

  console.log(`\n  ${c.dim}Verifying document...${c.reset}`);

  const data = await apiGet(`/api/anp/verify/${encodeURIComponent(cid)}`);

  console.log(`\n${c.bold}${c.cyan}ANP Document Verification${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  ${c.bold}CID:${c.reset}           ${cid}`);
  console.log(`  ${c.bold}Type:${c.reset}          ${data.type || `${c.dim}—${c.reset}`}`);
  console.log(`  ${c.bold}Signer:${c.reset}        ${data.signer || `${c.dim}—${c.reset}`}`);

  if (data.valid || data.verified) {
    console.log(`  ${c.bold}Signature:${c.reset}     ${c.green}Valid${c.reset}`);
  } else {
    console.log(`  ${c.bold}Signature:${c.reset}     ${c.red}Invalid${c.reset}`);
  }

  if (data.content_valid != null) {
    console.log(`  ${c.bold}Content Hash:${c.reset}  ${data.content_valid ? `${c.green}Matches${c.reset}` : `${c.red}Mismatch${c.reset}`}`);
  }

  if (data.chain_refs != null) {
    console.log(`  ${c.bold}Chain Refs:${c.reset}    ${data.chain_refs ? `${c.green}Valid${c.reset}` : `${c.red}Invalid${c.reset}`}`);
  }

  if (data.details) {
    console.log(`\n  ${c.bold}Details:${c.reset}`);
    const details = typeof data.details === 'string' ? data.details : JSON.stringify(data.details, null, 2);
    for (const line of details.split('\n')) {
      console.log(`  ${c.dim}${line}${c.reset}`);
    }
  }

  console.log();
}

function showAnpHelp() {
  console.log(`
${c.bold}${c.cyan}obolos anp${c.reset} — Agent Negotiation Protocol (EIP-712 signed documents)

${c.bold}Usage:${c.reset}
  obolos anp list [options]                Browse ANP listings
  obolos anp info <cid>                    Get listing details with bids
  obolos anp create [options]              Sign and publish a listing
  obolos anp bid <cid> [options]           Sign and publish a bid
  obolos anp accept <cid> [options]        Accept a bid (sign AcceptIntent)
  obolos anp verify <cid>                  Verify document integrity

${c.bold}List Options:${c.reset}
  --status=open|negotiating|accepted       Filter by status
  --limit=20                               Max results (default: 20)

${c.bold}Create Options:${c.reset}
  --title "..."                            Listing title (required)
  --description "..."                      Detailed description
  --min-budget 5                           Minimum budget in USDC
  --max-budget 50                          Maximum budget in USDC
  --deadline 7d                            Bidding deadline (e.g., "24h", "7d")
  --duration 3d                            Expected job duration (e.g., "48h", "3d")
  --evaluator 0x...                        Preferred evaluator address

${c.bold}Bid Options:${c.reset}
  --price 25                               Your proposed price in USDC (required)
  --delivery 48h                           Estimated delivery time (e.g., "24h", "3d")
  --message "I can do this"                Message to the client

${c.bold}Accept Options:${c.reset}
  --bid <bid_cid>                          Bid CID to accept (required)

${c.bold}Examples:${c.reset}
  obolos anp list --status=open
  obolos anp create --title "Analyze dataset" --description "Parse CSV" --min-budget 5 --max-budget 50 --deadline 7d --duration 3d
  obolos anp info sha256-abc123...
  obolos anp bid sha256-abc123... --price 25 --delivery 48h --message "I can do this"
  obolos anp accept sha256-listing... --bid sha256-bid...
  obolos anp verify sha256-abc123...
`);
}

async function cmdAnp(args: string[]) {
  const sub = args[0];
  const subArgs = args.slice(1);

  switch (sub) {
    case 'list':
    case 'ls':
      await cmdAnpList(subArgs);
      break;
    case 'info':
    case 'show':
      await cmdAnpInfo(subArgs);
      break;
    case 'create':
    case 'new':
      await cmdAnpCreate(subArgs);
      break;
    case 'bid':
      await cmdAnpBid(subArgs);
      break;
    case 'accept':
      await cmdAnpAccept(subArgs);
      break;
    case 'verify':
      await cmdAnpVerify(subArgs);
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      showAnpHelp();
      break;
    default:
      console.error(`${c.red}Unknown anp subcommand: ${sub}${c.reset}`);
      showAnpHelp();
      process.exit(1);
  }
}

// ─── Reputation Commands ─────────────────────────────────────────────────────

function tierColor(tier: string): string {
  switch (tier.toLowerCase()) {
    case 'diamond':     return `${c.bold}${c.cyan}${tier}${c.reset}`;
    case 'platinum':    return `${c.bold}${c.white}${tier}${c.reset}`;
    case 'gold':
    case 'established': return `${c.yellow}${tier}${c.reset}`;
    case 'silver':
    case 'developing':  return `${c.dim}${c.white}${tier}${c.reset}`;
    case 'bronze':
    case 'limited':     return `${c.dim}${tier}${c.reset}`;
    case 'flagged':     return `${c.red}${tier}${c.reset}`;
    default:            return `${c.dim}${tier}${c.reset}`;
  }
}

function scoreBar(score: number): string {
  const width = 20;
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  let color = c.red;
  if (score >= 70) color = c.green;
  else if (score >= 40) color = c.yellow;
  return `${color}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset} ${color}${score}${c.reset}/100`;
}

function verdictLabel(pass: boolean): string {
  return pass
    ? `${c.green}✔ PASS${c.reset}`
    : `${c.red}✘ FAIL${c.reset}`;
}

async function cmdReputationCheck(args: string[]) {
  const agentId = getPositional(args, 0);
  if (!agentId) {
    console.error(`${c.red}Usage: obolos reputation check <agentId> [--chain base]${c.reset}`);
    process.exit(1);
  }

  const chain = getFlag(args, 'chain') || 'base';

  console.log(`\n${c.dim}Checking reputation for agent ${c.bold}${agentId}${c.reset}${c.dim} on ${chain}...${c.reset}\n`);

  const data = await apiGet(`/api/anp/reputation/${encodeURIComponent(agentId)}?chain=${encodeURIComponent(chain)}`);

  // Header
  console.log(`${c.bold}${c.cyan}Reputation Report${c.reset}  ${c.dim}Agent ${agentId}${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);

  // Combined score
  const combined = data.combined || {};
  console.log(`  ${c.bold}Combined Score:${c.reset}  ${scoreBar(combined.score ?? 0)}`);
  console.log(`  ${c.bold}Tier:${c.reset}            ${tierColor(combined.tier ?? 'unknown')}`);
  console.log(`  ${c.bold}Verdict:${c.reset}         ${verdictLabel(combined.pass ?? false)}`);
  console.log(`  ${c.bold}Chain:${c.reset}           ${data.chain || chain}`);
  if (data.address) {
    console.log(`  ${c.bold}Address:${c.reset}         ${data.address}`);
  }

  // Sybil warning
  if (combined.hasSybilFlags) {
    console.log(`\n  ${c.red}${c.bold}⚠ Sybil flags detected${c.reset}`);
  }

  // Individual provider scores
  const scores = data.scores || [];
  if (scores.length > 0) {
    console.log(`\n  ${c.bold}${c.cyan}Provider Scores (${scores.length})${c.reset}`);
    console.log(`  ${c.dim}${'─'.repeat(56)}${c.reset}`);

    for (const s of scores) {
      const provider = s.provider === 'rnwy' ? 'RNWY' : s.provider === 'agentproof' ? 'AgentProof' : s.provider;
      console.log(`\n  ${c.bold}${provider}${c.reset}`);
      console.log(`    Score:   ${scoreBar(s.score ?? 0)}`);
      console.log(`    Tier:    ${tierColor(s.tier ?? 'unknown')}`);
      console.log(`    Verdict: ${verdictLabel(s.pass ?? false)}`);

      if (s.sybilFlags && s.sybilFlags.length > 0) {
        console.log(`    ${c.red}Sybil:   ${s.sybilFlags.join(', ')}${c.reset}`);
      }
      if (s.riskFlags && s.riskFlags.length > 0) {
        console.log(`    ${c.yellow}Risk:    ${s.riskFlags.join(', ')}${c.reset}`);
      }
    }
  } else {
    console.log(`\n  ${c.dim}No provider scores available.${c.reset}`);
  }

  console.log(`\n  ${c.dim}Checked: ${data.checkedAt ? formatDate(data.checkedAt) : 'just now'}${c.reset}\n`);
}

async function cmdReputationCompare(args: string[]) {
  // Collect all positional args (agent IDs, optionally prefixed with chain:)
  const agents: { agentId: number; chain: string }[] = [];
  for (const arg of args) {
    if (arg.startsWith('--')) continue;
    const parts = arg.split(':');
    if (parts.length === 2) {
      const id = parseInt(parts[1], 10);
      if (isNaN(id)) { console.error(`${c.red}Invalid agent ID: ${parts[1]}${c.reset}`); process.exit(1); }
      agents.push({ agentId: id, chain: parts[0] });
    } else {
      const id = parseInt(parts[0], 10);
      if (isNaN(id)) { console.error(`${c.red}Invalid agent ID: ${parts[0]}${c.reset}`); process.exit(1); }
      agents.push({ agentId: id, chain: 'base' });
    }
  }

  if (agents.length < 2) {
    console.error(`${c.red}Usage: obolos reputation compare <id1> <id2> [id3...]${c.reset}`);
    console.error(`${c.dim}  Prefix with chain:  obolos rep compare base:123 ethereum:456${c.reset}`);
    process.exit(1);
  }

  console.log(`\n${c.dim}Comparing ${agents.length} agents in parallel...${c.reset}\n`);

  // Fetch all in parallel
  const results = await Promise.all(
    agents.map(a =>
      apiGet(`/api/anp/reputation/${a.agentId}?chain=${encodeURIComponent(a.chain)}`)
        .catch((err: Error) => ({ agentId: a.agentId, chain: a.chain, error: err.message }))
    )
  );

  // Sort by combined score descending
  const sorted = results
    .map((r: any, i: number) => ({ ...r, _input: agents[i] }))
    .sort((a: any, b: any) => ((b.combined?.score ?? -1) - (a.combined?.score ?? -1)));

  // Table header
  console.log(`${c.bold}${c.cyan}Reputation Comparison${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(74)}${c.reset}`);
  console.log(`  ${c.bold}${'#'.padEnd(4)}${'Agent'.padEnd(12)}${'Chain'.padEnd(12)}${'Score'.padEnd(24)}${'Tier'.padEnd(14)}Verdict${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(70)}${c.reset}`);

  sorted.forEach((r: any, i: number) => {
    const rank = `${i + 1}.`.padEnd(4);
    const agent = String(r._input.agentId).padEnd(12);
    const chain = r._input.chain.padEnd(12);

    if (r.error) {
      console.log(`  ${rank}${agent}${chain}${c.red}Error: ${r.error}${c.reset}`);
      return;
    }

    const combined = r.combined || {};
    const score = combined.score ?? 0;
    const bar = scoreBar(score);
    // scoreBar has ANSI codes so we can't pad it normally; we pad the raw number
    const barPadded = bar; // already formatted
    const tier = tierColor(combined.tier ?? 'unknown');
    const verdict = verdictLabel(combined.pass ?? false);
    const sybil = combined.hasSybilFlags ? ` ${c.red}⚠ sybil${c.reset}` : '';

    console.log(`  ${rank}${agent}${chain}${barPadded}  ${tier.padEnd(14)}  ${verdict}${sybil}`);
  });

  console.log(`${c.dim}${'─'.repeat(74)}${c.reset}\n`);
}

function showReputationHelp() {
  console.log(`
${c.bold}${c.cyan}obolos reputation${c.reset} — Agent trust & reputation checking

${c.bold}Subcommands:${c.reset}
  check <agentId>              Check reputation for an agent
  compare <id1> <id2> [...]    Compare multiple agents side-by-side

${c.bold}Options (check):${c.reset}
  --chain <chain>              Blockchain to check (default: base)

${c.bold}Examples:${c.reset}
  obolos reputation check 16907
  obolos reputation check 16907 --chain ethereum
  obolos rep check 16907
  obolos reputation compare 123 456 789
  obolos rep compare base:123 base:456 ethereum:789
`);
}

async function cmdReputation(args: string[]) {
  const sub = args[0];
  const subArgs = args.slice(1);

  switch (sub) {
    case 'check':
      await cmdReputationCheck(subArgs);
      break;
    case 'compare':
    case 'cmp':
      await cmdReputationCompare(subArgs);
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      showReputationHelp();
      break;
    default:
      console.error(`${c.red}Unknown reputation subcommand: ${sub}${c.reset}`);
      showReputationHelp();
      process.exit(1);
  }
}

// ─── Help ───────────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
${c.bold}${c.cyan}obolos${c.reset} — CLI for the Obolos x402 API Marketplace

${c.bold}Usage:${c.reset}
  obolos search [query]          Search APIs by keyword
  obolos categories              List all API categories
  obolos info <id>               Get full API details
  obolos call <id> [options]     Call an API with payment
  obolos balance                 Check wallet USDC balance
  obolos setup                   Configure wallet (interactive)
  obolos setup --generate        Generate a new wallet
  obolos setup --show            Show current wallet config
  obolos setup-mcp               Show MCP server setup instructions

${c.bold}Job Commands (ERC-8183 ACP):${c.reset}
  obolos job list [options]      List jobs with filters
  obolos job create [options]    Create a new job
  obolos job info <id>           Get full job details
  obolos job fund <id>           Fund a job's escrow
  obolos job submit <id> [opts]  Submit work for a job
  obolos job complete <id>       Approve a job (evaluator)
  obolos job reject <id>         Reject a job submission
  obolos job help                Show job command help

${c.bold}Listing Commands (Negotiation):${c.reset}
  obolos listing list [options]  Browse open job listings
  obolos listing create [opts]   Create a listing for bids
  obolos listing info <id>       Get listing details + bids
  obolos listing bid <id> [opts] Submit a bid on a listing
  obolos listing accept <id>     Accept a bid (creates job)
  obolos listing cancel <id>     Cancel a listing
  obolos listing help            Show listing command help

${c.bold}ANP Commands (Agent Negotiation Protocol):${c.reset}
  obolos anp list [options]     Browse ANP listings
  obolos anp info <cid>         Get listing details + bids
  obolos anp create [options]   Sign and publish a listing
  obolos anp bid <cid> [opts]   Sign and publish a bid
  obolos anp accept <cid> [opts] Accept a bid (sign AcceptIntent)
  obolos anp verify <cid>       Verify document integrity
  obolos anp help               Show ANP command help

${c.bold}Reputation Commands:${c.reset}
  obolos reputation check <id>  Check agent trust score
  obolos reputation compare ... Compare multiple agents
  obolos reputation help        Show reputation command help
  ${c.dim}(alias: obolos rep ...)${c.reset}

${c.bold}Call Options:${c.reset}
  --method POST|GET|PUT          HTTP method (default: GET)
  --body '{"key":"value"}'       Request body (JSON)

${c.bold}Config:${c.reset}
  Wallet key is loaded from ~/.obolos/config.json or OBOLOS_PRIVATE_KEY env var.
  Run ${c.cyan}obolos setup${c.reset} to configure.

${c.bold}Examples:${c.reset}
  obolos setup --generate
  obolos search "token price"
  obolos info a59a0377-d77b-4fee-...
  obolos call a59a0377-... --body '{"prompt":"a cat in space"}'
  obolos job list --status=open
  obolos job create --title "Analyze data" --evaluator 0xABC... --budget 5.00
  obolos listing list --status=open
  obolos listing create --title "Parse CSV data" --max-budget 10.00 --deadline 7d
  obolos listing bid abc123 --price 5.00 --message "I can do this"
  obolos listing accept abc123 --bid bid456
  obolos anp list --status=open
  obolos anp create --title "Analyze data" --min-budget 5 --max-budget 50 --deadline 7d
  obolos anp bid sha256-abc... --price 25 --delivery 48h --message "I can do this"
  obolos anp accept sha256-listing... --bid sha256-bid...
  obolos rep check 16907
  obolos rep check 16907 --chain ethereum
  obolos rep compare 123 456 789
  obolos rep compare base:123 ethereum:456
`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];
const commandArgs = args.slice(1);

async function main() {
  switch (command) {
    case 'search':
    case 's':
      await cmdSearch(commandArgs);
      break;
    case 'categories':
    case 'cats':
      await cmdCategories();
      break;
    case 'info':
    case 'i':
      await cmdInfo(commandArgs);
      break;
    case 'call':
    case 'c':
      await cmdCall(commandArgs);
      break;
    case 'balance':
    case 'bal':
      await cmdBalance();
      break;
    case 'setup':
      await cmdSetup(commandArgs);
      break;
    case 'setup-mcp':
    case 'mcp':
      await cmdSetupMcp();
      break;
    case 'job':
    case 'j':
      await cmdJob(commandArgs);
      break;
    case 'listing':
    case 'l':
      await cmdListing(commandArgs);
      break;
    case 'anp':
      await cmdAnp(commandArgs);
      break;
    case 'reputation':
    case 'rep':
      await cmdReputation(commandArgs);
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      showHelp();
      break;
    default:
      console.error(`${c.red}Unknown command: ${command}${c.reset}`);
      showHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
