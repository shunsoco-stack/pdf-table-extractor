import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3017";
const windowsChromium =
  process.platform === "win32" && process.env.LOCALAPPDATA
    ? path.join(
        process.env.LOCALAPPDATA,
        "ms-playwright",
        "chromium-1234",
        "chrome-win64",
        "chrome.exe",
      )
    : undefined;
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (windowsChromium && existsSync(windowsChromium)
    ? windowsChromium
    : undefined);

if (process.env.CAPTURE_SCREENSHOTS === "1") {
  const url = new URL(baseURL);
  if (
    url.protocol !== "https:" ||
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    throw new Error(
      "README screenshots must be captured from the HTTPS production deployment. Set PLAYWRIGHT_BASE_URL.",
    );
  }
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL,
    browserName: "chromium",
    launchOptions: executablePath ? { executablePath } : {},
    viewport: { width: 1440, height: 1080 },
    locale: "ja-JP",
    reducedMotion: "reduce",
    acceptDownloads: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
