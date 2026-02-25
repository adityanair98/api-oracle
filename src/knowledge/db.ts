/**
 * SQLite database initialization and query layer.
 * Uses better-sqlite3 for synchronous access (safe in MCP context).
 *
 * Exports: initDb, insertEntry, getBySlug, getByCategory, searchByText, getAllEntries, deleteBySlug
 */

import type { ApiEntry } from "./schema.js";

// Stub — full implementation in Phase 4
export function initDb(_dbPath?: string): void {
  throw new Error("Not implemented");
}

export function insertEntry(_entry: ApiEntry): void {
  throw new Error("Not implemented");
}

export function getBySlug(_slug: string): ApiEntry | null {
  throw new Error("Not implemented");
}

export function getByCategory(_category: string): ApiEntry[] {
  throw new Error("Not implemented");
}

export function searchByText(_query: string): ApiEntry[] {
  throw new Error("Not implemented");
}

export function getAllEntries(): ApiEntry[] {
  throw new Error("Not implemented");
}

export function deleteBySlug(_slug: string): void {
  throw new Error("Not implemented");
}
