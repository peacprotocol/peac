// jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/core/tests/**/*.test.js',
    '**/core/ed25519/node/__tests__/**/*.test.js',
    '**/core/interop/http402/node/__tests__/**/*.test.js'
  ],
};
