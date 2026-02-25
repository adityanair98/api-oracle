/**
 * SQLite database initialization and query layer.
 * Uses better-sqlite3 for synchronous access (safe in MCP server context).
 * Complex nested objects are stored as JSON columns.
 *
 * Exports: initDb, insertEntry, getBySlug, getByCategory,
 *          searchByText, getAllEntries, deleteBySlug, closeDb
 */

import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { ApiEntrySchema, validateEntry, type ApiEntry } from "./schema.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("db");

// Module-level db instance (singleton)
let db: Database.Database | null = null;

// ─── JSON columns — stored as serialized JSON strings ────────────────────────

const JSON_COLUMNS = [
  "useCases",
  "auth",
  "pricing",
  "rateLimits",
  "sdk",
  "codeExamples",
  "gotchas",
  "reliability",
  "alternatives",
  "complementary",
] as const;

// ─── Schema DDL ───────────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS apis (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT NOT NULL,
    website TEXT NOT NULL,
    description TEXT NOT NULL,
    useCases TEXT NOT NULL,
    auth TEXT NOT NULL,
    pricing TEXT NOT NULL,
    rateLimits TEXT NOT NULL,
    sdk TEXT NOT NULL,
    codeExamples TEXT NOT NULL,
    gotchas TEXT NOT NULL,
    reliability TEXT NOT NULL,
    qualityScore REAL NOT NULL,
    qualityJustification TEXT NOT NULL,
    alternatives TEXT NOT NULL,
    complementary TEXT NOT NULL,
    bestFor TEXT NOT NULL,
    lastVerified TEXT NOT NULL,
    entryVersion INTEGER NOT NULL,
    addedBy TEXT NOT NULL
  );
`;

const CREATE_CATEGORY_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_apis_category ON apis(category);
`;

const CREATE_QUALITY_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_apis_quality ON apis(qualityScore DESC);
`;

// ─── Serialization helpers ────────────────────────────────────────────────────

function serializeEntry(entry: ApiEntry): Record<string, unknown> {
  const row: Record<string, unknown> = { ...entry };
  for (const col of JSON_COLUMNS) {
    row[col] = JSON.stringify(entry[col]);
  }
  return row;
}

function deserializeRow(row: Record<string, unknown>): ApiEntry {
  const deserialized: Record<string, unknown> = { ...row };
  for (const col of JSON_COLUMNS) {
    if (typeof deserialized[col] === "string") {
      deserialized[col] = JSON.parse(deserialized[col] as string) as unknown;
    }
  }
  const result = ApiEntrySchema.safeParse(deserialized);
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message).join(", ");
    throw new Error(`Stored entry is invalid: ${issues}`);
  }
  return result.data;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initDb(dbPath: string = "./data/api-oracle.db"): void {
  if (db) return; // already initialized
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(CREATE_TABLE_SQL);
  db.exec(CREATE_CATEGORY_INDEX_SQL);
  db.exec(CREATE_QUALITY_INDEX_SQL);
  logger.info("Database initialized", { dbPath });
}

export function getDb(): Database.Database {
  if (!db) throw new Error("Database not initialized — call initDb() first");
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/** Allows tests to inject their own in-memory database instance */
export function _setDbForTesting(testDb: Database.Database): void {
  testDb.exec(CREATE_TABLE_SQL);
  testDb.exec(CREATE_CATEGORY_INDEX_SQL);
  testDb.exec(CREATE_QUALITY_INDEX_SQL);
  db = testDb;
}

export function insertEntry(entry: ApiEntry): void {
  const validation = validateEntry(entry);
  if (!validation.success) {
    throw new Error(`Invalid entry: ${validation.errors.join("; ")}`);
  }
  const row = serializeEntry(validation.data);
  const database = getDb();

  const columns = Object.keys(row);
  const placeholders = columns.map((c) => `@${c}`).join(", ");
  const sql = `INSERT INTO apis (${columns.join(", ")}) VALUES (${placeholders})`;

  const stmt = database.prepare(sql);
  stmt.run(row);
  logger.info("Inserted entry", { slug: entry.slug });
}

export function getBySlug(slug: string): ApiEntry | null {
  const database = getDb();
  const row = database
    .prepare("SELECT * FROM apis WHERE slug = ?")
    .get(slug) as Record<string, unknown> | undefined;
  if (!row) return null;
  return deserializeRow(row);
}

export function getByCategory(category: string): ApiEntry[] {
  const database = getDb();
  const rows = database
    .prepare("SELECT * FROM apis WHERE category = ? ORDER BY qualityScore DESC")
    .all(category) as Record<string, unknown>[];
  return rows.map(deserializeRow);
}

export function searchByText(query: string): ApiEntry[] {
  const database = getDb();
  const pattern = `%${query}%`;
  // Search across name, description, subcategory, bestFor, and JSON-encoded useCases
  const rows = database
    .prepare(
      `SELECT * FROM apis
       WHERE name LIKE ?
          OR description LIKE ?
          OR subcategory LIKE ?
          OR bestFor LIKE ?
          OR useCases LIKE ?
          OR category LIKE ?
       ORDER BY qualityScore DESC`
    )
    .all(pattern, pattern, pattern, pattern, pattern, pattern) as Record<string, unknown>[];
  return rows.map(deserializeRow);
}

export function getAllEntries(): ApiEntry[] {
  const database = getDb();
  const rows = database
    .prepare("SELECT * FROM apis ORDER BY qualityScore DESC")
    .all() as Record<string, unknown>[];
  return rows.map(deserializeRow);
}

export function deleteBySlug(slug: string): void {
  const database = getDb();
  database.prepare("DELETE FROM apis WHERE slug = ?").run(slug);
  logger.info("Deleted entry", { slug });
}

export function slugExists(slug: string): boolean {
  const database = getDb();
  const row = database
    .prepare("SELECT 1 FROM apis WHERE slug = ?")
    .get(slug) as { "1": number } | undefined;
  return row !== undefined;
}
