/**
 * Tests for src/utils/logger.ts — LOG_LEVEL filtering.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createLogger, currentLogLevel } from "../../src/utils/logger.js";

const original = process.env["LOG_LEVEL"];

afterEach(() => {
  if (original === undefined) delete process.env["LOG_LEVEL"];
  else process.env["LOG_LEVEL"] = original;
  vi.restoreAllMocks();
});

function capture(fn: () => void): string[] {
  const lines: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  });
  fn();
  return lines;
}

describe("logger LOG_LEVEL", () => {
  it("defaults to info (debug suppressed)", () => {
    delete process.env["LOG_LEVEL"];
    expect(currentLogLevel()).toBe("info");
    const log = createLogger("t");
    const out = capture(() => {
      log.debug("hidden");
      log.info("shown");
    });
    expect(out.join("")).not.toContain("hidden");
    expect(out.join("")).toContain("shown");
  });

  it("LOG_LEVEL=warn suppresses info, keeps warn and error", () => {
    process.env["LOG_LEVEL"] = "warn";
    const log = createLogger("t");
    const out = capture(() => {
      log.info("info-line");
      log.warn("warn-line");
      log.error("error-line");
    }).join("");
    expect(out).not.toContain("info-line");
    expect(out).toContain("warn-line");
    expect(out).toContain("error-line");
  });

  it("LOG_LEVEL=debug emits debug (case-insensitive)", () => {
    process.env["LOG_LEVEL"] = "DEBUG";
    expect(currentLogLevel()).toBe("debug");
    const out = capture(() => createLogger("t").debug("dbg-line")).join("");
    expect(out).toContain("dbg-line");
  });

  it("unknown LOG_LEVEL values fall back to info (debug suppressed)", () => {
    process.env["LOG_LEVEL"] = "verbose";
    expect(currentLogLevel()).toBe("info");
    const out = capture(() => createLogger("t").debug("dbg-2")).join("");
    expect(out).not.toContain("dbg-2");
  });

  it("always writes to stderr, never stdout (MCP protocol channel)", () => {
    delete process.env["LOG_LEVEL"];
    const stdout = vi.spyOn(process.stdout, "write");
    capture(() => createLogger("t").error("x"));
    expect(stdout).not.toHaveBeenCalled();
  });
});
