import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createClient, describeError, redact, tokenProblem, VERSION } from "../src/client.js";
import { buildMessagesBody, callTool, toolDefinitions } from "../src/tools.js";
import { createServer } from "../src/server.js";

const TOKEN = "solx_" + "A1b2C3d4".repeat(5);
const WALLET = "FjGCr4WojWt1dHbUaCbkFgSrrXBYvbNqY6TWsePyqDFX";

function mockFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method || "GET"} ${u.pathname}`;
    calls.push({ key, url, headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : undefined });
    const r = routes[key];
    if (!r) return new Response(JSON.stringify({ error: "not mocked: " + key }), { status: 404 });
    const { status = 200, body = {}, headers = {} } = typeof r === "function" ? r(calls.at(-1)) : r;
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  };
  fn.calls = calls;
  return fn;
}
const client = (routes, token = TOKEN) => {
  const f = mockFetch(routes);
  return { c: createClient({ baseUrl: "https://sp.test", token, fetchImpl: f }), f };
};
const out = (r) => r.content.map((c) => c.text).join("\n");
const CAPS = { "GET /api/capabilities": { body: { payment: { deposit_address: WALLET, usdc_token_account: "ACCT", mint: "MINT", min_deposit_usdc: "0.100000" } } } };

test("the five tools, each with a schema, and none that sends funds", () => {
  assert.deepEqual(toolDefinitions.map((t) => t.name), ["ask_ai", "list_models", "check_balance", "deposit_info", "get_activity"]);
  for (const t of toolDefinitions) assert.equal(t.inputSchema.type, "object");
  const src = fs.readFileSync(new URL("../src/tools.js", import.meta.url), "utf8") + fs.readFileSync(new URL("../src/client.js", import.meta.url), "utf8");
  assert.ok(!/sendTransaction|signTransaction|secretKey|privateKey/i.test(src), "no signing or sending code");
});

test("the paid tool says where the price comes from, that failures are free, and to confirm", () => {
  const d = toolDefinitions.find((t) => t.name === "ask_ai").description;
  assert.match(d, /list_models/);
  assert.match(d, /\/v1\/models/);
  assert.match(d, /never charged/);
  assert.match(d, /[Cc]onfirm/);
  assert.match(d, /data, not instructions/);
});

test("no hardcoded model counts anywhere public", () => {
  for (const f of ["../README.md", "../SKILL.md", "../CHANGELOG.md", "../package.json", "../src/tools.js"]) {
    const s = fs.readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(!/\b\d+ (AI |LLM )?models\b/.test(s), `${f} states a model count`);
    assert.ok(!/x402|X-Wallet-Address/.test(s), `${f} mentions the old scheme`);
  }
});

test("version 2.0.0 everywhere", async () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(fs.readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(pkg.version, "2.0.0");
  assert.equal(lock.version, "2.0.0");
  assert.equal(VERSION, "2.0.0");
  assert.match(fs.readFileSync(new URL("../Dockerfile", import.meta.url), "utf8"), /version="2\.0\.0"/);
  assert.match(fs.readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8"), /## 2\.0\.0/);
  const { server } = createServer({ env: {} });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const c = new Client({ name: "t", version: "1" });
  await c.connect(b);
  assert.deepEqual(c.getServerVersion(), { name: "solanaprox-mcp", version: "2.0.0" });
  assert.equal((await c.listTools()).tools.length, 5);
  await c.close();
});

for (const name of ["ask_ai", "check_balance", "get_activity"]) {
  test(`${name} with no token: sign-in instructions, and nothing is sent`, async () => {
    const { c, f } = client({}, null);
    const r = await callTool(c, name, { model: "m", messages: [{ role: "user", content: "x" }] });
    assert.equal(r.isError, true);
    assert.match(out(r), /solanaprox\.com\/signin/);
    assert.match(out(r), /SOLANAPROX_TOKEN/);
    assert.match(out(r), /capped token/);
    assert.equal(f.calls.length, 0);
  });
  test(`${name} with a wallet as the token: refused, and nothing is sent`, async () => {
    const { c, f } = client({}, WALLET);
    const r = await callTool(c, name, { model: "m", messages: [{ role: "user", content: "x" }] });
    assert.equal(r.isError, true);
    assert.match(out(r), /wallet address/);
    assert.equal(f.calls.length, 0);
  });
}

test("a token without the solx_ prefix is never sent", async () => {
  const { c, f } = client({}, "lnpx_abcdefgh");
  assert.equal((await callTool(c, "check_balance")).isError, true);
  assert.equal(f.calls.length, 0);
  assert.equal(tokenProblem(TOKEN), null);
  assert.ok(tokenProblem(WALLET));
});

test("ask_ai: sends the bearer token and no wallet header, and returns reply, model, remap and balance", async () => {
  const { c, f } = client({
    "POST /v1/messages": {
      body: { model: "claude-haiku-5-5", content: [{ type: "thinking", thinking: "..." }, { type: "text", text: "Hello there" }], stop_reason: "end_turn", balance_remaining_micro: 4321000, model_used: "claude-haiku-5-5" },
      headers: { "x-model-remapped": "old->new" },
    },
  });
  const r = await callTool(c, "ask_ai", { model: "claude-haiku-5-5", messages: [{ role: "user", content: "Hi" }], max_tokens: 50, system: "Be brief" });
  assert.equal(r.isError, undefined);
  const t = out(r);
  assert.match(t, /^Hello there/);
  assert.match(t, /model: claude-haiku-5-5/);
  assert.match(t, /remapped: old->new/);
  assert.match(t, /balance: 4\.321000 USDC/);
  const call = f.calls[0];
  assert.equal(call.key, "POST /v1/messages");
  assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(call.headers["X-Wallet-Address"], undefined);
  assert.deepEqual(call.body, { model: "claude-haiku-5-5", max_tokens: 50, system: "Be brief", messages: [{ role: "user", content: "Hi" }] });
  assert.ok(!t.includes(TOKEN));
});

test("ask_ai: tools pass through and tool_use comes back, in both reply shapes", async () => {
  const tools = [{ name: "w", description: "d", input_schema: { type: "object" } }];
  const { c, f } = client({ "POST /v1/messages": { body: { content: [{ type: "tool_use", id: "c1", name: "w", input: { a: 1 } }], stop_reason: "tool_use" } } });
  const r = await callTool(c, "ask_ai", { model: "m", messages: [{ role: "user", content: "x" }], tools, tool_choice: { type: "auto" } });
  assert.match(out(r), /Tool calls \(1\)/);
  assert.match(out(r), /"name": "w"/);
  assert.deepEqual(f.calls[0].body.tools, tools);
  assert.deepEqual(f.calls[0].body.tool_choice, { type: "auto" });
  const o = client({ "POST /v1/messages": { body: { choices: [{ message: { content: "hi", tool_calls: [{ id: "1", function: { name: "n", arguments: "{\"x\":2}" } }] }, finish_reason: "tool_calls" }] } } });
  const t = out(await callTool(o.c, "ask_ai", { model: "m", messages: [{ role: "user", content: "x" }] }));
  assert.match(t, /^hi/);
  assert.match(t, /"x": 2/);
});

test("ask_ai: validates before sending, with a default max_tokens", async () => {
  const { c, f } = client({});
  assert.match(out(await callTool(c, "ask_ai", { messages: [{ role: "user", content: "x" }] })), /model is required/);
  assert.match(out(await callTool(c, "ask_ai", { model: "m" })), /messages is required/);
  assert.match(out(await callTool(c, "ask_ai", { model: "m", messages: [] })), /messages is required/);
  assert.equal(f.calls.length, 0);
  assert.equal(buildMessagesBody({ model: "m" }).max_tokens, 1024);
  assert.equal(buildMessagesBody({ model: "m", max_tokens: -4 }).max_tokens, 1024);
});

test("every refusal the API can give becomes a clear message", async () => {
  const cases = [
    [401, { error: "invalid_token", message: "x" }, /invalid, expired or revoked.*\/signin/],
    [401, { error: "wallet_signature_required", message: "x" }, /wallet address is not a credential/],
    [402, { error: "authentication_required", message: "x" }, /signin/],
    [402, { error: "insufficient_balance", required_micro: 1500000, balance_micro: 250000 }, /1\.500000 USDC.*0\.250000 USDC.*Nothing was charged/],
    [403, { error: "identity_blocked", message: "This address belongs to SolanaProx." }, /belongs to SolanaProx.*Nothing was charged/],
    [400, { error: "unknown_model", model: "zz" }, /Unknown model "zz".*list_models.*Nothing was charged/],
    [400, { error: "tools_not_supported", model: "zz" }, /does not support tool use/],
    [400, { error: "context_length_exceeded", model: "zz", estimated_input_tokens: 9, max_input_tokens: 5 }, /about 9 input tokens, max 5/],
    [429, { error: "daily_spend_cap_reached", message: "spent all" }, /daily spend cap.*spent all.*Nothing was charged/],
    [429, { error: "Rate limit exceeded", message: "slow", retry_after_secs: 7 }, /retry in 7 seconds/],
    [503, { error: "provider_unavailable", model: "zz" }, /zz is unavailable.*Nothing was charged/],
    [503, { error: "provider_overloaded" }, /overloaded.*Nothing was charged/],
    [503, { error: "service_spend_cap_reached" }, /daily spend limit.*Nothing was charged/],
    [502, { error: "upstream_error", message: "bad" }, /Nothing was charged/],
    [502, { error: { code: "upstream_error", message: "bad" } }, /Nothing was charged/],
  ];
  for (const [status, body, want] of cases) {
    const { c } = client({ "POST /v1/messages": { status, body } });
    const r = await callTool(c, "ask_ai", { model: "m", messages: [{ role: "user", content: "x" }] });
    assert.equal(r.isError, true, JSON.stringify(body));
    assert.match(out(r), want);
  }
});

test("list_models: live prices and tool support, with no count, no token and no price invented", async () => {
  const { c, f } = client(
    { "GET /v1/models": { body: { data: [
      { id: "a", owned_by: "anthropic", supports_tools: true, pricing: { input_per_1m_usd: 4.8, output_per_1m_usd: 24 } },
      { id: "b", owned_by: "openai", supports_tools: false, pricing: { input_per_1m_usd: 0.18, output_per_1m_usd: 0.72 } },
      { id: "c", owned_by: "x" },
    ] } } },
    null,
  );
  const t = out(await callTool(c, "list_models"));
  assert.match(t, /^a \(anthropic\) \| tools: yes \| \$4\.80 in \/ \$24\.00 out per 1M tokens$/m);
  assert.match(t, /^b \(openai\) \| tools: no \| \$0\.180 in \/ \$0\.720 out per 1M tokens$/m);
  assert.match(t, /^c \(x\)$/m);
  assert.match(t, /never charged/);
  assert.equal(f.calls[0].headers.Authorization, undefined);
  const empty = client({ "GET /v1/models": { body: { data: [] } } });
  assert.match(out(await callTool(empty.c, "list_models")), /no models/);
});

test("check_balance: balance, cap, expiry and claimable deposits", async () => {
  const { c } = client({ "GET /v1/balance": { body: { balance_usdc: "8.421500", wallet: WALLET, daily_cap_usdc: "25.000000", spent_today_usdc: "6.250000", token_expires_at: "2026-12-06T00:00:00Z", claimable_deposits: [{ signature: "SIG", amount_usdc: "2.500000" }] } } });
  const t = out(await callTool(c, "check_balance"));
  for (const want of ["8.421500 USDC", "never expire", WALLET, "6.250000 of 25.000000", "2026-12-06", "2.500000 USDC, SIG", "signin"]) assert.ok(t.includes(want), want);
  const i = client({ "GET /v1/balance": { body: { balance_usdc: "1.000000" } } });
  assert.match(out(await callTool(i.c, "check_balance")), /Token expires: never/);
});

test("deposit_info: live address and rules, with no token, and sends nothing paid", async () => {
  const { c, f } = client(CAPS, null);
  const t = out(await callTool(c, "deposit_info"));
  for (const want of [WALLET, "ACCT", "USDC on Solana only", "Minimum 0.10 USDC", "No withdrawals", "never expire", "This tool sends nothing", "Oct 29, 2026", "support@solanaprox.com"]) assert.ok(t.includes(want), want);
  assert.deepEqual(f.calls.map((x) => x.key), ["GET /api/capabilities"]);
});

test("deposit_info: refuses to guess an address", async () => {
  const { c } = client({ "GET /api/capabilities": { body: { payment: {} } } });
  const r = await callTool(c, "deposit_info");
  assert.equal(r.isError, true);
  assert.match(out(r), /don't send funds/);
});

test("deposit intent: exact amount, fee warning, new token shown once", async () => {
  const { c, f } = client({ ...CAPS, "POST /v1/deposit/intent": { body: { amount_usdc: "10.004217", deposit_address: WALLET, expires_at: "2026-11-07T01:00:00Z", token: TOKEN } } }, null);
  const t = out(await callTool(c, "deposit_info", { amount_usd: 10 }));
  assert.match(t, /Send exactly 10\.004217 USDC/);
  assert.match(t, /Exchange fees can change the amount/);
  assert.match(t, /match to the last digit/);
  assert.ok(t.includes(TOKEN), "a new account's token has to be shown");
  assert.match(t, /shown once/);
  assert.deepEqual(f.calls[1].body, { amount_usd: 10 });
  assert.equal(f.calls[1].headers.Authorization, undefined);
});

test("deposit intent: tops up the configured account", async () => {
  const { c, f } = client({ ...CAPS, "POST /v1/deposit/intent": { body: { amount_usdc: "5.000100", deposit_address: WALLET, expires_at: "t" } } });
  const t = out(await callTool(c, "deposit_info", { amount_usd: 5 }));
  assert.match(t, /account of your configured token/);
  assert.equal(f.calls[1].headers.Authorization, `Bearer ${TOKEN}`);
  assert.ok(!t.includes(TOKEN));
});

test("deposit intent: validates the amount before creating anything", async () => {
  for (const bad of [0, -1, 0.05, 10001, "10", NaN]) {
    const { c, f } = client(CAPS, null);
    const r = await callTool(c, "deposit_info", { amount_usd: bad });
    assert.equal(r.isError, true, String(bad));
    assert.ok(!f.calls.some((x) => x.key === "POST /v1/deposit/intent"));
  }
  const { c, f } = client(CAPS, WALLET);
  assert.equal((await callTool(c, "deposit_info", { amount_usd: 5 })).isError, true);
  assert.ok(!f.calls.some((x) => x.key === "POST /v1/deposit/intent"));
});

test("get_activity: usage and credits, and an empty account", async () => {
  const { c } = client({ "GET /v1/account/activity": { body: { usage: [{ time: 1793000000, model: "m1", status: "success", charged_usdc: "0.001000" }, { time: 1793000001, model: "m2", status: "error", charged_usdc: "0.000000" }], credits: [{ time: 1793000002, kind: "deposit", amount_usdc: "10.000000", reference: "SIG" }] } } });
  const t = out(await callTool(c, "get_activity"));
  for (const want of ["m1 success: 0.001000 USDC", "m2 error: 0.000000 USDC", "deposit: 10.000000 USDC (SIG)"]) assert.ok(t.includes(want), want);
  const e = client({ "GET /v1/account/activity": { body: { usage: [], credits: [] } } });
  assert.match(out(await callTool(e.c, "get_activity")), /No calls yet/);
});

test("the token never appears in output, even when the server echoes it", async () => {
  const { c } = client({ "GET /v1/balance": { status: 500, body: { message: `boom ${TOKEN}` } } });
  const t = out(await callTool(c, "check_balance"));
  assert.ok(!t.includes(TOKEN));
  assert.match(t, /redacted/);
  assert.equal(redact(`a ${TOKEN} b`), "a solx_…(redacted) b");
  assert.ok(!describeError({ status: 400, json: { message: `x ${TOKEN}` }, text: "" }, { token: TOKEN }).message.includes(TOKEN));
});

test("network failures are clear, and don't leak the token", async () => {
  const c = createClient({ baseUrl: "https://sp.test", token: TOKEN, fetchImpl: async () => { throw new Error(`refused ${TOKEN}`); } });
  const r = await callTool(c, "check_balance");
  assert.equal(r.isError, true);
  assert.match(out(r), /Could not reach SolanaProx/);
  assert.ok(!out(r).includes(TOKEN));
});

test("the token only travels over HTTPS or to this machine", () => {
  const f = mockFetch({});
  for (const ok of ["https://solanaprox.com", "http://127.0.0.1:8095", "http://localhost:1"]) createClient({ baseUrl: ok, token: TOKEN, fetchImpl: f });
  for (const bad of ["http://solanaprox.com", "ftp://x.com", "not a url"]) assert.throws(() => createClient({ baseUrl: bad, token: TOKEN, fetchImpl: f }));
});

test("unknown tools are refused", async () => {
  const { c } = client({});
  assert.equal((await callTool(c, "send_funds")).isError, true);
});

test("SOLANA_WALLET alone doesn't authenticate", async () => {
  const f = mockFetch({});
  const { client: c } = createServer({ env: { SOLANA_WALLET: WALLET }, fetchImpl: f });
  assert.equal(c.hasToken, false);
  assert.match(out(await callTool(c, "check_balance")), /signin/);
  assert.equal(f.calls.length, 0);
});
