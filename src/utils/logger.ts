/**
 * Simple structured logger — no external dependencies.
 * Writes to stderr so MCP stdout stays clean for protocol messages.
 *
 * Exports: logger (default instance), createLogger, currentLogLevel
 * Respects LOG_LEVEL (default: info).
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

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Minimum level to emit, from LOG_LEVEL (debug | info | warn | error).
 * Read on each call so it can be changed at runtime/tests. Default: info.
 */
export function currentLogLevel(): LogLevel {
  const raw = (process.env["LOG_LEVEL"] ?? "info").trim().toLowerCase();
  return raw in LEVEL_ORDER ? (raw as LogLevel) : "info";
}

function createLogger(namespace: string) {
  function log(level: LogLevel, message: string, data?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLogLevel()]) return;
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
