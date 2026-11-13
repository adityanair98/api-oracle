/**
 * Retrieval evaluation harness.
 *
 * Runs every query in tests/eval/dev.json and tests/eval/holdout.json through
 * findApis() against the bundled entries (in-memory) and reports, per set:
 *   - top-1 accuracy: rank-1 slug is in acceptableTop1
 *   - top-3 accuracy: any acceptableTop1 slug appears in the top 3
 *   - must-not violation rate: share of queries (that define mustNotTop3)
 *     where at least one forbidden slug appears in the top 3
 * and prints every failure.
 *
 * RULE: tune only on dev.json. holdout.json is a held-out measure — never
 * change weights or synonyms in response to individual holdout failures.
 *
 * Usage: npm run eval
 *        npm run eval -- --out tests/eval/results/after-fix.md --title "After fix 2"
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EvalQuery {
  id: string;
  query: string;
  acceptableTop1: string[];
  mustNotTop3?: string[];
  note?: string;
}

export interface EvalSet {
  name: string;
  description?: string;
  queries: EvalQuery[];
}

export interface QueryResult {
  id: string;
  query: string;
  acceptableTop1: string[];
  top3: string[];
  top1Hit: boolean;
  top3Hit: boolean;
  violations: string[];
}

export interface SetReport {
  name: string;
  total: number;
  top1Correct: number;
  top3Correct: number;
  /** Queries that define a non-empty mustNotTop3 list */
  mustNotQueries: number;
  /** Of those, how many had at least one forbidden slug in the top 3 */
  violatingQueries: number;
  results: QueryResult[];
}

/** A ranker returns slugs, best first. */
export type Ranker = (query: string) => string[];

// ─── Metrics ──────────────────────────────────────────────────────────────────

export function evaluateQuery(q: EvalQuery, ranked: string[]): QueryResult {
  const top3 = ranked.slice(0, 3);
  const acceptable = new Set(q.acceptableTop1);
  const forbidden = new Set(q.mustNotTop3 ?? []);
  return {
    id: q.id,
    query: q.query,
    acceptableTop1: q.acceptableTop1,
    top3,
    top1Hit: top3.length > 0 && acceptable.has(top3[0]!),
    top3Hit: top3.some((s) => acceptable.has(s)),
    violations: top3.filter((s) => forbidden.has(s)),
  };
}

export function evaluateSet(set: EvalSet, rank: Ranker): SetReport {
  const results = set.queries.map((q) => evaluateQuery(q, rank(q.query)));
  const mustNotQueries = set.queries.filter((q) => (q.mustNotTop3 ?? []).length > 0).length;
  return {
    name: set.name,
    total: results.length,
    top1Correct: results.filter((r) => r.top1Hit).length,
    top3Correct: results.filter((r) => r.top3Hit).length,
    mustNotQueries,
    violatingQueries: results.filter((r) => r.violations.length > 0).length,
    results,
  };
}

function pct(n: number, d: number): string {
  if (d === 0) return "n/a";
  return `${((100 * n) / d).toFixed(1)}%`;
}

export function summaryRow(r: SetReport): string {
  return (
    `| ${r.name} | ${r.total} | ${r.top1Correct}/${r.total} (${pct(r.top1Correct, r.total)}) ` +
    `| ${r.top3Correct}/${r.total} (${pct(r.top3Correct, r.total)}) ` +
    `| ${r.violatingQueries}/${r.mustNotQueries} (${pct(r.violatingQueries, r.mustNotQueries)}) |`
  );
}

function failureLines(r: SetReport): string[] {
  const lines: string[] = [];
  for (const q of r.results) {
    const problems: string[] = [];
    if (!q.top1Hit) problems.push(q.top3Hit ? "top-1 miss" : "top-3 miss");
    if (q.violations.length > 0) problems.push(`must-not in top 3: ${q.violations.join(", ")}`);
    if (problems.length === 0) continue;
    const got = q.top3.length > 0 ? q.top3.join(", ") : "(no results)";
    lines.push(
      `- **${q.id}** "${q.query}" — ${problems.join("; ")}. Got: ${got}. Wanted top-1: ${q.acceptableTop1.join(" / ")}`
    );
  }
  return lines;
}

