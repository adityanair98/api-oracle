/**
 * Tests for src/knowledge/loader.ts — bundled entry loading at startup.
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  resolveEntriesDir,
  loadEntriesFromDir,
  bootstrapKnowledgeBase,
} from "../../src/knowledge/loader.js";
import { closeDb, countEntries, getBySlug, initDb, insertEntry } from "../../src/knowledge/db.js";
import { resetTfIdfEngine } from "../../src/knowledge/tfidf.js";
import { findApis } from "../../src/knowledge/search.js";
import type { ApiEntry } from "../../src/knowledge/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(
  readFileSync(join(__dirname, "../fixtures/sample-entry.json"), "utf-8")
) as ApiEntry;

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "api-oracle-loader-"));
});

afterEach(() => {
  closeDb();
  resetTfIdfEngine();
  rmSync(tmp, { recursive: true, force: true });
});

describe("resolveEntriesDir", () => {
  it("points at the bundled src/entries directory, independent of cwd", () => {
    const dir = resolveEntriesDir();
    expect(dir).toBe(join(__dirname, "../../src/entries/"));
    expect(existsSync(join(dir, "email", "resend.json"))).toBe(true);
  });
});

describe("loadEntriesFromDir", () => {
  it("loads all 68 bundled entries with nothing skipped", () => {
    const { entries, skipped } = loadEntriesFromDir(resolveEntriesDir());
    expect(entries.length).toBe(68);
    expect(skipped).toEqual([]);
  });

  it("skips invalid JSON, schema failures and duplicate slugs without throwing", () => {
    mkdirSync(join(tmp, "email"));
    writeFileSync(join(tmp, "email", "good.json"), JSON.stringify(sample));
    writeFileSync(join(tmp, "email", "zz-duplicate.json"), JSON.stringify(sample));
    writeFileSync(join(tmp, "email", "broken.json"), "{ not json");
    writeFileSync(
      join(tmp, "email", "bad-schema.json"),
      JSON.stringify({ ...sample, slug: "Bad Slug", qualityScore: 42 })
    );

    const { entries, skipped } = loadEntriesFromDir(tmp);

    expect(entries.map((e) => e.slug)).toEqual([sample.slug]);
    expect(skipped).toHaveLength(3);
    const reasons = Object.fromEntries(skipped.map((s) => [s.file, s.reason]));
    expect(reasons[join("email", "broken.json")]).toMatch(/invalid JSON/);
    expect(reasons[join("email", "bad-schema.json")]).toMatch(/schema/);
    expect(reasons[join("email", "zz-duplicate.json")]).toMatch(/duplicate slug/);
  });

  it("throws a clear error when the directory does not exist", () => {
    expect(() => loadEntriesFromDir(join(tmp, "missing"))).toThrow(/Entries directory not found/);
  });
});

describe("bootstrapKnowledgeBase", () => {
  it("loads bundled entries into an in-memory DB and makes find_best_api work", () => {
    const result = bootstrapKnowledgeBase({ dbPath: ":memory:" });
    expect(result.loaded).toBe(68);
    expect(result.totalInDb).toBe(68);

    const top = findApis("send transactional emails", undefined, 3)[0];
    expect(top).toBeDefined();
    expect(top!.entry.category).toBe("email");
  });

  it("still starts when some entries are invalid", () => {
    writeFileSync(join(tmp, "good.json"), JSON.stringify(sample));
    writeFileSync(join(tmp, "bad.json"), JSON.stringify({ name: "x" }));
    const result = bootstrapKnowledgeBase({ dbPath: ":memory:", entriesDir: tmp });
    expect(result.loaded).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(countEntries()).toBe(1);
  });

  it("with an explicit DB file, upserts bundled entries and keeps other rows", () => {
    const dbFile = join(tmp, "custom", "oracle.db");

    // Pre-existing file: one stale copy of a bundled entry + one custom entry
    initDb(dbFile);
    insertEntry({ ...sample, slug: "resend", name: "Stale Resend", category: "email" });
    insertEntry({ ...sample, slug: "my-internal-api" });
    closeDb();

    const result = bootstrapKnowledgeBase({ dbPath: dbFile });
    expect(result.loaded).toBe(68);
    expect(result.totalInDb).toBe(69);
    expect(getBySlug("resend")?.name).toBe("Resend"); // bundled data wins
    expect(getBySlug("my-internal-api")).not.toBeNull(); // custom row kept
  });
});
