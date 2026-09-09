/**
 * Bundles scripts/local-server.ts (and its handler imports) into a single
 * CJS file with esbuild, so it can be run with plain `node` regardless of
 * ts-node/ESM quirks on the current Node version.
 *
 * @sparticuz/chromium is kept external and resolved from node_modules,
 * matching how it's packaged for the real Lambda deployment (see
 * scripts/build-lambda.js) - bundling its native binary would break its
 * own relative path resolution.
 */
const { spawnSync } = require('child_process');
const path = require('path');

function bundleServer(outfile) {
  const result = spawnSync(
    'npx',
    [
      'esbuild',
      'scripts/local-server.ts',
      '--bundle',
      '--platform=node',
      '--target=node20',
      '--format=cjs',
      '--external:@sparticuz/chromium',
      `--outfile=${outfile}`,
    ],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

module.exports = { bundleServer };

if (require.main === module) {
  bundleServer(path.join(process.cwd(), '.tmp-local-server.js'));
}
