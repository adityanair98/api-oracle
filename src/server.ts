/**
 * MCP server setup — creates the server, registers all tools, and handles protocol.
 * Uses @modelcontextprotocol/sdk McpServer (high-level API).
 *
 * Exports: createServer
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerFindBestApi } from "./tools/find-api.js";
import { registerCompareApis } from "./tools/compare-apis.js";
import { registerGetSetupGuide } from "./tools/get-setup-guide.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("server");

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: "api-oracle",
      version: "0.1.0",
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

  logger.info("Server created with 3 tools registered");
  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  logger.info("API Oracle MCP server running on stdio");
}
