// SolanaProx MCP server over stdio. Configuration comes from the environment:
// SOLANAPROX_TOKEN (solx_..., optional) and SOLANAPROX_URL. It reads no wallet and no key.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient, DEFAULT_URL, tokenProblem, VERSION } from "./client.js";
import { callTool, toolDefinitions } from "./tools.js";

export { VERSION };

export function createServer({ env = process.env, fetchImpl } = {}) {
  const token = (env.SOLANAPROX_TOKEN || "").trim() || undefined;
  const client = createClient({ baseUrl: env.SOLANAPROX_URL || DEFAULT_URL, token, fetchImpl });
  const server = new Server({ name: "solanaprox-mcp", version: VERSION }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => callTool(client, req.params.name, req.params.arguments || {}));
  return { server, client };
}

export async function main() {
  const { server, client } = createServer();
  await server.connect(new StdioServerTransport());
  // stdout carries the MCP protocol; diagnostics go to stderr. Never log the token.
  let state = "not set: sign in at https://solanaprox.com/signin";
  if (client.hasToken) state = tokenProblem(client.token) ? "unusable: it must be a solx_ token" : "configured";
  console.error(`solanaprox-mcp ${VERSION} ready on stdio (${client.base}; token ${state})`);
  if (process.env.SOLANA_WALLET) {
    console.error("SOLANA_WALLET is ignored since 2.0.0: a wallet address is not a credential. Set SOLANAPROX_TOKEN.");
  }
}
