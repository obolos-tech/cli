/**
 * Config resolution: env vars > ~/.obolos/config.json > defaults.
 * Kept schema-compatible with @obolos_tech/mcp-server so both binaries
 * read the same config file written by `obolos setup`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export const CONFIG_DIR = join(homedir(), '.obolos');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface ObolosConfig {
  apiUrl: string;
  privateKey: string | null;
  walletAddress: string | null;
}

function readFile(): Record<string, string> {
  try {
    if (existsSync(CONFIG_FILE)) return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {}
  return {};
}

export function loadConfig(): ObolosConfig {
  const file = readFile();
  return {
    apiUrl: process.env.OBOLOS_API_URL || file.api_url || 'https://obolos.tech',
    privateKey: process.env.OBOLOS_PRIVATE_KEY || file.private_key || null,
    walletAddress: file.wallet_address || null,
  };
}

export function writeConfigPatch(patch: Record<string, string>): void {
  const current = readFile();
  const merged = { ...current, ...patch };
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { mode: 0o700 });
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 });
}
