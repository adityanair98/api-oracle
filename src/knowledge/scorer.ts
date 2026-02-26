/**
 * Scoring/ranking engine — ranks API entries by relevance to a task description.
 * Uses weighted multi-factor scoring across use case fit, quality, dev experience, and pricing.
 *
 * Exports: ScoreWeights, DEFAULT_WEIGHTS, scoreEntry, rankEntries
 */

import type { ApiEntry } from "./schema.js";
import type { SearchConstraints, RankedResult } from "./search.js";

// ─── Weights ──────────────────────────────────────────────────────────────────

export interface ScoreWeights {
  useCaseFit: number;      // How well the API matches the task (use cases + description + bestFor)
  qualityScore: number;    // Curated quality score from the entry
  devExperience: number;   // TypeScript SDK, code examples, setup clarity, language support
  pricingFit: number;      // Free tier, pricing model alignment
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  useCaseFit: 0.40,
  qualityScore: 0.25,
  devExperience: 0.20,
  pricingFit: 0.15,
};

// ─── Tokenizer ────────────────────────────────────────────────────────────────

// Stop words that add noise without semantic value
const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all",
  "can", "her", "was", "one", "our", "out", "had", "has",
  "with", "this", "that", "from", "they", "have", "been",
  "more", "will", "when", "what", "your", "which", "how",
  "any", "use", "get", "let", "its", "from", "also",
  "want", "need", "build", "add", "make", "app",
]);

/**
 * Normalize text to a set of lowercase tokens for comparison.
 * Allows 2-char tokens (critical for "ai", "db", "ml", "go").
 */
export function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

/** Compute Jaccard-like overlap score between two token sets */
function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap++;
  }
  return overlap / Math.max(a.size, b.size);
}

// ─── Category keywords ─────────────────────────────────────────────────────────

/** Strong category signals — these get a boost when matched */
const CATEGORY_SIGNALS: Record<string, string[]> = {
  email: ["email", "mail", "smtp", "send", "transactional", "newsletter", "inbox", "bounce", "mailer"],
  payments: ["payment", "pay", "checkout", "charge", "billing", "invoice", "subscription", "card", "upi", "merchant", "transaction"],
  ai: ["ai", "ml", "llm", "gpt", "claude", "openai", "anthropic", "model", "completion", "embedding", "chatbot", "generate", "inference", "generative"],
  storage: ["upload", "file", "image", "video", "media", "storage", "cdn", "asset", "photo", "bucket", "picture", "avatar"],
  search: ["search", "query", "index", "algolia", "fulltext", "autocomplete", "facet", "filter", "typeahead"],
  auth: ["auth", "authentication", "login", "signin", "signup", "oauth", "sso", "identity", "session", "token", "jwt", "credential"],
  messaging: ["sms", "text", "message", "messaging", "phone", "call", "voice", "telephony", "twilio", "vonage"],
  analytics: ["analytics", "tracking", "metrics", "event", "crash", "exception", "error", "monitoring", "observability", "posthog", "sentry"],
  database: ["database", "db", "sql", "nosql", "postgres", "mysql", "query", "datastore", "backend", "persist"],
  media: ["audio", "video", "stream", "transcribe", "transcode", "speech", "mux", "deepgram"],
  notifications: ["notification", "push", "alert", "bell", "notify", "apns", "fcm"],
  maps: ["map", "maps", "geo", "location", "address", "geocode", "navigation", "direction", "coordinate"],
  communication: ["chat", "conversation", "channel", "room", "thread", "realtime", "websocket", "pusher", "ably"],
};

/** Score how well the query matches a category */
function scoreCategoryMatch(queryTokens: Set<string>, category: string): number {
  const signals = CATEGORY_SIGNALS[category] ?? [];
  if (signals.length === 0) return 0;
  const signalSet = new Set(signals);
  let matched = 0;
  for (const token of queryTokens) {
    if (signalSet.has(token)) matched++;
  }
  // Normalize: 1 match = 0.33, 2 = 0.67, 3+ = 1.0
  return Math.min(matched / 3, 1.0);
}

