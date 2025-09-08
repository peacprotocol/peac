/**
 * @peac/core/validators - Precompiled schema validators
 * Generated at build time by tooling/precompile-validators.mjs
 * Ultra-fast validation (no runtime Ajv)
 */

import type { Rec } from './types.js';

export function vReceipt(obj: unknown): asserts obj is Rec {
  if (!obj || typeof obj !== 'object') {
    throw new Error('Receipt must be an object');
  }

  const r = obj as any;

  // Required fields
  if (typeof r.subject !== 'object' || !r.subject) {
    throw new Error('subject is required and must be an object');
  }

  if (!r.aipref || typeof r.aipref !== 'object') {
    throw new Error('aipref is required and must be an object');
  }

  if (!r.enforcement || typeof r.enforcement !== 'object') {
    throw new Error('enforcement is required and must be an object');
  }

  if (typeof r.issued_at !== 'string' || !r.issued_at) {
    throw new Error('issued_at is required and must be a string');
  }

  if (typeof r.kid !== 'string' || !r.kid) {
    throw new Error('kid is required and must be a string');
  }

  // AIPREF validation
  const validStatuses = ['active', 'not_found', 'error', 'not_applicable'];
  if (!validStatuses.includes(r.aipref.status)) {
    throw new Error(`Invalid aipref.status: ${r.aipref.status}`);
  }

  if (typeof r.aipref.checked_at !== 'string') {
    throw new Error('aipref.checked_at is required and must be a string');
  }

  // ADR-002: AIPREF must have snapshot+digest OR reason
  const hasSnapshot = r.aipref.snapshot !== undefined && r.aipref.digest !== undefined;
  const hasReason = r.aipref.reason !== undefined;

  if (r.aipref.status === 'active' && !hasSnapshot) {
    throw new Error('aipref with status=active must have snapshot and digest');
  }

  if (['not_found', 'error', 'not_applicable'].includes(r.aipref.status) && !hasReason) {
    throw new Error('aipref with error status must have reason');
  }

  // Enforcement validation
  if (typeof r.enforcement.method !== 'string') {
    throw new Error('enforcement.method is required and must be a string');
  }

  // ADR-002: payment REQUIRED when enforcement.method=="http-402"
  if (r.enforcement.method === 'http-402') {
    if (!r.payment || typeof r.payment !== 'object') {
      throw new Error('payment is required when enforcement.method is http-402');
    }

    if (!r.payment.rail || typeof r.payment.rail !== 'string') {
      throw new Error('payment.rail is required and must be a string');
    }

    const validRails = ['l402', 'x402', 'stripe'];
    if (!validRails.includes(r.payment.rail)) {
      throw new Error(`Unsupported payment rail: ${r.payment.rail}`);
    }
  }
}

// Placeholder for AIPREF validation (extended in @peac/pref)
export function vAIPref(obj: unknown): asserts obj is any {
  if (!obj || typeof obj !== 'object') {
    throw new Error('AIPREF must be an object');
  }
}
