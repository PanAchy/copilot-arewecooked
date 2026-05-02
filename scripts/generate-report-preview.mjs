import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const root = resolve(import.meta.dirname, "..");
const tempDir = mkdtempSync(join(tmpdir(), "arewecooked-preview-"));
const htmlPath = join(tempDir, "report-preview.html");
const pngPath = resolve(root, "docs/assets/report-preview.png");

try {
  execFileSync("npx", ["tsx", "src/mock.ts", "--html", htmlPath], {
    cwd: root,
    stdio: "inherit",
  });

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(htmlPath).href, {
      waitUntil: "networkidle0",
    });
    await page.screenshot({ path: pngPath, fullPage: true });
  } finally {
    await browser.close();
  }

  console.log(`Report preview written to ${pngPath}`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
