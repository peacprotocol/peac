type Mode = 'DIRECT_USDC' | 'SETTLEMENT_CONTRACT';

function bool(v: string | undefined, d = false): boolean {
  return v === 'true' ? true : v === 'false' ? false : d;
}

function num(v: string | undefined, d: number): number {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
}

function arr(v: string | undefined, d: string[] = []): string[] {
  const list = (v || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : d;
}

export const config = {
  http: {
    port: num(process.env.PORT, 3000),
  },

  session: {
    ttl: num(process.env.SESSION_TTL, 3600),
  },

  x402: {
    mode: (process.env.X402_MODE as Mode) || 'DIRECT_USDC',
    chainId: num(process.env.CHAIN_ID || process.env.X402_CHAIN_ID, 11155111),
    usdcAddress: process.env.USDC_ADDRESS,
    contractAddress: process.env.X402_CONTRACT_ADDRESS,
    rpcUrl: process.env.PROVIDER_URL || process.env.X402_RPC_URL || 'http://localhost:8545',
    privateKey: process.env.X402_PRIVATE_KEY || process.env.PRIVATE_KEY || '',
    timeoutMs: num(process.env.X402_TX_TIMEOUT_MS, 15000),
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  gates: {
    metricsEnabled: bool(process.env.METRICS_ENABLED, false),
    healthEnabled: bool(process.env.HEALTH_ENABLED, true),
    corsOrigins: arr(process.env.CORS_ORIGINS, ['http://localhost:3000']),
  },

  network: {
    ssrfAllowlist: arr(process.env.SSRF_ALLOWLIST),
  },

  redistribution: {
    enabled: bool(process.env.REDIST_ENABLED, false),
    feeBps: num(process.env.REDIST_FEE_BPS, 0),
    treasury: process.env.REDIST_TREASURY,
  },

  gdpr: {
    manifestPrivateKey: process.env.GDPR_MANIFEST_PRIVATE_KEY || '',
  },
};
