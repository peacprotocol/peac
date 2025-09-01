// Jest test setup
import 'jest';

// Mock undici for tests
jest.mock('undici', () => ({
  request: jest.fn(),
}));

// Mock @noble/ed25519 for tests
jest.mock('@noble/ed25519', () => ({
  sign: jest.fn(),
  verify: jest.fn(),
  getPublicKey: jest.fn(),
}));

// Setup global test timeout
jest.setTimeout(10000);
