# Changelog

## 2.0.0 (2026-11-06)

A rewrite for the relaunched SolanaProx. **This is a breaking change.**

**Breaking**
- Auth is now `SOLANAPROX_TOKEN` (a `solx_` token). `SOLANA_WALLET` is ignored: a wallet address is not a credential, and SolanaProx refuses it. Sign in at https://solanaprox.com/signin to get a token.
- `estimate_cost` is gone. Prices come from `list_models`, and each call is credited back to actual usage.
- `ask_ai` takes `messages` instead of `prompt`.

**Added**
- `deposit_info`: the address, USDC account and rules, plus an optional deposit intent for exchange users with the fee warning.
- `get_activity`: recent usage and credits.
- `ask_ai` supports tools and shows the remaining balance.

**Fixed**
- Tools give clear next steps, and failed calls say that nothing was charged.
- The `agent-exammple.js` file name.

**Changed**
- Plain Node.js ESM with no build step, on Node 18 or newer.
- The npm package is smaller: no TypeScript sources or build configuration.
- The token is only sent over HTTPS, or to this machine.
- No tool sends funds, and the server holds no wallet or key.

## 1.0.1

- Published to npm. It sends a wallet address as a credential, which the relaunched service refuses.

## 1.0.0

- Initial release.
