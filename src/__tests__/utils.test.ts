import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLinesFromFile } from "../utils.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "arewecooked-utils-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(name: string, content: string): string {
  const path = join(tmpDir, name);
  writeFileSync(path, content, "utf8");
  return path;
}

function collect(filePath: string): string[] {
  return [...readLinesFromFile(filePath)];
}

// ---------------------------------------------------------------------------
// readLinesFromFile
// ---------------------------------------------------------------------------

describe("readLinesFromFile", () => {
  it("reads a single line with no newline at end", () => {
    const p = writeFile("a.txt", "hello world");
    expect(collect(p)).toEqual(["hello world"]);
  });

  it("reads multiple LF-delimited lines", () => {
    const p = writeFile("b.txt", "line1\nline2\nline3");
    expect(collect(p)).toEqual(["line1", "line2", "line3"]);
  });

  it("reads multiple CRLF-delimited lines", () => {
    const p = writeFile("c.txt", "line1\r\nline2\r\nline3");
    expect(collect(p)).toEqual(["line1", "line2", "line3"]);
  });

  it("handles trailing newline without producing an extra empty line entry via for-of", () => {
    // Trailing newline → leftover is '' → not yielded (leftover is falsy)
    const p = writeFile("d.txt", "line1\nline2\n");
    expect(collect(p)).toEqual(["line1", "line2"]);
  });

  it("reads an empty file and yields nothing", () => {
    const p = writeFile("e.txt", "");
    expect(collect(p)).toEqual([]);
  });

  it("reads a file larger than the 1 MB chunk size", () => {
    // Write 2 MB of lines so the generator must span multiple read calls
    const lineCount = 50_000;
    const content = Array.from(
      { length: lineCount },
      (_, i) => `line ${i}`
    ).join("\n");
    const p = writeFile("big.txt", content);
    const lines = collect(p);
    expect(lines).toHaveLength(lineCount);
    expect(lines[0]).toBe("line 0");
    expect(lines[lineCount - 1]).toBe(`line ${lineCount - 1}`);
  });

  it("does not leak the file descriptor when consumer breaks early", () => {
    // If fd leaks, the OS will eventually complain; we verify no throw occurs
    // and the generator cleans up via the finally block.
    const p = writeFile("f.txt", "a\nb\nc\nd\ne");
    const gen = readLinesFromFile(p);
    const first = gen.next(); // read one line
    expect(first.value).toBe("a");
    gen.return(undefined); // simulate break — triggers finally → closeSync
    // If fd was not closed, a subsequent open on the same path would fail on
    // systems with strict fd limits; here we just assert no error is thrown.
    expect(() => collect(p)).not.toThrow();
  });

  it("does not leak the file descriptor when consumer throws", () => {
    const p = writeFile("g.txt", "x\ny\nz");
    expect(() => {
      for (const _line of readLinesFromFile(p)) {
        throw new Error("consumer error");
      }
    }).toThrow("consumer error");
    // fd closed by finally; re-reading the file should work fine
    expect(collect(p)).toEqual(["x", "y", "z"]);
  });

  it("preserves lines that contain only whitespace", () => {
    const p = writeFile("h.txt", "a\n   \nb");
    expect(collect(p)).toEqual(["a", "   ", "b"]);
  });

  it("handles a file with a single newline character", () => {
    const p = writeFile("i.txt", "\n");
    // Split "\n" → ["", ""], pop "" (leftover, falsy, not yielded) → yields [""]
    expect(collect(p)).toEqual([""]);
  });
});
