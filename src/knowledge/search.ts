/**
 * Search layer — combines SQLite text search with the scoring engine.
 * This is the main entry point for all tool queries.
 *
 * Exports: SearchConstraints, RankedResult, findApis, getApiBySlug, getApisByCategory
 */

import type { ApiEntry } from "./schema.js";
import { searchByText, getAllEntries, getBySlug, getByCategory } from "./db.js";
import { rankEntries } from "./scorer.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("search");

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

/**
 * Find and rank APIs for a given task description.
 * 1. Text search narrows the candidate pool
 * 2. Scorer ranks candidates by relevance, quality, DX, and pricing fit
 */
export function findApis(
  query: string,
  constraints?: SearchConstraints,
  topN: number = 3
): RankedResult[] {
  logger.debug("findApis called", { query, constraints, topN });

  if (!query || query.trim().length === 0) {
    logger.warn("Empty query provided to findApis");
    return [];
  }

  // Step 1: Get candidates via text search
  let candidates: ApiEntry[] = searchByText(query.trim());

  // If text search returns too few results (< topN), broaden to all entries
  // so the scorer can still surface the best match
  if (candidates.length < topN) {
    logger.debug("Broadening to all entries — text search returned few results", {
      textSearchCount: candidates.length,
    });
    const all = getAllEntries();
    // Merge without duplicates
    const seen = new Set(candidates.map((e) => e.slug));
    for (const entry of all) {
      if (!seen.has(entry.slug)) {
        candidates.push(entry);
        seen.add(entry.slug);
      }
    }
  }

  // Step 2: Rank with scorer
  const results = rankEntries(candidates, query, constraints, topN);

  logger.debug("findApis results", {
    candidateCount: candidates.length,
    resultCount: results.length,
    topSlug: results[0]?.entry.slug,
  });

  return results;
}

/** Get a single API entry by its slug */
export function getApiBySlug(slug: string): ApiEntry | null {
  return getBySlug(slug);
}

/** Get all APIs in a category, ranked by quality score */
export function getApisByCategory(category: string): ApiEntry[] {
  return getByCategory(category);
}
