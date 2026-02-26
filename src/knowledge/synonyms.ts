/**
 * Synonym expansion, phrase detection, and category detection for query processing.
 *
 * Exports:
 *   SYNONYM_GROUPS      — raw synonym groups for testing
 *   expandQuery         — expands a query with synonyms
 *   detectPhrases       — extracts modifier intent from a query
 *   detectCategory      — maps a query to a known category with confidence
 */

// ─── Synonym Groups ───────────────────────────────────────────────────────────
// Each group is a list of terms that share meaning in the developer context.
// If any term from a group appears in the query, all terms are added.

export const SYNONYM_GROUPS: readonly string[][] = [
  // Auth / Identity
  [
    "auth", "authentication", "authenticate", "login", "signin", "signup",
    "register", "sso", "oauth", "saml", "identity", "credential", "session",
    "jwt", "token", "passwordless", "social", "provider",
    "log in", "sign in", "sign up", "sign on", "log on",
  ],

  // Payments / Billing
  [
    "payment", "pay", "billing", "checkout", "charge", "subscription",
    "invoice", "revenue", "commerce", "merchant", "card", "stripe",
    "transaction", "pricing", "monetize", "monetization",
  ],

  // Email
  [
    "email", "mail", "smtp", "newsletter", "inbox", "transactional",
    "mailer", "sendgrid", "resend", "postmark", "bounce", "delivery",
  ],

  // Database / Backend storage
  [
    "database", "db", "sql", "nosql", "data", "record", "table",
    "query", "orm", "schema", "postgres", "mysql", "backend", "persist",
    "persistence", "datastore",
  ],

  // Real-time / WebSockets
  [
    "realtime", "real-time", "real time", "websocket", "socket",
    "live", "streaming", "push", "broadcast", "pub-sub", "pubsub",
    "presence", "channel",
  ],

  // SMS / Voice / Messaging
  [
    "sms", "text", "message", "messaging", "twilio", "vonage",
    "phone", "call", "voice", "telephony", "otp", "verify", "verification",
  ],

  // Chat / Conversation
  [
    "chat", "conversation", "messaging", "inbox", "channel",
    "thread", "room", "dm", "direct message",
  ],

  // File / Image / Media Storage
  [
    "upload", "file", "image", "photo", "video", "media", "storage",
    "cdn", "asset", "bucket", "s3", "object", "blob", "picture",
    "avatar", "attachment",
  ],

  // Search / Discovery
  [
    "search", "query", "index", "algolia", "full-text", "fulltext",
    "autocomplete", "facet", "filter", "typeahead", "elasticsearch",
    "discovery",
  ],

  // AI / ML
  [
    "ai", "ml", "llm", "gpt", "claude", "openai", "anthropic",
    "model", "completion", "embedding", "chatbot", "generate", "inference",
    "generative", "machine learning", "artificial intelligence",
    "neural", "natural language", "nlp",
  ],

  // Error Tracking / Monitoring / Observability
  [
    "error", "crash", "crashes", "crashed", "crashing", "exception", "bug",
    "monitoring", "observability", "error tracking", "crash report",
    "sentry", "alerting", "incident", "apm", "logging", "trace",
    "diagnose", "debug", "production issue", "alert",
  ],

  // Analytics / Product Analytics
  [
    "analytics", "tracking", "event", "funnel", "session", "user behavior",
    "product analytics", "posthog", "mixpanel", "amplitude", "heatmap",
    "conversion", "retention", "cohort", "metric",
  ],

  // Push Notifications
  [
    "notification", "push", "alert", "bell", "notify", "in-app",
    "onesignal", "knock", "novu", "apns", "fcm", "mobile notification",
  ],

  // Maps / Location / Geocoding
  [
    "map", "maps", "geo", "geolocation", "location", "address",
    "geocod", "navigate", "navigation", "direction", "coordinate",
    "latitude", "longitude", "place", "places",
  ],

  // Video / Audio / Media Processing
  [
    "video", "stream", "streaming", "transcode", "encode", "playback",
    "mux", "player", "hls", "dash", "vod", "audio", "speech",
    "transcribe", "transcription", "voice synthesis",
  ],

  // Image Processing / CDN
  [
    "image", "resize", "crop", "optimize", "transform", "cdn", "imgix",
    "thumbnail", "watermark", "compress",
  ],
] as const;

// Build a lookup: term → all terms in its group (for fast expansion)
const TERM_TO_GROUP = new Map<string, readonly string[]>();
for (const group of SYNONYM_GROUPS) {
  for (const term of group) {
    TERM_TO_GROUP.set(term.toLowerCase(), group);
  }
}

// ─── Query Expansion ──────────────────────────────────────────────────────────

/**
 * Build a regex to match a synonym term in a query.
 * - Multi-word phrases ("log in"): exact phrase with word boundaries
 * - Single words: left word boundary only (so "crash" matches "crashes")
 */
