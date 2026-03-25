/**
 * Paymentauth JSON-RPC/MCP transport example.
 *
 * Demonstrates: -32042 Payment Required, -32043 Verification Failed,
 * MCP _meta extraction, coexistence with org.peacprotocol/* keys.
 *
 * Run: npx tsx examples/paymentauth-jsonrpc/demo.ts
 */

import {
  isPaymentRequiredError,
  isVerificationFailedError,
  parsePaymentauthFromJsonRpcError,
  extractCredentialFromMcpMeta,
  extractReceiptFromMcpMeta,
  extractPaymentauthCapability,
  normalizeChallenge,
  JSONRPC_PAYMENT_REQUIRED,
  JSONRPC_VERIFICATION_FAILED,
  MCP_META_CREDENTIAL,
  MCP_META_RECEIPT,
} from '@peac/mappings-paymentauth';

// ---------------------------------------------------------------------------
// Mock JSON-RPC data (inline, no network)
// ---------------------------------------------------------------------------

const mockPaymentRequiredError = {
  code: JSONRPC_PAYMENT_REQUIRED,
  message: 'Payment Required',
  data: {
    id: 'ch_jsonrpc_001',
    realm: 'api.example.com',
    method: 'stripe',
    intent: 'charge',
    request: Buffer.from(JSON.stringify({ amount: '500', currency: 'usd' })).toString('base64url'),
  },
};

const mockVerificationFailedError = {
  code: JSONRPC_VERIFICATION_FAILED,
  message: 'Payment Verification Failed',
};

const mockMcpMeta = {
  // paymentauth keys
  [MCP_META_CREDENTIAL]: 'cred_base64url_value',
  [MCP_META_RECEIPT]: 'receipt_base64url_value',
  // PEAC keys (coexisting on same response)
  'org.peacprotocol/receipt_ref': 'sha256:abc123def456',
  'org.peacprotocol/receipt_jws': 'eyJhbGciOiJFZERTQSJ9.payload.signature',
};

const mockCapabilities = {
  experimental: {
    payment: {
      supported: true,
      methods: ['stripe', 'lightning'],
      intents: ['charge', 'session'],
    },
  },
};

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

console.log('=== Paymentauth JSON-RPC/MCP Transport Demo ===\n');

// 1. Detect -32042 Payment Required
console.log('--- JSON-RPC Error Detection ---');
console.log('Is -32042 (Payment Required):', isPaymentRequiredError(mockPaymentRequiredError));
console.log(
  'Is -32043 (Verification Failed):',
  isVerificationFailedError(mockPaymentRequiredError)
);
console.log(
  'Is -32043 on verification error:',
  isVerificationFailedError(mockVerificationFailedError)
);
console.log();

// 2. Parse challenge from JSON-RPC error
console.log('--- Challenge from JSON-RPC Error ---');
const rawChallenge = parsePaymentauthFromJsonRpcError(mockPaymentRequiredError);
if (rawChallenge) {
  const challenge = normalizeChallenge(rawChallenge);
  console.log('Challenge ID:', challenge.id);
  console.log('Method:', challenge.method);
  console.log('Intent:', challenge.intent);
  console.log('Decoded request:', JSON.stringify(challenge.decodedRequest));
}
console.log();

// 3. MCP _meta extraction (coexistence demo)
console.log('--- MCP _meta Key Extraction ---');
const credential = extractCredentialFromMcpMeta(mockMcpMeta);
const receipt = extractReceiptFromMcpMeta(mockMcpMeta);
console.log('paymentauth credential:', credential ? '[present]' : '[absent]');
console.log('paymentauth receipt:', receipt ? '[present]' : '[absent]');
console.log('PEAC receipt_ref:', mockMcpMeta['org.peacprotocol/receipt_ref']);
console.log('Coexistence: both org.paymentauth/* and org.peacprotocol/* keys present');
console.log();

// 4. MCP capability advertisement
console.log('--- MCP Capability Advertisement ---');
const capability = extractPaymentauthCapability(mockCapabilities);
if (capability) {
  console.log('Payment supported:', capability.supported);
  console.log('Methods:', capability.methods);
  console.log('Intents:', capability.intents);
}
console.log();

console.log('=== Done ===');
