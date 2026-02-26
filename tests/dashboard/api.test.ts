/**
 * Tests for src/dashboard/routes/api.ts
 * Integration tests for the dashboard REST API endpoints.
 * Uses an in-memory SQLite database with all 68 real entries loaded.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import Database from "better-sqlite3";
import { readdirSync, statSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { _setDbForTesting, closeDb, insertEntry } from "../../src/knowledge/db.js";
import { resetTfIdfEngine } from "../../src/knowledge/tfidf.js";
import { validateEntry } from "../../src/knowledge/schema.js";
import type { ApiEntry } from "../../src/knowledge/schema.js";
import { apiRouter } from "../../src/dashboard/routes/api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Test app setup ───────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use("/api", apiRouter);

function loadAllEntries(): ApiEntry[] {
  const entriesDir = join(__dirname, "../../src/entries");
  const results: ApiEntry[] = [];
  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".json")) {
        const raw = JSON.parse(readFileSync(full, "utf-8")) as unknown;
        const r = validateEntry(raw);
        if (r.success) results.push(r.data);
      }
    }
  }
  walk(entriesDir);
  return results;
}

// ─── Simple in-process HTTP helper (no supertest needed) ─────────────────────
// Use Node's built-in http to make requests against the express app

import { createServer } from "node:http";
import http from "node:http";
import type { IncomingMessage } from "node:http";

let serverUrl = "";
let httpServer: ReturnType<typeof createServer>;

beforeAll(() => {
  const memDb = new Database(":memory:");
  _setDbForTesting(memDb);
  for (const entry of loadAllEntries()) insertEntry(entry);

  httpServer = createServer(app);
  return new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => {
      const addr = httpServer.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      serverUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  closeDb();
  resetTfIdfEngine();
  return new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function get(path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    http.get(`${serverUrl}${path}`, (res: IncomingMessage) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: data });
        }
      });
    }).on("error", reject);
  });
}

function post(path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const options = {
      hostname: url.hostname,
      port: parseInt(url.port),
      path: url.pathname,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "0" },
    };
    const req = http.request(options, (res: IncomingMessage) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: data });
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// ─── Type helpers ─────────────────────────────────────────────────────────────

type ApiResponse = { success: boolean; data?: unknown; error?: string };

function asOk(body: unknown): { success: true; data: unknown } {
  const r = body as ApiResponse;
  expect(r.success).toBe(true);
  return r as { success: true; data: unknown };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/stats", () => {
  it("returns 200 with correct shape", async () => {
    const { status, body } = await get("/api/stats");
    expect(status).toBe(200);
    const { data } = asOk(body);
    const d = data as Record<string, unknown>;
    expect(d.totalEntries).toBe(68);
    expect(d.categories).toBe(23);
    expect(d.staleness).toBeDefined();
    expect(d.averageQualityScore).toBeGreaterThan(0);
    expect(d.linterResults).toBeDefined();
  });

  it("staleness has all four levels", async () => {
    const { body } = await get("/api/stats");
    const { data } = asOk(body);
    const staleness = (data as Record<string, unknown>).staleness as Record<string, number>;
    expect(staleness.fresh).toBeDefined();
    expect(staleness.aging).toBeDefined();
    expect(staleness.stale).toBeDefined();
    expect(staleness.critical).toBeDefined();
    const total = staleness.fresh + staleness.aging + staleness.stale + staleness.critical;
    expect(total).toBe(68);
  });
});

describe("GET /api/categories", () => {
  it("returns 23 categories", async () => {
    const { status, body } = await get("/api/categories");
    expect(status).toBe(200);
    const { data } = asOk(body);
    const cats = data as Array<{ category: string; count: number }>;
    expect(cats.length).toBe(23);
  });

  it("each category has a count > 0", async () => {
    const { body } = await get("/api/categories");
    const { data } = asOk(body);
    const cats = data as Array<{ category: string; count: number }>;
    for (const c of cats) {
      expect(c.count).toBeGreaterThan(0);
    }
  });

  it("email category has 4 entries", async () => {
    const { body } = await get("/api/categories");
    const { data } = asOk(body);
    const cats = data as Array<{ category: string; count: number }>;
    const email = cats.find((c) => c.category === "email");
    expect(email?.count).toBe(4);
  });
});

describe("GET /api/entries", () => {
  it("returns all 68 entries by default", async () => {
    const { status, body } = await get("/api/entries");
    expect(status).toBe(200);
    const { data } = asOk(body);
    expect(Array.isArray(data)).toBe(true);
    expect((data as unknown[]).length).toBe(68);
  });

  it("filters by category", async () => {
    const { body } = await get("/api/entries?category=email");
    const { data } = asOk(body);
    const entries = data as Array<{ category: string }>;
    expect(entries.length).toBe(4);
    for (const e of entries) expect(e.category).toBe("email");
  });

  it("returns correct shape per entry", async () => {
    const { body } = await get("/api/entries?category=email");
    const { data } = asOk(body);
    const first = (data as unknown[])[0] as Record<string, unknown>;
    expect(first.slug).toBeTruthy();
    expect(first.name).toBeTruthy();
    expect(first.category).toBe("email");
    expect(first.qualityScore).toBeGreaterThan(0);
    expect(first.staleness).toBeDefined();
  });

  it("search param returns relevant results", async () => {
    const { body } = await get("/api/entries?search=send+transactional+emails");
    const { data } = asOk(body);
    const entries = data as Array<{ category: string; slug: string }>;
    expect(entries.length).toBeGreaterThan(0);
    const topSlugs = entries.slice(0, 3).map((e) => e.slug);
    const hasEmail = topSlugs.some((s) => ["resend", "sendgrid", "postmark", "mailgun"].includes(s));
    expect(hasEmail).toBe(true);
  });
});

describe("GET /api/entries/:slug", () => {
  it("returns full entry for valid slug", async () => {
    const { status, body } = await get("/api/entries/stripe");
    expect(status).toBe(200);
    const { data } = asOk(body);
    const d = data as Record<string, unknown>;
    expect((d.entry as Record<string, unknown>).slug).toBe("stripe");
    expect(d.staleness).toBeDefined();
    expect(d.lintResult).toBeDefined();
  });

  it("returns 404 for unknown slug", async () => {
    const { status, body } = await get("/api/entries/nonexistent-slug-xyz");
    expect(status).toBe(404);
    const r = body as ApiResponse;
    expect(r.success).toBe(false);
  });

  it("lintResult has expected shape", async () => {
    const { body } = await get("/api/entries/stripe");
    const { data } = asOk(body);
    const d = data as Record<string, unknown>;
    const lint = d.lintResult as Record<string, unknown>;
    expect(lint.slug).toBe("stripe");
    expect(Array.isArray(lint.issues)).toBe(true);
    expect(typeof lint.passed).toBe("boolean");
  });
});

describe("GET /api/search", () => {
  it("returns ranked results for valid query", async () => {
    const { status, body } = await get("/api/search?q=authenticate+users");
    expect(status).toBe(200);
    const { data } = asOk(body);
    const d = data as Record<string, unknown>;
    expect(d.query).toBe("authenticate users");
    expect(d.count).toBeGreaterThan(0);
    const results = d.results as Array<Record<string, unknown>>;
    expect(results[0]).toHaveProperty("slug");
    expect(results[0]).toHaveProperty("score");
    expect(results[0]).toHaveProperty("confidence");
    expect(results[0]).toHaveProperty("scoreBreakdown");
  });

  it("returns 400 when q is missing", async () => {
    const { status, body } = await get("/api/search");
    expect(status).toBe(400);
    const r = body as ApiResponse;
    expect(r.success).toBe(false);
  });

  it("top result for 'deploy Next.js app' is a devops API", async () => {
    const { body } = await get("/api/search?q=deploy+a+Next.js+app");
    const { data } = asOk(body);
    const results = (data as Record<string, unknown>).results as Array<{ slug: string }>;
    const slugs = results.map((r) => r.slug);
    const hasDevops = slugs.some((s) => ["vercel", "netlify", "railway", "fly-io"].includes(s));
    expect(hasDevops).toBe(true);
  });
});

describe("GET /api/refresh-report", () => {
  it("returns report with correct shape", async () => {
    const { status, body } = await get("/api/refresh-report");
    expect(status).toBe(200);
    const { data } = asOk(body);
    const d = data as Record<string, unknown>;
    expect(d.report).toBeDefined();
    expect(typeof d.markdown).toBe("string");
    const report = d.report as Record<string, unknown>;
    expect(report.totalEntries).toBe(68);
  });
});

describe("POST /api/entries/:slug/verify", () => {
  it("returns today's date for valid slug", async () => {
    const { status, body } = await post("/api/entries/stripe/verify");
    expect(status).toBe(200);
    const { data } = asOk(body);
    const d = data as Record<string, unknown>;
    const today = new Date().toISOString().slice(0, 10);
    expect(d.lastVerified).toBe(today);
    expect(d.staleness).toBeDefined();
  });

  it("returns 404 for unknown slug", async () => {
    const { status, body } = await post("/api/entries/nonexistent-xyz/verify");
    expect(status).toBe(404);
    const r = body as ApiResponse;
    expect(r.success).toBe(false);
  });
});

describe("GET /api/lint", () => {
  it("returns lint results for all entries", async () => {
    const { status, body } = await get("/api/lint");
    expect(status).toBe(200);
    const { data } = asOk(body);
    const d = data as Record<string, unknown>;
    expect(d.total).toBe(68);
    expect(typeof d.passing).toBe("number");
    expect(typeof d.failing).toBe("number");
    expect((d.passing as number) + (d.failing as number)).toBe(68);
  });
});
