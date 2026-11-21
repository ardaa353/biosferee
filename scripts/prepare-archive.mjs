import { copyFile, mkdir } from "node:fs/promises";
await mkdir("public/archive", {recursive: true});
await copyFile("node_modules/node-unrar-js/dist/js/unrar.wasm", "public/archive/unrar-2.0.2.wasm");
