/**
 * Conformance Profile Capabilities
 *
 * Maps categories to their profile details for capabilities reporting.
 */

import type { ProfileDetail, ProfileLevel, ConformanceLevel } from './types.js';

/**
 * Profile capability registry
 *
 * Maps categories to their profile details including:
 * - profile: The profile name for the report
 * - level: 'semantic' for full validation, 'shape' for structural-only
 * - validator: The validator used (for transparency)
 * - notes: Any caveats about validation scope
 */
export const PROFILE_CAPABILITIES: Record<string, ProfileDetail> = {
  valid: {
    profile: 'receipt.verify.claims',
    level: 'semantic',
    validator: '@peac/schema:ReceiptClaimsSchema',
  },
  invalid: {
    profile: 'receipt.verify.claims',
    level: 'semantic',
    validator: '@peac/schema:ReceiptClaimsSchema',
  },
  edge: {
    profile: 'receipt.verify.claims',
    level: 'semantic',
    validator: '@peac/schema:ReceiptClaimsSchema',
  },
  'agent-identity': {
    profile: 'receipt.verify.agent-identity',
    level: 'semantic',
    validator: '@peac/schema:validateAgentIdentityAttestation',
  },
  attribution: {
    profile: 'receipt.verify.attribution',
    level: 'semantic',
    validator: '@peac/schema:validateAttributionAttestation',
  },
  bundle: {
    profile: 'bundle.shape',
    level: 'shape',
    validator: 'structural-check',
    notes: 'Structure-only; no cryptographic integrity verification',
  },
  discovery: {
    profile: 'discovery.config',
    level: 'semantic',
    validator: '@peac/disc:parse',
  },
  dispute: {
    profile: 'receipt.verify.dispute',
    level: 'semantic',
    validator: '@peac/schema:validateDisputeAttestation',
  },
  interaction: {
    profile: 'receipt.verify.interaction',
    level: 'semantic',
    validator: '@peac/schema:validateInteractionOrdered',
  },
  issue: {
    profile: 'receipt.issue',
    level: 'semantic',
    validator: '@peac/schema:ReceiptClaimsSchema',
  },
  obligations: {
    profile: 'receipt.verify.obligations',
    level: 'semantic',
    validator: '@peac/schema:validateObligationsExtension',
  },
  policy: {
    profile: 'policy.evaluate',
    level: 'shape',
    validator: 'structural-check',
    notes: 'Structure-only; no policy evaluation logic',
  },
  purpose: {
    profile: 'receipt.verify.purpose',
    level: 'semantic',
    validator: '@peac/schema:isValidPurposeToken',
  },
  verifier: {
    profile: 'receipt.verify',
    level: 'semantic',
    validator: '@peac/schema:ReceiptClaimsSchema',
  },
  workflow: {
    profile: 'workflow.validate',
    level: 'semantic',
    validator: '@peac/schema:validateWorkflowContextOrdered',
  },
  x402: {
    profile: 'transport.x402.shape',
    level: 'shape',
    validator: 'structural-check',
    notes: 'Structure-only; no offer/receipt verification or term matching',
  },
};

/**
 * Get profile capability for a category
 *
 * For unknown categories, honestly reports that the default validator uses
 * heuristic semantic receipt validation (ReceiptClaimsSchema) when input
 * looks like claims. This prevents capability misrepresentation.
 */
export function getCategoryCapability(category: string): ProfileDetail {
  return (
    PROFILE_CAPABILITIES[category] ?? {
      profile: `receipt.verify.${category}`,
      level: 'semantic' as ProfileLevel,
      validator: '@peac/schema:ReceiptClaimsSchema (heuristic)',
      notes: 'Unknown category - uses semantic receipt validation when input looks like claims',
    }
  );
}

/**
 * Get profile name based on category
 */
export function getCategoryProfile(category: string): string {
  return getCategoryCapability(category).profile;
}

/**
 * Determine if a fixture should run at a given level
 */
export function shouldRunAtLevel(
  fixtureVersion: string | undefined,
  level: ConformanceLevel
): boolean {
  if (!fixtureVersion) return true; // Default to basic

  const [major, minor] = fixtureVersion.split('.').map(Number);
  const fixtureLevel: ConformanceLevel =
    major > 0 || minor >= 10 ? 'full' : minor >= 9 ? 'standard' : 'basic';

  const levelOrder: ConformanceLevel[] = ['basic', 'standard', 'full'];
  return levelOrder.indexOf(fixtureLevel) <= levelOrder.indexOf(level);
}
