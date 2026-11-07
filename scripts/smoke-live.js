#!/usr/bin/env node
// Live smoke test against production using free calls only, over the real stdio
// transport. No inference runs and no funds move. It uses no real token.
// Usage: node scripts/smoke-live.js [base_url]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const base = process.argv[2] || process.env.SOLANAPROX_URL || "https://solanaprox.com";
let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  - " + detail : ""}`);
  if (!ok) failed++;
};

async function connect(extra = {}) {
  const transport = new StdioClientTransport({ command: process.execPath, args: ["bin/solanaprox-mcp.js"], env: { PATH: process.env.PATH, SOLANAPROX_URL: base, ...extra } });
  const client = new Client({ name: "smoke", version: "1" });
  await client.connect(transport);
  return client;
}
const call = async (c, name, args = {}) => {
  const r = await c.callTool({ name, arguments: args });
  return { err: !!r.isError, t: r.content[0].text };
};

const c = await connect();
const info = c.getServerVersion();
check("initialize: server name and version", info.name === "solanaprox-mcp" && info.version === "2.0.0", `${info.name} ${info.version}`);
const tools = (await c.listTools()).tools.map((t) => t.name);
check("tools/list: the five tools", tools.join() === "ask_ai,list_models,check_balance,deposit_info,get_activity", tools.join(", "));

const m = await call(c, "list_models");
const rows = m.t.split("\n").filter((l) => / \| tools: /.test(l));
check("list_models: live models with prices", !m.err && rows.length > 0 && rows.every((l) => /\$[\d.]+ in \/ \$[\d.]+ out per 1M tokens/.test(l)), `${rows.length} rows, e.g. ${rows[0]}`);
check("list_models: includes the example model", /^claude-haiku-5-5 \(anthropic\) \| tools: yes/m.test(m.t));

for (const t of ["check_balance", "get_activity"]) {
  const r = await call(c, t);
  check(`${t} with no token: clear sign-in instructions`, r.err && /solanaprox\.com\/signin/.test(r.t) && /SOLANAPROX_TOKEN/.test(r.t), r.t.split("\n")[0]);
}
const a = await call(c, "ask_ai", { model: "claude-haiku-5-5", max_tokens: 5, messages: [{ role: "user", content: "ping" }] });
check("ask_ai with no token: sign-in instructions, nothing sent", a.err && /signin/.test(a.t));

const d = await call(c, "deposit_info");
check("deposit_info: live address and rules", !d.err && /FjGCr4WojWt1dHbUaCbkFgSrrXBYvbNqY6TWsePyqDFX/.test(d.t) && /7B65QQ41bRvk3Musz3mLCP1wBMW54T7M4TibjZ7NudSq/.test(d.t) && /USDC on Solana only/.test(d.t) && /Minimum 0\.10 USDC/.test(d.t) && /No withdrawals/.test(d.t));
const bad = await call(c, "deposit_info", { amount_usd: 0.01 });
check("deposit_info: a bad amount is refused locally", bad.err && /amount_usd must be/.test(bad.t));
await c.close();

// The API's own answers, which the tools map to clear messages.
const raw = await fetch(base + "/v1/balance");
const rawBody = await raw.json();
check("API with no token: 402 authentication_required", raw.status === 402 && rawBody.error === "authentication_required", `HTTP ${raw.status} ${rawBody.error}`);

const bogus = await connect({ SOLANAPROX_TOKEN: "solx_notARealTokenForSmokeTesting" });
const b = await call(bogus, "check_balance");
check("check_balance with a bad token: the 401 path, explained", b.err && /invalid, expired or revoked/.test(b.t) && /signin/.test(b.t), b.t.slice(0, 70));
const ba = await call(bogus, "ask_ai", { model: "claude-haiku-5-5", max_tokens: 5, messages: [{ role: "user", content: "ping" }] });
check("ask_ai with a bad token: 401, nothing charged", ba.err && /invalid, expired or revoked/.test(ba.t) && /Nothing was charged/.test(ba.t));
const bg = await call(bogus, "get_activity");
check("get_activity with a bad token: 401, explained", bg.err && /invalid, expired or revoked/.test(bg.t));
check("the bad token is never echoed", ![b.t, ba.t, bg.t].some((t) => t.includes("solx_notARealToken")));
await bogus.close();

const wallet = await connect({ SOLANAPROX_TOKEN: "FjGCr4WojWt1dHbUaCbkFgSrrXBYvbNqY6TWsePyqDFX" });
const w = await call(wallet, "check_balance");
check("a wallet address as the token: refused before sending", w.err && /wallet address/.test(w.t));
await wallet.close();

console.log(failed ? `\n${failed} check(s) failed` : "\nall live checks passed");
process.exit(failed ? 1 : 0);
