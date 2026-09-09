#!/usr/bin/env node
/**
 * Bundles the local server (scripts/local-server.ts), starts it, waits for
 * it to be reachable, runs the Postman/Newman collection against it, then
 * shuts it down.
 */
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { bundleServer } = require('./bundle-server');

const PORT = process.env.API_TEST_PORT || '3001';
const bundlePath = path.join(process.cwd(), `.tmp-api-test-server-${Date.now()}.js`);

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, 'localhost');
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for API test server on port ${port}`));
        } else {
          setTimeout(attempt, 300);
        }
      });
    };
    attempt();
  });
}

async function main() {
  bundleServer(bundlePath);

  const server = spawn('node', [bundlePath], {
    stdio: 'inherit',
    env: { ...process.env, PORT, API_KEY: process.env.API_KEY ?? 'test-api-key' },
  });

  let exitCode = 1;
  try {
    await waitForPort(PORT, 15000);

    exitCode = await new Promise((resolve) => {
      const newman = spawn(
        'npx',
        [
          'newman',
          'run',
          'tests/api/certificate.postman_collection.json',
          '--env-var',
          `baseUrl=http://localhost:${PORT}`,
          '--env-var',
          `apiKey=${process.env.API_KEY ?? 'test-api-key'}`,
        ],
        { stdio: 'inherit' },
      );
      newman.on('close', (code) => resolve(code ?? 1));
    });
  } catch (error) {
    console.error(error);
  } finally {
    server.kill();
    fs.rmSync(bundlePath, { force: true });
  }

  process.exit(exitCode);
}

main();
