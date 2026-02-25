/**
 * Zod schemas and TypeScript types for API knowledge base entries.
 * This is the central contract — all data must conform to this schema.
 *
 * Exports: ApiEntrySchema, ApiEntry, PartialApiEntrySchema, validateEntry
 */

import { z } from "zod";

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

const UseCaseSchema = z.object({
  task: z.string().min(1, "Use case task cannot be empty"),
  fit: z.enum(["perfect", "good", "partial"]),
});

const AuthSchema = z.object({
  method: z.enum(["api_key", "oauth2", "bearer_token", "basic_auth", "none"]),
  setupSteps: z.array(z.string().min(1)).min(1, "At least one setup step required"),
  envVarName: z.string().min(1, "Environment variable name required"),
  codeSnippet: z.string().min(1, "Auth code snippet required"),
});

const PricingSchema = z.object({
  model: z.enum(["free", "freemium", "paid", "usage_based", "open_source"]),
  freeTier: z.string().nullable(),
  startingPrice: z.string().nullable(),
  costPer: z.string().nullable(),
  pricingUrl: z.string().url("Pricing URL must be a valid URL"),
});

const RateLimitsSchema = z.object({
  tier: z.string().min(1),
  limit: z.string().min(1),
  notes: z.string().min(1),
  retryStrategy: z.string().min(1),
});

const SdkSchema = z.object({
  primaryLanguage: z.string().min(1),
  installCommand: z.string().min(1),
  importStatement: z.string().min(1),
  otherLanguages: z.array(z.string()),
});

const CodeExampleSchema = z.object({
  title: z.string().min(1, "Code example title required"),
  language: z.string().min(1),
  code: z.string().min(1, "Code example cannot be empty"),
  notes: z.string(),
});

const ReliabilitySchema = z.object({
  uptimeGuarantee: z.string().nullable(),
  statusPageUrl: z.string().url("Status page URL must be valid").nullable(),
  notes: z.string(),
});

// ─── Main Schema ──────────────────────────────────────────────────────────────

export const ApiEntrySchema = z.object({
  // IDENTITY
  name: z.string().min(1, "API name required"),
  slug: z
    .string()
    .min(1, "Slug required")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase kebab-case"),
  category: z.enum([
    "email",
    "payments",
    "ai",
    "storage",
    "search",
    "auth",
    "messaging",
    "analytics",
    "database",
    "media",
    "notifications",
    "maps",
    "communication",
  ]),
  subcategory: z.string().min(1, "Subcategory required"),
  website: z.string().url("Website must be a valid URL"),
  description: z.string().min(20, "Description must be at least 20 characters"),

  // USE CASES
  useCases: z
    .array(UseCaseSchema)
    .min(1, "At least one use case required"),

  // AUTHENTICATION
  auth: AuthSchema,

  // PRICING
  pricing: PricingSchema,

  // RATE LIMITS
  rateLimits: RateLimitsSchema,

  // SDK & INTEGRATION
  sdk: SdkSchema,

  // CODE EXAMPLES
  codeExamples: z
    .array(CodeExampleSchema)
    .min(1, "At least one code example required"),

  // GOTCHAS
  gotchas: z
    .array(z.string().min(1))
    .min(2, "At least 2 gotchas required"),

  // RELIABILITY
  reliability: ReliabilitySchema,

  // SCORING
  qualityScore: z
    .number()
    .min(1, "Quality score minimum is 1")
    .max(10, "Quality score maximum is 10"),
  qualityJustification: z.string().min(10, "Quality justification required"),

  // RELATIONSHIPS
  alternatives: z.array(z.string()),
  complementary: z.array(z.string()),
  bestFor: z.string().min(1, "bestFor summary required"),

  // METADATA
  lastVerified: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "lastVerified must be ISO date (YYYY-MM-DD)"),
  entryVersion: z.number().int().min(1, "Entry version must be at least 1"),
  addedBy: z.string().min(1, "addedBy required"),
});

// ─── Partial Schema (for filtering/search params) ─────────────────────────────

export const PartialApiEntrySchema = ApiEntrySchema.partial();

// ─── TypeScript Types ─────────────────────────────────────────────────────────

export type ApiEntry = z.infer<typeof ApiEntrySchema>;
export type PartialApiEntry = z.infer<typeof PartialApiEntrySchema>;
export type UseCase = z.infer<typeof UseCaseSchema>;
export type Auth = z.infer<typeof AuthSchema>;
export type Pricing = z.infer<typeof PricingSchema>;
export type RateLimits = z.infer<typeof RateLimitsSchema>;
export type Sdk = z.infer<typeof SdkSchema>;
export type CodeExample = z.infer<typeof CodeExampleSchema>;
export type Reliability = z.infer<typeof ReliabilitySchema>;
export type Category = ApiEntry["category"];

// ─── Validation Helper ────────────────────────────────────────────────────────

export function validateEntry(
  data: unknown
): { success: true; data: ApiEntry } | { success: false; errors: string[] } {
  const result = ApiEntrySchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.issues.map(
    (issue) => `${issue.path.join(".")} — ${issue.message}`
  );
  return { success: false, errors };
}
