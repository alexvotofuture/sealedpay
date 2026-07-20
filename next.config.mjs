/**
 * In-browser UltraHonk proving (bb.js) needs multithreading →
 * SharedArrayBuffer → cross-origin isolation, so every response carries
 * COOP=same-origin + COEP=credentialless (credentialless keeps fetch() to the
 * Soroban RPC working without that endpoint sending CORP headers).
 *
 * bb.js must NOT be bundled by webpack: its browser build spawns its wasm Web
 * Worker relative to import.meta.url, which breaks once the file lives in a
 * hashed _next chunk. scripts/vendor-bb.mjs (run by predev/prebuild) copies
 * bb.js's dest/browser into public/vendor/bb, lib/bb-loader.ts loads it as
 * native ESM from there, and the bare specifier is aliased away below.
 */
const crossOriginIsolation = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@ctd/sdk"],
  async headers() {
    return [{ source: "/(.*)", headers: crossOriginIsolation }];
  },
  webpack: (config, { isServer }) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true, topLevelAwait: true };
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    if (!isServer) {
      config.resolve.alias = { ...config.resolve.alias, "@aztec/bb.js": false };
    }
    return config;
  },
};

export default nextConfig;
