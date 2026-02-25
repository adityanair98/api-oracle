/**
 * Search logic — combines text search with scorer ranking.
 * Main entry point for the tools layer.
 *
 * Exports: SearchConstraints, RankedResult, findApis
 */

import type { ApiEntry } from "./schema.js";

export interface SearchConstraints {
  maxPrice?: string;
  requiredLanguage?: string;
  preferFree?: boolean;
}

export interface RankedResult {
  entry: ApiEntry;
  score: number;
  scoreBreakdown: Record<string, number>;
}

// Stub — full implementation in Phase 6
export function findApis(
  _query: string,
  _constraints?: SearchConstraints,
  _topN?: number
): RankedResult[] {
  throw new Error("Not implemented");
}
