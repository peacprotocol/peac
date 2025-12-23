/**
 * Structured error codes for Razorpay adapter
 *
 * Following RFC 9457 problem+json patterns for structured errors
 */

/**
 * Error codes for Razorpay operations
 */
export type RazorpayErrorCode =
  | 'signature_invalid'
  | 'signature_malformed'
  | 'signature_length_mismatch'
  | 'amount_out_of_range'
  | 'amount_invalid'
  | 'currency_invalid'
  | 'event_type_unsupported'
  | 'payload_invalid'
  | 'payment_missing';

/**
 * Structured error for Razorpay operations
 */
export class RazorpayError extends Error {
  readonly code: RazorpayErrorCode;
  readonly statusCode: number;

  constructor(code: RazorpayErrorCode, message: string, statusCode = 400) {
    super(message);
    this.name = 'RazorpayError';
    this.code = code;
    this.statusCode = statusCode;
  }

  /**
   * Convert to RFC 9457 problem+json format
   */
  toProblemJson(): Record<string, unknown> {
    return {
      type: `https://peacprotocol.org/errors/razorpay/${this.code}`,
      title: this.message,
      status: this.statusCode,
      detail: this.message,
    };
  }
}

/**
 * Create a signature invalid error
 */
export function signatureInvalidError(): RazorpayError {
  return new RazorpayError('signature_invalid', 'Webhook signature verification failed', 401);
}

/**
 * Create a signature malformed error
 */
export function signatureMalformedError(detail: string): RazorpayError {
  return new RazorpayError('signature_malformed', `Webhook signature is malformed: ${detail}`);
}

/**
 * Create a signature length mismatch error
 */
export function signatureLengthMismatchError(): RazorpayError {
  return new RazorpayError('signature_length_mismatch', 'Webhook signature has incorrect length');
}

/**
 * Create an amount out of range error
 */
export function amountOutOfRangeError(amount: number): RazorpayError {
  return new RazorpayError(
    'amount_out_of_range',
    `Amount ${amount} is not a safe integer (exceeds Number.MAX_SAFE_INTEGER)`
  );
}

/**
 * Create an amount invalid error
 */
export function amountInvalidError(detail: string): RazorpayError {
  return new RazorpayError('amount_invalid', `Invalid amount: ${detail}`);
}

/**
 * Create a currency invalid error
 */
export function currencyInvalidError(currency: string): RazorpayError {
  return new RazorpayError(
    'currency_invalid',
    `Invalid currency: ${currency} (must be uppercase ISO 4217)`
  );
}

/**
 * Create an event type unsupported error
 */
export function eventTypeUnsupportedError(eventType: string): RazorpayError {
  return new RazorpayError(
    'event_type_unsupported',
    `Unsupported webhook event type: ${eventType}`
  );
}

/**
 * Create a payload invalid error
 */
export function payloadInvalidError(detail: string): RazorpayError {
  return new RazorpayError('payload_invalid', `Invalid webhook payload: ${detail}`);
}

/**
 * Create a payment missing error
 */
export function paymentMissingError(): RazorpayError {
  return new RazorpayError('payment_missing', 'Webhook payload does not contain a payment entity');
}
