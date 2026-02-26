/**
 * Dashboard REST API routes.
 * All routes return { success: true, data: ... } or { success: false, error: "..." }
 *
 * Exports: apiRouter
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { getAllEntries, getBySlug as getEntryBySlug } from "../../knowledge/db.js";
import { findApis } from "../../knowledge/search.js";
import { checkAllEntries, checkStaleness } from "../../updater/staleness.js";
import { buildFreshnessReport, formatReport } from "../../updater/report.js";
import { lintEntry } from "../../updater/linter.js";
import type { ApiEntry } from "../../knowledge/schema.js";
import type { StalenessLevel } from "../../updater/staleness.js";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("dashboard:api");

export const apiRouter = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ok(res: Response, data: unknown): void {
  res.json({ success: true, data });
}

function err(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, error: message });
}

type SortField = "name" | "qualityScore" | "lastVerified" | "staleness";
type SortOrder = "asc" | "desc";

const LEVEL_ORDER: Record<StalenessLevel, number> = {
  fresh: 0, aging: 1, stale: 2, critical: 3,
};

function sortEntries(
  entries: ApiEntry[],
  sort: SortField,
  order: SortOrder
): ApiEntry[] {
  const stalenessMap = new Map<string, StalenessLevel>(
    checkAllEntries(entries).map((i) => [i.slug, i.level])
  );

  return [...entries].sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "qualityScore":
        cmp = a.qualityScore - b.qualityScore;
        break;
      case "lastVerified":
        cmp = a.lastVerified.localeCompare(b.lastVerified);
        break;
      case "staleness": {
        const la = LEVEL_ORDER[stalenessMap.get(a.slug) ?? "fresh"];
        const lb = LEVEL_ORDER[stalenessMap.get(b.slug) ?? "fresh"];
        cmp = la - lb;
        break;
      }
    }
    return order === "desc" ? -cmp : cmp;
  });
}

// ─── GET /api/entries ─────────────────────────────────────────────────────────

apiRouter.get("/entries", (req: Request, res: Response): void => {
  try {
    let entries = getAllEntries();

    const { category, search, sort = "name", order = "asc" } = req.query as Record<string, string>;

    if (category && category !== "all") {
      entries = entries.filter((e) => e.category === category);
    }

    if (search && search.trim()) {
      const results = findApis(search.trim(), undefined, 68);
      const slugSet = new Set(results.map((r) => r.entry.slug));
      entries = entries.filter((e) => slugSet.has(e.slug));
      // Preserve search order
      const slugOrder = new Map(results.map((r, i) => [r.entry.slug, i]));
      entries.sort((a, b) => (slugOrder.get(a.slug) ?? 99) - (slugOrder.get(b.slug) ?? 99));
    } else {
      entries = sortEntries(entries, sort as SortField, order as SortOrder);
    }

    const stalenessInfos = checkAllEntries(entries);
    const stalenessMap = new Map(stalenessInfos.map((i) => [i.slug, i]));

    const data = entries.map((e) => {
      const staleness = stalenessMap.get(e.slug);
      return {
        slug: e.slug,
        name: e.name,
        category: e.category,
        subcategory: e.subcategory,
        description: e.description.slice(0, 120) + (e.description.length > 120 ? "…" : ""),
        qualityScore: e.qualityScore,
        pricing: { model: e.pricing.model, freeTier: e.pricing.freeTier },
        bestFor: e.bestFor,
        lastVerified: e.lastVerified,
        staleness: staleness
          ? { level: staleness.level, daysSinceVerified: staleness.daysSinceVerified }
          : null,
      };
    });

    ok(res, data);
  } catch (e: unknown) {
    logger.error("GET /api/entries error", { error: String(e) });
    err(res, 500, "Internal server error");
  }
});

// ─── GET /api/entries/:slug ───────────────────────────────────────────────────

apiRouter.get("/entries/:slug", (req: Request, res: Response): void => {
  try {
    const { slug } = req.params as { slug: string };
    const entry = getEntryBySlug(slug);

    if (!entry) {
      err(res, 404, `No entry found with slug: ${slug}`);
      return;
    }

    const staleness = checkStaleness(entry);
    const lintResult = lintEntry(entry);

    ok(res, { entry, staleness, lintResult });
  } catch (e: unknown) {
    logger.error("GET /api/entries/:slug error", { error: String(e) });
    err(res, 500, "Internal server error");
  }
});

// ─── GET /api/categories ──────────────────────────────────────────────────────

apiRouter.get("/categories", (_req: Request, res: Response): void => {
  try {
    const entries = getAllEntries();
    const counts = new Map<string, number>();

    for (const e of entries) {
      counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    }

    const data = [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => a.category.localeCompare(b.category));

    ok(res, data);
  } catch (e: unknown) {
    logger.error("GET /api/categories error", { error: String(e) });
    err(res, 500, "Internal server error");
  }
});

// ─── GET /api/stats ───────────────────────────────────────────────────────────

apiRouter.get("/stats", (_req: Request, res: Response): void => {
  try {
    const entries = getAllEntries();
    const stalenessInfos = checkAllEntries(entries);

    const staleness: Record<StalenessLevel, number> = { fresh: 0, aging: 0, stale: 0, critical: 0 };
    for (const info of stalenessInfos) staleness[info.level]++;

    const lintResults = entries.map(lintEntry);
    const lintPassing = lintResults.filter((r) => r.passed).length;

    const avgQuality =
      entries.reduce((sum, e) => sum + e.qualityScore, 0) / entries.length;

    const categories = new Set(entries.map((e) => e.category)).size;

    ok(res, {
      totalEntries: entries.length,
      categories,
      staleness,
      linterResults: { passing: lintPassing, failing: entries.length - lintPassing },
      averageQualityScore: Math.round(avgQuality * 10) / 10,
      lastUpdated: new Date().toISOString(),
    });
  } catch (e: unknown) {
    logger.error("GET /api/stats error", { error: String(e) });
    err(res, 500, "Internal server error");
  }
});

// ─── GET /api/search ─────────────────────────────────────────────────────────

apiRouter.get("/search", (req: Request, res: Response): void => {
  try {
    const { q } = req.query as { q?: string };

    if (!q || !q.trim()) {
      err(res, 400, "Query param 'q' is required");
      return;
    }

    const results = findApis(q.trim(), undefined, 5);

    const data = {
      query: q.trim(),
      count: results.length,
      results: results.map((r) => ({
        slug: r.entry.slug,
        name: r.entry.name,
        category: r.entry.category,
        score: Math.round(r.score * 1000) / 1000,
        confidence: Math.round((r.confidence ?? 0) * 100),
        scoreBreakdown: r.scoreBreakdown,
        bestFor: r.entry.bestFor,
        description: r.entry.description.slice(0, 120) + "…",
      })),
    };

    ok(res, data);
  } catch (e: unknown) {
    logger.error("GET /api/search error", { error: String(e) });
    err(res, 500, "Internal server error");
  }
});

// ─── GET /api/refresh-report ──────────────────────────────────────────────────

apiRouter.get("/refresh-report", (_req: Request, res: Response): void => {
  try {
    const entries = getAllEntries();
    const allInfos = checkAllEntries(entries);
    const report = buildFreshnessReport(allInfos);
    ok(res, { report, markdown: formatReport(report) });
  } catch (e: unknown) {
    logger.error("GET /api/refresh-report error", { error: String(e) });
    err(res, 500, "Internal server error");
  }
});

// ─── POST /api/entries/:slug/verify ──────────────────────────────────────────

apiRouter.post("/entries/:slug/verify", (req: Request, res: Response): void => {
  try {
    const { slug } = req.params as { slug: string };
    const entry = getEntryBySlug(slug);

    if (!entry) {
      err(res, 404, `No entry found with slug: ${slug}`);
      return;
    }

    // In a real setup this would write to the JSON file and re-seed.
    // For the dashboard, we return the updated staleness as if verified now.
    const today = new Date().toISOString().slice(0, 10);
    const updatedEntry = { ...entry, lastVerified: today };
    const staleness = checkStaleness(updatedEntry);

    logger.info("Mark as verified (read-only — update JSON file to persist)", { slug, today });

    ok(res, {
      slug,
      lastVerified: today,
      staleness,
      note: `To persist: update lastVerified in src/entries/**/${slug}.json and run npm run seed`,
    });
  } catch (e: unknown) {
    logger.error("POST /api/entries/:slug/verify error", { error: String(e) });
    err(res, 500, "Internal server error");
  }
});

// ─── GET /api/lint ────────────────────────────────────────────────────────────

apiRouter.get("/lint", (_req: Request, res: Response): void => {
  try {
    const entries = getAllEntries();
    const results = entries.map(lintEntry);
    const failing = results.filter((r) => !r.passed);
    const passing = results.filter((r) => r.passed);

    ok(res, {
      total: results.length,
      passing: passing.length,
      failing: failing.length,
      results: results.sort((a, b) => b.issues.length - a.issues.length),
    });
  } catch (e: unknown) {
    logger.error("GET /api/lint error", { error: String(e) });
    err(res, 500, "Internal server error");
  }
});
