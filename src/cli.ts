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
import { bootstrapKnowledgeBase } from "./knowledge/loader.js";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports
const pkg = require("../package.json") as { version: string; name: string };

/** The one-line Claude Code setup command (package name from package.json) */
const CLAUDE_CODE_CMD = `claude mcp add api-oracle -- npx -y ${pkg.name} serve`;

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
    DB_PATH      Optional SQLite file to use. By default the bundled entries
                 are loaded into an in-memory database at startup and no
                 file is written. If set, bundled entries are upserted into it.
    PORT         Dashboard port (default: 3737)
    LOG_LEVEL    Log level: debug | info | warn | error (default: info)

  Add to Claude Code:
    ${CLAUDE_CODE_CMD}
    For every project, add --scope user right after "claude mcp add".
    On native Windows (not WSL), put "cmd /c" before npx.
    Check it with: claude mcp list

  Add to Claude Desktop — edit claude_desktop_config.json
  (macOS: ~/Library/Application Support/Claude/claude_desktop_config.json,
   Windows: %APPDATA%\\Claude\\claude_desktop_config.json):
    {
      "mcpServers": {
        "api-oracle": {
          "command": "npx",
          "args": ["-y", "${pkg.name}", "serve"]
        }
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
    bootstrapKnowledgeBase();
    const { startDashboard } = await import("./dashboard/server.js");
    startDashboard();
    return;
  }

  if (command === "serve" || command === "") {
    // Default: MCP server on stdio. Load the bundled entries before serving.
    bootstrapKnowledgeBase();
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
