/**
 * TF-IDF text search engine for API entries.
 *
 * Builds an in-memory index from entries and provides relevance-ranked search
 * without requiring any external API calls or embedding models. Uses weighted
 * multi-field document construction to boost precision:
 *   name (x4) > bestFor/subcategory (x3) > useCases (x2) > description (x1)
 *
 * TF-IDF formula:
 *   score(doc, query) = sum_t( TF(t, doc) * IDF(t) ) for each query term t
 *   IDF(t) = log((N + 1) / (df(t) + 1)) + 1   (Laplace smoothing)
 *
 * Exports: TfIdfEngine, getTfIdfEngine, resetTfIdfEngine
 */

import type { ApiEntry } from "./schema.js";
import { tokenize } from "./scorer.js";

// ─── Field weights for document construction ──────────────────────────────────

const FIELD_WEIGHTS = {
  name: 4,        // API name is the strongest identity signal
  subcategory: 3, // e.g. "transactional-email", "push-notification"
  bestFor: 3,     // Concise purpose statement written for discoverability
  useCases: 2,    // Task-oriented descriptions — close to real queries
  description: 1, // Full prose description (lower weight — can be noisy)
  category: 1,    // Broad category (broad signal only)
} as const;

// ─── Internal types ────────────────────────────────────────────────────────────

interface DocumentVector {
  slug: string;
  /** Weighted raw term counts (before TF normalization) */
  termCounts: Map<string, number>;
  /** Sum of all weighted term counts — used as document length for TF norm */
  totalWeight: number;
}

// ─── TF-IDF Engine ────────────────────────────────────────────────────────────

export class TfIdfEngine {
  private vectors: DocumentVector[] = [];
  private idf: Map<string, number> = new Map();
  private entryBySlug: Map<string, ApiEntry> = new Map();
  private _built = false;

  /**
   * Build the TF-IDF index from a list of entries.
   * Can be called again to rebuild with updated entries.
   */
  build(entries: ApiEntry[]): void {
    this.vectors = [];
    this.idf = new Map();
    this.entryBySlug = new Map();
    this._built = false;

    const N = entries.length;
    if (N === 0) return;

    // Document frequency: how many documents contain each term
    const df = new Map<string, number>();

    for (const entry of entries) {
      this.entryBySlug.set(entry.slug, entry);

      const termCounts = new Map<string, number>();

      const addTokens = (text: string, weight: number): void => {
        for (const token of tokenize(text)) {
          termCounts.set(token, (termCounts.get(token) ?? 0) + weight);
        }
      };

      addTokens(entry.name, FIELD_WEIGHTS.name);
      addTokens(entry.subcategory.replace(/-/g, " "), FIELD_WEIGHTS.subcategory);
      addTokens(entry.bestFor, FIELD_WEIGHTS.bestFor);
      addTokens(entry.category, FIELD_WEIGHTS.category);
      addTokens(entry.description.slice(0, 300), FIELD_WEIGHTS.description);

      for (const uc of entry.useCases) {
        addTokens(uc.task, FIELD_WEIGHTS.useCases);
      }

      // Document length = sum of all weighted counts (for TF normalization)
      let totalWeight = 0;
      for (const count of termCounts.values()) totalWeight += count;

      this.vectors.push({ slug: entry.slug, termCounts, totalWeight });

      // Update document frequency (count each term once per document)
      for (const term of termCounts.keys()) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }

    // Compute IDF with Laplace smoothing to avoid division-by-zero
    // log((N+1)/(df+1)) + 1 ensures unknown terms get IDF ≈ 1
    for (const [term, count] of df) {
      this.idf.set(term, Math.log((N + 1) / (count + 1)) + 1);
    }

    this._built = true;
  }

  /**
   * Search the index for entries most relevant to the query.
   * Returns up to topN entries sorted by TF-IDF score descending.
   * Entries with zero score are excluded.
   */
  search(query: string, topN: number = 10): ApiEntry[] {
    if (!this._built || this.vectors.length === 0) return [];

    const queryTokens = tokenize(query);
    if (queryTokens.size === 0) return [];

    const scores: Array<{ slug: string; score: number }> = [];

    for (const doc of this.vectors) {
      let score = 0;
      for (const term of queryTokens) {
        const rawCount = doc.termCounts.get(term) ?? 0;
        if (rawCount === 0) continue;

        // TF = count / document_length (normalized by total weighted length)
        const tf = rawCount / Math.max(doc.totalWeight, 1);

        // IDF: terms not in any document get default IDF=1 (unknown query term)
        const idf = this.idf.get(term) ?? 1;

        score += tf * idf;
      }

      if (score > 0) {
        scores.push({ slug: doc.slug, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);

    const results: ApiEntry[] = [];
    for (const { slug } of scores.slice(0, topN)) {
      const entry = this.entryBySlug.get(slug);
      if (entry) results.push(entry);
    }
    return results;
  }

  get isBuilt(): boolean {
    return this._built;
  }

  /** Number of indexed documents */
  get size(): number {
    return this.vectors.length;
  }
}

// ─── Module-level singleton ────────────────────────────────────────────────────

let _engine: TfIdfEngine | null = null;

/** Get the shared engine instance (lazily created) */
export function getTfIdfEngine(): TfIdfEngine {
  if (!_engine) {
    _engine = new TfIdfEngine();
  }
  return _engine;
}

/**
 * Reset the shared engine (forces rebuild on next search).
 * Must be called in test afterEach when the DB is replaced.
 */
export function resetTfIdfEngine(): void {
  _engine = null;
}
