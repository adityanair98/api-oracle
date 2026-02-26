/**
 * Validate script — reads all JSON entries from src/entries/ and validates
 * against the Zod schema. Does NOT write to the database.
 * Exits with code 1 if any entry fails (useful for CI).
 *
 * Also performs cross-reference validation: ensures every slug listed in
 * "alternatives" and "complementary" exists as an entry.
 *
 * Usage: npm run validate
 */

import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";
import { validateEntry } from "../src/knowledge/schema.js";
import type { ApiEntry } from "../src/knowledge/schema.js";

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

  let schemaValid = 0;
  let schemaInvalid = 0;
  const validEntries: ApiEntry[] = [];

  // Phase 1: Schema validation
  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf-8")) as unknown;
    } catch (e) {
      process.stderr.write(`ERROR parsing JSON in ${file}: ${String(e)}\n`);
      schemaInvalid++;
      continue;
    }

    const result = validateEntry(raw);
    if (result.success) {
      process.stdout.write(`  ✓ ${result.data.slug} — ${file}\n`);
      schemaValid++;
      validEntries.push(result.data);
    } else {
      process.stderr.write(`  ✗ INVALID — ${file}\n`);
      for (const err of result.errors) {
        process.stderr.write(`      ${err}\n`);
      }
      schemaInvalid++;
    }
  }

  // Phase 2: Cross-reference validation
  const allSlugs = new Set(validEntries.map((e) => e.slug));
  let xrefErrors = 0;

  process.stdout.write(`\nCross-reference check:\n`);
  for (const entry of validEntries) {
    const badAlts = entry.alternatives.filter((s) => !allSlugs.has(s));
    const badComps = entry.complementary.filter((s) => !allSlugs.has(s));

    if (badAlts.length > 0) {
      process.stderr.write(
        `  ✗ ${entry.slug}: unknown alternative slugs: ${badAlts.join(", ")}\n`
      );
      xrefErrors++;
    }
    if (badComps.length > 0) {
      process.stderr.write(
        `  ✗ ${entry.slug}: unknown complementary slugs: ${badComps.join(", ")}\n`
      );
      xrefErrors++;
    }
  }

  if (xrefErrors === 0) {
    process.stdout.write(`  ✓ All cross-references resolve to valid slugs\n`);
  }

  process.stdout.write(
    `\nValidation: ${schemaValid} valid, ${schemaInvalid} invalid, ${xrefErrors} cross-reference errors\n`
  );

  if (schemaInvalid > 0 || xrefErrors > 0) {
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`Fatal: ${String(e)}\n`);
  process.exit(1);
});
