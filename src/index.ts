/**
 * Entry point — loads the bundled knowledge base and starts the MCP server.
 * Run with: npm run dev (via tsx) or node dist/index.js (compiled).
 */

import { bootstrapKnowledgeBase } from "./knowledge/loader.js";
import { startServer } from "./server.js";
import { config } from "./utils/config.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  logger.info("Starting API Oracle MCP server", {
    dbPath: config.dbPath,
    nodeEnv: config.nodeEnv,
  });

  // Open the database and load the bundled entries (in-memory unless DB_PATH is set)
  bootstrapKnowledgeBase();

  // Start the MCP server on stdio
  await startServer();
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
