/**
 * Simple structured logger — no external dependencies.
 * Writes to stderr so MCP stdout stays clean for protocol messages.
 *
 * Exports: logger (default instance), createLogger
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: unknown;
}

function formatEntry(entry: LogEntry): string {
  const base = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`;
  if (entry.data !== undefined) {
    return `${base} ${JSON.stringify(entry.data)}`;
  }
  return base;
}

function createLogger(namespace: string) {
  function log(level: LogLevel, message: string, data?: unknown): void {
    const entry: LogEntry = {
      level,
      message: namespace ? `[${namespace}] ${message}` : message,
      timestamp: new Date().toISOString(),
      data,
    };
    process.stderr.write(formatEntry(entry) + "\n");
  }

  return {
    debug: (message: string, data?: unknown) => log("debug", message, data),
    info: (message: string, data?: unknown) => log("info", message, data),
    warn: (message: string, data?: unknown) => log("warn", message, data),
    error: (message: string, data?: unknown) => log("error", message, data),
  };
}

export type Logger = ReturnType<typeof createLogger>;
export { createLogger };
export const logger = createLogger("api-oracle");
