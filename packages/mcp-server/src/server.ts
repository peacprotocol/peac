/**
 * MCP Server binding -- ONLY file importing @modelcontextprotocol/sdk
 *
 * Registers pure tool handlers with the MCP server.
 * Injects _meta audit block into every response.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { SERVER_NAME } from './infra/constants.js';
import type { PolicyConfig } from './infra/policy.js';
import type { ServerContext, HandlerResult } from './handlers/types.js';
import { handleVerify } from './handlers/verify.js';
import { handleInspect } from './handlers/inspect.js';
import { handleDecode } from './handlers/decode.js';
import { checkInputSizes, checkObjectDepth, measureEnvelopeBytes } from './handlers/guards.js';
import type { VerifyInput } from './schemas/verify.js';
import type { InspectInput } from './schemas/inspect.js';
import type { DecodeInput } from './schemas/decode.js';
import { VerifyInputSchema } from './schemas/verify.js';
import { InspectInputSchema } from './schemas/inspect.js';
import { DecodeInputSchema } from './schemas/decode.js';

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
};

const MAX_INPUT_DEPTH = 10;

function errorCallToolResult(
  meta: Record<string, unknown>,
  code: string,
  message: string
): CallToolResult {
  return {
    content: [{ type: 'text' as const, text: message }],
    structuredContent: { _meta: meta, ok: false, code, message },
    isError: true,
  };
}

/**
 * Narrowed type for McpServer.registerTool that avoids TS2589
 * deep instantiation errors from cross-version Zod generics.
 *
 * The MCP SDK v1.26 uses zod@3.25 types internally. Our workspace
 * uses zod@3.22. Zod schema objects are structurally identical at
 * runtime (SDK duck-types via _def presence check), but TypeScript
 * cannot resolve the deep generic chain across versions.
 *
 * This type accurately describes the runtime contract: inputSchema
 * accepts any object with Zod-like structure (which our schemas are).
 */
type RegisterToolBridge = (
  name: string,
  config: {
    title?: string;
    description?: string;
    inputSchema?: unknown;
    annotations?: ToolAnnotations;
  },
  cb: (args: Record<string, unknown>, extra: Record<string, unknown>) => Promise<CallToolResult>
) => unknown;

export function createPeacMcpServer(options: ServerOptions): McpServer {
  const { version, policy, context } = options;
  const meta = makeMeta(context, SERVER_NAME);
  const maxConcurrency = policy.limits.max_concurrency;
  let activeHandlers = 0;

  async function wrapHandler(
    toolName: string,
    args: Record<string, unknown>,
    handlerFn: () => Promise<HandlerResult>
  ): Promise<CallToolResult> {
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
    const handlerPromise = handlerFn();

    // Detached slot release: fires when handler settles, regardless of timeout.
    // The void + catch ensure no unhandled rejection if handler throws.
    void handlerPromise
      .finally(() => {
        activeHandlers--;
      })
      .catch(() => {});

    // Timeout race -- handlerPromise keeps running even if timeout fires
    let timedOut = false;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      setTimeout(() => {
        timedOut = true;
        reject(new Error(`Tool "${toolName}" timed out after ${policy.limits.tool_timeout_ms}ms`));
      }, policy.limits.tool_timeout_ms);
    });

    try {
      const result = await Promise.race([handlerPromise, timeoutPromise]);

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
      if (timedOut) {
        return errorCallToolResult(meta, 'E_MCP_TOOL_TIMEOUT', message);
      }
      return errorCallToolResult(meta, 'E_MCP_INTERNAL', message);
    }
  }

  const server = new McpServer(
    { name: SERVER_NAME, version },
    { capabilities: { tools: { listChanged: true } } }
  );

  // Bind with narrowed types to bridge Zod v3.22 <-> SDK v3.25 boundary
  const register = server.registerTool.bind(server) as RegisterToolBridge;

  // -- peac_verify --
  register(
    'peac_verify',
    {
      title: 'Verify PEAC Receipt',
      description:
        'Verify a PEAC receipt JWS signature and validate claims. Returns structured check results.',
      inputSchema: VerifyInputSchema,
      annotations: PURE_TOOL_ANNOTATIONS,
    },
    async (args) =>
      wrapHandler('peac_verify', args, () =>
        handleVerify({ input: args as VerifyInput, policy, context })
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
      annotations: PURE_TOOL_ANNOTATIONS,
    },
    async (args) =>
      wrapHandler('peac_inspect', args, () =>
        handleInspect({ input: args as InspectInput, policy, context })
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
      annotations: PURE_TOOL_ANNOTATIONS,
    },
    async (args) =>
      wrapHandler('peac_decode', args, () =>
        handleDecode({ input: args as DecodeInput, policy, context })
      )
  );

  return server;
}

export { McpServer };
