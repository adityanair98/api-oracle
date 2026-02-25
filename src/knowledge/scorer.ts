/**
 * Scoring/ranking engine — ranks APIs by relevance to a task.
 * Uses weighted multi-factor scoring.
 *
 * Exports: ScoreWeights, ScoreBreakdown, scoreEntry, rankEntries
 */

import type { ApiEntry } from "./schema.js";
import type { SearchConstraints, RankedResult } from "./search.js";

export interface ScoreWeights {
  useCaseFit: number;   // 0.40
  qualityScore: number; // 0.25
  devExperience: number; // 0.20
  pricingFit: number;   // 0.15
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  useCaseFit: 0.40,
  qualityScore: 0.25,
  devExperience: 0.20,
  pricingFit: 0.15,
};

// Stub — full implementation in Phase 6
export function scoreEntry(
  _entry: ApiEntry,
  _query: string,
  _constraints?: SearchConstraints,
  _weights?: ScoreWeights
): RankedResult {
  throw new Error("Not implemented");
}

export function rankEntries(
  _entries: ApiEntry[],
  _query: string,
  _constraints?: SearchConstraints,
  _topN?: number
): RankedResult[] {
  throw new Error("Not implemented");
}
