/**
 * Configuration — reads environment variables and provides typed defaults.
 *
 * Exports: config (singleton config object)
 */

export interface Config {
  /** ":memory:" unless DB_PATH is set explicitly */
  dbPath: string;
  logLevel: string;
  nodeEnv: string;
}

function loadConfig(): Config {
  const explicitDbPath = process.env["DB_PATH"]?.trim();
  return {
    // Default: in-memory DB loaded from the bundled entries at startup, so
    // nothing is written to the user's working directory.
    dbPath: explicitDbPath ? explicitDbPath : ":memory:",
    logLevel: process.env["LOG_LEVEL"] ?? "info",
    nodeEnv: process.env["NODE_ENV"] ?? "development",
  };
}

export const config = loadConfig();
