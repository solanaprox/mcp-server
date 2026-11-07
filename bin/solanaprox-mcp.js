#!/usr/bin/env node
import { main } from "../src/server.js";

main().catch((err) => {
  console.error("solanaprox-mcp failed to start:", err && err.message ? err.message : err);
  process.exit(1);
});