function buildTermRegex(term: string): RegExp {
  const escaped = term.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  if (term.includes(" ")) {
    // Multi-word: exact phrase match (word boundary on left, space/end on right)
    return new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "i");
  } else {
    // Single word: match at word start; allow suffixes (crash → crashes)
    return new RegExp(`\\b${escaped}`, "i");
  }
}

// Sort terms longest-first so multi-word phrases are checked before their parts
const SORTED_TERM_ENTRIES = [...TERM_TO_GROUP.entries()].sort(
  ([a], [b]) => b.length - a.length
);

/**
 * Expand a query by adding synonyms for any terms it contains.
 * Example: "log in with Google" → "log in with Google auth authentication
 *           login signin signup register sso oauth identity..."
 */
export function expandQuery(query: string): string {
  if (!query) return query;
  const lowerQuery = query.toLowerCase();
  const addedTerms = new Set<string>();
  // Track which positions have been matched to avoid double-matching
  const matchedGroups = new Set<readonly string[]>();

  for (const [term, group] of SORTED_TERM_ENTRIES) {
    if (matchedGroups.has(group)) continue; // Already expanding this group
    const regex = buildTermRegex(term);
    if (regex.test(lowerQuery)) {
      matchedGroups.add(group);
      for (const synonym of group) {
        const synLower = synonym.toLowerCase();
        // Only add if not already present (substring check)
        if (!lowerQuery.includes(synLower)) {
          addedTerms.add(synonym);
        }
      }
    }
  }

  if (addedTerms.size === 0) return query;
  return `${query} ${[...addedTerms].join(" ")}`;
}

// ─── Phrase Detection ─────────────────────────────────────────────────────────

export interface PhraseModifiers {
  /** User wants free or cheap options */
  preferFree: boolean;
  /** User wants open-source or self-hostable options */
  preferOpenSource: boolean;
  /** User emphasizes reliability / production-grade */
  preferReliable: boolean;
  /** Serverless / edge / Vercel context */
  preferServerless: boolean;
  /** Reference to another API ("like Firebase but...") */
  referenceSlug: string | null;
}

const FREE_PATTERNS = [
  /\bfree\b/i, /\bcheap/i, /\bno cost\b/i, /\bbudget\b/i, /\baffordable\b/i,
];
const OPEN_SOURCE_PATTERNS = [
  /\bopen.?source\b/i, /\bself.?host/i, /\bself host/i, /\bown server\b/i,
];
const RELIABLE_PATTERNS = [
  /\breliable\b/i, /\benterprise\b/i, /\bproduction.grade\b/i,
  /\bmost reliable\b/i, /\bhigh.?availab/i, /\buptime\b/i,
];
const SERVERLESS_PATTERNS = [
  /\bserverless\b/i, /\bedge\b/i, /\bvercel\b/i, /\bnextjs?\b/i,
  /\bnext\.js\b/i, /\bcloudflare\b/i,
];

// Known API names to slugs for reference extraction
const API_NAME_TO_SLUG: Record<string, string> = {
  firebase: "firebase", supabase: "supabase", stripe: "stripe",
  sendgrid: "sendgrid", twilio: "twilio", algolia: "algolia",
  auth0: "auth0", clerk: "clerk", cloudinary: "cloudinary",
  openai: "openai", anthropic: "anthropic", sentry: "sentry",
  pusher: "pusher", mapbox: "mapbox", "google maps": "google-maps",
};

/** Extract modifier intent from a query */
export function detectPhrases(query: string): PhraseModifiers {
  const preferFree = FREE_PATTERNS.some((p) => p.test(query));
  const preferOpenSource = OPEN_SOURCE_PATTERNS.some((p) => p.test(query));
  const preferReliable = RELIABLE_PATTERNS.some((p) => p.test(query));
  const preferServerless = SERVERLESS_PATTERNS.some((p) => p.test(query));

  // Detect "like X but..." reference pattern
  let referenceSlug: string | null = null;
  const likePattern = /like\s+([a-z][a-z0-9\s-]*?)(?:\s+but|\s+except|\s+without|,|\.|$)/i;
  const match = likePattern.exec(query);
  if (match) {
    const refName = match[1].trim().toLowerCase();
    referenceSlug = API_NAME_TO_SLUG[refName] ?? null;
  }

  return { preferFree, preferOpenSource, preferReliable, preferServerless, referenceSlug };
}

// ─── Category Detection ───────────────────────────────────────────────────────

export interface CategoryMatch {
  category: string | null;
  confidence: number; // 0-1
}

interface CategoryPattern {
  category: string;
  patterns: RegExp[];
  /** Weight per pattern hit */
  weight: number;
}