// ─── Multi-Field Use Case Scoring ─────────────────────────────────────────────

const FIT_WEIGHTS = {
  perfect: 1.0,
  good: 0.7,
  partial: 0.4,
} as const;

/**
 * Score an entry against a query using multiple fields with weighted relevance:
 * - Use case tasks (40%) — most direct signal with fit multiplier
 * - bestFor (25%) — concise statement of the API's purpose
 * - Description (20%) — rich context
 * - Category signals (15%) — broad category match
 */
export function scoreUseCaseFit(entry: ApiEntry, queryTokens: Set<string>): number {
  if (queryTokens.size === 0) return 0;

  // 1. Use case task matching (with fit multiplier — best match wins)
  let bestUseCaseScore = 0;
  for (const useCase of entry.useCases) {
    const useCaseTokens = tokenize(useCase.task);
    const overlap = tokenOverlap(queryTokens, useCaseTokens);
    const score = overlap * FIT_WEIGHTS[useCase.fit];
    if (score > bestUseCaseScore) bestUseCaseScore = score;
  }

  // 2. bestFor field scoring
  const bestForTokens = tokenize(entry.bestFor);
  const bestForScore = tokenOverlap(queryTokens, bestForTokens);

  // 3. Description scoring (partial — first 200 chars to keep it signal-dense)
  const descTokens = tokenize(entry.description.slice(0, 200));
  const descScore = tokenOverlap(queryTokens, descTokens);

  // 4. Category match signal
  const categoryScore = scoreCategoryMatch(queryTokens, entry.category);

  // Weighted combination:
  // useCaseFit=40%, bestFor=25%, description=20%, category=15%
  const combined =
    bestUseCaseScore * 0.40 +
    bestForScore * 0.25 +
    descScore * 0.20 +
    categoryScore * 0.15;

  return Math.min(combined, 1.0);
}

// ─── Quality Score ─────────────────────────────────────────────────────────────

function scoreQuality(entry: ApiEntry): number {
  // qualityScore is 1-10, normalize to 0-1
  return (entry.qualityScore - 1) / 9;
}

// ─── Developer Experience ──────────────────────────────────────────────────────

export function scoreDevExperience(
  entry: ApiEntry,
  constraints?: SearchConstraints
): number {
  let score = 0;
  let maxScore = 0;

  // TypeScript as primary language (+30 points)
  maxScore += 30;
  if (entry.sdk.primaryLanguage.toLowerCase() === "typescript") {
    score += 30;
  } else if (entry.sdk.otherLanguages.some((l) => l.toLowerCase() === "typescript")) {
    score += 15;
  }

  // Required language match (+20 points)
  maxScore += 20;
  if (constraints?.requiredLanguage) {
    const required = constraints.requiredLanguage.toLowerCase();
    if (entry.sdk.primaryLanguage.toLowerCase() === required) {
      score += 20;
    } else if (entry.sdk.otherLanguages.some((l) => l.toLowerCase() === required)) {
      score += 10;
    }
  } else {
    score += 20; // No constraint — full points
  }

  // Number of code examples (+20 points)
  maxScore += 20;
  const exampleScore = Math.min(entry.codeExamples.length / 3, 1) * 20;
  score += exampleScore;

  // Auth setup clarity — few steps is better (+15 points)
  maxScore += 15;
  const setupSteps = entry.auth.setupSteps.length;
  if (setupSteps <= 3) score += 15;
  else if (setupSteps <= 5) score += 10;
  else score += 5;

  // Gotcha-to-example ratio — too many gotchas signal rough DX (+15 points)
  maxScore += 15;
  const gotchaRatio = entry.gotchas.length / Math.max(entry.codeExamples.length, 1);
  if (gotchaRatio <= 1.5) score += 15;
  else if (gotchaRatio <= 3) score += 8;
  else score += 3;

  return score / maxScore;
}

