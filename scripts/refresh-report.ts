/**
 * Refresh Report — CLI script that checks all entries for staleness
 * and prints a freshness report to stdout.
 *
 * Usage:
 *   npm run refresh-report
 *   npm run refresh-report -- --format=json
 *   npm run refresh-report -- --level=stale    (only show stale/critical)
 */

import { readdirSync, statSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { validateEntry } from "../src/knowledge/schema.js";
import type { ApiEntry } from "../src/knowledge/schema.js";
import { checkAllEntries } from "../src/updater/staleness.js";
import { buildSnapshot, diffSnapshot } from "../src/updater/version-tracker.js";
import { buildFreshnessReport, formatReport, formatBriefSummary } from "../src/updater/report.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadAllEntries(): ApiEntry[] {
  const entriesDir = join(__dirname, "../src/entries");
  const results: ApiEntry[] = [];

  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith(".json")) {
        const raw = JSON.parse(readFileSync(full, "utf-8")) as unknown;
        const result = validateEntry(raw);
        if (result.success) {
          results.push(result.data);
        } else {
          process.stderr.write(`  Skipping invalid entry ${name}: ${result.errors[0]}\n`);
        }
      }
    }
  }

  walk(entriesDir);
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const formatArg = args.find((a) => a.startsWith("--format="))?.split("=")[1] ?? "markdown";
const levelArg = args.find((a) => a.startsWith("--level="))?.split("=")[1];
const briefFlag = args.includes("--brief");

const entries = loadAllEntries();

// Build staleness info (sorted most-stale first)
const allInfos = checkAllEntries(entries);

// Build version diffs against a trivial "no previous snapshot" baseline
// (a real deployment would persist the snapshot between runs)
const emptySnapshot = buildSnapshot([]);
const versionDiffs = diffSnapshot(entries, emptySnapshot);
// For display, only show "new" diffs in the report (all are "new" since empty snapshot)
const newEntries = versionDiffs.slice(0, 5); // Show only last 5 newest

const report = buildFreshnessReport(allInfos, newEntries);

// Apply optional level filter
if (levelArg) {
  const validLevels = ["fresh", "aging", "stale", "critical"] as const;
  type Level = typeof validLevels[number];
  if (!validLevels.includes(levelArg as Level)) {
    process.stderr.write(`Invalid --level value: ${levelArg}. Must be one of: ${validLevels.join(", ")}\n`);
    process.exit(1);
  }
  report.staleEntries = report.staleEntries.filter((e) => e.level === levelArg);
}

if (briefFlag) {
  process.stdout.write(formatBriefSummary(report) + "\n");
  process.exit(0);
}

if (formatArg === "json") {
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} else {
  process.stdout.write(formatReport(report) + "\n");
}
