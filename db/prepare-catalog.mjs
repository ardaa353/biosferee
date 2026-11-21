import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./prepare_catalog.py', import.meta.url));
const python = process.platform === 'win32' ? 'python' : 'python3';
const result = spawnSync(python, [script], { stdio: 'inherit' });
if (result.error) console.error(`Catalogue of Life: ${result.error.message}`);
process.exitCode = result.status ?? 1;
