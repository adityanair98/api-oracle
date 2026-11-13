/**
 * Knowledge-base loader — reads the bundled JSON entries that ship with the
 * package (src/entries/<category>/<slug>.json), validates each one, and loads
 * them into the SQLite database at startup.
 *
 * The entries directory is resolved relative to this compiled module
 * (import.meta.url), never the process cwd, so running the package via npx
 * works from any folder.
 *
 * Exports: resolveEntriesDir, loadEntriesFromDir, bootstrapKnowledgeBase,
 *          LoadResult, SkippedEntry, BootstrapResult
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";
import { initDb, upsertEntries, countEntries } from "./db.js";
import { validateEntry, type ApiEntry } from "./schema.js";
import { resetTfIdfEngine } from "./tfidf.js";
import { config } from "../utils/config.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("loader");

export interface SkippedEntry {
  file: string;
  reason: string;
}

export interface LoadResult {
  dir: string;
  entries: ApiEntry[];
  skipped: SkippedEntry[];
}

export interface BootstrapResult {
  dbPath: string;
  entriesDir: string;
  loaded: number;
  skipped: SkippedEntry[];
  totalInDb: number;
}

/**
 * Absolute path of the bundled entries directory.
 *
 * This module lives two levels below the package root in both layouts:
 *   <pkg>/dist/knowledge/loader.js   (compiled, what npm users run)
 *   <pkg>/src/knowledge/loader.ts    (tsx, local development)
 * and package.json "files" ships the entries at <pkg>/src/entries.
 */
export function resolveEntriesDir(): string {
  return fileURLToPath(new URL("../../src/entries/", import.meta.url));
}

function findJsonFiles(dir: string): string[] {
  const results: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      results.push(...findJsonFiles(full));
    } else if (name.endsWith(".json")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Read and validate every JSON entry under `dir`.
 * Invalid JSON, schema failures and duplicate slugs are skipped (and reported),
 * never thrown — one bad entry must not take the server down.
 */
export function loadEntriesFromDir(dir: string): LoadResult {
  if (!existsSync(dir)) {
    throw new Error(`Entries directory not found: ${dir}`);
  }

  const entries: ApiEntry[] = [];
  const skipped: SkippedEntry[] = [];
  const seen = new Map<string, string>();

  for (const file of findJsonFiles(dir)) {
    const rel = relative(dir, file);

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf-8")) as unknown;
    } catch (e) {
      skipped.push({ file: rel, reason: `invalid JSON: ${String(e)}` });
      continue;
    }

    const validation = validateEntry(raw);
    if (!validation.success) {
      skipped.push({ file: rel, reason: `schema: ${validation.errors.slice(0, 3).join("; ")}` });
      continue;
    }

    const entry = validation.data;
    const firstFile = seen.get(entry.slug);
    if (firstFile) {
      skipped.push({ file: rel, reason: `duplicate slug "${entry.slug}" (already loaded from ${firstFile})` });
      continue;
    }

    seen.set(entry.slug, rel);
    entries.push(entry);
  }

  return { dir, entries, skipped };
}

/**
 * Open the database and load the bundled entries into it.
 *
 * - Default (DB_PATH unset): an in-memory database, rebuilt on every start, so
 *   no file is ever written to the user's working directory.
 * - DB_PATH set explicitly: that file is opened and the bundled entries are
 *   upserted into it (bundled data wins for matching slugs; other rows are kept).
 */
export function bootstrapKnowledgeBase(
  options: { dbPath?: string; entriesDir?: string } = {}
): BootstrapResult {
  const dbPath = options.dbPath ?? config.dbPath;
  const entriesDir = options.entriesDir ?? resolveEntriesDir();

  initDb(dbPath);

  const { entries, skipped } = loadEntriesFromDir(entriesDir);
  for (const s of skipped) {
    logger.warn("Skipped invalid entry", s);
  }

  const loaded = upsertEntries(entries);
  // The TF-IDF index is built lazily from the DB — force a rebuild.
  resetTfIdfEngine();

  const totalInDb = countEntries();
  logger.info("Knowledge base loaded", {
    loaded,
    skipped: skipped.length,
    totalInDb,
    dbPath,
  });

  if (totalInDb === 0) {
    logger.error("Knowledge base is empty — find_best_api will return no results", {
      entriesDir,
    });
  }

  return { dbPath, entriesDir, loaded, skipped, totalInDb };
}
