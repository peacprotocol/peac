/**
 * MCP Tool Call Example
 *
 * Demonstrates MCP tool integration with PEAC records using the v0.11.1+
 * Evidence Carrier Contract:
 * 1. An MCP server executes a tool and issues a signed record
 * 2. The record is attached to the tool result via top-level MCP `_meta`
 *    carrier keys (`org.peacprotocol/receipt_ref` + `org.peacprotocol/receipt_jws`)
 * 3. A client extracts the carrier, checks receipt_ref consistency, and
 *    verifies the record offline with the issuer public key
 * 4. Two tamper checks show how modification is detected: a carrier
 *    receipt_ref mismatch and an invalid Ed25519 signature
 *
 * The record uses `type: 'org.peacprotocol/mcp-tool-call'`. This is an example
 * custom type URI used by the MCP recipe. It is not a registered PEAC extension
 * group or registered receipt type. The reference public verifier
 * (`@peac/protocol.verifyLocal()`) emits a `type_unregistered` warning for
 * unregistered type values, which downstream policy logic may treat as
 * informational.
 *
 * This example uses local stubs - no external services required.
 */

import { issue, verifyLocal } from '@peac/protocol';
import { generateKeypair } from '@peac/crypto';
import { computeReceiptRef } from '@peac/schema';
import { attachReceiptToMeta, extractReceiptFromMetaAsync } from '@peac/mappings-mcp';

// Configuration
const ISSUER_URL = 'https://mcp-provider.example.com';
const TOOL_NAME = 'web-search';
const COST_PER_CALL_CENTS = 5; // $0.05
const CURRENCY = 'USD';

/** MCP CallToolResult-shaped response with the top-level _meta carrier. */
interface McpToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Simulated MCP tool that performs a web search.
 */
async function webSearchTool(query: string): Promise<{ results: string[] }> {
  return {
    results: [`Result 1 for "${query}"`, `Result 2 for "${query}"`, `Result 3 for "${query}"`],
  };
}

/**
 * MCP server handler: execute the tool, issue a signed record, and attach it
 * to the result via the top-level `_meta` carrier.
 */
async function mcpToolHandler(params: {
  tool: string;
  args: Record<string, unknown>;
  privateKey: Uint8Array;
}): Promise<McpToolCallResult> {
  const query = params.args.query as string;
  const toolResult = await webSearchTool(query);

  // Issue a signed record. The `type` value is an example custom URI used by
  // this MCP recipe; it is not a registered PEAC receipt type, so verification
  // will surface a `type_unregistered` warning.
  const { jws } = await issue({
    iss: ISSUER_URL,
    kind: 'evidence',
    type: 'org.peacprotocol/mcp-tool-call',
    pillars: ['attribution', 'commerce'],
    extensions: {
      'org.peacprotocol/commerce': {
        payment_rail: 'mcp',
        amount_minor: String(COST_PER_CALL_CENTS),
        currency: CURRENCY,
        reference: `mcp_${Date.now()}`,
        asset: CURRENCY,
        env: 'test',
      },
    },
    privateKey: params.privateKey,
    kid: 'mcp-key-2025',
  });

  // receipt_ref is sha256 of the JWS; attachReceiptToMeta writes both values
  // into top-level _meta under the org.peacprotocol/ carrier keys while
  // preserving the rest of the MCP result.
  const receipt_ref = await computeReceiptRef(jws);

  const result: McpToolCallResult = {
    content: [{ type: 'text', text: `Tool ${params.tool} completed.` }],
    structuredContent: { ...toolResult, cost_cents: COST_PER_CALL_CENTS, currency: CURRENCY },
  };

  return attachReceiptToMeta(result, { receipt_ref, receipt_jws: jws }) as McpToolCallResult;
}

/** Flip one character of a string at the given index (tamper helper). */
function flipChar(value: string, index: number): string {
  const original = value[index];
  const replacement = original === 'A' ? 'B' : 'A';
  return value.slice(0, index) + replacement + value.slice(index + 1);
}

/** Modify one payload claim while keeping the original signature (tamper helper). */
function tamperPayload(jws: string): string {
  const [header, payload, signature] = jws.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  decoded.iss = 'https://attacker.example.com';
  const reEncoded = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
  return `${header}.${reEncoded}.${signature}`;
}

