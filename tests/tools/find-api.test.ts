/**
 * Tests for src/tools/find-api.ts
 * Integration tests for the find_best_api MCP tool handler.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { readdirSync, statSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { _setDbForTesting, closeDb, insertEntry } from "../../src/knowledge/db.js";
import { findApis } from "../../src/knowledge/search.js";
import { validateEntry } from "../../src/knowledge/schema.js";
import type { ApiEntry } from "../../src/knowledge/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadAllEntries(): ApiEntry[] {
  const entriesDir = join(__dirname, "../../src/entries");
  const results: ApiEntry[] = [];
  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".json")) {
        const raw = JSON.parse(readFileSync(full, "utf-8")) as unknown;
        const result = validateEntry(raw);
        if (result.success) results.push(result.data);
      }
    }
  }
  walk(entriesDir);
  return results;
}

describe("find_best_api tool (via findApis)", () => {
  beforeEach(() => {
    const memDb = new Database(":memory:");
    _setDbForTesting(memDb);
    for (const entry of loadAllEntries()) {
      insertEntry(entry);
    }
  });

  afterEach(() => {
    closeDb();
  });

  it("returns recommendation for email task", () => {
    const results = findApis("send transactional emails", undefined, 3);
    expect(results.length).toBeGreaterThan(0);
    const topSlug = results[0]!.entry.slug;
    expect(["resend", "sendgrid", "postmark"]).toContain(topSlug);
  });

  it("returns up to 3 alternatives", () => {
    const results = findApis("process payments online", undefined, 3);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("result includes score breakdown", () => {
    const results = findApis("add authentication to my app", undefined, 1);
    expect(results[0]).toBeDefined();
    const breakdown = results[0]!.scoreBreakdown;
    expect(breakdown["useCaseFit"]).toBeDefined();
    expect(breakdown["qualityScore"]).toBeDefined();
    expect(breakdown["devExperience"]).toBeDefined();
    expect(breakdown["pricingFit"]).toBeDefined();
    expect(breakdown["total"]).toBeDefined();
  });

  it("handles no results for nonsense query gracefully", () => {
    // Even for nonsense, scorer will return something from all entries
    // but with low scores
    const results = findApis("quantum-entanglement-api-xyz-9999", undefined, 1);
    // Should not throw, may return low-scored results
    expect(Array.isArray(results)).toBe(true);
  });

  it("preferFree constraint returns freemium APIs", () => {
    const results = findApis("send emails", { preferFree: true }, 3);
    expect(results.length).toBeGreaterThan(0);
    // Top result should have a free tier
    const top = results[0]!.entry;
    expect(["freemium", "free", "open_source"]).toContain(top.pricing.model);
  });

  it("result entries have required fields", () => {
    const results = findApis("store and serve images", undefined, 1);
    expect(results.length).toBeGreaterThan(0);
    const entry = results[0]!.entry;
    expect(entry.name).toBeTruthy();
    expect(entry.slug).toBeTruthy();
    expect(entry.sdk.installCommand).toBeTruthy();
    expect(entry.auth.envVarName).toBeTruthy();
    expect(entry.codeExamples.length).toBeGreaterThan(0);
    expect(entry.gotchas.length).toBeGreaterThanOrEqual(2);
  });
});
