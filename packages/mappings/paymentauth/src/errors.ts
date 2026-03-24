/**
 * Paymentauth mapping errors.
 *
 * SECURITY: error messages MUST NOT contain raw Authorization: Payment
 * or Payment-Receipt header values. Use redactPaymentauthHeader() for
 * safe logging.
 */

export type PaymentauthErrorCode =
  | 'PARSE_HEADER_TOO_LARGE'
  | 'PARSE_TOO_MANY_PARAMS'
  | 'PARSE_MISSING_SCHEME'
  | 'PARSE_MISSING_REQUIRED_PARAM'
  | 'PARSE_INVALID_BASE64URL'
  | 'PARSE_PAYLOAD_TOO_LARGE'
  | 'PARSE_JSON_DEPTH_EXCEEDED'
  | 'PARSE_INVALID_UTF8'
  | 'NORMALIZE_MISSING_FIELD';

export class PaymentauthError extends Error {
  readonly code: PaymentauthErrorCode;

  constructor(code: PaymentauthErrorCode, message: string) {
    super(message);
    this.name = 'PaymentauthError';
    this.code = code;
  }
}
