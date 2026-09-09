#!/usr/bin/env node
/**
 * Bundles and runs the local server (scripts/local-server.ts) in the
 * foreground for local development. See scripts/local-server.ts for why
 * this replaces `serverless offline`.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { bundleServer } = require('./bundle-server');

const PORT = process.env.PORT || '3000';
const bundlePath = path.join(process.cwd(), `.tmp-dev-server-${Date.now()}.js`);

function cleanup() {
  fs.rmSync(bundlePath, { force: true });
}

bundleServer(bundlePath);

const server = spawn('node', [bundlePath], {
  stdio: 'inherit',
  env: { ...process.env, PORT },
});

server.on('close', (code) => {
  cleanup();
  process.exit(code ?? 0);
});

process.on('SIGINT', () => server.kill('SIGINT'));
process.on('SIGTERM', () => server.kill('SIGTERM'));
