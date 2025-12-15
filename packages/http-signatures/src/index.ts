/**
 * @peac/http-signatures
 *
 * RFC 9421 HTTP Message Signatures parsing and verification.
 * Runtime-neutral - no DOM dependencies in public API.
 */

// Types
export type {
  SignatureVerifier,
  KeyResolver,
  ParsedSignatureParams,
  ParsedSignature,
  VerificationResult,
  SignatureRequest,
  VerifyOptions,
} from './types.js';

// Parser
export {
  parseSignatureInput,
  parseSignatureHeader,
  parseSignature,
} from './parser.js';

// Signature base
export { buildSignatureBase, signatureBaseToBytes } from './base.js';

// Verification
export {
  verifySignature,
  isExpired,
  isCreatedInFuture,
  isEd25519WebCryptoSupported,
  createWebCryptoVerifier,
} from './verify.js';

// Errors
export { ErrorCodes, ErrorHttpStatus, HttpSignatureError } from './errors.js';
export type { ErrorCode } from './errors.js';
