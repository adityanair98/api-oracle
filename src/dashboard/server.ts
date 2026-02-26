/**
 * API Oracle Web Dashboard — Express server.
 *
 * Runs as a separate process from the MCP server.
 * Start with: npm run dashboard
 *
 * Exports: startDashboard
 */

import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { initDb } from "../knowledge/db.js";
import { config } from "../utils/config.js";
import { createLogger } from "../utils/logger.js";
import { apiRouter } from "./routes/api.js";

const logger = createLogger("dashboard");
const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3737;

export function startDashboard(): void {
  const app = express();

  // Parse JSON bodies
  app.use(express.json());

  // Serve static frontend files
  const publicDir = join(__dirname, "public");
  app.use(express.static(publicDir));

  // Mount REST API
  app.use("/api", apiRouter);

  // Catch-all: serve index.html for client-side routing
  app.get("*", (_req, res) => {
    res.sendFile(join(publicDir, "index.html"));
  });

  app.listen(PORT, () => {
    process.stdout.write(`\n  API Oracle Dashboard\n`);
    process.stdout.write(`  ───────────────────────────────\n`);
    process.stdout.write(`  Local:   http://localhost:${PORT}\n`);
    process.stdout.write(`  Entries: 68 APIs across 23 categories\n\n`);
  });
}

// When run directly (npm run dashboard)
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  logger.info("Initializing database for dashboard", { dbPath: config.dbPath });
  initDb(config.dbPath);
  startDashboard();
}
