#!/usr/bin/env node
/**
 * API Oracle CLI entry point.
 *
 * Usage:
 *   api-oracle serve       — Start the MCP server (default)
 *   api-oracle dashboard   — Start the web dashboard
 *   api-oracle --help      — Print usage
 *   api-oracle --version   — Print version
 */

import { createRequire } from "module";
import { initDb } from "./knowledge/db.js";
import { config } from "./utils/config.js";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports
const pkg = require("../package.json") as { version: string; name: string };

const HELP = `
  API Oracle — MCP server for API discovery and recommendations

  Usage:
    api-oracle [command]

  Commands:
    serve        Start the MCP server on stdio (default)
    dashboard    Start the web dashboard at http://localhost:3737

  Options:
    --help, -h   Show this help message
    --version    Show version

  Environment variables:
    DB_PATH      Path to SQLite database (default: ./data/api-oracle.db)
    PORT         Dashboard port (default: 3737)
    LOG_LEVEL    Log level: debug | info | warn | error (default: info)

  Example Claude Code configuration (~/.claude/claude_desktop_config.json):
    {
      "api-oracle": {
        "command": "npx",
        "args": ["@adityanair98/api-oracle", "serve"]
      }
    }
`.trimStart();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? "serve";

  if (command === "--help" || command === "-h") {
    process.stdout.write(HELP);
    process.exit(0);
  }

  if (command === "--version") {
    process.stdout.write(`${pkg.name} v${pkg.version}\n`);
    process.exit(0);
  }

  if (command === "dashboard") {
    initDb(config.dbPath);
    const { startDashboard } = await import("./dashboard/server.js");
    startDashboard();
    return;
  }

  if (command === "serve" || command === "") {
    // Default: MCP server on stdio
    initDb(config.dbPath);
    const { startServer } = await import("./server.js");
    await startServer();
    return;
  }

  process.stderr.write(`Unknown command: ${command}\n${HELP}`);
  process.exit(1);
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
