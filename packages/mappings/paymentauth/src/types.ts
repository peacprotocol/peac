/**
 * Paymentauth wire types: raw + normalized.
 *
 * Envelope-first design: the stable surface is the common envelope
 * (id, realm, method, intent, request, expires, digest, opaque).
 * Method-specific payloads (request content, credential payload,
 * receipt details) are typed as `unknown` because each payment method
 * (card, lightning, stripe, tempo) has its own draft spec.
 *
 * Raw types preserve the original wire form exactly.
 * Normalized types project a stable PEAC-facing structure.
 * Every normalized type retains a `_raw` field for traceability.
 */

// ---------------------------------------------------------------------------
// Raw Types (preserve original wire form)
// ---------------------------------------------------------------------------

/**
 * Raw paymentauth challenge from WWW-Authenticate header.
 *
 * Preserves the original header string and parsed auth-params.
 * The `request` field is kept as raw base64url (not decoded).
 */
export interface RawPaymentauthChallenge {
  /** Original full header string (for redaction and traceability) */
  rawHeader: string;
  /** Raw segment of the header corresponding to this challenge (for precise tracing) */
  rawSegment: string;
  /** Parsed auth-param key-value pairs */
  params: Record<string, string>;
}

/**
 * Raw paymentauth credential from Authorization header.
 *
 * The decoded JSON payload is typed as `unknown` because the
 * credential structure contains method-specific `payload` fields.
 */
export interface RawPaymentauthCredential {
  /** Original base64url-encoded header value (after scheme prefix) */
  rawValue: string;
  /** Decoded bytes as Uint8Array (preserved for non-UTF-8 safety) */
  decodedBytes: Uint8Array;
  /** Decoded UTF-8 string, or null if bytes are not valid UTF-8 */
  decodedString: string | null;
  /** Parsed JSON object if decoding and parsing succeeded, otherwise undefined */
  parsedJson: unknown;
}

/**
 * Raw paymentauth receipt from Payment-Receipt header.
 *
 * Same raw preservation pattern as credential.
 */
export interface RawPaymentauthReceipt {
  /** Original base64url-encoded header value */
  rawValue: string;
  /** Decoded bytes as Uint8Array */
  decodedBytes: Uint8Array;
  /** Decoded UTF-8 string, or null if bytes are not valid UTF-8 */
  decodedString: string | null;
  /** Parsed JSON object if decoding and parsing succeeded */
  parsedJson: unknown;
}

// ---------------------------------------------------------------------------
// Normalized Types (stable PEAC-facing projection)
// ---------------------------------------------------------------------------

/**
 * Normalized paymentauth challenge.
 *
 * Only common envelope fields are typed. Method-specific data within
 * the decoded request is typed as `unknown`.
 */
export interface NormalizedPaymentauthChallenge {
  id: string;
  realm: string;
  method: string;
  intent: string;
  /** Raw base64url string of the request parameter */
  requestRaw: string;
  /**
   * Decoded request payload. Typed as `unknown` first; best-effort
   * `Record<string, unknown>` when JSON parsing succeeds and result is object-shaped.
   * Preserves raw base64url + decoded string alongside.
   */
  decodedRequest: unknown;
  expires?: string;
  digest?: string;
  description?: string;
  opaque?: string;
  /** Back-reference to the raw form */
  _raw: RawPaymentauthChallenge;
}

/**
 * Normalized paymentauth credential.
 *
 * Stable projection of the credential envelope.
 * Method-specific payload typed as `unknown`.
 */
export interface NormalizedPaymentauthCredential {
  challengeId: string;
  method: string;
  intent: string;
  /** Payer identifier (DID format recommended per spec) */
  source?: string;
  /** Method-specific payment proof (typed as `unknown`) */
  payload: unknown;
  /** Back-reference to the raw form */
  _raw: RawPaymentauthCredential;
}

/**
 * Normalized paymentauth receipt.
 *
 * Stable projection of the receipt envelope.
 * Method-specific fields typed as `unknown` via extras.
 */
export interface NormalizedPaymentauthReceipt {
  status: string;
  method: string;
  timestamp?: string;
  reference?: string;
  /** Any additional fields from the receipt (method-specific) */
  extras: Record<string, unknown>;
  /** Back-reference to the raw form */
  _raw: RawPaymentauthReceipt;
}

// ---------------------------------------------------------------------------
// Discovery Types (from OpenAPI x-service-info / x-payment-info)
// ---------------------------------------------------------------------------

/**
 * Parsed x-service-info from OpenAPI document.
 */
export interface PaymentauthServiceInfo {
  categories?: string[];
  docs?: {
    apiReference?: string;
    homepage?: string;
    llms?: string;
  };
}

/**
 * Parsed x-payment-info from OpenAPI operation.
 */
export interface PaymentauthPaymentInfo {
  intent?: string;
  method?: string;
  amount?: string | null;
  currency?: string;
  description?: string;
}
