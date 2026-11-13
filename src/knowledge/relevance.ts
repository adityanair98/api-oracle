/**
 * Query relevance model — how well does an entry cover what the user asked for?
 *
 * relevance(entry) = IDF-weighted share of the query's words ("concepts") that
 * the entry covers, where a concept is covered by the best field it appears in:
 *
 *   name / slug / subcategory / bestFor / "perfect" use cases   1.0
 *   "good" use cases                                           0.8
 *   description / category                                     0.6
 *   "partial" use cases                                        ignored — in this
 *       knowledge base "partial" marks known poor fits (e.g. Anthropic:
 *       "Generate images or audio", Twilio: "Send transactional emails")
 *
 * A direct word match counts fully; a match only through a synonym group counts
 * SYNONYM_CREDIT. Brand names inside synonym groups (stripe, twilio, mux…) are
 * never used as synonyms — they only count when the user typed them — and
 * product names never match by prefix stemming ("open" !~ "openai").
 *
 * IDF is computed over the entries being ranked, so rare, specific words
 * ("transcription", "resize") outweigh generic ones ("users", "data").
 * Query words that no entry matches at all still count (with a low weight) so
 * mostly-unknown queries get low relevance everywhere.
 *
 * Exports: buildRelevanceModel, entryRelevance, RelevanceModel, tokensMatch,
 *          relevanceTokens
 */

import type { ApiEntry } from "./schema.js";
import { matchSynonymGroups } from "./synonyms.js";

// ─── Tunables ─────────────────────────────────────────────────────────────────

export const FIELD_WEIGHTS = {
  primary: 1.0, // name, slug, subcategory, bestFor, perfect use cases
  good: 0.8, // good use cases
  secondary: 0.6, // description, category
} as const;

/** Credit for a concept matched only through a synonym */
export const SYNONYM_CREDIT = 0.4;

/**
 * Weight of an ordered word pair from the query (e.g. "speech text") relative
 * to the mean IDF of its two words. Rewards entries that contain the phrase in
 * the same order, so "speech to text" prefers STT over text-to-speech.
 */
export const BIGRAM_WEIGHT = 0.5;

/**
 * Weight of a query word that no entry matches at all (≈ the lowest IDF a
 * known word can have). It can never be covered, so a query made mostly of
 * unknown words gets low relevance everywhere instead of a perfect score for
 * the one word it shares with an entry.
 */
export const UNKNOWN_WORD_WEIGHT = 1.0;

// Words that carry no task meaning in a developer's request
const STOP = new Set([
  "a", "an", "the", "to", "in", "on", "of", "for", "by", "at", "as", "is", "be",
  "it", "or", "and", "my", "me", "we", "us", "our", "i", "im", "do", "so", "up",
  "if", "no", "but", "with", "from", "into", "via", "using", "use", "that", "this",
  "these", "those", "them", "their", "they", "you", "your", "what", "which", "when",
  "how", "who", "can", "will", "would", "should", "could", "want", "need", "needs",
  "get", "let", "lets", "make", "add", "build", "just", "some", "any", "all", "also",
  "app", "apps", "application", "way", "best", "good", "thing", "things", "something",
  "anything", "everything", "like", "than", "then", "there", "where", "without",
  "about", "have", "has", "are", "was", "been", "not", "one", "more", "very", "really",
  "know", "someone", "somebody", "whenever", "every", "each",
  // Preference modifiers: handled by constraints / phrase detection, not task words
  "cheap", "cheaper", "cheapest", "affordable", "budget", "free", "reliable", "most",
  "easy", "easiest", "simple", "simplest", "quick", "quickly", "popular", "recommended",
  // Domain-generic: every entry is an API / SDK / service
  "api", "apis", "sdk", "sdks", "service", "services", "tool", "tools",
]);

// Synonym-group terms that are product names. Kept out of synonym expansion.
const BRAND_TERMS = new Set([
  "stripe", "sendgrid", "resend", "postmark", "twilio", "vonage", "algolia",
  "openai", "anthropic", "claude", "gpt", "sentry", "posthog", "mixpanel",
  "amplitude", "onesignal", "knock", "novu", "mux", "imgix", "vercel", "netlify",
  "railway", "heroku", "cloudflare", "shopify", "contentful", "sanity", "strapi",
  "typeform", "calendly", "cal", "snyk", "elasticsearch", "s3", "r2",
]);

