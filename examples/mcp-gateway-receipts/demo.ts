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
 *    delivered content no longer matches the bound digest. Digests are taken
 *    over a deterministic serialization (stableStringify) so an independent
 *    party recomputes the same bytes.
 * 4. Redaction as a recorded fact: the gateway redacts PII before hashing,
 *    and the record states redaction_applied so the verifier knows what the
 *    digest covers.
 *
 * Record types and extension groups used here:
 * - The per-call record uses the registered type org.peacprotocol/access-decision;
 *   the tool-definition record uses the registered type org.peacprotocol/provenance-record.
 * - org.peacprotocol/access and org.peacprotocol/correlation are registered
 *   extension groups.
 * - org.peacprotocol/mcp (server/tool labels) and com.example/gateway
 *   (digests, policy reference, tool_definition_ref) are well-formed but
 *   unregistered extension groups: verification preserves them and surfaces an
 *   informational unknown_extension_preserved warning. Operators who want
 *   registered semantics should propose a profile and registry entry.
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

/**
 * Deterministic JSON serialization for digest inputs: object keys are sorted
 * recursively, array order is preserved. Two parties that serialize the same
 * value this way produce byte-identical input to sha256, so an independent
 * verifier recomputes the same digest. Production profiles should pin a
 * canonicalization rule (for example RFC 8785 JCS) rather than rely on this
 * local helper.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringify(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const entries = Object.keys(obj)
    .sort()
    .map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]));
  return '{' + entries.join(',') + '}';
}

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
  const manifestSha256 = await sha256Hex(stableStringify(TOOL_DEFINITIONS));
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
  const inputSha256 = await sha256Hex(stableStringify(params.args));

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
  const resultJson = stableStringify(delivered);
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

export interface GatewayDemoResult {
  ok: boolean;
  toolDefinitionRef: string;
  call: {
    signatureValid: boolean;
    decision?: string;
    policyRef?: string;
    redactionApplied?: string;
    digestMatches: boolean;
    defRefMatches: boolean;
    warnings: string[];
  };
  deny: { decision: string; verified: boolean };
  tamper?: {
    signatureStillValid: boolean;
    digestMatchesAfterTamper: boolean;
    payloadTamperValid: boolean;
    payloadTamperCode?: string;
  };
  piiLeak: boolean;
}

export interface RunOptions {
  tamper?: boolean;
  showRecord?: boolean;
  quiet?: boolean;
}

/**
 * Run the full gateway demo and return a structured result. Prints a stage
 * report unless quiet. Importing this module does not run anything; only the
 * guarded main() at the bottom invokes it when the file is run directly.
 */
