/**
 * Report formatter for the API Oracle auto-updater.
 *
 * Formats staleness info and version diffs into a human-readable
 * markdown/text report for the refresh-report script and MCP tool.
 *
 * Exports: FreshnessReport, buildFreshnessReport, formatReport
 */

import type { StalenessInfo, StalenessLevel } from "./staleness.js";
import type { VersionDiff } from "./version-tracker.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FreshnessReport {
  generatedAt: string;
  totalEntries: number;
  summary: Record<StalenessLevel, number>;
  staleEntries: StalenessInfo[];
  recentlyUpdated: VersionDiff[];
}

// ─── Builders ─────────────────────────────────────────────────────────────────

/**
 * Build a structured freshness report from staleness data.
 */
export function buildFreshnessReport(
  allInfos: StalenessInfo[],
  versionDiffs: VersionDiff[] = []
): FreshnessReport {
  const summary: Record<StalenessLevel, number> = {
    fresh: 0,
    aging: 0,
    stale: 0,
    critical: 0,
  };

  for (const info of allInfos) {
    summary[info.level]++;
  }

  const staleEntries = allInfos.filter(
    (i) => i.level === "stale" || i.level === "critical" || i.level === "aging"
  );

  return {
    generatedAt: new Date().toISOString(),
    totalEntries: allInfos.length,
    summary,
    staleEntries,
    recentlyUpdated: versionDiffs,
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const LEVEL_EMOJI: Record<StalenessLevel, string> = {
  fresh: "✅",
  aging: "🟡",
  stale: "🟠",
  critical: "🔴",
};

/**
 * Format a freshness report as a human-readable markdown string.
 */
export function formatReport(report: FreshnessReport): string {
  const lines: string[] = [];

  lines.push("# API Oracle — Freshness Report");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`Total entries: **${report.totalEntries}**`);
  lines.push("");
  lines.push(
    `| Status | Count | Threshold |`,
    `|--------|-------|-----------|`,
    `| ${LEVEL_EMOJI.fresh} Fresh    | ${report.summary.fresh}  | Verified < 90 days ago |`,
    `| ${LEVEL_EMOJI.aging} Aging    | ${report.summary.aging}  | 90–180 days ago |`,
    `| ${LEVEL_EMOJI.stale} Stale    | ${report.summary.stale}  | 180–365 days ago |`,
    `| ${LEVEL_EMOJI.critical} Critical | ${report.summary.critical}  | > 365 days ago |`
  );

  if (report.staleEntries.length === 0) {
    lines.push("");
    lines.push("## All entries are fresh — nothing to update! 🎉");
  } else {
    lines.push("");
    lines.push("## Entries Needing Attention");
    lines.push(
      `| Slug | Name | Last Verified | Age (days) | Status |`,
      `|------|------|--------------|------------|--------|`
    );
    for (const entry of report.staleEntries) {
      const emoji = LEVEL_EMOJI[entry.level];
      lines.push(
        `| ${entry.slug} | ${entry.name} | ${entry.lastVerified} | ${entry.daysSinceVerified} | ${emoji} ${entry.level} |`
      );
    }
  }

  if (report.recentlyUpdated.length > 0) {
    lines.push("");
    lines.push("## Recently Updated Entries");
    lines.push(
      `| Slug | Name | Change | Version |`,
      `|------|------|--------|---------|`
    );
    for (const diff of report.recentlyUpdated) {
      const versionStr =
        diff.changeType === "new"
          ? `new (v${diff.currentVersion})`
          : `v${diff.previousVersion ?? "?"} → v${diff.currentVersion}`;
      lines.push(`| ${diff.slug} | ${diff.name} | ${diff.changeType} | ${versionStr} |`);
    }
  }

  return lines.join("\n");
}

/**
 * Format a brief staleness summary suitable for an MCP tool response.
 */
export function formatBriefSummary(report: FreshnessReport): string {
  const { summary, totalEntries } = report;
  const issues = summary.aging + summary.stale + summary.critical;

  if (issues === 0) {
    return `All ${totalEntries} entries are fresh (verified within 90 days). No updates needed.`;
  }

  const parts: string[] = [];
  if (summary.critical > 0) parts.push(`${summary.critical} critical (>1 year old)`);
  if (summary.stale > 0) parts.push(`${summary.stale} stale (6–12 months old)`);
  if (summary.aging > 0) parts.push(`${summary.aging} aging (3–6 months old)`);

  return (
    `${totalEntries} entries total: ${summary.fresh} fresh, ${issues} need attention — ` +
    parts.join(", ") +
    "."
  );
}
