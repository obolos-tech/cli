/**
 * Setup commands. `setup` is MCP-exposed in non-interactive mode (--key /
 * --generate), but the interactive prompt is CLI-only.
 */

import { createInterface } from 'readline';
import { defineCommand } from '../registry.js';
import type { Command } from '../registry.js';
import { userError } from '../runtime/errors.js';
import { writeConfigPatch, CONFIG_FILE } from '../runtime/config.js';
import { c } from '../runtime/display.js';

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
}

async function normalizeAndValidate(key: string): Promise<{ key: `0x${string}`; address: string }> {
  const normalized = (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`;
  const { privateKeyToAccount } = await import('viem/accounts');
  try {
    const account = privateKeyToAccount(normalized);
    return { key: normalized, address: account.address };
  } catch (err: any) {
    throw userError(`Invalid private key: ${err.message}`);
  }
}

// ─── setup ──────────────────────────────────────────────────────────────────

export const setupCmd = defineCommand({
  name: 'setup',
  summary: 'Configure wallet. Non-interactive via --key or --generate; interactive otherwise.',
  description:
    'Writes the private key to ~/.obolos/config.json (mode 0600). Shared with @obolos_tech/mcp-server.',
  input: {
    generate: { type: 'boolean', description: 'Generate a new wallet instead of importing' },
    key: { type: 'string', description: 'Private key to import (0x...)' },
    show: { type: 'boolean', description: 'Show current wallet address without changing anything' },
  },
  examples: [
    'obolos setup --generate',
    'obolos setup --key 0xabc...',
    'obolos setup --show --json',
  ],
  // MCP-exposed only in non-interactive mode. Tool callers must pass --key or
  // --generate; the interactive prompt path short-circuits via isInteractive.
  mcp: { expose: true, destructive: true },
  async run(input, ctx) {
    if (input.show) {
      if (!ctx.config.privateKey) return { configured: false, configFile: CONFIG_FILE };
      const { address } = await normalizeAndValidate(ctx.config.privateKey);
      return { configured: true, address, configFile: CONFIG_FILE, apiUrl: ctx.config.apiUrl };
    }

    if (input.generate) {
      const { generatePrivateKey } = await import('viem/accounts');
      const key = generatePrivateKey();
      const { address } = await normalizeAndValidate(key);
      writeConfigPatch({ private_key: key });
      return { generated: true, address, configFile: CONFIG_FILE };
    }

    if (input.key) {
      const { key, address } = await normalizeAndValidate(String(input.key));
      writeConfigPatch({ private_key: key });
      return { imported: true, address, configFile: CONFIG_FILE };
    }

    // Interactive — only works from a real TTY, not MCP.
    if (ctx.source === 'mcp' || !process.stdin.isTTY) {
      throw userError('Pass --key or --generate for non-interactive setup.');
    }
    const answer = await prompt(`  Private key (0x...) or "generate" for a new wallet: `);
    if (!answer) return { configured: false, cancelled: true };
    if (answer === 'generate') {
      const { generatePrivateKey } = await import('viem/accounts');
      const key = generatePrivateKey();
      const { address } = await normalizeAndValidate(key);
      writeConfigPatch({ private_key: key });
      return { generated: true, address, configFile: CONFIG_FILE };
    }
    const { key, address } = await normalizeAndValidate(answer);
    writeConfigPatch({ private_key: key });
    return { imported: true, address, configFile: CONFIG_FILE };
  },
  format(out) {
    if (out.cancelled) return `${c.yellow}No changes made.${c.reset}`;
    if (out.configured === false) {
      return `${c.yellow}No wallet configured.${c.reset}  Run ${c.cyan}obolos setup --generate${c.reset}.`;
    }
    const verb = out.generated ? 'generated' : out.imported ? 'imported' : 'loaded';
    return ['', `${c.green}Wallet ${verb}.${c.reset}`,
      `  ${c.bold}Address:${c.reset} ${out.address}`,
      `  ${c.bold}Config:${c.reset}  ${out.configFile}`].join('\n');
  },
});

// ─── setup-mcp ──────────────────────────────────────────────────────────────

export const setupMcpCmd = defineCommand({
  name: 'setup-mcp',
  summary: 'Print instructions for wiring the MCP server into your agent runtime.',
  input: {},
  examples: ['obolos setup-mcp'],
  // Pointless to expose to MCP — the agent is already using MCP.
  mcp: { expose: false },
  async run(_input) {
    return {
      install: 'npm install -g @obolos_tech/mcp-server',
      claudeCode: {
        user: 'claude mcp add obolos --scope user -e OBOLOS_PRIVATE_KEY=0x... -- obolos-mcp',
        project: 'claude mcp add obolos -e OBOLOS_PRIVATE_KEY=0x... -- obolos-mcp',
      },
      desktopConfig: {
        mcpServers: {
          obolos: {
            command: 'npx',
            args: ['@obolos_tech/mcp-server'],
            env: { OBOLOS_PRIVATE_KEY: '0xyour_private_key' },
          },
        },
      },
    };
  },
  format(out) {
    return [
      '', `${c.bold}${c.cyan}Obolos MCP Server Setup${c.reset}`, '',
      `${c.bold}Install:${c.reset}`,
      `  ${out.install}`, '',
      `${c.bold}Claude Code (all projects):${c.reset}`,
      `  ${out.claudeCode.user}`, '',
      `${c.bold}Claude Code (this project only):${c.reset}`,
      `  ${out.claudeCode.project}`, '',
      `${c.bold}Claude Desktop / Cursor / Windsurf — add to config:${c.reset}`,
      `  ${c.dim}${JSON.stringify(out.desktopConfig, null, 2).replace(/\n/g, '\n  ')}${c.reset}`,
    ].join('\n');
  },
});

export const setupCommands: Command[] = [setupCmd, setupMcpCmd] as Command[];