/**
 * MCP client: extract the carrier from _meta, verify offline, then run the
 * two tamper checks.
 */
async function mcpClient(params: { privateKey: Uint8Array; publicKey: Uint8Array }): Promise<void> {
  console.log('\n=== PEAC MCP Tool Call Demo ===\n');

  const query = 'PEAC protocol';
  console.log(`1. Tool call: ${TOOL_NAME}("${query}")`);

  const response = await mcpToolHandler({
    tool: TOOL_NAME,
    args: { query },
    privateKey: params.privateKey,
  });

  const refKey = 'org.peacprotocol/receipt_ref';
  const jwsKey = 'org.peacprotocol/receipt_jws';
  console.log(`2. Record attached via top-level _meta carrier keys:`);
  console.log(`   ${refKey} = ${String(response._meta?.[refKey]).slice(0, 24)}...`);
  console.log(`   ${jwsKey} = ${String(response._meta?.[jwsKey]).slice(0, 24)}... `);

  // Extract with receipt_ref consistency check (async variant verifies that
  // receipt_ref matches sha256 of receipt_jws).
  const extracted = await extractReceiptFromMetaAsync(response);
  if (!extracted || extracted.receipts.length === 0) {
    console.error(`   Extraction failed: ${extracted?.violations.join('; ') ?? 'no carrier'}`);
    process.exitCode = 1;
    return;
  }
  console.log(`3. Carrier extracted: receipt_ref consistency OK (0 violations)`);

  // Verify offline with the issuer public key. Expect a `type_unregistered`
  // warning because org.peacprotocol/mcp-tool-call is intentionally unregistered.
  const carrierJws = extracted.receipts[0].receipt_jws!;
  const verifyResult = await verifyLocal(carrierJws, params.publicKey, { issuer: ISSUER_URL });
  if (verifyResult.valid) {
    const commerce = (
      verifyResult.claims.extensions as
        | { 'org.peacprotocol/commerce'?: { amount_minor?: string; currency?: string } }
        | undefined
    )?.['org.peacprotocol/commerce'];
    const typeUnregistered = verifyResult.warnings.some((w) => w.code === 'type_unregistered');
    console.log(`4. Offline verification: valid = true`);
    console.log(`   Amount: ${commerce?.amount_minor ?? '?'} ${commerce?.currency ?? '?'}`);
    console.log(`   Warning type_unregistered (expected): ${typeUnregistered}`);
  } else {
    console.error(`4. Offline verification FAILED: ${verifyResult.code} ${verifyResult.message}`);
    process.exitCode = 1;
    return;
  }

  // Tamper check 1: flip one character of receipt_jws inside _meta. The
  // carrier's receipt_ref no longer matches sha256 of the JWS, so the async
  // extractor rejects the carrier with a violation.
  const tamperedCarrier: McpToolCallResult = {
    ...response,
    _meta: { ...response._meta, [jwsKey]: flipChar(carrierJws, carrierJws.length - 2) },
  };
  const tamperedExtract = await extractReceiptFromMetaAsync(tamperedCarrier);
  const refMismatch =
    tamperedExtract !== null &&
    tamperedExtract.receipts.length === 0 &&
    tamperedExtract.violations.length > 0;
  console.log(`5. Tamper check 1 (flip one char of receipt_jws in _meta):`);
  console.log(`   carrier rejected = ${refMismatch}`);
  console.log(`   violation: ${tamperedExtract?.violations[0] ?? 'none'}`);
  if (!refMismatch) process.exitCode = 1;

  // Tamper check 2: modify a payload claim but keep the original signature.
  // The Ed25519 signature check fails even though the JWS still parses.
  const tamperedJws = tamperPayload(carrierJws);
  const tamperedVerify = await verifyLocal(tamperedJws, params.publicKey, { issuer: ISSUER_URL });
  console.log(`6. Tamper check 2 (modify payload claim, keep signature):`);
  console.log(`   valid = ${tamperedVerify.valid}`);
  console.log(`   code  = ${tamperedVerify.valid ? 'n/a' : tamperedVerify.code}`);
  if (tamperedVerify.valid) process.exitCode = 1;

  console.log('\n=== Demo Complete ===\n');
}

// Main execution
async function main() {
  const { privateKey, publicKey } = await generateKeypair();
  await mcpClient({ privateKey, publicKey });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
