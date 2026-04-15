/**
 * Marketplace commands — first group ported to the registry pattern.
 *
 * Each export is a Command<InputSchema, Output> that:
 *   - run()    : calls runtime/http, returns structured data
 *   - format() : pretty-prints for human stdout
 *
 * The runtime chooses which to use based on --json / source=mcp.
 */

import { defineCommand } from '../registry.js';
import type { Command } from '../registry.js';
import { userError } from '../runtime/errors.js';

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', red: '\x1b[31m',
};

// ─── search ─────────────────────────────────────────────────────────────────

interface ApiListing {
  id: string;
  name: string;
  price_per_call: number;
  category: string;
  api_type?: string;
  slug?: string;
}

interface SearchOutput {
  apis: ApiListing[];
  total: number;
  query: string | null;
}

export const searchCmd = defineCommand({
  name: 'search',
  summary: 'Search the Obolos x402 marketplace for pay-per-call APIs.',
  description:
    'Returns APIs that AI agents can call with automatic USDC micropayments. ' +
    'Use this to find data services, AI endpoints, blockchain tools, and more.',
  input: {
    query: { type: 'string', description: 'Free-text query (e.g. "token price")', positional: 0 },
    category: { type: 'string', description: 'Filter by category slug' },
    limit: { type: 'number', description: 'Max results (default 25)', default: 25 },
    type: { type: 'string', description: 'API type', enum: ['native', 'external', 'all'], default: 'native' },
  },
  examples: [
    'obolos search "token price"',
    'obolos search --category data --limit 10',
    'obolos search --json "weather"',
  ],
  mcp: { expose: true, readOnly: true },

  async run(input, ctx): Promise<SearchOutput> {
    const params = new URLSearchParams();
    if (input.query) params.set('q', String(input.query));
    if (input.category) params.set('category', String(input.category));
    params.set('limit', String(input.limit));
    if (input.type !== 'all') params.set('type', String(input.type));
    const data = await ctx.http.get<{ apis: ApiListing[]; pagination: { total: number } }>(
      `/api/marketplace/apis/search?${params}`,
    );
    return {
      apis: data.apis,
      total: data.pagination?.total ?? data.apis.length,
      query: (input.query as string) ?? null,
    };
  },

  format(out) {
    if (out.apis.length === 0) {
      return `${c.yellow}No APIs found${out.query ? ` for "${out.query}"` : ''}.${c.reset}`;
    }
    const lines: string[] = [
      '',
      `${c.bold}${c.cyan}Obolos Marketplace${c.reset} ${c.dim}— ${out.total} APIs found${c.reset}`,
      '',
    ];
    for (const api of out.apis) {
      const name = (api.name || 'Unnamed').slice(0, 50);
      lines.push(`  ${c.bold}${name}${c.reset}`);
      lines.push(`    ${c.green}$${api.price_per_call.toFixed(4)}${c.reset}  ${c.dim}${api.category}${c.reset}  ${c.cyan}${api.id}${c.reset}`);
      lines.push('');
    }
    lines.push(`${c.dim}Use: obolos info <id> for details${c.reset}`);
    return lines.join('\n');
  },
});

// ─── categories ─────────────────────────────────────────────────────────────

interface CategoriesOutput {
  categories: Array<{ name: string; count: number }>;
  nativeCount: number;
  externalCount: number;
}

export const categoriesCmd = defineCommand({
  name: 'categories',
  summary: 'List all API categories with counts.',
  input: {},
  examples: ['obolos categories', 'obolos categories --json'],
  mcp: { expose: true, readOnly: true },

  async run(_input, ctx): Promise<CategoriesOutput> {
    return ctx.http.get<CategoriesOutput>('/api/marketplace/categories');
  },

  format(out) {
    const lines: string[] = ['', `${c.bold}${c.cyan}API Categories${c.reset}`, ''];
    for (const cat of out.categories) {
      const bar = '█'.repeat(Math.min(50, Math.ceil(cat.count / 5)));
      lines.push(`  ${cat.name.padEnd(25)} ${c.green}${String(cat.count).padStart(4)}${c.reset} ${c.dim}${bar}${c.reset}`);
    }
    lines.push('', `  ${c.bold}Total:${c.reset} ${out.nativeCount} native + ${out.externalCount} external`);
    return lines.join('\n');
  },
});

// ─── info ───────────────────────────────────────────────────────────────────

interface ApiInfoOutput {
  id: string;
  name: string;
  api_type: string;
  price_per_call: number;
  http_method: string;
  category: string;
  seller_name: string;
  total_calls: number;
  average_rating?: number;
  review_count?: number;
  description?: string;
  input_schema?: { fields?: Record<string, { type: string; required?: boolean; example?: unknown }> };
  example_request?: string;
  example_response?: string;
  slug?: string;
}

export const infoCmd = defineCommand({
  name: 'info',
  summary: 'Get full details for a specific API (schema, pricing, example).',
  input: {
    id: { type: 'string', description: 'API id (from search results)', positional: 0, required: true },
  },
  examples: ['obolos info ext-abc123', 'obolos info ext-abc123 --json'],
  mcp: { expose: true, readOnly: true },

  async run(input, ctx): Promise<ApiInfoOutput> {
    if (!input.id) throw userError('Missing api id');
    return ctx.http.get<ApiInfoOutput>(`/api/marketplace/apis/${encodeURIComponent(String(input.id))}`);
  },

  format(api, ctx) {
    const lines: string[] = [
      '',
      `${c.bold}${c.cyan}${api.name}${c.reset}`,
      `${c.dim}${'─'.repeat(60)}${c.reset}`,
      `  ${c.bold}ID:${c.reset}        ${api.id}`,
      `  ${c.bold}Type:${c.reset}      ${api.api_type}`,
      `  ${c.bold}Price:${c.reset}     ${c.green}$${api.price_per_call.toFixed(4)}${c.reset} USDC`,
      `  ${c.bold}Method:${c.reset}    ${api.http_method}`,
      `  ${c.bold}Category:${c.reset}  ${api.category}`,
      `  ${c.bold}Seller:${c.reset}    ${api.seller_name}`,
      `  ${c.bold}Calls:${c.reset}     ${api.total_calls}`,
    ];
    if (api.average_rating) {
      lines.push(`  ${c.bold}Rating:${c.reset}    ${api.average_rating.toFixed(1)}/5 (${api.review_count} reviews)`);
    }
    if (api.description) {
      lines.push('', `  ${c.bold}Description:${c.reset}`, `  ${api.description}`);
    }
    if (api.input_schema?.fields && Object.keys(api.input_schema.fields).length > 0) {
      lines.push('', `  ${c.bold}Input Fields:${c.reset}`);
      for (const [name, field] of Object.entries(api.input_schema.fields)) {
        const req = field.required ? `${c.red}*${c.reset}` : ' ';
        const ex = field.example ? `${c.dim}(e.g. ${JSON.stringify(field.example)})${c.reset}` : '';
        lines.push(`    ${req} ${c.cyan}${name}${c.reset}: ${field.type} ${ex}`);
      }
    }
    lines.push('', `  ${c.bold}Call:${c.reset} obolos call ${api.id}${api.http_method === 'POST' ? " --body '{...}'" : ''}`);
    lines.push(`  ${c.bold}Proxy:${c.reset} ${ctx.config.apiUrl}/api/proxy/${api.id}`);
    return lines.join('\n');
  },
});

export const marketplaceCommands: Command[] = [searchCmd, categoriesCmd, infoCmd] as Command[];
