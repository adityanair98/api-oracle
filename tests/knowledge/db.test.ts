/**
 * Tests for src/knowledge/db.ts
 * Uses in-memory SQLite database (:memory:) to avoid filesystem side effects.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  _setDbForTesting,
  closeDb,
  insertEntry,
  getBySlug,
  getByCategory,
  searchByText,
  getAllEntries,
  deleteBySlug,
  slugExists,
} from "../../src/knowledge/db.js";
import type { ApiEntry } from "../../src/knowledge/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(): ApiEntry {
  const fixturePath = join(__dirname, "../fixtures/sample-entry.json");
  return JSON.parse(readFileSync(fixturePath, "utf-8")) as ApiEntry;
}

function makeEntry(overrides: Partial<ApiEntry> = {}): ApiEntry {
  return { ...loadFixture(), ...overrides };
}

describe("Database layer", () => {
  beforeEach(() => {
    // Fresh in-memory database for each test
    const memDb = new Database(":memory:");
    _setDbForTesting(memDb);
  });

  afterEach(() => {
    closeDb();
  });

  it("database initializes with the apis table", () => {
    // If _setDbForTesting didn't throw, table was created
    expect(() => getAllEntries()).not.toThrow();
    expect(getAllEntries()).toEqual([]);
  });

  it("inserts and retrieves entry by slug", () => {
    const entry = loadFixture();
    insertEntry(entry);
    const retrieved = getBySlug(entry.slug);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.slug).toBe(entry.slug);
    expect(retrieved?.name).toBe(entry.name);
    expect(retrieved?.qualityScore).toBe(entry.qualityScore);
  });

  it("getBySlug returns null for unknown slug", () => {
    expect(getBySlug("nonexistent-slug")).toBeNull();
  });

  it("insertEntry validates with Zod before inserting", () => {
    const badEntry = { slug: "bad" } as unknown as ApiEntry;
    expect(() => insertEntry(badEntry)).toThrow("Invalid entry");
  });

  it("getByCategory returns matching entries sorted by qualityScore DESC", () => {
    const entry1 = makeEntry({ slug: "resend", qualityScore: 9 });
    const entry2 = makeEntry({ slug: "sendgrid", qualityScore: 7 });
    insertEntry(entry1);
    insertEntry(entry2);

    const emailApis = getByCategory("email");
    expect(emailApis).toHaveLength(2);
    expect(emailApis[0]!.slug).toBe("resend"); // higher score first
    expect(emailApis[1]!.slug).toBe("sendgrid");
  });

  it("getByCategory returns empty array for unknown category", () => {
    expect(getByCategory("maps")).toEqual([]);
  });

  it("searchByText finds entries by name", () => {
    insertEntry(loadFixture());
    const results = searchByText("Resend");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.slug).toBe("resend");
  });

  it("searchByText finds entries by description keyword", () => {
    insertEntry(loadFixture());
    const results = searchByText("transactional");
    expect(results.length).toBeGreaterThan(0);
  });

  it("searchByText returns empty array when no match", () => {
    insertEntry(loadFixture());
    const results = searchByText("quantum-blockchain-xyz-9999");
    expect(results).toEqual([]);
  });

  it("getAllEntries returns all inserted entries", () => {
    const e1 = makeEntry({ slug: "resend" });
    const e2 = makeEntry({ slug: "postmark" });
    insertEntry(e1);
    insertEntry(e2);
    const all = getAllEntries();
    expect(all).toHaveLength(2);
  });

  it("duplicate slug throws on insert", () => {
    const entry = loadFixture();
    insertEntry(entry);
    expect(() => insertEntry(entry)).toThrow();
  });

  it("slugExists returns true for existing slug", () => {
    insertEntry(loadFixture());
    expect(slugExists("resend")).toBe(true);
  });

  it("slugExists returns false for nonexistent slug", () => {
    expect(slugExists("unknown-api")).toBe(false);
  });

  it("deleteBySlug removes the entry", () => {
    const entry = loadFixture();
    insertEntry(entry);
    expect(getBySlug(entry.slug)).not.toBeNull();
    deleteBySlug(entry.slug);
    expect(getBySlug(entry.slug)).toBeNull();
  });

  it("deserializes JSON columns correctly on retrieval", () => {
    const entry = loadFixture();
    insertEntry(entry);
    const retrieved = getBySlug(entry.slug);
    expect(retrieved).not.toBeNull();
    // JSON columns should be parsed back to objects/arrays
    expect(Array.isArray(retrieved?.useCases)).toBe(true);
    expect(Array.isArray(retrieved?.gotchas)).toBe(true);
    expect(typeof retrieved?.auth).toBe("object");
    expect(typeof retrieved?.pricing).toBe("object");
    expect(retrieved?.useCases[0]!.task).toBe(entry.useCases[0]!.task);
  });
});