export function formatMarkdown(reports: SetReport[], title: string, meta: string[]): string {
  const out: string[] = [];
  out.push(`# ${title}`, "");
  for (const m of meta) out.push(`- ${m}`);
  out.push("");
  out.push("| Set | Queries | Top-1 accuracy | Top-3 accuracy | Must-not violation rate |");
  out.push("|-----|---------|----------------|----------------|-------------------------|");
  for (const r of reports) out.push(summaryRow(r));
  out.push("");
  out.push(
    "Top-1: rank-1 slug is an acceptable answer. Top-3: an acceptable answer is in the top 3. " +
      "Violation rate: share of queries with a must-not list where a forbidden slug appeared in the top 3."
  );

  for (const r of reports) {
    out.push("", `## ${r.name} — failures`, "");
    const fails = failureLines(r);
    out.push(...(fails.length > 0 ? fails : ["_none_"]));
  }

  for (const r of reports) {
    out.push("", `## ${r.name} — all results`, "");
    out.push("| id | query | top 3 | top-1 | top-3 | violations |");
    out.push("|----|-------|-------|-------|-------|------------|");
    for (const q of r.results) {
      out.push(
        `| ${q.id} | ${q.query} | ${q.top3.join(", ") || "—"} | ${q.top1Hit ? "✓" : "✗"} | ` +
          `${q.top3Hit ? "✓" : "✗"} | ${q.violations.join(", ") || ""} |`
      );
    }
  }
  return out.join("\n") + "\n";
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
export const EVAL_DIR = join(__dirname, "..", "tests", "eval");

export function loadEvalSet(name: "dev" | "holdout"): EvalSet {
  return JSON.parse(readFileSync(join(EVAL_DIR, `${name}.json`), "utf-8")) as EvalSet;
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  // Imported lazily so unit tests of the metric functions don't need a DB.
  const { bootstrapKnowledgeBase } = await import("../src/knowledge/loader.js");
  const { findApis } = await import("../src/knowledge/search.js");

  const kb = bootstrapKnowledgeBase({ dbPath: ":memory:" });
  const rank: Ranker = (q) => findApis(q, undefined, 3).map((r) => r.entry.slug);

  const reports = [evaluateSet(loadEvalSet("dev"), rank), evaluateSet(loadEvalSet("holdout"), rank)];

  // Identify the exact scorer source by the git tree hash of src/ as staged.
  // It equals `git rev-parse <commit>:src` for the commit that contains it,
  // and (unlike a commit hash) survives rebases.
  let source = "unknown (not a git checkout)";
  try {
    const tree = execSync("git write-tree --prefix=src/", { encoding: "utf-8" }).trim().slice(0, 12);
    const unstaged = execSync("git diff --name-only -- src", { encoding: "utf-8" }).trim();
    source = `src/ tree ${tree}${unstaged ? " + UNSTAGED src changes" : ""} (check: git rev-parse <commit>:src)`;
  } catch {
    /* not a git checkout */
  }

  const title = argValue("--title") ?? "API Oracle retrieval eval";
  const meta = [
    `Scorer source: ${source}`,
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    `Ranker: findApis(query, no constraints, top 3) over the ${kb.totalInDb} bundled entries` +
      (kb.skipped.length > 0 ? ` (${kb.skipped.length} skipped as invalid)` : ""),
  ];
  const md = formatMarkdown(reports, title, meta);
  process.stdout.write(md);

  const outPath = argValue("--out");
  if (outPath) {
    mkdirSync(dirname(resolve(outPath)), { recursive: true });
    writeFileSync(outPath, md);
    process.stdout.write(`\nWrote ${outPath}\n`);
  }
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e: unknown) => {
    process.stderr.write(`eval failed: ${String(e)}\n`);
    process.exit(1);
  });
}
