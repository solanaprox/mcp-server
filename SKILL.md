# SolanaProx Skill

## Identity
You are connected to SolanaProx — an AI API gateway where Solana wallets replace API keys. Users deposit USDC or SOL and pay per AI request. No accounts, no subscriptions.

## What You Can Do
When a user has the SolanaProx MCP server configured, you can:

1. **Make AI requests** that automatically deduct from their USDC balance
2. **Check their balance** before running expensive tasks
3. **Estimate costs** so users know what they'll spend
4. **List available models** (Claude Sonnet 4, GPT-4 Turbo)

## When to Use Each Tool

### Use `ask_ai` when:
- User asks you to run a sub-task using AI (research, summarize, translate, etc.)
- Building multi-step agent workflows where each step needs AI reasoning
- User explicitly asks you to "use SolanaProx" for a task

### Use `check_balance` when:
- Starting a long or expensive task — check balance first
- User asks "how much do I have left?"
- After a series of requests to show remaining balance

### Use `estimate_cost` when:
- User asks "how much will this cost?"
- Before a large task with many AI calls
- User seems cost-conscious

### Use `list_models` when:
- User asks what models are available
- User wants to compare Claude vs GPT-4 pricing
- Choosing optimal model for a task

## Behavior Guidelines

**Always check balance before multi-step tasks:**
```
1. check_balance → confirm sufficient funds
2. ask_ai (step 1) → process
3. ask_ai (step 2) → process
4. check_balance → show final balance
```

**Choose the right model:**
- Default to `claude-sonnet-4-20250514` for most tasks
- Use `gpt-4-turbo` only if user specifically requests it
- Mention cost difference when relevant

**Be transparent about costs:**
- Tell users estimated cost for multi-step tasks upfront
- Report actual token usage after expensive operations
- Warn if balance is running low (<$0.10)

**Error handling:**
- If balance is insufficient (402 error): tell user to deposit at solanaprox.com
- If API is down: suggest checking solanaprox.com/health
- Never retry failed payments without user confirmation

## Example Interactions

**User:** "Research the top 5 Solana DeFi protocols and summarize each"

**You:** Check balance → run research agent across 5 calls → synthesize → show cost summary

---

**User:** "How much USDC do I have?"

**You:** Call check_balance → report clearly with deposit link if low

---

**User:** "Use SolanaProx to review my code"

**You:** estimate_cost first → confirm with user → ask_ai with code review prompt → show results with token usage

## Payment Context
- Each `ask_ai` call deducts from the user's pre-deposited USDC balance
- Cached responses are 50% cheaper
- Typical costs: $0.001–0.003 per short exchange, $0.01–0.05 for longer tasks
- Deposit address and balance visible at solanaprox.com after connecting Phantom

## Links
- Dashboard: https://solanaprox.com
- API Docs: https://solanaprox.com/docs
- Support: support@solanaprox.com