const CATEGORY_DETECTORS: CategoryPattern[] = [
  {
    category: "email",
    patterns: [
      /\bemail\b/i, /\bmail\b/i, /\bsmtp\b/i, /\bnewsletter\b/i,
      /\binbox\b/i, /\btransactional\b/i, /\bsend.*mail\b/i,
    ],
    weight: 0.4,
  },
  {
    category: "payments",
    patterns: [
      /\bpay(ment)?s?\b/i, /\bbilling\b/i, /\bcheckout\b/i,
      /\bcharge\b/i, /\bsubscription\b/i, /\binvoice\b/i,
      /\bsaas.*billing\b/i, /\baccept.*payment\b/i, /\bcredit card\b/i,
    ],
    weight: 0.4,
  },
  {
    category: "auth",
    patterns: [
      /\bauth(entication)?\b/i, /\blogin\b/i, /\bsign.?in\b/i,
      /\bsign.?up\b/i, /\boauth\b/i, /\bsso\b/i, /\bidentity\b/i,
      /\blog.*in\b/i, /\buser.*account\b/i, /\bcredential\b/i,
    ],
    weight: 0.4,
  },
  {
    category: "database",
    patterns: [
      /\bdatabase\b/i, /\b(postgres|mysql|sqlite|mongodb)\b/i,
      /\bdata store\b/i, /\bsql\b/i, /\bbackend\b/i,
      /\bstore.*data\b/i, /\bpersist\b/i,
    ],
    weight: 0.35,
  },
  {
    category: "storage",
    patterns: [
      /\bupload\b/i, /\bfile.*upload\b/i, /\bimage.*upload\b/i,
      /\bstore.*file\b/i, /\bcdn\b/i, /\bmedia.*storage\b/i,
    ],
    weight: 0.4,
  },
  {
    category: "ai",
    patterns: [
      /\bai\b/i, /\bllm\b/i, /\bgpt\b/i, /\bchatbot\b/i,
      /\bml\b/i, /\bmachine learning\b/i, /\bartificial intelligence\b/i,
      /\bgenerat(e|ive)\b/i, /\bcompletion\b/i, /\bembedding\b/i,
    ],
    weight: 0.4,
  },
  {
    category: "analytics",
    patterns: [
      /\banalytics\b/i, /\bmonitoring\b/i, /\berror track/i,
      /\bcrash(es|ing)?\b/i, /\bexception\b/i, /\buser.*behav/i,
      /\bproduct.*analytics\b/i, /\btrack.*user\b/i, /\bhow user/i,
      /\bobservabilit/i, /\bsentry\b/i, /\bposthog\b/i,
    ],
    weight: 0.35,
  },
  {
    category: "messaging",
    patterns: [
      /\bsms\b/i, /\btext message\b/i, /\bwhatsapp\b/i, /\bvoice call\b/i,
      /\bphone.*notif/i, /\btwilio\b/i,
    ],
    weight: 0.4,
  },
  {
    category: "notifications",
    patterns: [
      /\bpush.*notif/i, /\bnotif(y|ication)/i, /\bin.?app.*notif/i,
      /\balert.*user\b/i, /\bemail.*notif/i,
    ],
    weight: 0.35,
  },
  {
    category: "communication",
    patterns: [
      /\bchat\b/i, /\bmessag(e|ing)\b/i, /\bconversation\b/i,
      /\breal.?time.*chat\b/i, /\bin.?app.*chat\b/i,
    ],
    weight: 0.35,
  },
  {
    category: "maps",
    patterns: [
      /\bmap(s)?\b/i, /\bgeocode\b/i, /\blocation\b/i,
      /\bnavigation\b/i, /\baddress.*look/i, /\bnearby\b/i,
    ],
    weight: 0.4,
  },
  {
    category: "media",
    patterns: [
      /\bvideo.*stream/i, /\bvideo.*host/i, /\baudio\b/i,
      /\btranscribe\b/i, /\bspeech.?to.?text\b/i, /\bvideo.*encod/i,
      /\bmux\b/i, /\bdeepgram\b/i,
    ],
    weight: 0.4,
  },
  {
    category: "search",
    patterns: [
      /\bsearch\b/i, /\bfull.?text\b/i, /\bautocomplete\b/i,
      /\bsearch engine\b/i, /\balgolia\b/i, /\bindex.*search\b/i,
    ],
    weight: 0.4,
  },
];

/** Detect the most likely category for a query, with a confidence score */
export function detectCategory(query: string): CategoryMatch {
  const scores: Map<string, number> = new Map();

  for (const detector of CATEGORY_DETECTORS) {
    let categoryScore = 0;
    for (const pattern of detector.patterns) {
      if (pattern.test(query)) {
        categoryScore += detector.weight;
      }
    }
    if (categoryScore > 0) {
      scores.set(detector.category, categoryScore);
    }
  }

  if (scores.size === 0) return { category: null, confidence: 0 };

  // Find highest-scoring category
  let bestCategory = "";
  let bestScore = 0;
  let totalScore = 0;
  for (const [cat, score] of scores) {
    totalScore += score;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  }

  // Confidence: how dominant is the top category vs others
  // If one category is clearly dominant, confidence is high
  const dominance = bestScore / totalScore;
  // Clamp raw score: a single strong signal (0.4+) → confidence 0.6+
  const rawConfidence = Math.min(bestScore / 0.8, 1.0);
  const confidence = rawConfidence * (0.5 + dominance * 0.5);

  return { category: bestCategory, confidence: Math.min(confidence, 1.0) };
}
