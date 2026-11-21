import { build } from "esbuild";

// LiteRT's single-threaded WASM loader uses importScripts, which requires a classic worker.
await build({
  entryPoints: ["src/lib/identification.worker.ts"],
  outfile: "public/identification/assets/litert-2.6.0/worker.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
});
