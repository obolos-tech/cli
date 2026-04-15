import { Registry } from '../registry.js';
import { marketplaceCommands } from './marketplace.js';
import { walletCommands } from './wallet.js';
import { reputationCommands } from './reputation.js';
import { jobCommands } from './jobs.js';
import { listingCommands } from './listings.js';
import { anpCommands } from './anp.js';
import { setupCommands } from './setup.js';

export const registry = new Registry();

// Marketplace
registry.add(marketplaceCommands[0], ['s']);      // search
registry.add(marketplaceCommands[1], ['cats']);   // categories
registry.add(marketplaceCommands[2], ['i']);      // info

// Wallet / payment
registry.add(walletCommands[0], ['c']);           // call
registry.add(walletCommands[1], ['bal']);         // balance

// Reputation — dotted names routed via `obolos rep check` through subcommand
// dispatch wrapper (see runtime/dispatch.ts).
registry.add(reputationCommands[0]);              // reputation.check
registry.add(reputationCommands[1], ['reputation.cmp']); // reputation.compare

// Jobs (ACP on-chain)
for (const cmd of jobCommands) registry.add(cmd);

// Listings (off-chain negotiation → on-chain ACP)
for (const cmd of listingCommands) registry.add(cmd);

// ANP (EIP-712 signed negotiation)
for (const cmd of anpCommands) registry.add(cmd);

// Setup (wallet + MCP wiring)
registry.add(setupCommands[0]);                         // setup
registry.add(setupCommands[1], ['mcp']);                // setup-mcp

export { registry as default };
