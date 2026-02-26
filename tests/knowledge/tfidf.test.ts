/**
 * Tests for src/knowledge/tfidf.ts
 * Covers TfIdfEngine build, search, and module-level singleton helpers.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { _setDbForTesting, closeDb, insertEntry } from "../../src/knowledge/db.js";
import { validateEntry } from "../../src/knowledge/schema.js";
import type { ApiEntry } from "../../src/knowledge/schema.js";
import { TfIdfEngine, getTfIdfEngine, resetTfIdfEngine } from "../../src/knowledge/tfidf.js";

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

describe("TfIdfEngine", () => {
  let allEntries: ApiEntry[];
  let engine: TfIdfEngine;

  beforeEach(() => {
    allEntries = loadAllEntries();
    engine = new TfIdfEngine();
    const memDb = new Database(":memory:");
    _setDbForTesting(memDb);
    for (const entry of allEntries) {
      insertEntry(entry);
    }
  });

  afterEach(() => {
    closeDb();
    resetTfIdfEngine();
  });

  it("is not built before build() is called", () => {
    expect(engine.isBuilt).toBe(false);
    expect(engine.size).toBe(0);
  });

  it("builds from entries and reports correct size", () => {
    engine.build(allEntries);
    expect(engine.isBuilt).toBe(true);
    expect(engine.size).toBe(35);
  });

  it("returns empty array before build", () => {
    const results = engine.search("send emails");
    expect(results).toEqual([]);
  });

  it("returns empty array for empty query after build", () => {
    engine.build(allEntries);
    expect(engine.search("")).toEqual([]);
    expect(engine.search("   ")).toEqual([]);
  });

  it("'send transactional emails' returns email APIs in top results", () => {
    engine.build(allEntries);
    const results = engine.search("send transactional emails", 5);
    const slugs = results.map((e) => e.slug);
    const hasEmailApi = slugs.some((s) => ["resend", "sendgrid", "postmark"].includes(s));
    expect(hasEmailApi).toBe(true);
  });

  it("'process payments stripe checkout' returns payment APIs", () => {
    engine.build(allEntries);
    const results = engine.search("process payments stripe checkout", 5);
    const slugs = results.map((e) => e.slug);
    const hasPaymentApi = slugs.some((s) => ["stripe", "razorpay"].includes(s));
    expect(hasPaymentApi).toBe(true);
  });

  it("'add user authentication oauth' returns auth APIs", () => {
    engine.build(allEntries);
    const results = engine.search("add user authentication oauth", 5);
    const slugs = results.map((e) => e.slug);
    const hasAuthApi = slugs.some((s) => ["clerk", "auth0"].includes(s));
    expect(hasAuthApi).toBe(true);
  });

  it("'stream video on demand' returns mux", () => {
    engine.build(allEntries);
    const results = engine.search("stream video on demand", 5);
    const slugs = results.map((e) => e.slug);
    expect(slugs).toContain("mux");
  });

  it("'error tracking production crashes sentry' returns analytics APIs", () => {
    engine.build(allEntries);
    const results = engine.search("error tracking production crashes sentry", 5);
    const slugs = results.map((e) => e.slug);
    const hasMonitoring = slugs.some((s) => ["sentry", "posthog"].includes(s));
    expect(hasMonitoring).toBe(true);
  });

  it("respects topN parameter", () => {
    engine.build(allEntries);
    const results3 = engine.search("send emails", 3);
    expect(results3.length).toBeLessThanOrEqual(3);

    const results10 = engine.search("send emails", 10);
    expect(results10.length).toBeLessThanOrEqual(10);
    expect(results10.length).toBeGreaterThanOrEqual(results3.length);
  });

  it("handles nonsense query without throwing", () => {
    engine.build(allEntries);
    const results = engine.search("xyzzy-quantum-frobnicator-42");
    expect(Array.isArray(results)).toBe(true);
    // No documents should match a nonsense query
    expect(results.length).toBe(0);
  });

  it("can be rebuilt with the same entries", () => {
    engine.build(allEntries);
    expect(engine.isBuilt).toBe(true);
    engine.build(allEntries); // rebuild
    expect(engine.isBuilt).toBe(true);
    expect(engine.size).toBe(35);
  });
});

describe("getTfIdfEngine / resetTfIdfEngine singleton", () => {
  afterEach(() => {
    resetTfIdfEngine();
    closeDb();
  });

  it("getTfIdfEngine returns a TfIdfEngine instance", () => {
    const engine = getTfIdfEngine();
    expect(engine).toBeInstanceOf(TfIdfEngine);
  });

  it("returns the same instance on repeated calls", () => {
    const a = getTfIdfEngine();
    const b = getTfIdfEngine();
    expect(a).toBe(b);
  });

  it("resetTfIdfEngine causes getTfIdfEngine to return a new instance", () => {
    const a = getTfIdfEngine();
    resetTfIdfEngine();
    const b = getTfIdfEngine();
    expect(a).not.toBe(b);
  });

  it("new instance after reset is not built", () => {
    getTfIdfEngine();
    resetTfIdfEngine();
    const fresh = getTfIdfEngine();
    expect(fresh.isBuilt).toBe(false);
  });
});
