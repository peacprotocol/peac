/**
 * Decode handler -- ZERO MCP SDK imports (DD-57)
 *
 * Raw JWS decode. Returns header and payload without verification.
 * Text output is bounded by policy limits.
 */

import { decode } from '@peac/crypto';
import type { HandlerParams, HandlerResult } from './types.js';
import type { DecodeInput } from '../schemas/decode.js';
import { checkJwsSize, checkToolEnabled, truncateResponse } from './guards.js';

export async function handleDecode(params: HandlerParams<DecodeInput>): Promise<HandlerResult> {
  const { input, policy } = params;

  // Guard: tool enablement
  const disabledResult = checkToolEnabled('peac_decode', policy);
  if (disabledResult) return disabledResult;

  // Guard: JWS size limit
  const sizeResult = checkJwsSize(input.jws, policy);
  if (sizeResult) return sizeResult;

  try {
    const decoded = decode<Record<string, unknown>>(input.jws);
    const header = decoded.header as unknown as Record<string, unknown>;
    const payload = decoded.payload;

    const tr = truncateResponse(
      [
        'WARNING: Signature NOT verified',
        '',
        `Header: ${JSON.stringify(header, null, 2)}`,
        '',
        `Payload: ${JSON.stringify(payload, null, 2)}`,
      ].join('\n'),
      policy
    );

    return {
      text: tr.text,
      structured: {
        header,
        payload,
        verified: false,
        ...(tr.truncated
          ? {
              _truncation: {
                truncated: tr.truncated,
                originalBytes: tr.originalBytes,
                returnedBytes: tr.returnedBytes,
              },
            }
          : {}),
      },
    };
  } catch (err) {
    return {
      text: `Decode failed: ${err instanceof Error ? err.message : String(err)}`,
      structured: {
        error: err instanceof Error ? err.message : String(err),
        code: 'E_MCP_INVALID_INPUT',
      },
      isError: true,
    };
  }
}
