import { cp, mkdir, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const destination = path.join(projectRoot, "public", "pdfjs");
await mkdir(destination, { recursive: true });
await copyFile(
  path.join(packageRoot, "build", "pdf.worker.min.mjs"),
  path.join(destination, "pdf.worker.min.mjs"),
);
for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(
    path.join(packageRoot, directory),
    path.join(destination, directory),
    { recursive: true },
  );
}
await copyFile(
  path.join(packageRoot, "LICENSE"),
  path.join(destination, "LICENSE"),
);
console.log("PDF.js worker, CMaps, fonts and WASM copied to public/pdfjs.");
