import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, "../../src/cli.ts");
const tsx = resolve(__dirname, "../../node_modules/.bin/tsx");
const tempHomes: string[] = [];

afterEach(() => {
  for (const home of tempHomes.splice(0)) {
    rmSync(home, { recursive: true, force: true });
  }
});

function makeTempHome(): string {
  const home = mkdtempSync(join(tmpdir(), "arewecooked-cli-home-"));
  tempHomes.push(home);
  return home;
}

function writeCopilotCliEvents(
  home: string,
  sessionId: string,
  events: any[]
): void {
  const dir = join(home, ".copilot", "session-state", sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "events.jsonl"),
    events.map((event) => JSON.stringify(event)).join("\n") + "\n"
  );
}

// ---------------------------------------------------------------------------
// CLI — --since / --days mutual exclusion (Bug 3)
// ---------------------------------------------------------------------------

describe("CLI — end-to-end fixture parsing", () => {
  it("does not double count Copilot CLI assistant messages when shutdown metrics exist", () => {
    const home = makeTempHome();
    writeCopilotCliEvents(home, "s1", [
      {
        type: "session.start",
        data: { sessionId: "s1" },
        id: "start",
        timestamp: "2026-05-01T00:00:00.000Z",
      },
      {
        type: "assistant.message",
        data: { messageId: "m1", outputTokens: 10_000 },
        id: "msg",
        timestamp: "2026-05-01T00:00:01.000Z",
      },
      {
        type: "session.shutdown",
        id: "shutdown",
        timestamp: "2026-05-01T00:00:02.000Z",
        data: {
          modelMetrics: {
            "gpt-5-mini": {
              requests: { count: 2, cost: 1 },
              usage: {
                inputTokens: 1_000_000,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
              },
            },
          },
        },
      },
    ]);

    const result = spawnSync(tsx, [cliPath, "--json"], {
      encoding: "utf8",
      timeout: 15_000,
      env: { ...process.env, HOME: home },
    });

    expect(result.status).toBe(0);
    const summary = JSON.parse(result.stdout);
    expect(summary.totals.calls).toBe(2);
    expect(summary.totals.inputTokens).toBe(1_000_000);
    expect(summary.totals.outputTokens).toBe(0);
    expect(summary.totals.credits).toBeCloseTo(25, 6);
    expect(summary.records).toHaveLength(1);
    expect(summary.records[0]).toMatchObject({
      mode: "session.shutdown",
      calls: 2,
    });
  });
});

describe("CLI — terminal report", () => {
  it("prints a compact report without writing HTML/PNG", () => {
    const home = makeTempHome();
    writeCopilotCliEvents(home, "s1", [
      {
        type: "session.start",
        data: { sessionId: "s1" },
        id: "start",
        timestamp: "2026-05-01T00:00:00.000Z",
      },
      {
        type: "session.shutdown",
        id: "shutdown",
        timestamp: "2026-05-01T00:00:02.000Z",
        data: {
          modelMetrics: {
            "gpt-5-mini": {
              requests: { count: 1, cost: 1 },
              usage: {
                inputTokens: 1_000_000,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
              },
            },
          },
        },
      },
    ]);

    const result = spawnSync(tsx, [cliPath, "--terminal"], {
      encoding: "utf8",
      timeout: 15_000,
      env: { ...process.env, HOME: home },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("copilot-arewecooked");
    expect(result.stdout).toContain("Estimated cost: 25 AI credits");
    expect(result.stdout).not.toContain("HTML report written");
    expect(result.stdout).not.toContain("PNG screenshot written");
  });
});

describe("CLI — mutual exclusion", () => {
  it("exits with code 1 when both --since and --days are provided", () => {
    const result = spawnSync(
      tsx,
      [cliPath, "--since", "2026-01-01", "--days", "7"],
      { encoding: "utf8", timeout: 15_000 }
    );
    expect(result.status).toBe(1);
  });

  it("prints a 'mutually exclusive' error message to stderr", () => {
    const result = spawnSync(
      tsx,
      [cliPath, "--since", "2026-01-01", "--days", "7"],
      { encoding: "utf8", timeout: 15_000 }
    );
    expect(result.stderr).toContain("mutually exclusive");
  });

  it("exits with code 1 when --json and --terminal are provided", () => {
    const result = spawnSync(tsx, [cliPath, "--json", "--terminal"], {
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "--json and --terminal are mutually exclusive"
    );
  });

  it("exits with code 1 when --html and --terminal are provided", () => {
    const result = spawnSync(
      tsx,
      [cliPath, "--html", "report.html", "--terminal"],
      {
        encoding: "utf8",
        timeout: 15_000,
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "--html and --terminal are mutually exclusive"
    );
  });
});