// ─── Tokenisation and fuzzy word matching ─────────────────────────────────────

export function relevanceTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

/**
 * Light stemming by prefix: "image"~"images", "upload"~"uploaded",
 * "transcribe"~"transcription", "generate"~"generation", but not
 * "store"~"storefront" or "pay"~"payment".
 */
export function tokensMatch(a: string, b: string, exactOnly?: ReadonlySet<string>): boolean {
  if (a === b) return true;
  // Product names never match by prefix: "open" !~ "openai", "upload" !~ "uploadthing"
  if (exactOnly && (exactOnly.has(a) || exactOnly.has(b))) return false;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 3 && l.startsWith(s) && l.length - s.length <= 3) return true;
  let p = 0;
  while (p < s.length && s[p] === l[p]) p++;
  return p >= 6 && p >= 0.75 * s.length;
}

// ─── Product-name tokens ──────────────────────────────────────────────────────

type Matcher = (a: string, b: string) => boolean;

/**
 * Words in entry names that are ordinary English and should keep stemming
 * ("stream" ~ "streaming", "maps" ~ "map"). Every other name token is a
 * product name and only matches exactly.
 */
const GENERIC_NAME_WORDS = new Set([
  "ai", "replicate", "resemble", "stability", "sanity", "stream", "chat", "neon",
  "fly", "io", "railway", "workers", "spaces", "google", "maps", "platform",
  "channels", "knock", "lemon", "square", "temporal", "trigger", "dev", "paddle",
  "medusa", "clerk", "resend", "com", "aws", "s3", "r2",
]);

/** Product-name tokens of the entries being ranked (+ BRAND_TERMS) */
function productNameTokens(entries: ApiEntry[]): Set<string> {
  const names = new Set<string>(BRAND_TERMS);
  for (const e of entries) {
    for (const t of relevanceTokens(e.name)) if (!GENERIC_NAME_WORDS.has(t)) names.add(t);
  }
  return names;
}

// ─── Entry index ──────────────────────────────────────────────────────────────

interface EntryField {
  /** Unique tokens */
  tokens: string[];
  /** Tokens in text order (for phrase / bigram matching) */
  sequence: string[];
  weight: number;
}

/** Never matches a word — separates texts so no bigram spans two of them */
const BOUNDARY = "|";

function field(texts: string[], weight: number): EntryField {
  const sequence: string[] = [];
  for (const text of texts) {
    if (sequence.length > 0) sequence.push(BOUNDARY);
    sequence.push(...relevanceTokens(text));
  }
  const tokens = [...new Set(sequence.filter((t) => t !== BOUNDARY))];
  return { tokens, sequence, weight };
}

function indexEntry(entry: ApiEntry): EntryField[] {
  const primary = [
    entry.name,
    entry.slug.replace(/-/g, " "),
    entry.subcategory.replace(/-/g, " "),
    entry.bestFor,
    ...entry.useCases.filter((u) => u.fit === "perfect").map((u) => u.task),
  ];
  const good = entry.useCases.filter((u) => u.fit === "good").map((u) => u.task);
  const secondary = [entry.description, entry.category];

  return [
    field(primary, FIELD_WEIGHTS.primary),
    field(good, FIELD_WEIGHTS.good),
    field(secondary, FIELD_WEIGHTS.secondary),
  ];
}

// ─── Query concepts ───────────────────────────────────────────────────────────

interface WordConcept {
  kind: "word";
  key: string;
  token: string;
  synonyms: string[];
}

interface PairConcept {
  kind: "pair";
  key: string;
  first: string;
  second: string;
}

type Concept = WordConcept | PairConcept;

function buildConcepts(query: string, match: Matcher): { words: WordConcept[]; pairs: PairConcept[] } {
  const sequence = relevanceTokens(query);
  const tokens = [...new Set(sequence)];
  const groups = matchSynonymGroups(query);

  const words: WordConcept[] = tokens.map((token) => {
    const synonyms = new Set<string>();
    for (const { term, group } of groups) {
      // Attach the group to the query word(s) that triggered it
      if (!relevanceTokens(term).some((t) => match(t, token))) continue;
      for (const syn of group) {
        for (const st of relevanceTokens(syn)) {
          if (!BRAND_TERMS.has(st) && !match(st, token)) synonyms.add(st);
        }
      }
    }
    return { kind: "word", key: token, token, synonyms: [...synonyms] };
  });

  const pairs: PairConcept[] = [];
  const seenPairs = new Set<string>();
  for (let i = 0; i + 1 < sequence.length; i++) {
    const key = `${sequence[i]} ${sequence[i + 1]}`;
    if (sequence[i] === sequence[i + 1] || seenPairs.has(key)) continue;
    seenPairs.add(key);
    pairs.push({ kind: "pair", key, first: sequence[i]!, second: sequence[i + 1]! });
  }

  return { words, pairs };
}

