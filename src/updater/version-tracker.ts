/**
 * Version tracker for API Oracle entries.
 *
 * Reads the current entryVersion from each entry and compares to a stored
 * baseline to detect entries that have been updated since the last review.
 *
 * Exports: VersionSnapshot, VersionDiff, buildSnapshot, diffSnapshot
 */

import type { ApiEntry } from "../knowledge/schema.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/** A map of slug → entryVersion, stored as a JSON snapshot. */
export type VersionSnapshot = Record<string, number>;

export interface VersionDiff {
  slug: string;
  name: string;
  previousVersion: number | null;
  currentVersion: number;
  /** "new" = entry added since snapshot; "updated" = version incremented */
  changeType: "new" | "updated";
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Build a version snapshot from a list of entries.
 */
export function buildSnapshot(entries: ApiEntry[]): VersionSnapshot {
  const snapshot: VersionSnapshot = {};
  for (const entry of entries) {
    snapshot[entry.slug] = entry.entryVersion;
  }
  return snapshot;
}

/**
 * Diff a current entry list against a stored snapshot.
 * Returns entries that are new or have an incremented version.
 */
export function diffSnapshot(
  entries: ApiEntry[],
  previousSnapshot: VersionSnapshot
): VersionDiff[] {
  const diffs: VersionDiff[] = [];

  for (const entry of entries) {
    const prev = previousSnapshot[entry.slug] ?? null;
    if (prev === null) {
      // New entry not in snapshot
      diffs.push({
        slug: entry.slug,
        name: entry.name,
        previousVersion: null,
        currentVersion: entry.entryVersion,
        changeType: "new",
      });
    } else if (entry.entryVersion > prev) {
      // Version was incremented
      diffs.push({
        slug: entry.slug,
        name: entry.name,
        previousVersion: prev,
        currentVersion: entry.entryVersion,
        changeType: "updated",
      });
    }
  }

  return diffs.sort((a, b) => a.slug.localeCompare(b.slug));
}
