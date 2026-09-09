#!/usr/bin/env node
/**
 * Builds the deployment artifact for each Lambda function into
 * infra/build/<function>/, ready for Terraform's archive_file data source.
 *
 * Each function is bundled with esbuild (matching the settings previously
 * held in serverless.ts's `custom.esbuild` block), and:
 *  - src/templates/** is copied alongside the bundle, because the handler
 *    code reads templates relative to process.cwd() (i.e. /var/task).
 *  - externalized packages (only @sparticuz/chromium, too large/native to
 *    bundle) are copied into node_modules/ next to the bundle so `require`
 *    resolves them at runtime.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const BUILD_DIR = path.join(ROOT, 'infra', 'build');

const FUNCTIONS = [
  { name: 'generateCertificate', external: ['@sparticuz/chromium'] },
  { name: 'verifyCertificate', external: [] },
];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function build(fn) {
  const outDir = path.join(BUILD_DIR, fn.name);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const args = [
    'esbuild',
    `src/functions/${fn.name}.ts`,
    '--bundle',
    '--platform=node',
    '--target=node24',
    '--format=cjs',
    '--sourcemap',
    `--outfile=${path.join(outDir, 'index.js')}`,
  ];
  for (const dep of fn.external) {
    args.push(`--external:${dep}`);
  }

  const result = spawnSync('npx', args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  copyDir(path.join(ROOT, 'src', 'templates'), path.join(outDir, 'src', 'templates'));

  for (const dep of fn.external) {
    copyDir(path.join(ROOT, 'node_modules', dep), path.join(outDir, 'node_modules', dep));
  }

  console.log(`Built ${fn.name} -> ${path.relative(ROOT, outDir)}`);
}

for (const fn of FUNCTIONS) {
  build(fn);
}
