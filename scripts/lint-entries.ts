/**
 * Entry quality linter CLI script.
 * Lints all JSON entries for content quality issues beyond schema validation.
 *
 * Usage:
 *   npm run lint-entries
 *   npm run lint-entries -- --severity=warning   (show only warnings+)
 *   npm run lint-entries -- --slug=stripe        (lint specific entry)
 *   npm run lint-entries -- --summary            (show counts only)
 */

import { readdirSync, statSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { validateEntry } from "../src/knowledge/schema.js";
import type { ApiEntry } from "../src/knowledge/schema.js";
import { lintAllEntries, lintEntry } from "../src/updater/linter.js";
import type { LintSeverity } from "../src/updater/linter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadAllEntries(): ApiEntry[] {
  const entriesDir = join(__dirname, "../src/entries");
  const results: ApiEntry[] = [];
  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".json")) {
        const raw = JSON.parse(readFileSync(full, "utf-8")) as unknown;
        const result = validateEntry(raw);
        if (result.success) results.push(result.data);
      }
    }
  }
  walk(entriesDir);
  return results;
}

const SEVERITY_ICON: Record<LintSeverity, string> = {
  error: "🔴",
  warning: "🟡",
  info: "💡",
};

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const severityFilter = (args.find((a) => a.startsWith("--severity="))?.split("=")[1] ?? "info") as LintSeverity;
const slugFilter = args.find((a) => a.startsWith("--slug="))?.split("=")[1];
const summaryOnly = args.includes("--summary");

const SEVERITY_RANK: Record<LintSeverity, number> = { error: 3, warning: 2, info: 1 };
const minRank = SEVERITY_RANK[severityFilter] ?? 1;

// ─── Run ─────────────────────────────────────────────────────────────────────

const allEntries = loadAllEntries();
let entries = allEntries;

if (slugFilter) {
  entries = allEntries.filter((e) => e.slug === slugFilter);
  if (entries.length === 0) {
    process.stderr.write(`No entry found with slug: ${slugFilter}\n`);
    process.exit(1);
  }
}

const results = lintAllEntries(entries);

// Apply severity filter
const filtered = results.map((r) => ({
  ...r,
  issues: r.issues.filter((i) => (SEVERITY_RANK[i.severity] ?? 0) >= minRank),
}));

// Summary stats
const totalIssues = filtered.reduce((sum, r) => sum + r.issues.length, 0);
const errorCount = filtered.reduce((sum, r) => sum + r.issues.filter((i) => i.severity === "error").length, 0);
const warningCount = filtered.reduce((sum, r) => sum + r.issues.filter((i) => i.severity === "warning").length, 0);
const infoCount = filtered.reduce((sum, r) => sum + r.issues.filter((i) => i.severity === "info").length, 0);
const passedCount = filtered.filter((r) => r.issues.length === 0).length;

if (summaryOnly) {
  process.stdout.write(`Lint summary (${entries.length} entries):\n`);
  process.stdout.write(`  ${errorCount} errors, ${warningCount} warnings, ${infoCount} info\n`);
  process.stdout.write(`  ${passedCount}/${entries.length} entries with no ${severityFilter}+ issues\n`);
  process.exit(errorCount > 0 ? 1 : 0);
}

// Detailed output
process.stdout.write(`\n API Oracle Entry Linter\n`);
process.stdout.write(` Severity filter: ${severityFilter}+\n`);
process.stdout.write(` Entries checked: ${entries.length}\n\n`);

let anyIssue = false;
for (const result of filtered) {
  if (result.issues.length === 0) continue;
  anyIssue = true;
  process.stdout.write(`[${result.slug}] ${result.name}\n`);
  for (const issue of result.issues) {
    process.stdout.write(`  ${SEVERITY_ICON[issue.severity]} [${issue.field}] ${issue.message}\n`);
  }
  process.stdout.write("\n");
}

if (!anyIssue) {
  process.stdout.write(`✅ All ${entries.length} entries pass at severity level '${severityFilter}'!\n`);
}

process.stdout.write(`\nSummary: ${errorCount} errors, ${warningCount} warnings, ${infoCount} info across ${entries.length} entries.\n`);
process.stdout.write(`${passedCount}/${entries.length} entries with no ${severityFilter}+ issues.\n`);

process.exit(errorCount > 0 ? 1 : 0);