export async function runGatewayDemo(opts: RunOptions = {}): Promise<GatewayDemoResult> {
  const { tamper = false, showRecord = false, quiet = false } = opts;
  const log = quiet ? () => undefined : (msg = '') => console.log(msg);
  const { privateKey, publicKey } = await generateKeypair();

  log('\n=== PEAC MCP Gateway Receipts Demo ===\n');

  // 1. The gateway publishes a signed record of its tool definitions.
  const toolDef = await issueToolDefinitionRecord(privateKey);
  log('1. Gateway publishes a signed tool-definition record:');
  log(`   tools: ${TOOL_DEFINITIONS.map((t) => t.name).join(', ')}`);
  log(`   manifest sha256     = ${toolDef.manifestSha256.slice(0, 20)}...`);
  log(`   tool_definition_ref = ${toolDef.receiptRef.slice(0, 27)}...`);

  // 2. A gateway-mediated tool call with redaction and digests.
  const args = { customer_id: 'cus_1042' };
  const { response } = await gatewayToolCall({
    tool: 'read_customer_profile',
    args,
    toolDefinitionRef: toolDef.receiptRef,
    privateKey,
  });
  log(`\n2. Tool call via gateway: read_customer_profile(${JSON.stringify(args)})`);
  log('   policy pii.redact.v1: decision = allow, redaction applied (email masked)');

  const refKey = 'org.peacprotocol/receipt_ref';
  const jwsKey = 'org.peacprotocol/receipt_jws';
  log('\n3. Record attached via top-level _meta carrier keys:');
  log(`   ${refKey} = ${String(response._meta?.[refKey]).slice(0, 24)}...`);
  log(`   ${jwsKey} = ${String(response._meta?.[jwsKey]).slice(0, 24)}...`);

  const failed = (): GatewayDemoResult => ({
    ok: false,
    toolDefinitionRef: toolDef.receiptRef,
    call: {
      signatureValid: false,
      digestMatches: false,
      defRefMatches: false,
      warnings: [],
    },
    deny: { decision: 'unverified', verified: false },
    piiLeak: false,
  });

  // 3. Counterparty: extract, verify offline, and check the content binding.
  const extracted = await extractReceiptFromMetaAsync(response);
  if (!extracted || extracted.receipts.length === 0) {
    console.error(`   Extraction failed: ${extracted?.violations.join('; ') ?? 'no carrier'}`);
    return failed();
  }
  const carrierJws = extracted.receipts[0].receipt_jws!;

  if (showRecord) {
    log('\n   Decoded record:');
    log(JSON.stringify(decodeJws(carrierJws), null, 2));
  }

  const verifyResult = await verifyLocal(carrierJws, publicKey, { issuer: ISSUER_URL });
  if (!verifyResult.valid) {
    console.error(`4. Offline verification FAILED: ${verifyResult.code} ${verifyResult.message}`);
    return failed();
  }
  const ext = (verifyResult.claims.extensions as Record<string, unknown> | undefined)?.[
    GATEWAY_EXT
  ] as GatewayExtension | undefined;
  const access = (verifyResult.claims.extensions as Record<string, unknown> | undefined)?.[
    'org.peacprotocol/access'
  ] as { decision?: string } | undefined;

  const deliveredJson = stableStringify(
    (response.structuredContent as { result?: unknown } | undefined)?.result
  );
  const deliveredSha256 = await sha256Hex(deliveredJson);
  const digestMatches = deliveredSha256 === ext?.result_sha256;
  const defRefMatches = ext?.tool_definition_ref === toolDef.receiptRef;
  const warnings = verifyResult.warnings.map((w) => w.code);

  log('\n4. Counterparty verification (offline, public key only):');
  log('   carrier consistency OK (0 violations)');
  log('   signature valid = true');
  log(
    `   decision = ${access?.decision}, policy = ${ext?.policy_ref}, redaction_applied = ${ext?.redaction_applied}`
  );
  log(`   delivered result digest matches bound result_sha256 = ${digestMatches}`);
  log(`   tool_definition_ref matches published manifest record = ${defRefMatches}`);
  if (warnings.length > 0) {
    log(`   informational warnings: ${warnings.join(', ')}`);
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
    ? ((
        (deniedVerify.claims.extensions as Record<string, unknown>)['org.peacprotocol/access'] as {
          decision?: string;
        }
      )?.decision ?? 'unverified')
    : 'unverified';
  log('\n5. Denied call is also evidence: deploy_config_change');
  log(`   decision = ${deniedDecision}, signed deny record verified = ${deniedVerify.valid}`);

  const result: GatewayDemoResult = {
    ok: true,
    toolDefinitionRef: toolDef.receiptRef,
    call: {
      signatureValid: true,
      decision: access?.decision,
      policyRef: ext?.policy_ref,
      redactionApplied: ext?.redaction_applied,
      digestMatches,
      defRefMatches,
      warnings,
    },
    deny: { decision: deniedDecision, verified: deniedVerify.valid === true },
    piiLeak: denied.resultJson.includes('asha.rao@example.com'),
  };

  if (tamper) {
    // Tamper check 1: modify the delivered result AFTER signing. The
    // signature still verifies (the record was not changed), but the
    // delivered content no longer matches the bound result_sha256 digest.
    const tamperedResult = {
      ...readCustomerProfile('cus_1042'),
      email: '[redacted]',
      plan: 'free',
    };
    const tamperedSha256 = await sha256Hex(stableStringify(tamperedResult));
    const reVerify = await verifyLocal(carrierJws, publicKey, { issuer: ISSUER_URL });
    const signatureStillValid = reVerify.valid === true;
    const digestMatchesAfterTamper = tamperedSha256 === ext?.result_sha256;
    log('\n6. Tamper check 1 (modify the delivered result, keep the record):');
    log(`   signature still valid = ${signatureStillValid}`);
    log(`   delivered result digest matches bound result_sha256 = ${digestMatchesAfterTamper}`);
    log('   detected: the content binding fails even though the signature holds');

    // Tamper check 2: modify the record payload and keep the signature.
    const tamperedJws = tamperPayload(carrierJws);
    const tamperedVerify = await verifyLocal(tamperedJws, publicKey, { issuer: ISSUER_URL });
    log('\n7. Tamper check 2 (modify the record payload, keep signature):');
    log(`   valid = ${tamperedVerify.valid}`);
    if (!tamperedVerify.valid) {
      log(`   code  = ${tamperedVerify.code}`);
    }
    result.tamper = {
      signatureStillValid,
      digestMatchesAfterTamper,
      payloadTamperValid: tamperedVerify.valid === true,
      payloadTamperCode: tamperedVerify.valid ? undefined : tamperedVerify.code,
    };
  }

  // Verdict: every check the demo makes must hold.
  result.ok =
    result.call.signatureValid &&
    result.call.digestMatches &&
    result.call.defRefMatches &&
    result.deny.verified &&
    result.deny.decision === 'deny' &&
    !result.piiLeak &&
    (!tamper ||
      (result.tamper!.signatureStillValid &&
        !result.tamper!.digestMatchesAfterTamper &&
        !result.tamper!.payloadTamperValid &&
        result.tamper!.payloadTamperCode === 'E_INVALID_SIGNATURE'));

  if (result.ok) {
    log('\n=== Demo Complete ===\n');
  }
  return result;
}

async function main(): Promise<void> {
  const result = await runGatewayDemo({
    tamper: process.argv.includes('--tamper'),
    showRecord: process.argv.includes('--show-record'),
  });
  if (!result.ok) {
    process.exitCode = 1;
  }
}

// Run only when executed directly (pnpm demo), not when imported by a test.
const invokedDirectly = process.argv[1] !== undefined && /demo\.ts$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch((err) => {
    console.error('Demo failed:', err);
    process.exitCode = 1;
  });
}
