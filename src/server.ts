/**
 * MCP server setup — creates the server, registers all tools, and handles protocol.
 * Uses @modelcontextprotocol/sdk McpServer (high-level API).
 *
 * Exports: createServer, startServer, SERVER_VERSION
 */

import { createRequire } from "module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerFindBestApi } from "./tools/find-api.js";
import { registerCompareApis } from "./tools/compare-apis.js";
import { registerGetSetupGuide } from "./tools/get-setup-guide.js";
import { registerCheckApiFreshness } from "./tools/check-freshness.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("server");

// package.json sits one level above both src/server.ts and dist/server.js
const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

/** Server version reported to MCP clients — always package.json's version */
export const SERVER_VERSION: string = pkg.version;

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: "api-oracle",
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        "API Oracle helps developers find, evaluate, and use the best API for any programming task. " +
        "Use find_best_api to get a recommendation, compare_apis to compare specific options, " +
        "and get_api_setup_guide for complete setup instructions.",
    }
  );

  // Register all tools
  registerFindBestApi(server);
  registerCompareApis(server);
  registerGetSetupGuide(server);
  registerCheckApiFreshness(server);

  logger.info("Server created with 4 tools registered");
  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  logger.info("API Oracle MCP server running on stdio");
}
