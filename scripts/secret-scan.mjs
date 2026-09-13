import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const excludedDirs = new Set([
  "node_modules",
  ".next",
  ".vercel",
  ".git",
  "out",
  "tmp",
  ".cache",
  "playwright-report",
  "test-results",
]);
const binaryExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".ico",
  ".pdf",
  ".xlsx",
  ".zip",
  ".gz",
  ".wasm",
  ".bcmap",
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
  ".pfb",
]);
const joinParts = (...parts) => parts.join("");
// Assemble prefixes so this scanner does not contain literal credential examples.
const checks = [
  ["GitHub token", new RegExp(joinParts("gh", "[pousr]_", "[A-Za-z0-9]{30,}"))],
  [
    "GitHub fine-grained token",
    new RegExp(joinParts("github", "_pat_", "[A-Za-z0-9_]{40,}")),
  ],
  [
    "API secret token",
    new RegExp(
      joinParts("sk", "-(?:proj-|ant-|live_|test_)?", "[A-Za-z0-9_-]{28,}"),
    ),
  ],
  [
    "Slack token",
    new RegExp(joinParts("xo", "x[baprs]-", "[A-Za-z0-9-]{20,}")),
  ],
  [
    "AWS access key",
    new RegExp(joinParts("(?:AK", "IA|AS", "IA)", "[A-Z0-9]{16}")),
  ],
  ["Google API key", new RegExp(joinParts("AI", "za", "[A-Za-z0-9_-]{35}"))],
  [
    "Private key",
    new RegExp(
      joinParts(
        "-----BE",
        "GIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?",
        "PRIVATE KEY-----",
      ),
    ),
  ],
  [
    "Credential-bearing URL",
    /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]{1,80}:[^\s/@]{6,}@/i,
  ],
];
const assignment =
  /(?:["']?)(?:[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY))["']?\s*[:=]\s*["']([^"'\r\n]{12,})["']/gi;
const placeholder =
  /^(?:example|placeholder|your[-_ ]|replace[-_ ]|changeme|test[-_ ]|dummy|<|\$\{|process\.env|import\.meta\.env)/i;

function inspectText(text) {
  const found = [];
  for (const [rule, pattern] of checks) {
    const match = pattern.exec(text);
    if (match)
      found.push({ rule, line: text.slice(0, match.index).split("\n").length });
  }
  assignment.lastIndex = 0;
  for (const match of text.matchAll(assignment)) {
    if (
      !placeholder.test(match[1]) &&
      /[A-Za-z]/.test(match[1]) &&
      /[0-9/+_=.-]/.test(match[1])
    ) {
      found.push({
        rule: "Non-placeholder credential assignment",
        line: text.slice(0, match.index).split("\n").length,
      });
    }
  }
  return found;
}

function forbiddenName(path) {
  const name = basename(path).toLowerCase();
  return (
    ((name === ".env" || name.startsWith(".env.")) &&
      !/\.(?:example|sample|template)$/.test(name)) ||
    /^(?:credentials|service[-_]account|id_rsa|id_ed25519)(?:\.|$)/.test(
      name,
    ) ||
    /\.(?:p12|pfx|key)$/.test(name)
  );
}

function ignored(path) {
  const segments = path.replaceAll("\\", "/").split("/");
  return (
    segments.some((part) => excludedDirs.has(part)) ||
    /\.(?:log|tsbuildinfo)$/.test(path)
  );
}

function walk(directory, result = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    const path = relative(root, absolute);
    if (ignored(path)) continue;
    if (entry.isDirectory()) walk(absolute, result);
    else result.push(path);
  }
  return result;
}

function publishedFiles() {
  let gitRoot;
  try {
    gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    /* New project: scan source tree before git init. */
  }
  if (gitRoot && resolve(gitRoot).toLowerCase() === root.toLowerCase()) {
    const files = execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
      .split("\0")
      .filter(Boolean);
    // Also detect ignored environment files accidentally placed beside the source.
    const sensitivePaths = walk(root).filter(forbiddenName);
    return {
      mode: "tracked files + unignored publish-source files",
      files: [...new Set([...files, ...sensitivePaths])],
    };
  }
  return {
    mode: "publish-source tree (before independent git initialization)",
    files: walk(root),
  };
}

if (process.argv.includes("--self-test")) {
  for (const value of [
    joinParts("gh", "p_", "Ab9".repeat(14)),
    joinParts("-----BE", "GIN PRIVATE KEY-----"),
    "API_" + 'KEY="abc123def456ghi789"',
    "https://" + "someone:longpassword@host.test",
  ]) {
    assert.ok(
      inspectText(value).length > 0,
      "Credential fixture must be detected",
    );
  }
  assert.equal(inspectText("API_" + 'KEY="your_api_key_here"').length, 0);
  assert.equal(inspectText("日本語CSV: 請求明細,商品一覧").length, 0);
  assert.ok(forbiddenName(".env.production"));
  assert.ok(!forbiddenName(".env.example"));
  console.log("Secret scanner self-test: PASS");
} else {
  const { mode, files } = publishedFiles();
  const findings = [];
  let scanned = 0;
  let binaries = 0;
  for (const path of files.sort()) {
    if (ignored(path)) continue;
    const absolute = resolve(root, path);
    if (!absolute.startsWith(root + "\\") && !absolute.startsWith(root + "/"))
      throw new Error("Source path escaped the project");
    if (!existsSync(absolute)) continue; // Locally deleted tracked file.
    if (forbiddenName(path))
      findings.push({
        file: path,
        rule: "Sensitive credential filename",
        line: 0,
      });
    if (lstatSync(absolute).isSymbolicLink()) {
      findings.push({
        file: path,
        rule: "Review symbolic link before publishing",
        line: 0,
      });
      continue;
    }
    if (binaryExtensions.has(extname(path).toLowerCase())) {
      binaries++;
      continue;
    }
    const bytes = readFileSync(absolute);
    if (bytes.includes(0)) {
      binaries++;
      continue;
    }
    scanned++;
    findings.push(
      ...inspectText(bytes.toString("utf8")).map((finding) => ({
        file: path,
        ...finding,
      })),
    );
  }
  console.log(
    `Secret scan: ${mode}; ${scanned} text files checked; ${binaries} binary assets excluded.`,
  );
  if (findings.length) {
    for (const finding of findings)
      console.error(`${finding.file}:${finding.line} — ${finding.rule}`);
    console.error(
      `FAIL: ${findings.length} candidate(s). Values are never printed. Review before publishing.`,
    );
    process.exitCode = 1;
  } else
    console.log(
      "PASS: no known secret patterns or sensitive credential filenames found.",
    );
}
