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
 */
export {};
