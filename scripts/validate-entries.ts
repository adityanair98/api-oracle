/**
 * Validate script — reads all JSON entries from src/entries/ and validates
 * against the Zod schema. Does NOT write to the database.
 * Exits with code 1 if any entry fails (useful for CI).
 *
 * Usage: npm run validate
 */

import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";
import { validateEntry } from "../src/knowledge/schema.js";

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
  const entriesDir = join(process.cwd(), "src", "entries");

  let files: string[];
  try {
    files = findJsonFiles(entriesDir);
  } catch {
    process.stderr.write(`ERROR: could not read entries directory at ${entriesDir}\n`);
    process.exit(1);
  }

  if (files.length === 0) {
    process.stdout.write("No JSON files found in src/entries/\n");
    process.exit(0);
  }

  let valid = 0;
  let invalid = 0;

  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf-8")) as unknown;
    } catch (e) {
      process.stderr.write(`ERROR parsing JSON in ${file}: ${String(e)}\n`);
      invalid++;
      continue;
    }

    const result = validateEntry(raw);
    if (result.success) {
      process.stdout.write(`  ✓ ${result.data.slug} — ${file}\n`);
      valid++;
    } else {
      process.stderr.write(`  ✗ INVALID — ${file}\n`);
      for (const err of result.errors) {
        process.stderr.write(`      ${err}\n`);
      }
      invalid++;
    }
  }

  process.stdout.write(`\nValidation: ${valid} valid, ${invalid} invalid\n`);

  if (invalid > 0) {
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`Fatal: ${String(e)}\n`);
  process.exit(1);
});
