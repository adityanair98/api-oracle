/**
 * Configuration — reads environment variables and provides typed defaults.
 *
 * Exports: config (singleton config object)
 */

export interface Config {
  dbPath: string;
  logLevel: string;
  nodeEnv: string;
}

function loadConfig(): Config {
  return {
    dbPath: process.env["DB_PATH"] ?? "./data/api-oracle.db",
    logLevel: process.env["LOG_LEVEL"] ?? "info",
    nodeEnv: process.env["NODE_ENV"] ?? "development",
  };
}

export const config = loadConfig();
