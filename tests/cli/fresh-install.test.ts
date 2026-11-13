/**
 * Fresh-install test: runs the BUILT CLI (dist/cli.js) from an empty temp
 * folder — the way `npx` runs it for a new user — and checks that it returns
 * a real recommendation and writes nothing to that folder.
 *
 * Builds the package first so the test always exercises current sources.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, spawn, type ChildProcess } from "child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../..");
const cliPath = join(repoRoot, "dist", "cli.js");

/** Environment for the child: inherited, but never with DB_PATH set. */
function cleanEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== "DB_PATH") env[k] = v;
  }
  return { ...env, ...extra };
}

let emptyDir: string;
let dotDirRoot: string;
let dotDirCli: string;

beforeAll(() => {
  execSync("npm run build", { cwd: repoRoot, stdio: "pipe" });
  emptyDir = mkdtempSync(join(tmpdir(), "api-oracle-fresh-"));

  // A copy of the package inside a dot-directory, like npx's ~/.npm/_npx/<hash>/
  dotDirRoot = mkdtempSync(join(tmpdir(), "api-oracle-dotdir-"));
  const pkgDir = join(dotDirRoot, ".npm", "_npx", "pkg");
  mkdirSync(pkgDir, { recursive: true });
  cpSync(join(repoRoot, "dist"), join(pkgDir, "dist"), { recursive: true });
  cpSync(join(repoRoot, "src", "entries"), join(pkgDir, "src", "entries"), { recursive: true });
  cpSync(join(repoRoot, "package.json"), join(pkgDir, "package.json"));
  symlinkSync(join(repoRoot, "node_modules"), join(pkgDir, "node_modules"), "dir");
  dotDirCli = join(pkgDir, "dist", "cli.js");
}, 120_000);

afterAll(() => {
  rmSync(emptyDir, { recursive: true, force: true });
  rmSync(dotDirRoot, { recursive: true, force: true });
});

describe("fresh install: built CLI from an empty folder", () => {
  it("serve: find_best_api returns a real recommendation over stdio", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [cliPath, "serve"],
      cwd: emptyDir,
      env: cleanEnv(),
      stderr: "pipe",
    });
    const client = new Client({ name: "fresh-install-test", version: "0.0.0" });
    await client.connect(transport);

    try {
      const res = await client.callTool({
        name: "find_best_api",
        arguments: { task: "send transactional emails" },
      });
      const content = res.content as Array<{ type: string; text: string }>;
      const body = JSON.parse(content[0]!.text) as {
        error?: string;
        recommendation?: { slug: string };
      };

      expect(body.error).toBeUndefined();
      expect(["resend", "sendgrid", "postmark", "mailgun"]).toContain(body.recommendation?.slug);
    } finally {
      await client.close();
    }

    // Nothing (no ./data/api-oracle.db) may be left in the user's folder
    expect(readdirSync(emptyDir)).toEqual([]);
  }, 30_000);

  it("dashboard: serves all bundled entries from an empty folder (installed under a dot-directory)", async () => {
    const port = 38000 + Math.floor(Math.random() * 1000);
    const child: ChildProcess = spawn(process.execPath, [dotDirCli, "dashboard"], {
      cwd: emptyDir,
      env: cleanEnv({ PORT: String(port) }),
      stdio: "pipe",
    });

    try {
      let stats: { data: { totalEntries: number } } | null = null;
      for (let i = 0; i < 40 && !stats; i++) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/stats`);
          stats = (await r.json()) as { data: { totalEntries: number } };
        } catch {
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      expect(stats?.data.totalEntries).toBe(68);

      const page = await fetch(`http://127.0.0.1:${port}/some/client/route`);
      expect(page.status).toBe(200);
    } finally {
      child.kill();
    }

    expect(readdirSync(emptyDir)).toEqual([]);
  }, 30_000);
});