function fieldHas(field: EntryField, word: string, match: Matcher): boolean {
  return field.tokens.some((t) => match(t, word));
}

/** Max distance between the two words of a pair ("send … emails" = 2) */
const PAIR_WINDOW = 2;

function fieldHasPair(field: EntryField, first: string, second: string, match: Matcher): boolean {
  const seq = field.sequence;
  for (let i = 0; i < seq.length; i++) {
    if (!match(seq[i]!, first)) continue;
    for (let j = i + 1; j <= i + PAIR_WINDOW && j < seq.length; j++) {
      if (seq[j] === BOUNDARY) break;
      if (match(seq[j]!, second)) return true;
    }
  }
  return false;
}

/** 0..1 — how strongly one entry covers one concept */
function conceptMatch(concept: Concept, fields: EntryField[], match: Matcher): number {
  let best = 0;
  for (const field of fields) {
    if (field.weight <= best) continue;
    if (concept.kind === "pair") {
      if (fieldHasPair(field, concept.first, concept.second, match)) best = field.weight;
    } else if (fieldHas(field, concept.token, match)) {
      best = field.weight;
    } else if (
      field.weight * SYNONYM_CREDIT > best &&
      concept.synonyms.some((s) => fieldHas(field, s, match))
    ) {
      best = field.weight * SYNONYM_CREDIT;
    }
  }
  return best;
}

// ─── Model ────────────────────────────────────────────────────────────────────

export interface RelevanceModel {
  /** Concept keys: query words, then ordered word pairs ("speech text") */
  concepts: string[];
  /** concept key → weight (pairs absent from the KB get 0) */
  idf: Map<string, number>;
  /** slug → per-concept match strength, aligned with `concepts` */
  matches: Map<string, number[]>;
}

/** Build the relevance model for one query over the entries being ranked. */
export function buildRelevanceModel(query: string, entries: ApiEntry[]): RelevanceModel {
  const productNames = productNameTokens(entries);
  const match: Matcher = (a, b) => tokensMatch(a, b, productNames);
  const { words, pairs } = buildConcepts(query, match);
  const concepts: Concept[] = [...words, ...pairs];
  const indexes = entries.map((e) => ({ slug: e.slug, fields: indexEntry(e) }));

  const matches = new Map<string, number[]>();
  for (const { slug, fields } of indexes) {
    matches.set(slug, concepts.map((c) => conceptMatch(c, fields, match)));
  }

  const N = entries.length;
  const idf = new Map<string, number>();
  words.forEach((c, i) => {
    let df = 0; // entries that match this word at all (directly or via synonym)
    let directDf = 0; // entries that contain the word itself
    for (const { slug, fields } of indexes) {
      if (matches.get(slug)![i]! > 0) df++;
      if (fields.some((f) => fieldHas(f, c.token, match))) directDf++;
    }
    idf.set(
      c.key,
      df === 0 ? UNKNOWN_WORD_WEIGHT : Math.log((N + 1) / (Math.max(directDf, 1) + 1)) + 1
    );
  });
  pairs.forEach((p, j) => {
    const i = words.length + j;
    const anyMatch = indexes.some(({ slug }) => matches.get(slug)![i]! > 0);
    const a = idf.get(p.first) ?? 0;
    const b = idf.get(p.second) ?? 0;
    // Only phrases that exist somewhere in the KB
    idf.set(p.key, anyMatch ? (BIGRAM_WEIGHT * (a + b)) / 2 : 0);
  });

  return { concepts: concepts.map((c) => c.key), idf, matches };
}

/** 0..1 — IDF-weighted share of the query's concepts the entry covers */
export function entryRelevance(model: RelevanceModel, slug: string): number {
  const m = model.matches.get(slug);
  if (!m) return 0;
  let num = 0;
  let den = 0;
  model.concepts.forEach((c, i) => {
    const w = model.idf.get(c) ?? 0;
    num += w * m[i]!;
    den += w;
  });
  return den === 0 ? 0 : num / den;
}
