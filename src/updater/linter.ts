/**
 * Entry quality linter for API Oracle.
 *
 * Applies heuristic quality rules beyond Zod schema validation.
 * Checks for common content issues: vague descriptions, thin code examples,
 * missing gotchas detail, suspicious field values, etc.
 *
 * Exports: LintIssue, LintSeverity, LintResult, lintEntry, lintAllEntries
 */

import type { ApiEntry } from "../knowledge/schema.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LintSeverity = "error" | "warning" | "info";

export interface LintIssue {
  field: string;
  severity: LintSeverity;
  message: string;
}

export interface LintResult {
  slug: string;
  name: string;
  issues: LintIssue[];
  /** Entries with zero errors and warnings pass */
  passed: boolean;
}

// ─── Rules ────────────────────────────────────────────────────────────────────

type Rule = (entry: ApiEntry) => LintIssue[];

const RULES: Rule[] = [
  // ── Description quality ─────────────────────────────────────────────────
  (e) => {
    const issues: LintIssue[] = [];
    if (e.description.length < 80) {
      issues.push({
        field: "description",
        severity: "warning",
        message: `Description is short (${e.description.length} chars). Aim for 100+ chars of useful context.`,
      });
    }
    return issues;
  },

  // ── Code examples quality ───────────────────────────────────────────────
  (e) => {
    const issues: LintIssue[] = [];
    if (e.codeExamples.length < 2) {
      issues.push({
        field: "codeExamples",
        severity: "warning",
        message: "Only 1 code example. 2+ examples showing different use cases are recommended.",
      });
    }
    for (const ex of e.codeExamples) {
      if (ex.code.split("\n").length < 5) {
        issues.push({
          field: `codeExamples[${ex.title}].code`,
          severity: "warning",
          message: `Code example "${ex.title}" is very short (< 5 lines). Consider a more complete example.`,
        });
      }
      if (!ex.notes || ex.notes.trim().length < 20) {
        issues.push({
          field: `codeExamples[${ex.title}].notes`,
          severity: "info",
          message: `Code example "${ex.title}" has sparse notes. Add context about what the example demonstrates.`,
        });
      }
    }
    return issues;
  },

  // ── Gotchas quality ─────────────────────────────────────────────────────
  (e) => {
    const issues: LintIssue[] = [];
    for (const gotcha of e.gotchas) {
      if (gotcha.length < 50) {
        issues.push({
          field: "gotchas",
          severity: "warning",
          message: `Gotcha is very short: "${gotcha.slice(0, 40)}...". Each gotcha should explain WHY it matters.`,
        });
      }
    }
    if (e.gotchas.length < 3) {
      issues.push({
        field: "gotchas",
        severity: "info",
        message: `Only ${e.gotchas.length} gotchas. Consider adding a 3rd with a less obvious pitfall.`,
      });
    }
    return issues;
  },

  // ── Pricing completeness ─────────────────────────────────────────────────
  (e) => {
    const issues: LintIssue[] = [];
    if (e.pricing.model === "paid" && e.pricing.startingPrice === null) {
      issues.push({
        field: "pricing.startingPrice",
        severity: "warning",
        message: "Pricing model is 'paid' but startingPrice is null. Add a price if publicly listed.",
      });
    }
    if (e.pricing.model === "usage_based" && e.pricing.costPer === null) {
      issues.push({
        field: "pricing.costPer",
        severity: "info",
        message: "Usage-based pricing with no costPer breakdown. Add $/unit info if available.",
      });
    }
    return issues;
  },

  // ── Setup steps quality ──────────────────────────────────────────────────
  (e) => {
    const issues: LintIssue[] = [];
    if (e.auth.setupSteps.length < 3) {
      issues.push({
        field: "auth.setupSteps",
        severity: "info",
        message: `Only ${e.auth.setupSteps.length} setup step(s). Consider adding more detail for a complete setup guide.`,
      });
    }
    return issues;
  },

  // ── Quality score vs justification consistency ───────────────────────────
  (e) => {
    const issues: LintIssue[] = [];
    if (e.qualityScore >= 9 && e.qualityJustification.length < 80) {
      issues.push({
        field: "qualityJustification",
        severity: "info",
        message: `Score is ${e.qualityScore}/10 but justification is brief. Explain what earns this high rating.`,
      });
    }
    if (e.qualityScore <= 4 && e.qualityJustification.length < 80) {
      issues.push({
        field: "qualityJustification",
        severity: "info",
        message: `Score is ${e.qualityScore}/10. Explain specifically why the score is low to help users make decisions.`,
      });
    }
    return issues;
  },

  // ── Alternatives and complementary relationships ─────────────────────────
  (e) => {
    const issues: LintIssue[] = [];
    if (e.alternatives.length === 0 && e.qualityScore < 9) {
      issues.push({
        field: "alternatives",
        severity: "info",
        message: "No alternatives listed. Most APIs have at least one competitor worth mentioning.",
      });
    }
    if (e.complementary.length === 0) {
      issues.push({
        field: "complementary",
        severity: "info",
        message: "No complementary APIs listed. Most APIs work well with at least one other service.",
      });
    }
    return issues;
  },

  // ── Reliability info ─────────────────────────────────────────────────────
  (e) => {
    const issues: LintIssue[] = [];
    if (e.reliability.uptimeGuarantee === null && e.pricing.model !== "open_source") {
      issues.push({
        field: "reliability.uptimeGuarantee",
        severity: "info",
        message: "No uptime guarantee listed. Check the provider's SLA page.",
      });
    }
    if (e.reliability.statusPageUrl === null && e.pricing.model !== "open_source") {
      issues.push({
        field: "reliability.statusPageUrl",
        severity: "info",
        message: "No status page URL. Most hosted APIs have a status page — check status.[provider].com.",
      });
    }
    return issues;
  },

  // ── Use cases coverage ───────────────────────────────────────────────────
  (e) => {
    const issues: LintIssue[] = [];
    if (e.useCases.length < 3) {
      issues.push({
        field: "useCases",
        severity: "info",
        message: `Only ${e.useCases.length} use case(s). Consider adding more to improve search discoverability.`,
      });
    }
    const hasPerfect = e.useCases.some((u) => u.fit === "perfect");
    if (!hasPerfect) {
      issues.push({
        field: "useCases",
        severity: "warning",
        message: "No use case has fit='perfect'. At least one core use case should be a perfect fit.",
      });
    }
    return issues;
  },
];

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Lint a single entry and return all issues found.
 */
export function lintEntry(entry: ApiEntry): LintResult {
  const issues: LintIssue[] = [];
  for (const rule of RULES) {
    issues.push(...rule(entry));
  }
  const passed = !issues.some((i) => i.severity === "error" || i.severity === "warning");
  return { slug: entry.slug, name: entry.name, issues, passed };
}

/**
 * Lint all entries. Returns results sorted: failed first, then passed.
 */
export function lintAllEntries(entries: ApiEntry[]): LintResult[] {
  return entries
    .map(lintEntry)
    .sort((a, b) => {
      // Sort by issue count descending, then by slug
      const aScore = issueScore(a);
      const bScore = issueScore(b);
      if (bScore !== aScore) return bScore - aScore;
      return a.slug.localeCompare(b.slug);
    });
}

function issueScore(result: LintResult): number {
  let score = 0;
  for (const issue of result.issues) {
    if (issue.severity === "error") score += 100;
    else if (issue.severity === "warning") score += 10;
    else score += 1;
  }
  return score;
}
