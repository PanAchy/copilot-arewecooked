import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, "../../src/cli.ts");
const tsx = resolve(__dirname, "../../node_modules/.bin/tsx");

// ---------------------------------------------------------------------------
// CLI — --since / --days mutual exclusion (Bug 3)
// ---------------------------------------------------------------------------

describe("CLI — --since and --days mutual exclusion", () => {
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
});
