module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['**/?(*.)+(integration|int).test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
    // puppeteer-core (and its dependency chain) ships ESM-only, with no
    // CommonJS build - Jest's module runtime can't parse `import` syntax in
    // node_modules by default, so it's transpiled to CommonJS here instead.
    '^.+\\.m?js$': ['babel-jest', { presets: [['@babel/preset-env', { targets: { node: 'current' } }]] }],
  },
  // Disables Jest's default "don't transform node_modules" behavior, since
  // puppeteer-core's ESM-only dependencies need the babel-jest transform above.
  transformIgnorePatterns: [],
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.ts'],
  testTimeout: 20000, // Reduced from 60000ms to 20000ms
};