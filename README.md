# solanaprox-mcp

MCP server for [SolanaProx](https://solanaprox.com): pay-per-call AI paid in USDC on Solana, for Claude Desktop, Cursor, Claude Code and other MCP clients.

- **Signed wallet auth.** You sign in with your wallet once and give the server a `solx_` token. A wallet address is not a credential.
- **Live prices** from the API, credited back to actual usage after each call.
- **Failed or empty calls are never charged.**
- **Balances never expire.** USDC on Solana only, with no withdrawals.
- **No tool sends funds.** The server holds no wallet and no key.
- Tool / function calling passthrough. Pure Node.js 18 or newer, with no build step.

> **Upgrading from 1.x?** Version 1.x sent a wallet address, which SolanaProx now refuses. Sign in to get a token, replace `SOLANA_WALLET` with `SOLANAPROX_TOKEN`, and restart your client. Your balance is safe and appears after sign-in.

## Get a token

1. Sign in at [solanaprox.com/signin](https://solanaprox.com/signin) with Phantom or Solflare. Signing moves no funds.
2. **Choose a low daily spend cap for agents.** The token is the agent's budget, and it never needs your wallet's key.
3. Copy the `solx_` token. It's shown once.

## Setup

### Claude Desktop

Edit `claude_desktop_config.json`:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "solanaprox": {
      "command": "npx",
      "args": ["-y", "solanaprox-mcp"],
      "env": {
        "SOLANAPROX_TOKEN": "solx_your_token_here"
      }
    }
  }
}
```

Restart Claude Desktop afterwards.

### Cursor

Add the same block to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per project).

### Claude Code

```bash
claude mcp add solanaprox -e SOLANAPROX_TOKEN=solx_your_token_here -- npx -y solanaprox-mcp
```

## Environment variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `SOLANAPROX_TOKEN` | For paid and account tools | none | Your `solx_` token, sent as a bearer header. The server never prints it. |
| `SOLANAPROX_URL` | no | `https://solanaprox.com` | API base URL. Must be HTTPS, except on this machine. |

## Tools

| Tool | Cost | Needs a token | What it does |
|------|------|---------------|--------------|
| `ask_ai` | **Paid** | Yes | Sends `messages` to `model` (`POST /v1/messages`), with optional `max_tokens`, `system`, `tools` and `tool_choice`. Returns the reply, any tool calls and the remaining balance. |
| `list_models` | Free | No | Lists the models served now, with live prices and tool support (`GET /v1/models`). |
| `check_balance` | Free | Yes | Shows the balance, today's spend against the token's cap, its expiry and claimable deposits (`GET /v1/balance`). |
| `deposit_info` | Free | No | Shows the deposit address, USDC account and rules. With `amount_usd`, creates a deposit intent for exchange users (`POST /v1/deposit/intent`). It never sends funds. |
| `get_activity` | Free | Yes | Shows recent usage and credits (`GET /v1/account/activity`). |

**What `ask_ai` costs:** the price comes from `list_models`. A call is quoted from the input size and `max_tokens`, then credited back to actual usage. Failed or empty calls are never charged. **An agent must confirm the cost with the user first.**

## Deposits

USDC on Solana only, with a 0.10 USDC minimum and no withdrawals. Balances never expire.

- **From your own wallet:** send before or after signing in. Earlier deposits are claimed automatically when you sign in.
- **From an exchange:** an exchange sends from its own wallet, so ask for an exact amount (`deposit_info` with `amount_usd`), valid for 1 hour. **Exchange fees can change the amount:** the amount that arrives must match to the last digit. Save the token it returns, since it's shown once and can't be recovered.

If you sent USDC to SolanaProx on Oct 29, 2026 and were not credited, contact support@solanaprox.com with your exchange withdrawal record.

## Errors

Errors are plain messages that say what to do next: sign in, deposit, pick another model, or wait. Nothing is charged when a request is refused or fails.

## Development

```bash
npm install
npm test          # unit tests with a mocked HTTP layer
npm run smoke     # live checks against solanaprox.com, free calls only
node agent-example.js
```

## Links

- [solanaprox.com](https://solanaprox.com) and its [docs](https://solanaprox.com/docs)
- Support: support@solanaprox.com

Built by LPX Digital Group LLC. MIT licensed.
