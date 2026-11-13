/**
 * Fresh-install test: runs the BUILT CLI (dist/cli.js) from an empty temp
 * folder — the way `npx` runs it for a new user — and checks that it returns
 * a real recommendation and writes nothing to that folder.
 *
 * Builds the package first so the test always exercises current sources.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, spawn, type ChildProcess } from "child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from "fs";
import { createServer, type AddressInfo } from "net";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../..");
const cliPath = join(repoRoot, "dist", "cli.js");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf-8")) as {
  name: string;
  version: string;
};

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
      // Server reports the package.json version (was hardcoded "0.1.0")
      expect(client.getServerVersion()?.version).toBe(pkg.version);

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

  it("--help documents the Claude Code command with the published package name", () => {
    const help = execSync(`"${process.execPath}" "${cliPath}" --help`, { cwd: emptyDir, encoding: "utf-8" });
    expect(help).toContain(`claude mcp add api-oracle -- npx -y ${pkg.name} serve`);
    expect(help).not.toContain("~/.claude/claude_desktop_config.json");
    expect(help).toContain("Claude Desktop");
  });

  it("dashboard: serves all bundled entries from an empty folder (installed under a dot-directory)", async () => {
    // PORT=0: the OS picks a free port and the banner reports it. A fixed or
    // random port can already be held by another socket on the machine (on
    // Linux, 38000–38999 is inside the ephemeral range used for outgoing
    // connections), and the old dashboard then exited 0 without listening.
    // That is the likely, but unproven, cause of the failed v0.6.0 publish.
    const dash = spawnDashboard(dotDirCli, "0");
    try {
      const port = await dash.boundPort;
      const r = await fetch(`http://127.0.0.1:${port}/api/stats`);
      const stats = (await r.json()) as { data: { totalEntries: number } };
      expect(stats.data.totalEntries).toBe(68);

      const page = await fetch(`http://127.0.0.1:${port}/some/client/route`);
      expect(page.status).toBe(200);
    } finally {
      dash.child.kill();
    }

    expect(readdirSync(emptyDir)).toEqual([]);
  }, 30_000);

  it("dashboard: exits 1 with a clear message when the port is in use", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, resolve));
    const busyPort = (blocker.address() as AddressInfo).port;

    try {
      const dash = spawnDashboard(cliPath, String(busyPort));
      const code = await dash.exitCode;
      expect(code).toBe(1);
      // Our hint, not just Node's "address already in use"
      expect(dash.stderr()).toContain(`Port ${busyPort} is already in use`);
      expect(dash.stdout()).not.toContain("Local:");
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  }, 30_000);

  it("dashboard: rejects an invalid PORT", async () => {
    const dash = spawnDashboard(cliPath, "not-a-port");
    expect(await dash.exitCode).toBe(1);
    expect(dash.stderr()).toContain('Invalid PORT "not-a-port"');
  }, 30_000);
});

interface DashboardChild {
  child: ChildProcess;
  /** Resolves with the port from the "Local:" banner; rejects (with stderr) if the process exits first. */
  boundPort: Promise<number>;
  exitCode: Promise<number | null>;
  stdout: () => string;
  stderr: () => string;
}

function spawnDashboard(cli: string, port: string): DashboardChild {
  const child = spawn(process.execPath, [cli, "dashboard"], {
    cwd: emptyDir,
    env: cleanEnv({ PORT: port }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  let err = "";
  // Always drain both pipes so the child never blocks on a full pipe.
  child.stdout?.on("data", (d: Buffer) => (out += d.toString()));
  child.stderr?.on("data", (d: Buffer) => (err += d.toString()));

  // 'close', not 'exit': 'close' fires only after stdout/stderr have ended,
  // so stderr() is complete when exitCode resolves.
  const exitCode = new Promise<number | null>((resolve) => child.on("close", (c) => resolve(c)));
  const boundPort = new Promise<number>((resolve, reject) => {
    child.stdout?.on("data", () => {
      const m = /Local:\s+http:\/\/localhost:(\d+)/.exec(out);
      if (m) resolve(Number(m[1]));
    });
    void exitCode.then((c) =>
      reject(new Error(`dashboard exited (code ${String(c)}) before listening.\nstderr:\n${err.slice(-2000)}`))
    );
    setTimeout(
      () => reject(new Error(`dashboard did not report a port within 15s.\nstderr:\n${err.slice(-2000)}`)),
      15_000
    ).unref();
  });
  // Tests that expect an early exit never await boundPort; don't let its
  // rejection surface as an unhandled rejection.
  boundPort.catch(() => undefined);
  return { child, boundPort, exitCode, stdout: () => out, stderr: () => err };
}
