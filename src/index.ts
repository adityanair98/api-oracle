/**
 * Entry point — initializes the SQLite database and starts the MCP server.
 * Run with: npm run dev (via tsx) or node dist/index.js (compiled).
 */

import { initDb } from "./knowledge/db.js";
import { startServer } from "./server.js";
import { config } from "./utils/config.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  logger.info("Starting API Oracle MCP server", {
    dbPath: config.dbPath,
    nodeEnv: config.nodeEnv,
  });

  // Initialize SQLite database (creates tables if they don't exist)
  initDb(config.dbPath);
  logger.info("Database initialized");

  // Start the MCP server on stdio
  await startServer();
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
