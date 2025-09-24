// Security limits for headers and bodies
export const LIMITS = {
  MAX_RECEIPT_HEADER: 12 * 1024, // 12KB
  MAX_PAYMENT_HEADER: 4 * 1024, // 4KB
  MAX_RESPONSE_BODY: 10 * 1024 * 1024, // 10MB
  CLOCK_SKEW_SECONDS: 120, // ±2 minutes
} as const;

export function validateHeaderSize(
  headerValue: string | null,
  maxSize: number,
  headerName: string
): void {
  if (!headerValue) return;

  const size = Buffer.byteLength(headerValue, 'utf8');
  if (size > maxSize) {
    throw new Error(`${headerName} header exceeds ${maxSize} bytes (got ${size})`);
  }
}

export function validateReceiptHeader(header: string | null): void {
  validateHeaderSize(header, LIMITS.MAX_RECEIPT_HEADER, 'PEAC-Receipt');
}

export function validatePaymentHeader(header: string | null): void {
  validateHeaderSize(header, LIMITS.MAX_PAYMENT_HEADER, 'X-PAYMENT');
}

export function validateResponseBody(body: any): void {
  if (typeof body === 'string') {
    const size = Buffer.byteLength(body, 'utf8');
    if (size > LIMITS.MAX_RESPONSE_BODY) {
      throw new Error(`Response body exceeds ${LIMITS.MAX_RESPONSE_BODY} bytes`);
    }
  }
}
