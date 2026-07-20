/**
 * Vendor @aztec/bb.js's browser build into THIS package's public/ directory.
 *
 * The workspace-root scripts/vendor-bb.mjs hardcodes its destination to
 * packages/app/public — fine for the demo app, wrong for us. Same rationale
 * as upstream: bb.js spawns its wasm Web Worker relative to import.meta.url,
 * so the intact dest/browser directory must be served from a stable public
 * path and loaded as native ESM (see ../lib/bb-loader.ts), never bundled.
 *
 * Runs automatically via predev/prebuild. Output (public/vendor/bb) is a
 * build artifact — safe to delete, regenerated from node_modules each run.
 */
import { cp, mkdir, readdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
// Workspace root (this package lives at <root>/packages/pay).
const repoRoot = resolve(pkgRoot, "..", "..");

function findBrowserDir() {
  const candidates = [];
  const pnpmDir = join(repoRoot, "node_modules", ".pnpm");
  if (existsSync(pnpmDir)) {
    for (const name of readdirSync(pnpmDir)) {
      if (name.startsWith("@aztec+bb.js@")) {
        candidates.push(join(pnpmDir, name, "node_modules", "@aztec", "bb.js", "dest", "browser"));
      }
    }
  }
  candidates.push(join(repoRoot, "node_modules", "@aztec", "bb.js", "dest", "browser"));
  candidates.push(join(pkgRoot, "node_modules", "@aztec", "bb.js", "dest", "browser"));
  return candidates.find((d) => existsSync(join(d, "index.js")));
}

const srcDir = findBrowserDir();
if (!srcDir) {
  throw new Error(
    "could not locate @aztec/bb.js dest/browser under node_modules — run `pnpm install` at the workspace root first",
  );
}

const destDir = join(pkgRoot, "public", "vendor", "bb");
await mkdir(destDir, { recursive: true });
await cp(srcDir, destDir, { recursive: true });

const files = await readdir(destDir);
console.log("vendored @aztec/bb.js browser build");
console.log(`  from ${srcDir}`);
console.log(`  to   ${destDir}`);
console.log(`  files: ${files.join(", ")}`);
