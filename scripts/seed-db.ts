/**
 * Seed script — reads all JSON entries from src/entries/, validates against
 * the Zod schema, and loads valid entries into the SQLite database.
 *
 * Usage: npm run seed
 * Output: X entries loaded, Y skipped (duplicate slug), Z errors
 */

import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";
import { initDb, insertEntry, slugExists } from "../src/knowledge/db.js";
import { validateEntry } from "../src/knowledge/schema.js";
import { config } from "../src/utils/config.js";

function findJsonFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findJsonFiles(full));
    } else if (entry.endsWith(".json")) {
      results.push(full);
    }
  }
  return results;
}

async function main(): Promise<void> {
  initDb(config.dbPath);

  const entriesDir = join(process.cwd(), "src", "entries");
  const files = findJsonFiles(entriesDir);

  let loaded = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf-8")) as unknown;
    } catch (e) {
      process.stderr.write(`ERROR parsing JSON in ${file}: ${String(e)}\n`);
      errors++;
      continue;
    }

    const validation = validateEntry(raw);
    if (!validation.success) {
      process.stderr.write(`ERROR in ${file}:\n`);
      for (const err of validation.errors) {
        process.stderr.write(`  - ${err}\n`);
      }
      errors++;
      continue;
    }

    const entry = validation.data;
    if (slugExists(entry.slug)) {
      process.stderr.write(`SKIP ${entry.slug} (duplicate slug) — ${file}\n`);
      skipped++;
      continue;
    }

    try {
      insertEntry(entry);
      process.stdout.write(`  ✓ ${entry.slug} (${entry.category})\n`);
      loaded++;
    } catch (e) {
      process.stderr.write(`ERROR inserting ${entry.slug}: ${String(e)}\n`);
      errors++;
    }
  }

  process.stdout.write(
    `\nDone: ${loaded} loaded, ${skipped} skipped, ${errors} errors\n`
  );

  if (errors > 0) {
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`Fatal: ${String(e)}\n`);
  process.exit(1);
});
