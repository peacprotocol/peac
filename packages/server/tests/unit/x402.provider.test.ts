export {}; // make this file a module

/**
 * Unit tests for production X402 provider with on-chain call flow mocked,
 * including Redistribution Hook (Preview).
 */

// Capture redistribution metrics
const redistCalls: Array<Record<string, string>> = [];

// Mock metrics for this test suite
jest.mock('../../src/metrics', () => ({
  metrics: {
    paymentAttempt: { inc: jest.fn() },
    redistributionTotal: { inc: (labels: any) => redistCalls.push(labels) },
  },
}));

// In-memory Redis SET NX EX
const store = new Map<string, { v: string; exp: number }>();
jest.mock('ioredis', () => {
  return class MockRedis {
    async set(key: string, value: string, nx?: string, _ex?: string, ttl?: number) {
      if (nx === 'NX') {
        if (store.has(key)) return null;
        const exp = typeof ttl === 'number' ? Date.now() + ttl * 1000 : Number.MAX_SAFE_INTEGER;
        store.set(key, { v: value, exp });
        return 'OK';
      }
      store.set(key, { v: value, exp: Number.MAX_SAFE_INTEGER });
      return 'OK';
    }
    async sadd(_key: string, _member: string) { return 1; }
    async expire(_key: string, _ttl: number) { return 1; }
    async sismember(_key: string, _member: string) { return 1; }
    async srem(_key: string, _member: string) { return 1; }
    async quit() { /* no-op */ }
  };
});

// Ethers mocks (factory)
let failSecondWait = false;
let callIndex = 0;

const mockTx = (opts?: { never?: boolean }) => ({
  hash: '0xdeadbeef',
  wait: jest.fn(() => {
    if (opts?.never) return new Promise(() => { /* never resolves */ });
    return Promise.resolve({ status: 1 });
  }),
});

let mockContractImpl: any = {
  transfer: jest.fn(async () => {
    callIndex += 1;
    if (callIndex === 2 && failSecondWait) return mockTx({ never: true });
    return mockTx();
  }),
  settle: jest.fn(async () => mockTx()),
};

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    Contract: jest.fn().mockImplementation((_addr: string, _abi: any, _signer: any) => mockContractImpl),
    verifyTypedData: jest.fn(), // set via requireMock() below
    JsonRpcProvider: jest.fn().mockImplementation((_url: string) => ({})),
    Wallet: jest.fn().mockImplementation((_pk: string, _p: any) => ({})),
    id: (_s: string) => '0x' + '00'.repeat(32),
  };
});

const okAddress = '0x0000000000000000000000000000000000000AaA';

function resetMocks() {
  store.clear();
  callIndex = 0;
  failSecondWait = false;
  redistCalls.splice(0);
  mockContractImpl = {
    transfer: jest.fn(async () => {
      callIndex += 1;
      if (callIndex === 2 && failSecondWait) return mockTx({ never: true });
      return mockTx();
    }),
    settle: jest.fn(async () => mockTx()),
  };
  const mockedEthers: any = jest.requireMock('ethers');
  (mockedEthers.Contract as jest.Mock).mockImplementation((_a: string, _b: any, _c: any) => mockContractImpl);
  (mockedEthers.verifyTypedData as jest.Mock).mockReset();
}

const baseConfig = {
  x402: {
    mode: 'DIRECT_USDC' as const,
    chainId: 11155111,
    usdcAddress: '0x0000000000000000000000000000000000000001',
    contractAddress: '0x0000000000000000000000000000000000000010',
    rpcUrl: 'http://localhost:8545',
    privateKey: '0x' + '11'.repeat(32),
    timeoutMs: 2000,
  },
  redis: { url: 'redis://localhost:6379' },
  session: { ttl: 3600 },
  redistribution: { enabled: false, feeBps: 0, treasury: undefined as any },
};

jest.mock('../../src/config', () => ({ config: { ...baseConfig } }));

function loadProvider(override?: any) {
  jest.resetModules();
  jest.doMock('../../src/config', () => ({ config: override ?? { ...baseConfig } }));
  return require('../../src/x402').X402Provider as typeof import('../../src/x402').X402Provider;
}

describe('X402Provider Redistribution (Preview)', () => {
  beforeEach(() => resetMocks());

  test('redistribution disabled -> only one transfer and counted as skipped', async () => {
    const X402Provider = loadProvider();
    const mockedEthers: any = jest.requireMock('ethers');
    (mockedEthers.verifyTypedData as jest.Mock).mockReturnValue(okAddress);

    const provider = new X402Provider();
    const token = await provider.processPayment({
      agentId: okAddress,
      nonce: 'n-1',
      recipient: '0x0000000000000000000000000000000000000cCc',
      amount: '1000',
      currency: 'USDC',
      signature: '0xsig',
    });

    expect(typeof token).toBe('string');
    expect(mockContractImpl.transfer).toHaveBeenCalledTimes(1);
    expect(redistCalls[0]).toEqual({ outcome: 'skipped', mode: 'DIRECT_USDC' });
  });

  test('redistribution enabled (DIRECT_USDC) applies fee transfer', async () => {
    const X402Provider = loadProvider({
      ...baseConfig,
      redistribution: { enabled: true, feeBps: 250, treasury: '0x0000000000000000000000000000000000000dDd' },
    });
    const mockedEthers: any = jest.requireMock('ethers');
    (mockedEthers.verifyTypedData as jest.Mock).mockReturnValue(okAddress);

    const provider = new X402Provider();
    const token = await provider.processPayment({
      agentId: okAddress,
      nonce: 'n-2',
      recipient: '0x0000000000000000000000000000000000000cCc',
      amount: '1000',
      currency: 'USDC',
      signature: '0xsig',
    });

    expect(typeof token).toBe('string');
    expect(mockContractImpl.transfer).toHaveBeenCalledTimes(2);
    const secondArgs = (mockContractImpl.transfer as jest.Mock).mock.calls[1];
    expect(secondArgs[0]).toBe('0x0000000000000000000000000000000000000dDd');
    expect(secondArgs[1]).toBe('25');
    expect(redistCalls.find((c) => c.outcome === 'applied' && c.mode === 'DIRECT_USDC')).toBeTruthy();
  });

  test('redistribution fee transfer timeout -> succeeds and counts failed', async () => {
    failSecondWait = true;

    const X402Provider = loadProvider({
      ...baseConfig,
      redistribution: { enabled: true, feeBps: 250, treasury: '0x0000000000000000000000000000000000000dDd' },
    });
    const mockedEthers: any = jest.requireMock('ethers');
    (mockedEthers.verifyTypedData as jest.Mock).mockReturnValue(okAddress);

    const provider = new X402Provider();
    const token = await provider.processPayment({
      agentId: okAddress,
      nonce: 'n-3',
      recipient: '0x0000000000000000000000000000000000000cCc',
      amount: '1000',
      currency: 'USDC',
      signature: '0xsig',
    });

    expect(typeof token).toBe('string');
    expect(mockContractImpl.transfer).toHaveBeenCalledTimes(2);
    expect(redistCalls.find((c) => c.outcome === 'failed' && c.mode === 'DIRECT_USDC')).toBeTruthy();
  });
});
