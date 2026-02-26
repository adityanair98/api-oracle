/**
 * MCP Tool: check_api_freshness
 * Reports how up-to-date the API Oracle knowledge base entries are.
 * Returns a staleness summary — useful before making API recommendations.
 *
 * Exports: registerCheckApiFreshness
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAllEntries } from "../knowledge/db.js";
import { checkAllEntries, filterByLevel } from "../updater/staleness.js";
import { buildFreshnessReport, formatReport, formatBriefSummary } from "../updater/report.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tool:check-freshness");

const inputSchema = {
  slug: z
    .string()
    .optional()
    .describe(
      "Optional: check freshness for a specific API by slug (e.g. 'stripe'). " +
        "If omitted, returns a summary for all entries."
    ),
  level: z
    .enum(["aging", "stale", "critical"])
    .optional()
    .describe(
      "Optional: filter to only show entries at this staleness level or worse. " +
        "Values: 'aging' (3–6 months), 'stale' (6–12 months), 'critical' (>12 months)."
    ),
  brief: z
    .boolean()
    .optional()
    .describe("Optional: return a one-line summary instead of a full report (default: false)."),
};

export function registerCheckApiFreshness(server: McpServer): void {
  server.tool(
    "check_api_freshness",
    "Check how up-to-date the API Oracle knowledge base is. Returns a freshness report showing which entries need review based on their lastVerified date.",
    inputSchema,
    async ({ slug, level, brief }) => {
      logger.info("check_api_freshness called", { slug, level, brief });

      try {
        const entries = getAllEntries();

        if (entries.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No entries found in the database. Run `npm run seed` first.",
              },
            ],
          };
        }

        // Single-entry lookup
        if (slug) {
          const entry = entries.find((e) => e.slug === slug);
          if (!entry) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No entry found with slug: ${slug}`,
                },
              ],
            };
          }
          const [info] = checkAllEntries([entry]);
          if (!info) {
            return {
              content: [{ type: "text" as const, text: "Error computing staleness." }],
            };
          }
          const text =
            `**${entry.name}** (${entry.slug})\n` +
            `Last verified: ${info.lastVerified}\n` +
            `Age: ${info.daysSinceVerified} days\n` +
            `Status: ${info.level}`;
          return { content: [{ type: "text" as const, text }] };
        }

        // Full report
        let allInfos = checkAllEntries(entries);

        if (level) {
          const levelOrder: Record<string, number> = { fresh: 0, aging: 1, stale: 2, critical: 3 };
          const minLevel = levelOrder[level] ?? 0;
          allInfos = allInfos.filter((i) => (levelOrder[i.level] ?? 0) >= minLevel);
        }

        const report = buildFreshnessReport(allInfos);

        if (brief) {
          return {
            content: [{ type: "text" as const, text: formatBriefSummary(report) }],
          };
        }

        return {
          content: [{ type: "text" as const, text: formatReport(report) }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("check_api_freshness error", { error: message });
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
        };
      }
    }
  );
}
