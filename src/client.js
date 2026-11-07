// SolanaProx HTTP client: requests, response metadata and error mapping.
// The token is sent only as a bearer header and is redacted from every string this
// module returns. A wallet address is never a credential, so it is never sent as one.

export const DEFAULT_URL = "https://solanaprox.com";
export const VERSION = "2.0.0";
const USER_AGENT = `solanaprox-mcp/${VERSION}`;
const TIMEOUT_MS = 120_000;
const TOKEN_RE = /solx_[1-9A-HJ-NP-Za-km-z]{8,}/g;

export const SIGN_IN_HELP = `No SolanaProx token is configured (SOLANAPROX_TOKEN).
To get one:
  1. Sign in with your wallet at https://solanaprox.com/signin. Signing moves no funds.
  2. Set SOLANAPROX_TOKEN=solx_... in your MCP config and restart the client.
Give agents a capped token: choose a low daily spend cap when you sign in, and don't give an agent your wallet's key.
A wallet address is not a credential.`;

/** Error carrying a user-facing message (already redacted). */
export class SolanaProxError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "SolanaProxError";
    this.status = status;
    this.code = code;
  }
}

/** Replace any solx_ token in s with a redacted marker. */
export function redact(s, token) {
  if (typeof s !== "string") return s;
  let out = s;
  if (token) out = out.split(token).join("solx_…(redacted)");
  return out.replace(TOKEN_RE, "solx_…(redacted)");
}

/** What's wrong with a configured token, or null. Checked before anything is sent. */
export function tokenProblem(token) {
  if (!token) return null;
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token)) {
    return `SOLANAPROX_TOKEN looks like a wallet address, which isn't a credential, so it wasn't sent.\nSign in at https://solanaprox.com/signin to get a solx_ token, and use that instead.`;
  }
  if (!token.startsWith("solx_")) {
    return "SOLANAPROX_TOKEN must start with solx_, so it wasn't sent. Sign in at https://solanaprox.com/signin to get one.";
  }
  return null;
}

/** The token travels only over HTTPS, or to this machine for local testing. */
export function baseUrlProblem(base) {
  let u;
  try {
    u = new URL(base);
  } catch {
    return `SOLANAPROX_URL "${base}" isn't a valid URL.`;
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) {
    return `SOLANAPROX_URL must use https, because your token travels to it. Got ${u.protocol}//${u.host}.`;
  }
  return null;
}

export function createClient({ baseUrl, token, fetchImpl } = {}) {
  const base = (baseUrl || DEFAULT_URL).replace(/\/+$/, "");
  const urlProblem = baseUrlProblem(base);
  if (urlProblem) throw new Error(urlProblem);
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new Error("global fetch is not available: Node.js 18 or newer is required");
  }

  async function request(method, path, { body, auth = false } = {}) {
    const h = { "User-Agent": USER_AGENT, Accept: "application/json" };
    if (body !== undefined) h["Content-Type"] = "application/json";
    if (auth && token) h.Authorization = `Bearer ${token}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await doFetch(base + path, {
        method,
        headers: h,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err) {
      const why = err && err.name === "AbortError" ? `timed out after ${TIMEOUT_MS / 1000}s` : String(err && err.message ? err.message : err);
      throw new SolanaProxError(redact(`Could not reach SolanaProx at ${base}: ${why}`, token), { code: "network_error" });
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, ok: res.ok, headers: res.headers, json, text };
  }

  return { base, hasToken: Boolean(token), token, request };
}

/** Micro-USDC to a plain USDC amount. */
export function usdc(micro) {
  return typeof micro === "number" && Number.isFinite(micro) ? (micro / 1e6).toFixed(6) : "?";
}

/** Turn a non-2xx SolanaProx response into a clear message that says what to do. */
export function describeError(res, { token, model } = {}) {
  const body = res.json || {};
  const err = body.error;
  const code = typeof err === "string" ? err : err && typeof err === "object" ? err.code || err.type : undefined;
  const serverMsg =
    (typeof body.message === "string" && body.message) ||
    (err && typeof err === "object" && typeof err.message === "string" && err.message) ||
    (typeof err === "string" && err) ||
    (res.text || "").slice(0, 300);
  const m = body.model || model;
  let msg;
  switch (true) {
    case code === "unknown_model":
      msg = `Unknown model "${m || "?"}". Call list_models for the IDs SolanaProx serves now. Nothing was charged.`;
      break;
    case code === "model_retired":
      msg = `Model "${m}" is retired. Use ${body.replacement || "a model from list_models"} instead. Nothing was charged.`;
      break;
    case code === "context_length_exceeded":
      msg = `Prompt too long for ${m}: about ${body.estimated_input_tokens} input tokens, max ${body.max_input_tokens} with this max_tokens. Shorten the prompt, lower max_tokens, or pick a larger-context model. Nothing was charged.`;
      break;
    case code === "tools_not_supported":
      msg = `${m} does not support tool use. Call list_models and pick a model with tools: yes. Nothing was charged.`;
      break;
    case code === "unsupported_tool_type":
    case code === "invalid_tools":
    case code === "invalid_tool_choice":
    case code === "tool_choice_not_supported":
    case code === "invalid_tool_history":
      msg = `Tool request rejected (${code}): ${serverMsg} Nothing was charged.`;
      break;
    case code === "authentication_required":
      msg = SIGN_IN_HELP;
      break;
    case code === "wallet_signature_required":
      msg = `A wallet address is not a credential. Sign in at https://solanaprox.com/signin to get a solx_ token, then set SOLANAPROX_TOKEN. Nothing was charged.`;
      break;
    case code === "invalid_token":
      msg = `SolanaProx rejected the token: it's invalid, expired or revoked. Your balance is safe, since balances never expire. Sign in again at https://solanaprox.com/signin and update SOLANAPROX_TOKEN. Nothing was charged.`;
      break;
    case code === "identity_blocked":
      msg = `${serverMsg} Nothing was charged.`;
      break;
    case code === "insufficient_balance":
      msg = `Balance too low for this request: it needs up to ${usdc(body.required_micro)} USDC and the balance is ${usdc(body.balance_micro)} USDC. Lower max_tokens, or deposit USDC (see deposit_info). Unused quote is credited back after each call. Nothing was charged.`;
      break;
    case code === "daily_spend_cap_reached":
      msg = `This token's daily spend cap was reached: ${serverMsg} Nothing was charged.`;
      break;
    case code === "service_spend_cap_reached":
      msg = `The service reached its daily spend limit. It resets at 00:00 UTC. Nothing was charged.`;
      break;
    case code === "provider_unavailable":
      msg = `${m} is unavailable from its provider right now. Nothing was charged. Retry later or choose another model (list_models).`;
      break;
    case code === "provider_overloaded":
      msg = `The AI provider is overloaded right now. Nothing was charged. Ask the user before retrying.`;
      break;
    case code === "upstream_error":
      msg = `The AI provider returned an error. Nothing was charged. ${serverMsg}`;
      break;
    case res.status === 429: {
      const retry = body.retry_after_secs ?? (res.headers && res.headers.get && res.headers.get("retry-after"));
      msg = `Rate limited by SolanaProx${retry ? `; retry in ${retry} seconds` : ""}. Nothing was charged. ${serverMsg}`;
      break;
    }
    case res.status === 413:
      msg = `Request too large for SolanaProx. Nothing was charged. ${serverMsg}`;
      break;
    default:
      msg = `SolanaProx error ${res.status}${code ? ` (${code})` : ""}: ${serverMsg}`;
  }
  return new SolanaProxError(redact(msg, token), { status: res.status, code });
}
