#!/usr/bin/env node
// Drive the MCP server from your own agent, using free calls only.
//   npm install
//   SOLANAPROX_TOKEN=solx_... node agent-example.js
// ask_ai is left commented out because it's paid: confirm the cost with the user first.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["bin/solanaprox-mcp.js"],
  env: { PATH: process.env.PATH, ...(process.env.SOLANAPROX_TOKEN ? { SOLANAPROX_TOKEN: process.env.SOLANAPROX_TOKEN } : {}) },
});
const client = new Client({ name: "solanaprox-example", version: "2.0.0" });
await client.connect(transport);

const show = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  console.log(`--- ${name}${r.isError ? " (error)" : ""}\n${r.content[0].text}\n`);
};
await show("list_models");
await show("check_balance");
await show("deposit_info");
await show("get_activity");
// await show("ask_ai", { model: "claude-haiku-5-5", max_tokens: 100, messages: [{ role: "user", content: "Say hello" }] });

await client.close();
