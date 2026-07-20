/**
 * Point the SDK's UltraHonk prover at bb.js served as native ESM from
 * /vendor/bb (populated by scripts/vendor-bb.mjs on predev/prebuild). See
 * next.config.mjs for why bb.js can't go through webpack. Adapted from the
 * upstream demo (MIT).
 */
import { setUltraHonkBackendLoader } from "@ctd/sdk";

let nativeImport: ((url: string) => Promise<Record<string, unknown>>) | undefined;

function getNativeImport(): (url: string) => Promise<Record<string, unknown>> {
  // Built with new Function so webpack never sees an import() to rewrite;
  // constructed lazily because eval-like codegen is forbidden in some SSR
  // runtimes and proving is browser-only anyway.
  nativeImport ??= new Function("url", "return import(url)") as (
    url: string,
  ) => Promise<Record<string, unknown>>;
  return nativeImport;
}

const BB_URL = "/vendor/bb/index.js";

let registered = false;

/** Idempotent; no-op during SSR. */
export function ensureBrowserBackend(): void {
  if (registered || typeof window === "undefined") return;
  registered = true;
  setUltraHonkBackendLoader(async () => {
    const mod = await getNativeImport()(BB_URL);
    return mod.UltraHonkBackend as never;
  });
}
