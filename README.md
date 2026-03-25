# Obolos CLI

**Search, browse, and call x402 APIs from the terminal.**

```bash
npx @obolos/cli search "token price"
npx @obolos/cli info ext-abc123
npx @obolos/cli call ext-abc123 --body '{"symbol":"ETH"}'
```

## Commands

| Command | Description |
|---------|-------------|
| `obolos search [query]` | Search APIs by keyword |
| `obolos categories` | List all API categories |
| `obolos info <id>` | Get full API details with input fields |
| `obolos call <id> [opts]` | Call an API with automatic x402 payment |
| `obolos balance` | Check wallet USDC balance |
| `obolos setup-mcp` | Show MCP server setup instructions |

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
