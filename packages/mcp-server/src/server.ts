/**
 * MCP Server binding -- ONLY file importing @modelcontextprotocol/sdk
 *
 * Registers pure tool handlers with the MCP server.
 * Injects _meta audit block into every response.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { ERRORS } from '@peac/kernel';
import { SERVER_NAME } from './infra/constants.js';
import type { PolicyConfig } from './infra/policy.js';
import type { ServerContext, HandlerResult } from './handlers/types.js';
import { handleVerify } from './handlers/verify.js';
import { handleInspect } from './handlers/inspect.js';
import { handleDecode } from './handlers/decode.js';
import { handleIssue } from './handlers/issue.js';
import { handleCreateBundle } from './handlers/bundle.js';
import { checkInputSizes, checkObjectDepth, measureEnvelopeBytes } from './handlers/guards.js';
import type { VerifyInput } from './schemas/verify.js';
import type { InspectInput } from './schemas/inspect.js';
import type { DecodeInput } from './schemas/decode.js';
import type { IssueInput } from './schemas/issue.js';
import type { BundleInput } from './schemas/bundle.js';
import { VerifyInputSchema, VerifyOutputSchema } from './schemas/verify.js';
import { InspectInputSchema, InspectOutputSchema } from './schemas/inspect.js';
import { DecodeInputSchema, DecodeOutputSchema } from './schemas/decode.js';
import { IssueInputSchema, IssueOutputSchema } from './schemas/issue.js';
import { BundleInputSchema, BundleOutputSchema } from './schemas/bundle.js';

export interface ServerOptions {
  version: string;
  policy: PolicyConfig;
  policyHash: string;
  protocolVersion: string;
  context: ServerContext;
}

function makeMeta(ctx: ServerContext, serverName: string): Record<string, unknown> {
  return {
    serverName,
    serverVersion: ctx.version,
    policyHash: ctx.policyHash,
    protocolVersion: ctx.protocolVersion,
  };
}

function handlerResultToCallToolResult(
  result: HandlerResult,
  meta: Record<string, unknown>
): CallToolResult {
  return {
    content: [{ type: 'text' as const, text: result.text }],
    structuredContent: { _meta: meta, ...result.structured },
    isError: result.isError,
  };
}

const PURE_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

// peac_issue: pure in-memory signing, no filesystem or network side-effects.
// readOnlyHint: true -- produces a JWS string, does not mutate state.
// idempotentHint: false -- each call includes a fresh `iat` timestamp.
// openWorldHint: false -- closed world; no external I/O or filesystem access.
const ISSUE_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

const BUNDLE_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

const MAX_INPUT_DEPTH = 10;

function errorCallToolResult(
  meta: Record<string, unknown>,
  code: string,
  message: string
): CallToolResult {
  const errorDef = ERRORS[code];
  return {
    content: [{ type: 'text' as const, text: message }],
    structuredContent: {
      _meta: meta,
      ok: false,
      code,
      message,
      retryable: errorDef?.retryable ?? false,
      next_action: errorDef?.next_action ?? 'none',
    },
    isError: true,
  };
}

/**
 * Narrowed type for McpServer.registerTool that avoids TS2589
 * deep instantiation errors from cross-version Zod generics.
 *
 * The MCP SDK and our workspace may pin different Zod versions.
 * Zod schema objects are structurally identical at runtime (the SDK
 * duck-types via _def presence check), but TypeScript cannot resolve
 * the deep generic chain across version boundaries.
 *
 * This type accurately describes the runtime contract: inputSchema
 * accepts any object with Zod-like structure (which our schemas are).
 * See package.json for actual pinned versions.
 */
type RegisterToolBridge = (
  name: string,
  config: {
    title?: string;
    description?: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
    annotations?: ToolAnnotations;
  },
  cb: (args: Record<string, unknown>, extra: Record<string, unknown>) => Promise<CallToolResult>
) => unknown;

