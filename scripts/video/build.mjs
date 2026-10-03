import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Use the already pinned esbuild dependency of tsx. A single bundle avoids the
// expensive per-module TypeScript loader path on hosts under memory pressure.
const require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [dirname(require.resolve('tsx/package.json'))] }));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
process.env.GOMAXPROCS ||= '2';
await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['scripts/video/prepare-refund.ts', 'scripts/video/capture.ts'],
  outdir: 'submission/_video_work',
  outExtension: { '.js': '.mjs' },
  bundle: true, platform: 'node', format: 'esm',
  external: ['*.node', '@playwright/test'],
  banner: { js: 'import {createRequire as __createRequire} from "node:module";import {fileURLToPath as __fileURLToPath} from "node:url";import {dirname as __dirnameFn} from "node:path";const require=__createRequire(import.meta.url);const __filename=__fileURLToPath(import.meta.url);const __dirname=__dirnameFn(__filename);' },
  logLevel: 'info',
});
