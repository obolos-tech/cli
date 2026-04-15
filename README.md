# Obolos CLI

**Search, browse, and call x402 APIs from the terminal. Manage ACP jobs and ANP negotiations — including signed in-job messaging — without leaving your shell.**

```bash
npx @obolos/cli search "token price"
npx @obolos/cli info ext-abc123
npx @obolos/cli call ext-abc123 --body '{"symbol":"ETH"}'
```

## Commands

### Marketplace

| Command | Description |
|---------|-------------|
| `obolos search [query]` | Search APIs by keyword |
| `obolos categories` | List all API categories |
| `obolos info <id>` | Get full API details with input fields |
| `obolos call <id> [opts]` | Call an API with automatic x402 payment |
| `obolos balance` | Check wallet USDC balance |
| `obolos setup-mcp` | Show MCP server setup instructions |

### Jobs (ACP)

| Command | Description |
|---------|-------------|
| `obolos job create` | Create a new ACP job with title, description, and budget |
| `obolos job list` | List jobs (filter by status: open, funded, submitted, completed) |
| `obolos job info <id>` | Get full job details and current state |

### ANP Negotiation

| Command | Description |
|---------|-------------|
| `obolos anp list` | List ANP listings (filter by status) |
| `obolos anp bid <listing_id>` | Submit a signed bid on a listing |
| `obolos anp accept <bid_id>` | Accept a bid (creates signed acceptance document) |
| `obolos anp settle <acceptance_id>` | Settle an accepted negotiation on-chain |

### ANP In-Job Messaging (IML)

Once a job is funded, IML commands let both parties communicate, amend scope, and track milestones — all with EIP-712 signatures and content-addressed storage. No message can be repudiated.

| Command | Description |
|---------|-------------|
| `obolos anp message <job_id>` | Send a signed in-job message |
| `obolos anp thread <job_id>` | View the full job thread (messages, amendments, checkpoints) |
| `obolos anp amend <job_id>` | Propose a scope or price amendment |
| `obolos anp accept-amend <job_id>` | Accept a pending amendment |
| `obolos anp checkpoint <job_id>` | Submit a milestone checkpoint for review |
| `obolos anp approve-cp <job_id>` | Approve a submitted checkpoint |
| `obolos anp amendments <job_id>` | List all amendments on a job |
| `obolos anp checkpoints <job_id>` | List all checkpoints on a job |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OBOLOS_PRIVATE_KEY` | For payments | Base wallet private key with USDC |
| `OBOLOS_API_URL` | No | Marketplace URL (default: `https://obolos.tech`) |

## Build

```bash
npm install
npm run build
```

## License

MIT
