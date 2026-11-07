# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x     | Yes |
| 1.x     | No: it sends a wallet address as a credential, which SolanaProx now refuses |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Contact: support@solanaprox.com

Include a description, steps to reproduce, the potential impact and a suggested fix if you have one. We will respond within 48 hours and provide a fix within 7 days for critical issues.

## Scope

This server makes network requests only to `solanaprox.com`, or to `SOLANAPROX_URL` if you set it (HTTPS required, except on this machine). It reads the `SOLANAPROX_TOKEN` environment variable and accesses no other credentials or local files.

- **It holds no wallet and no private key, and no tool can send funds.**
- The token is sent only as a bearer header, and is redacted from tool output. The one exception is a new account's token from a deposit intent, which is shown once because it can't be recovered.
- A wallet address is never sent as a credential. A wallet-shaped `SOLANAPROX_TOKEN` is refused before anything is sent.
- Prompts go to SolanaProx and on to the model's provider. Don't put secrets in them.
- Use a token with a low daily spend cap, so a compromised agent has a limited budget.