export function createPeacMcpServer(options: ServerOptions): McpServer {
  const { version, policy, context } = options;

  // Compute registered tool list upfront for capability discovery
  const registeredTools = ['peac_verify', 'peac_inspect', 'peac_decode'];
  if (context.issuerKey && context.issuerId) {
    registeredTools.push('peac_issue');
    if (context.bundleDir) {
      registeredTools.push('peac_create_bundle');
    }
  }

  const meta = { ...makeMeta(context, SERVER_NAME), registeredTools };
  const maxConcurrency = policy.limits.max_concurrency;
  let activeHandlers = 0;

  async function wrapHandler(
    toolName: string,
    args: Record<string, unknown>,
    handlerFn: (signal?: AbortSignal) => Promise<HandlerResult>,
    signal?: AbortSignal
  ): Promise<CallToolResult> {
    // Cancellation: if already aborted before we start, return immediately
    if (signal?.aborted) {
      return errorCallToolResult(meta, 'E_MCP_CANCELLED', 'Request cancelled');
    }

    // Concurrency guard
    if (activeHandlers >= maxConcurrency) {
      return errorCallToolResult(
        meta,
        'E_MCP_CONCURRENCY_LIMIT',
        `Server at capacity (${maxConcurrency} concurrent handlers)`
      );
    }

    // Input depth guard
    if (!checkObjectDepth(args, MAX_INPUT_DEPTH)) {
      return errorCallToolResult(
        meta,
        'E_MCP_INPUT_TOO_DEEP',
        `Input exceeds maximum nesting depth of ${MAX_INPUT_DEPTH}`
      );
    }

    // Input size guard (recursive sum of all string bytes)
    const inputSizeResult = checkInputSizes(args, policy);
    if (inputSizeResult) {
      return handlerResultToCallToolResult(inputSizeResult, meta);
    }

    // Reserve concurrency slot. Released when the handler settles (not when
    // timeout fires), so inflight CPU work stays bounded by maxConcurrency.
    // The slot release is detached -- wrapHandler returns the timeout error
    // immediately without waiting for the handler to finish.
    //
    // IMPORTANT: If a handler promise never settles, the concurrency slot is
    // permanently leaked. This is by design -- Node.js cannot forcibly cancel
    // arbitrary user code. All built-in handlers (verify, inspect, decode) are
    // pure synchronous-ish operations that will always settle. Future handlers
    // with network I/O should accept AbortSignal and honor cancellation.
    // If leaked slots become an operational concern, add a watchdog that logs
    // when a handler exceeds 2x tool_timeout_ms without settling.
    activeHandlers++;
    const handlerPromise = handlerFn(signal);

    // Detached slot release: fires when handler settles, regardless of timeout.
    // The void + catch ensure no unhandled rejection if handler throws.
    void handlerPromise
      .finally(() => {
        activeHandlers--;
      })
      .catch(() => {});

    // Timeout + cancellation race -- handlerPromise keeps running even if
    // timeout or cancellation fires. Timer is cleared when the handler
    // resolves to avoid unnecessary timers accumulating under load.
    let timedOut = false;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(new Error(`Tool "${toolName}" timed out after ${policy.limits.tool_timeout_ms}ms`));
      }, policy.limits.tool_timeout_ms);
      // Prevent timeout timer from keeping Node.js alive during shutdown
      timer.unref?.();
    });

    // Build race participants: handler vs timeout vs (optional) cancellation
    const raceParticipants: Promise<HandlerResult>[] = [handlerPromise, timeoutPromise];

    let abortCleanup: (() => void) | undefined;
    if (signal && !signal.aborted) {
      const cancelPromise = new Promise<never>((_resolve, reject) => {
        const onAbort = () => {
          cancelled = true;
          reject(new Error('Request cancelled'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        abortCleanup = () => signal.removeEventListener('abort', onAbort);
      });
      raceParticipants.push(cancelPromise);
    }

    try {
      const result = await Promise.race(raceParticipants);

      // Output size cap -- measure the full JSON-RPC envelope that will be
      // serialized to stdout, not just the tool result. This is the actual
      // risk surface for downstream clients parsing the response line.
      // Uses conservative UUID-length id placeholder (default) since the
      // MCP SDK doesn't expose the request id to tool handlers.
      const callResult = handlerResultToCallToolResult(result, meta);
      const outputBytes = measureEnvelopeBytes(callResult);
      if (outputBytes > policy.limits.max_response_bytes) {
        return errorCallToolResult(
          meta,
          'E_MCP_OUTPUT_TOO_LARGE',
          `Response is ${outputBytes} bytes, exceeding limit of ${policy.limits.max_response_bytes}`
        );
      }

      return callResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (cancelled) {
        return errorCallToolResult(meta, 'E_MCP_CANCELLED', 'Request cancelled');
      }
      if (timedOut) {
        return errorCallToolResult(meta, 'E_MCP_TOOL_TIMEOUT', message);
      }
      return errorCallToolResult(meta, 'E_MCP_INTERNAL', message);
    } finally {
      clearTimeout(timer);
      abortCleanup?.();
    }
  }

  const server = new McpServer(
    { name: SERVER_NAME, version },
    // listChanged: false -- tool set is static per server instance (determined
    // at startup from CLI flags). The server never emits notifications/tools/list_changed.
    { capabilities: { tools: { listChanged: false } } }
  );

  // Bind with narrowed types to bridge workspace Zod <-> SDK Zod boundary
  const register = server.registerTool.bind(server) as RegisterToolBridge;

  // -- peac_verify --
  register(
    'peac_verify',
    {
      title: 'Verify PEAC Receipt',
      description:
        'Verify a PEAC receipt JWS signature and validate claims. Returns structured check results.',
      inputSchema: VerifyInputSchema,
      outputSchema: VerifyOutputSchema,
      annotations: PURE_TOOL_ANNOTATIONS,
    },
    async (args, extra) =>
      wrapHandler(
        'peac_verify',
        args,
        (signal) => handleVerify({ input: args as VerifyInput, policy, context, signal }),
        (extra as { signal?: AbortSignal }).signal
      )
  );

  // -- peac_inspect --
  register(
    'peac_inspect',
    {
      title: 'Inspect PEAC Receipt',
      description:
        'Decode and inspect a PEAC receipt without verifying the signature. Shows header, payload metadata, and optionally full claims.',
      inputSchema: InspectInputSchema,
      outputSchema: InspectOutputSchema,
      annotations: PURE_TOOL_ANNOTATIONS,
    },
    async (args, extra) =>
      wrapHandler(
        'peac_inspect',
        args,
        (signal) => handleInspect({ input: args as InspectInput, policy, context, signal }),
        (extra as { signal?: AbortSignal }).signal
      )
  );

  // -- peac_decode --
  register(
    'peac_decode',
    {
      title: 'Decode PEAC Receipt',
      description:
        'Raw decode of a PEAC receipt JWS. Returns header and payload without signature verification.',
      inputSchema: DecodeInputSchema,
      outputSchema: DecodeOutputSchema,
      annotations: PURE_TOOL_ANNOTATIONS,
    },
    async (args, extra) =>
      wrapHandler(
        'peac_decode',
        args,
        (signal) => handleDecode({ input: args as DecodeInput, policy, context, signal }),
        (extra as { signal?: AbortSignal }).signal
      )
  );

  // -- Privileged tools (conditionally registered) --

  // peac_issue: requires issuerKey + issuerId
  if (context.issuerKey && context.issuerId) {
    register(
      'peac_issue',
      {
        title: 'Issue PEAC Receipt',
        description:
          'Sign and return a PEAC receipt JWS. Requires server to be configured with --issuer-key and --issuer-id.',
        inputSchema: IssueInputSchema,
        outputSchema: IssueOutputSchema,
        annotations: ISSUE_TOOL_ANNOTATIONS,
      },
      async (args, extra) =>
        wrapHandler(
          'peac_issue',
          args,
          (signal) => handleIssue({ input: args as IssueInput, policy, context, signal }),
          (extra as { signal?: AbortSignal }).signal
        )
    );

    // peac_create_bundle: additionally requires bundleDir
    if (context.bundleDir) {
      register(
        'peac_create_bundle',
        {
          title: 'Create Evidence Bundle',
          description:
            'Create a signed evidence bundle directory from receipt JWS strings. Requires --issuer-key, --issuer-id, and --bundle-dir.',
          inputSchema: BundleInputSchema,
          outputSchema: BundleOutputSchema,
          annotations: BUNDLE_TOOL_ANNOTATIONS,
        },
        async (args, extra) =>
          wrapHandler(
            'peac_create_bundle',
            args,
            (signal) => handleCreateBundle({ input: args as BundleInput, policy, context, signal }),
            (extra as { signal?: AbortSignal }).signal
          )
      );
    }
  }

  return server;
}

export { McpServer };
