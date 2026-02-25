/**
 * Zod schemas and TypeScript types for API entries.
 * This is the central contract for all knowledge base data.
 *
 * Exports: ApiEntrySchema, ApiEntry, PartialApiEntrySchema, validateEntry
 */

import { z } from "zod";

// Stub — full implementation in Phase 3
export const ApiEntrySchema = z.object({
  slug: z.string(),
});

export type ApiEntry = z.infer<typeof ApiEntrySchema>;

export function validateEntry(
  data: unknown
): { success: true; data: ApiEntry } | { success: false; errors: string[] } {
  const result = ApiEntrySchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((i) => i.message),
  };
}
