/**
 * DID adapter error types.
 *
 * Uses error codes registered in specs/kernel/errors.json (PR3 #571).
 */

/** DID-specific error codes (registered in kernel) */
export type DIDErrorCode =
  | 'E_DID_RESOLUTION_FAILED'
  | 'E_DID_DOCUMENT_INVALID'
  | 'E_DID_KEY_NOT_FOUND'
  | 'E_DID_UNSUPPORTED_METHOD'
  | 'E_DID_DEACTIVATED'
  | 'E_DID_KEY_AMBIGUOUS';

/**
 * Error thrown by DID adapter operations.
 */
export class DIDError extends Error {
  readonly code: DIDErrorCode;

  constructor(code: DIDErrorCode, message: string) {
    super(message);
    this.name = 'DIDError';
    this.code = code;
  }
}
