/**
 * Staleness checker for API Oracle knowledge base entries.
 *
 * Determines how "fresh" each entry is based on its lastVerified date
 * and exposes structured staleness metadata per entry.
 *
 * Exports: StalenessLevel, StalenessInfo, checkStaleness, checkAllEntries
 */

import type { ApiEntry } from "../knowledge/schema.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StalenessLevel = "fresh" | "aging" | "stale" | "critical";

export interface StalenessInfo {
  slug: string;
  name: string;
  lastVerified: string;
  daysSinceVerified: number;
  level: StalenessLevel;
  /** ISO date of when this was computed */
  checkedAt: string;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────
// How many days since lastVerified before an entry is considered each level.

const THRESHOLDS = {
  fresh: 90,   // < 90 days → fresh
  aging: 180,  // 90–180 days → aging
  stale: 365,  // 180–365 days → stale
  // > 365 days → critical
} as const;

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Compute staleness level from a day count.
 */
export function getStalenessLevel(daysSince: number): StalenessLevel {
  if (daysSince < THRESHOLDS.fresh) return "fresh";
  if (daysSince < THRESHOLDS.aging) return "aging";
  if (daysSince < THRESHOLDS.stale) return "stale";
  return "critical";
}

/**
 * Compute the number of days between a date string (YYYY-MM-DD) and today.
 */
export function daysSince(dateStr: string, today: Date = new Date()): number {
  const then = new Date(dateStr + "T00:00:00Z");
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  const diff = todayUtc - then.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Check staleness for a single entry.
 */
export function checkStaleness(entry: ApiEntry, today?: Date): StalenessInfo {
  const days = daysSince(entry.lastVerified, today);
  return {
    slug: entry.slug,
    name: entry.name,
    lastVerified: entry.lastVerified,
    daysSinceVerified: days,
    level: getStalenessLevel(days),
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Check staleness for all entries, sorted from most stale to freshest.
 */
export function checkAllEntries(
  entries: ApiEntry[],
  today?: Date
): StalenessInfo[] {
  return entries
    .map((e) => checkStaleness(e, today))
    .sort((a, b) => b.daysSinceVerified - a.daysSinceVerified);
}

/**
 * Filter entries by staleness level.
 */
export function filterByLevel(
  infos: StalenessInfo[],
  level: StalenessLevel
): StalenessInfo[] {
  return infos.filter((i) => i.level === level);
}
