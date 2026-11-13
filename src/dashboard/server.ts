/**
 * API Oracle Web Dashboard — Express server.
 *
 * Runs as a separate process from the MCP server.
 * Start with: npm run dashboard
 *
 * Exports: startDashboard
 */

import express from "express";
import type { Server } from "http";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getAllEntries } from "../knowledge/db.js";
import { bootstrapKnowledgeBase } from "../knowledge/loader.js";
import { config } from "../utils/config.js";
import { createLogger } from "../utils/logger.js";
import { apiRouter } from "./routes/api.js";

const logger = createLogger("dashboard");
const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT = 3737;

/**
 * Port from PORT (default 3737). 0 asks the OS for a free port; the banner
 * prints the port actually bound. Returns null for an invalid value.
 */
export function resolveDashboardPort(raw: string | undefined = process.env.PORT): number | null {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PORT;
  if (!/^\d+$/.test(raw.trim())) return null;
  const port = Number(raw.trim());
  return port <= 65535 ? port : null;
}

export function startDashboard(): Server | null {
  const port = resolveDashboardPort();
  if (port === null) {
    logger.error(`Invalid PORT "${process.env.PORT ?? ""}": use a number from 0 to 65535.`);
    process.exitCode = 1;
    return null;
  }

  const app = express();

  // Parse JSON bodies
  app.use(express.json());

  // Serve static frontend files
  const publicDir = join(__dirname, "public");
  app.use(express.static(publicDir));

  // Mount REST API
  app.use("/api", apiRouter);

  // Catch-all: serve index.html for client-side routing.
  // Express 5 (path-to-regexp v8) requires a named wildcard — a bare "*" throws at startup.
  app.get("/{*splat}", (_req, res) => {
    // Resolve relative to `root`: with an absolute path, send() refuses any
    // dot-directory in it (npx installs under ~/.npm/_npx/…) and returns 404.
    res.sendFile("index.html", { root: publicDir });
  });

  const entries = getAllEntries();
  const categoryCount = new Set(entries.map((e) => e.category)).size;

  // Express 5 passes listen errors (e.g. EADDRINUSE) to this callback instead
  // of throwing. Ignoring them printed the "Local:" banner and then exited 0.
  const server = app.listen(port, (err?: Error) => {
    if (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const hint =
        code === "EADDRINUSE"
          ? ` Port ${port} is already in use. Stop the other process or set PORT, e.g. PORT=3738 api-oracle dashboard.`
          : "";
      logger.error(`Dashboard could not start: ${err.message}.${hint}`);
      process.exitCode = 1;
      return;
    }
    const address = server.address();
    const boundPort = typeof address === "object" && address !== null ? address.port : port;
    process.stdout.write(`\n  API Oracle Dashboard\n`);
    process.stdout.write(`  ───────────────────────────────\n`);
    process.stdout.write(`  Local:   http://localhost:${boundPort}\n`);
    process.stdout.write(`  Entries: ${entries.length} APIs across ${categoryCount} categories\n\n`);
  });
  return server;
}

// When run directly (npm run dashboard)
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  logger.info("Loading knowledge base for dashboard", { dbPath: config.dbPath });
  bootstrapKnowledgeBase();
  startDashboard();
}
