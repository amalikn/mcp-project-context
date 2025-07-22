#!/usr/bin/env node
import { MCPProjectContextServer } from "./server.js";

async function main() {
  const server = new MCPProjectContextServer();
  await server.run();
}

main().catch(console.error);
