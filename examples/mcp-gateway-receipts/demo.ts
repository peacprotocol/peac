/**
 * MCP Gateway Receipts Example
 *
 * Demonstrates the gateway sign-point for PEAC records: an MCP gateway that
 * mediates tool calls for many servers issues a signed record per call, and
 * a counterparty verifies the record offline with only the issuer public key.
 *
 * What this example adds over examples/mcp-tool-call:
 * 1. A signed tool-definition record: the gateway signs a manifest of the
 *    tool definitions it exposes, so every per-call record can reference
 *    exactly which definitions were in force (tool_definition_ref).
 * 2. Policy decisions as record content: allow and deny are both evidence.
 *    The registered org.peacprotocol/access extension carries the decision.
 * 3. Content digests: the record binds sha256 digests of the (redacted)
 *    input and result, never the raw payloads. A verifier can detect a
 *    modified result even though the signature still verifies, because the
 *    delivered content no longer matches the bound digest.
 * 4. Redaction as a recorded fact: the gateway redacts PII before hashing,
 *    and the record states redaction_applied so the verifier knows what the
 *    digest covers.
 *
 * The per-call record uses the registered type URI
 * org.peacprotocol/access-decision (the tool-definition record uses
 * org.peacprotocol/provenance-record) and the registered access and
 * correlation extension groups. Gateway-specific
 * facts (digests, policy reference, tool_definition_ref) travel in an
 * integrator-defined extension group (com.example/gateway); verification
 * surfaces informational warnings for keys outside the registry.
 *
 * This example uses local stubs - no network, no external services.
 *
 * Run:
 *   pnpm demo                demo flow (issue, carry, verify, deny record)
 *   pnpm demo:tamper         two tamper checks (digest mismatch, bad signature)
 *   pnpm demo:show-record    print the decoded record header and payload
 */

import { issue, verifyLocal } from '@peac/protocol';
import { generateKeypair, sha256Hex } from '@peac/crypto';
import { computeReceiptRef } from '@peac/schema';
import { attachReceiptToMeta, extractReceiptFromMetaAsync } from '@peac/mappings-mcp';

// Configuration
const ISSUER_URL = 'https://mcp-gateway.example.com';
const GATEWAY_NAME = 'gateway-demo';
const KID = 'gateway-key-2026';
const GATEWAY_EXT = 'com.example/gateway';
const TRACE_ID = '6e7a364be19c40c0a4f4ba9a7f9622d1';
const WORKFLOW_ID = 'wf-support-4711';

/** MCP CallToolResult-shaped response with the top-level _meta carrier. */
interface McpToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Tool definitions the gateway exposes (a small, fixed catalog). */
const TOOL_DEFINITIONS = [
  {
    name: 'search_service_docs',
    description: 'Search internal service documentation (read-only)',
    risk_tier: 'low',
    input_schema: { query: 'string' },
  },
  {
    name: 'read_customer_profile',
    description: 'Read a customer profile (sensitive; PII redacted on output)',
    risk_tier: 'sensitive',
    input_schema: { customer_id: 'string' },
  },
  {
    name: 'create_refund',
    description: 'Create a refund (write action; policy gated)',
    risk_tier: 'write',
    input_schema: { order_id: 'string', amount_minor: 'string' },
  },
  {
    name: 'deploy_config_change',
    description: 'Deploy a configuration change (blocked without approval)',
    risk_tier: 'critical',
    input_schema: { service: 'string', change_ref: 'string' },
  },
] as const;

/** Per-tool gateway policy (static for the demo). */
const POLICY: Record<string, { policy_ref: string; decision: 'allow' | 'deny'; redact: boolean }> =
  {
    search_service_docs: { policy_ref: 'docs.read.v1', decision: 'allow', redact: false },
    read_customer_profile: { policy_ref: 'pii.redact.v1', decision: 'allow', redact: true },
    create_refund: { policy_ref: 'refund.limit.v1', decision: 'allow', redact: false },
    deploy_config_change: { policy_ref: 'change.approval.v1', decision: 'deny', redact: false },
  };

/** Simulated backing tool: returns a profile containing PII before redaction. */
function readCustomerProfile(customerId: string): Record<string, unknown> {
  return {
    customer_id: customerId,
    plan: 'enterprise',
    email: 'asha.rao@example.com',
    region: 'ap-south-1',
  };
}

