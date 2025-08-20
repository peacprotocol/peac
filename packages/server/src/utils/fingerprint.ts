/**
 * Deterministic Fingerprinting Utility for PEAC Protocol v0.9.6
 * 
 * Provides consistent SHA-256 hashing for agreement proposals.
 * Excludes volatile fields and ensures reproducible fingerprints.
 */

import { createHash } from 'crypto';
import { AgreementProposal } from '@peacprotocol/schema';

/**
 * Fields to exclude from fingerprint calculation (volatile/mutable)
 */
const EXCLUDED_FIELDS = new Set([
  'status',
  'created_at',
  'updated_at',
  'expires_at',
  'reason'
]);

/**
 * Compute deterministic fingerprint from agreement proposal
 * 
 * @param proposal Agreement proposal data
 * @returns SHA-256 hash as hex string
 */
export function computeAgreementFingerprint(proposal: AgreementProposal): string {
  // Create clean object without excluded fields
  const cleanProposal = removeVolatileFields(proposal);
  
  // Convert to canonical JSON (sorted keys)
  const canonical = canonicalJSON(cleanProposal);
  
  // Generate SHA-256 hash
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Remove volatile/mutable fields from object for fingerprinting
 */
function removeVolatileFields(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(removeVolatileFields);
  }
  
  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!EXCLUDED_FIELDS.has(key)) {
      cleaned[key] = removeVolatileFields(value);
    }
  }
  
  return cleaned;
}

/**
 * Convert object to canonical JSON string with sorted keys
 */
function canonicalJSON(obj: any): string {
  if (obj === null) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJSON).join(',') + ']';
  }
  
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(key => `"${key}":${canonicalJSON(obj[key])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Validate fingerprint format (64-character hex string)
 */
export function isValidFingerprint(fingerprint: string): boolean {
  return typeof fingerprint === 'string' && 
         /^[a-f0-9]{64}$/.test(fingerprint);
}

/**
 * Compare two fingerprints securely
 */
export function compareFingerprints(fp1: string, fp2: string): boolean {
  if (!isValidFingerprint(fp1) || !isValidFingerprint(fp2)) {
    return false;
  }
  
  // Use timing-safe comparison for security
  const crypto = require('crypto');
  return crypto.timingSafeEqual(
    Buffer.from(fp1, 'hex'),
    Buffer.from(fp2, 'hex')
  );
}