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
 *    bundle) are installed with npm into node_modules/ next to the bundle,
 *    together with their own dependency tree (copying just the package folder
 *    left out e.g. follow-redirects/tar-fs, so the function crashed at init).
 *  - the packaged handler is then require()d once, so a missing runtime
 *    dependency fails the build instead of the deployed Lambda.
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

  if (fn.external.length > 0) {
    const dependencies = Object.fromEntries(
      fn.external.map((dep) => {
        const pkg = JSON.parse(
          fs.readFileSync(path.join(ROOT, 'node_modules', dep, 'package.json'), 'utf8'),
        );
        return [dep, pkg.version];
      }),
    );
    fs.writeFileSync(
      path.join(outDir, 'package.json'),
      JSON.stringify({ name: fn.name, private: true, dependencies }, null, 2),
    );
    const install = spawnSync(
      'npm',
      ['install', '--omit=dev', '--no-audit', '--no-fund', '--no-package-lock', '--ignore-scripts'],
      { cwd: outDir, stdio: 'inherit' },
    );
    if (install.status !== 0) {
      process.exit(install.status ?? 1);
    }
  }

  // Load the packaged handler the way Lambda would, so missing runtime
  // dependencies surface here rather than as a 500 from the deployed API.
  const check = spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(path.join(outDir, 'index.js'))})`],
    {
      cwd: outDir,
      stdio: 'inherit',
      env: { ...process.env, AWS_REGION: process.env.AWS_REGION || 'eu-west-1' },
    },
  );
  if (check.status !== 0) {
    console.error(`Packaged ${fn.name} handler failed to load`);
    process.exit(check.status ?? 1);
  }

  console.log(`Built ${fn.name} -> ${path.relative(ROOT, outDir)}`);
}

for (const fn of FUNCTIONS) {
  build(fn);
}