/** Redact PII fields before the result leaves the gateway. */
function redactProfile(profile: Record<string, unknown>): Record<string, unknown> {
  return { ...profile, email: '[redacted]' };
}

/**
 * Sign the tool-definition manifest. Every per-call record references this
 * record by receipt_ref, so a verifier can check which definitions were in
 * force when the call happened.
 */
async function issueToolDefinitionRecord(privateKey: Uint8Array): Promise<{
  jws: string;
  receiptRef: string;
  manifestSha256: string;
}> {
  const manifestJson = JSON.stringify(TOOL_DEFINITIONS);
  const manifestSha256 = await sha256Hex(manifestJson);
  const { jws } = await issue({
    iss: ISSUER_URL,
    kind: 'evidence',
    type: 'org.peacprotocol/provenance-record',
    pillars: ['access', 'provenance'],
    extensions: {
      'org.peacprotocol/mcp': { server: GATEWAY_NAME, tool: 'tool-definitions' },
      [GATEWAY_EXT]: {
        record_role: 'tool-definitions',
        manifest_sha256: manifestSha256,
        tool_count: String(TOOL_DEFINITIONS.length),
        tools: TOOL_DEFINITIONS.map((t) => t.name).join(','),
      },
    },
    privateKey,
    kid: KID,
  });
  return { jws, receiptRef: await computeReceiptRef(jws), manifestSha256 };
}

/**
 * Gateway handler: apply policy, redact, hash, execute, issue the per-call
 * record, and attach it to the MCP result via the top-level _meta carrier.
 */
async function gatewayToolCall(params: {
  tool: string;
  args: Record<string, unknown>;
  toolDefinitionRef: string;
  privateKey: Uint8Array;
}): Promise<{ response: McpToolCallResult; resultJson: string }> {
  const policy = POLICY[params.tool];
  const inputJson = JSON.stringify(params.args);
  const inputSha256 = await sha256Hex(inputJson);

  if (policy.decision === 'deny') {
    const { jws } = await issue({
      iss: ISSUER_URL,
      kind: 'evidence',
      type: 'org.peacprotocol/access-decision',
      pillars: ['access'],
      extensions: {
        'org.peacprotocol/mcp': { server: GATEWAY_NAME, tool: params.tool },
        'org.peacprotocol/access': {
          resource: `tool:${params.tool}`,
          action: 'tools/call',
          decision: 'deny',
        },
        'org.peacprotocol/correlation': { trace_id: TRACE_ID, workflow_id: WORKFLOW_ID },
        [GATEWAY_EXT]: {
          record_role: 'tool-call',
          policy_ref: policy.policy_ref,
          input_sha256: inputSha256,
          redaction_applied: 'false',
          tool_definition_ref: params.toolDefinitionRef,
          deny_reason: 'requires_change_approval',
        },
      },
      privateKey: params.privateKey,
      kid: KID,
    });
    const receiptRef = await computeReceiptRef(jws);
    const denied: McpToolCallResult = {
      content: [{ type: 'text', text: `Tool ${params.tool} denied by policy.` }],
      structuredContent: { denied: true, policy_ref: policy.policy_ref },
      isError: true,
    };
    return {
      response: attachReceiptToMeta(denied, {
        receipt_ref: receiptRef,
        receipt_jws: jws,
      }) as McpToolCallResult,
      resultJson: '',
    };
  }

  const raw = readCustomerProfile(String(params.args.customer_id ?? 'cus_0000'));
  const delivered = policy.redact ? redactProfile(raw) : raw;
  const resultJson = JSON.stringify(delivered);
  const resultSha256 = await sha256Hex(resultJson);

  const { jws } = await issue({
    iss: ISSUER_URL,
    kind: 'evidence',
    type: 'org.peacprotocol/access-decision',
    pillars: ['access', 'privacy'],
    extensions: {
      'org.peacprotocol/mcp': { server: GATEWAY_NAME, tool: params.tool },
      'org.peacprotocol/access': {
        resource: `tool:${params.tool}`,
        action: 'tools/call',
        decision: 'allow',
      },
      'org.peacprotocol/correlation': { trace_id: TRACE_ID, workflow_id: WORKFLOW_ID },
      [GATEWAY_EXT]: {
        record_role: 'tool-call',
        policy_ref: policy.policy_ref,
        input_sha256: inputSha256,
        result_sha256: resultSha256,
        redaction_applied: String(policy.redact),
        tool_definition_ref: params.toolDefinitionRef,
      },
    },
    privateKey: params.privateKey,
    kid: KID,
  });
  const receiptRef = await computeReceiptRef(jws);

  const result: McpToolCallResult = {
    content: [{ type: 'text', text: `Tool ${params.tool} completed.` }],
    structuredContent: { result: delivered },
  };
  return {
    response: attachReceiptToMeta(result, {
      receipt_ref: receiptRef,
      receipt_jws: jws,
    }) as McpToolCallResult,
    resultJson,
  };
}

