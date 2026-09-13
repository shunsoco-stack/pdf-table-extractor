import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryUrl = 'https://github.com/shunsoco-stack/pdf-table-extractor';
const expectedFiles = [
  '01-pdf-upload.png',
  '02-pdf-table-preview.png',
  '03-table-edit.png',
  '04-multiple-tables.png',
  '05-export.png',
];
const windowsChromium = process.platform === 'win32' && process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe')
  : undefined;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  || (windowsChromium && existsSync(windowsChromium) ? windowsChromium : undefined);

// A fresh browser context visits the actual public GitHub Web UI. No login state,
// cookies, access tokens or certificate/security bypasses are supplied.
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, locale: 'ja-JP', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const response = await page.goto(repositoryUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  assert.equal(response?.status(), 200, 'Public repository Web UI must return HTTP 200');
  assert.equal(new URL(page.url()).origin, 'https://github.com');

  const readme = page.locator('article.markdown-body').first();
  await expect(readme).toBeVisible({ timeout: 30_000 });
  const images = readme.locator('img[src*="/docs/screenshots/"]');
  await expect(images).toHaveCount(5);
  const evidence = [];

  for (const file of expectedFiles) {
    const image = images.filter({ visible: true }).locator(`xpath=self::img[contains(@src, "${file}")]`);
    await expect(image).toHaveCount(1);
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect.poll(async () => image.evaluate(element => element.complete && element.naturalWidth > 0), { timeout: 30_000 }).toBe(true);
    const imageInfo = await image.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return {
        alt: element.alt,
        src: element.currentSrc || element.src,
        naturalWidth: element.naturalWidth,
        naturalHeight: element.naturalHeight,
        renderedWidth: Math.round(bounds.width),
        renderedHeight: Math.round(bounds.height),
      };
    });
    assert.ok(imageInfo.alt.length > 0, `${file}: descriptive alt is required`);
    assert.ok(imageInfo.renderedWidth > 0 && imageInfo.renderedHeight > 0, `${file}: image must occupy visible page space`);
    evidence.push({ file, ...imageInfo });
  }

  mkdirSync(join(root, '.cache'), { recursive: true });
  await page.screenshot({ path: join(root, '.cache', 'github-readme.png'), fullPage: true });
  const report = {
    status: 'PASS',
    verifiedAt: new Date().toISOString(),
    repositoryUrl,
    method: 'Fresh unauthenticated Chromium context; actual GitHub Web UI README; each image scrolled into view and checked for completed decoding, non-zero intrinsic size and visible layout.',
    browser: `Chromium ${browser.version()}`,
    httpStatus: response.status(),
    expectedCount: expectedFiles.length,
    verifiedCount: evidence.length,
    images: evidence,
  };
  writeFileSync(join(root, 'docs', 'github-readme-verification.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`PASS: all ${evidence.length} screenshots rendered in the public GitHub README Web UI.`);
  for (const item of evidence) console.log(`${item.file}: ${item.naturalWidth} x ${item.naturalHeight} pixels; visible ${item.renderedWidth} x ${item.renderedHeight}`);
} finally {
  await browser.close();
}
