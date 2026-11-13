/**
 * Seed script — writes the bundled JSON entries (src/entries/) to a SQLite
 * FILE so it can be inspected with external tools.
 *
 * You do NOT need this to run the server: `serve` and `dashboard` load the
 * bundled entries into an in-memory database at startup.
 *
 * Usage: npm run seed            (writes ./data/api-oracle.db)
 *        DB_PATH=/tmp/x.db npm run seed
 * Output: X entries loaded, Y skipped (invalid or duplicate)
 */

import { bootstrapKnowledgeBase } from "../src/knowledge/loader.js";

const dbPath = process.env["DB_PATH"]?.trim() || "./data/api-oracle.db";
const result = bootstrapKnowledgeBase({ dbPath });

for (const s of result.skipped) {
  process.stderr.write(`SKIP ${s.file}: ${s.reason}\n`);
}
process.stdout.write(
  `\nDone: ${result.loaded} loaded, ${result.skipped.length} skipped, ${result.totalInDb} rows in ${dbPath}\n`
);

if (result.skipped.length > 0) {
  process.exit(1);
}
