/**
 * Entry point — initializes database and starts the MCP server.
 * Run with: npm run dev (tsx) or node dist/index.js (compiled)
 */

// Stub — full implementation in Phase 7
async function main(): Promise<void> {
  throw new Error("Not implemented");
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
