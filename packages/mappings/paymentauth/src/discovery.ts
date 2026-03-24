/**
 * Paymentauth discovery extraction from OpenAPI documents.
 *
 * Parses x-service-info and x-payment-info extensions per
 * draft-payment-discovery-00. Pure extraction; no network I/O.
 *
 * The OpenAPI document is useful for discovery, but the live 402
 * challenge is always authoritative (per discovery spec).
 */

import type { PaymentauthServiceInfo, PaymentauthPaymentInfo } from './types.js';

/**
 * Extract x-service-info from an OpenAPI document root.
 *
 * Returns null if the extension is absent or malformed.
 */
export function extractServiceInfo(openapiDoc: unknown): PaymentauthServiceInfo | null {
  if (!openapiDoc || typeof openapiDoc !== 'object' || Array.isArray(openapiDoc)) {
    return null;
  }

  const doc = openapiDoc as Record<string, unknown>;
  const info = doc['x-service-info'];
  if (!info || typeof info !== 'object' || Array.isArray(info)) {
    return null;
  }

  const raw = info as Record<string, unknown>;
  const result: PaymentauthServiceInfo = {};

  if (Array.isArray(raw.categories)) {
    result.categories = raw.categories.filter((c): c is string => typeof c === 'string');
  }

  if (raw.docs && typeof raw.docs === 'object' && !Array.isArray(raw.docs)) {
    const docs = raw.docs as Record<string, unknown>;
    result.docs = {};
    if (typeof docs.apiReference === 'string') result.docs.apiReference = docs.apiReference;
    if (typeof docs.homepage === 'string') result.docs.homepage = docs.homepage;
    if (typeof docs.llms === 'string') result.docs.llms = docs.llms;
  }

  return result;
}

/**
 * Extract x-payment-info from an OpenAPI operation.
 *
 * Returns null if the extension is absent or malformed.
 */
export function extractPaymentInfo(operation: unknown): PaymentauthPaymentInfo | null {
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
    return null;
  }

  const op = operation as Record<string, unknown>;
  const info = op['x-payment-info'];
  if (!info || typeof info !== 'object' || Array.isArray(info)) {
    return null;
  }

  const raw = info as Record<string, unknown>;
  const result: PaymentauthPaymentInfo = {};

  if (typeof raw.intent === 'string') result.intent = raw.intent;
  if (typeof raw.method === 'string') result.method = raw.method;
  if (typeof raw.amount === 'string' || raw.amount === null) {
    result.amount = raw.amount as string | null;
  }
  if (typeof raw.currency === 'string') result.currency = raw.currency;
  if (typeof raw.description === 'string') result.description = raw.description;

  return result;
}