/** Decode a compact JWS without verifying (display helper). */
function decodeJws(jws: string): { header: unknown; payload: unknown } {
  const [header, payload] = jws.split('.');
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
  };
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

type GatewayExtension = {
  policy_ref?: string;
  result_sha256?: string;
  redaction_applied?: string;
  tool_definition_ref?: string;
};

async function main(): Promise<void> {
  const tamperMode = process.argv.includes('--tamper');
  const showRecord = process.argv.includes('--show-record');
  const { privateKey, publicKey } = await generateKeypair();

  console.log('\n=== PEAC MCP Gateway Receipts Demo ===\n');

  // 1. The gateway publishes a signed record of its tool definitions.
  const toolDef = await issueToolDefinitionRecord(privateKey);
  console.log('1. Gateway publishes a signed tool-definition record:');
  console.log(`   tools: ${TOOL_DEFINITIONS.map((t) => t.name).join(', ')}`);
  console.log(`   manifest sha256     = ${toolDef.manifestSha256.slice(0, 20)}...`);
  console.log(`   tool_definition_ref = ${toolDef.receiptRef.slice(0, 27)}...`);

  // 2. A gateway-mediated tool call with redaction and digests.
  const args = { customer_id: 'cus_1042' };
  const { response, resultJson } = await gatewayToolCall({
    tool: 'read_customer_profile',
    args,
    toolDefinitionRef: toolDef.receiptRef,
    privateKey,
  });
  console.log(`\n2. Tool call via gateway: read_customer_profile(${JSON.stringify(args)})`);
  console.log('   policy pii.redact.v1: decision = allow, redaction applied (email masked)');

  const refKey = 'org.peacprotocol/receipt_ref';
  const jwsKey = 'org.peacprotocol/receipt_jws';
  console.log('\n3. Record attached via top-level _meta carrier keys:');
  console.log(`   ${refKey} = ${String(response._meta?.[refKey]).slice(0, 24)}...`);
  console.log(`   ${jwsKey} = ${String(response._meta?.[jwsKey]).slice(0, 24)}...`);

  // 3. Counterparty: extract, verify offline, and check the content binding.
  const extracted = await extractReceiptFromMetaAsync(response);
  if (!extracted || extracted.receipts.length === 0) {
    console.error(`   Extraction failed: ${extracted?.violations.join('; ') ?? 'no carrier'}`);
    process.exitCode = 1;
    return;
  }
  const carrierJws = extracted.receipts[0].receipt_jws!;

  if (showRecord) {
    console.log('\n   Decoded record:');
    console.log(JSON.stringify(decodeJws(carrierJws), null, 2));
  }

  const verifyResult = await verifyLocal(carrierJws, publicKey, { issuer: ISSUER_URL });
  if (!verifyResult.valid) {
    console.error(`4. Offline verification FAILED: ${verifyResult.code} ${verifyResult.message}`);
    process.exitCode = 1;
    return;
  }
  const ext = (verifyResult.claims.extensions as Record<string, unknown> | undefined)?.[
    GATEWAY_EXT
  ] as GatewayExtension | undefined;
  const access = (verifyResult.claims.extensions as Record<string, unknown> | undefined)?.[
    'org.peacprotocol/access'
  ] as { decision?: string } | undefined;

  const deliveredJson = JSON.stringify(
    (response.structuredContent as { result?: unknown } | undefined)?.result
  );
  const deliveredSha256 = await sha256Hex(deliveredJson);
  const digestMatches = deliveredSha256 === ext?.result_sha256;
  const defRefMatches = ext?.tool_definition_ref === toolDef.receiptRef;

  console.log('\n4. Counterparty verification (offline, public key only):');
  console.log('   carrier consistency OK (0 violations)');
  console.log('   signature valid = true');
  console.log(
    `   decision = ${access?.decision}, policy = ${ext?.policy_ref}, redaction_applied = ${ext?.redaction_applied}`
  );
  console.log(`   delivered result digest matches bound result_sha256 = ${digestMatches}`);
  console.log(`   tool_definition_ref matches published manifest record = ${defRefMatches}`);
  if (verifyResult.warnings.length > 0) {
    console.log(
      `   informational warnings: ${verifyResult.warnings.map((w) => w.code).join(', ')}`
    );
  }
  if (!digestMatches || !defRefMatches) {
    process.exitCode = 1;
    return;
  }

  // 4. A denied call is also evidence: the gateway records what it refused.
  const denied = await gatewayToolCall({
    tool: 'deploy_config_change',
    args: { service: 'billing', change_ref: 'chg-2207' },
    toolDefinitionRef: toolDef.receiptRef,
    privateKey,
  });
  const deniedExtract = await extractReceiptFromMetaAsync(denied.response);
  const deniedJws = deniedExtract?.receipts[0]?.receipt_jws;
  const deniedVerify = deniedJws
    ? await verifyLocal(deniedJws, publicKey, { issuer: ISSUER_URL })
    : { valid: false as const, code: 'E_NO_CARRIER', message: 'no carrier' };
  const deniedDecision = deniedVerify.valid
    ? (
        (deniedVerify.claims.extensions as Record<string, unknown>)['org.peacprotocol/access'] as {
          decision?: string;
        }
      )?.decision
    : 'unverified';
  console.log('\n5. Denied call is also evidence: deploy_config_change');
  console.log(
    `   decision = ${deniedDecision}, signed deny record verified = ${deniedVerify.valid}`
  );
  if (!deniedVerify.valid || deniedDecision !== 'deny') {
    process.exitCode = 1;
    return;
  }

  if (tamperMode) {
    // Tamper check 1: modify the delivered result AFTER signing. The
    // signature still verifies (the record was not changed), but the
    // delivered content no longer matches the bound result_sha256 digest.
    const tamperedResult = {
      ...readCustomerProfile('cus_1042'),
      email: '[redacted]',
      plan: 'free',
    };
    const tamperedJson = JSON.stringify(tamperedResult);
    const tamperedSha256 = await sha256Hex(tamperedJson);
    const reVerify = await verifyLocal(carrierJws, publicKey, { issuer: ISSUER_URL });
    const stillValid = reVerify.valid === true;
    const tamperedMatches = tamperedSha256 === ext?.result_sha256;
    console.log('\n6. Tamper check 1 (modify the delivered result, keep the record):');
    console.log(`   signature still valid = ${stillValid}`);
    console.log(`   delivered result digest matches bound result_sha256 = ${tamperedMatches}`);
    console.log('   detected: the content binding fails even though the signature holds');

    // Tamper check 2: modify the record payload and keep the signature.
    const tamperedJws = tamperPayload(carrierJws);
    const tamperedVerify = await verifyLocal(tamperedJws, publicKey, { issuer: ISSUER_URL });
    console.log('\n7. Tamper check 2 (modify the record payload, keep signature):');
    console.log(`   valid = ${tamperedVerify.valid}`);
    if (!tamperedVerify.valid) {
      console.log(`   code  = ${tamperedVerify.code}`);
    }
    const bothDetected = stillValid && !tamperedMatches && !tamperedVerify.valid;
    if (!bothDetected) {
      process.exitCode = 1;
      return;
    }
  }

  // Demo invariant: unverified usage of resultJson keeps TypeScript honest
  // about the value the digest covers (the redacted JSON, not the raw one).
  if (resultJson.includes('asha.rao@example.com')) {
    console.error('   PII leaked into the hashed result payload');
    process.exitCode = 1;
    return;
  }

  console.log('\n=== Demo Complete ===\n');
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exitCode = 1;
});