// ─── Pricing Fit ──────────────────────────────────────────────────────────────

function scorePricingFit(
  entry: ApiEntry,
  constraints?: SearchConstraints
): number {
  let score = 0.5; // Neutral baseline

  if (constraints?.preferFree) {
    if (entry.pricing.model === "free" || entry.pricing.model === "open_source") {
      score = 1.0;
    } else if (
      entry.pricing.model === "freemium" &&
      entry.pricing.freeTier !== null
    ) {
      score = 0.85;
    } else if (entry.pricing.model === "usage_based") {
      score = 0.6; // Usage-based can be effectively free at low usage
    } else {
      score = 0.2; // Paid only
    }
  } else {
    // No pricing preference — slight boost for usage-based (no upfront cost)
    if (entry.pricing.model === "usage_based") {
      score = 0.65;
    } else if (entry.pricing.model === "freemium") {
      score = 0.6;
    } else if (entry.pricing.model === "free" || entry.pricing.model === "open_source") {
      score = 0.7;
    } else {
      score = 0.5;
    }
  }

  return score;
}

// ─── Category Boost ───────────────────────────────────────────────────────────

/**
 * When a category is detected with high confidence, apply a multiplicative
 * boost to APIs in that category to help them surface over noisy competitors.
 */
function applyCategoryBoost(
  score: number,
  entry: ApiEntry,
  detectedCategory: string | null,
  detectedConfidence: number
): number {
  if (!detectedCategory || detectedConfidence < 0.4) return score;

  if (entry.category === detectedCategory) {
    // Boost: up to 15% for high-confidence matches
    const boost = detectedConfidence * 0.15;
    return Math.min(score * (1 + boost), 1.0);
  }
  return score;
}

// ─── Main Scoring Function ────────────────────────────────────────────────────

export interface ScoringContext {
  /** Synonym-expanded query for richer matching */
  expandedQuery: string;
  /** Detected category from the query */
  detectedCategory: string | null;
  /** Confidence in the detected category (0-1) */
  detectedConfidence: number;
}

export function scoreEntry(
  entry: ApiEntry,
  query: string,
  constraints?: SearchConstraints,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
  context?: ScoringContext
): RankedResult {
  // Use expanded query for tokenization if available
  const effectiveQuery = context?.expandedQuery ?? query;
  const queryTokens = tokenize(effectiveQuery);

  const useCaseFitRaw = scoreUseCaseFit(entry, queryTokens);
  const qualityRaw = scoreQuality(entry);
  const devExperienceRaw = scoreDevExperience(entry, constraints);
  const pricingFitRaw = scorePricingFit(entry, constraints);

  const baseScore =
    useCaseFitRaw * weights.useCaseFit +
    qualityRaw * weights.qualityScore +
    devExperienceRaw * weights.devExperience +
    pricingFitRaw * weights.pricingFit;

  // Apply category boost from detected category
  const totalScore = applyCategoryBoost(
    baseScore,
    entry,
    context?.detectedCategory ?? null,
    context?.detectedConfidence ?? 0
  );

  const scoreBreakdown: Record<string, number> = {
    useCaseFit: Math.round(useCaseFitRaw * 100) / 100,
    qualityScore: Math.round(qualityRaw * 100) / 100,
    devExperience: Math.round(devExperienceRaw * 100) / 100,
    pricingFit: Math.round(pricingFitRaw * 100) / 100,
    total: Math.round(totalScore * 100) / 100,
  };

  return { entry, score: totalScore, scoreBreakdown };
}

// ─── Ranking Function ─────────────────────────────────────────────────────────

export function rankEntries(
  entries: ApiEntry[],
  query: string,
  constraints?: SearchConstraints,
  topN: number = 3,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
  context?: ScoringContext
): RankedResult[] {
  if (entries.length === 0) return [];

  const scored = entries.map((entry) =>
    scoreEntry(entry, query, constraints, weights, context)
  );

  // Sort descending by total score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topN);
}
