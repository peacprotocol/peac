/**
 * Agreement-First API Handlers for PEAC Protocol v0.9.6
 *
 * Implements POST /peac/agreements and GET /peac/agreements/{id} endpoints
 * with RFC-compliant caching, ETag support, and protocol version enforcement.
 */

import type { Request, Response, NextFunction } from 'express';
import { ulid } from 'ulidx';
import { AgreementProposal, Agreement } from '@peacprotocol/schema';
import { WIRE_VERSION } from '@peacprotocol/schema';
import { problemDetails } from './problems';
import { logger } from '../logging';
import { agreementStore } from '../agreements/store';
import { computeAgreementFingerprint } from '../utils/fingerprint';

/**
 * Generate agreement ID with agr_ prefix
 */
function generateAgreementId(): string {
  return `agr_${ulid()}`;
}

// Removed: using utility from utils/fingerprint.ts

/**
 * Middleware to validate protocol version header on write endpoints
 */
export function validateProtocolVersion(req: Request, res: Response, next: NextFunction): void {
  const protocolHeader = req.get('X-PEAC-Protocol');

  if (!protocolHeader) {
    return problemDetails.send(res, 'protocol_version_required', {
      detail: 'X-PEAC-Protocol header is required',
      required_header: 'X-PEAC-Protocol',
      supported: [WIRE_VERSION],
    });
  }

  if (protocolHeader !== WIRE_VERSION) {
    return problemDetails.send(res, 'protocol_version_unsupported', {
      detail: `Version ${protocolHeader} is not supported`,
      provided_version: protocolHeader,
      supported: [WIRE_VERSION],
      'x-peac-advice': `Supported versions: ${WIRE_VERSION}`,
    });
  }

  next();
}

/**
 * Middleware to validate protocol version for deprecated negotiate endpoint
 * Includes deprecation headers in error responses
 */
export function validateProtocolVersionWithDeprecation(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Set deprecation headers for all responses from this endpoint
  res.set({
    Deprecation: 'true',
    Sunset: 'Wed, 30 Oct 2025 23:59:59 GMT',
    Link: '</peac/agreements>; rel="successor-version"',
  });

  const protocolHeader = req.get('X-PEAC-Protocol');

  if (!protocolHeader) {
    return problemDetails.send(res, 'protocol_version_required', {
      detail: 'X-PEAC-Protocol header is required',
      required_header: 'X-PEAC-Protocol',
      supported: [WIRE_VERSION],
    });
  }

  if (protocolHeader !== WIRE_VERSION) {
    return problemDetails.send(res, 'protocol_version_unsupported', {
      detail: `Version ${protocolHeader} is not supported`,
      provided_version: protocolHeader,
      supported: [WIRE_VERSION],
      'x-peac-advice': `Supported versions: ${WIRE_VERSION}`,
    });
  }

  next();
}

/**
 * Middleware to validate Content-Type for agreement endpoints
 */
export function validateContentType(req: Request, res: Response, next: NextFunction): void {
  const contentType = req.get('Content-Type');

  if (!contentType || !contentType.includes('application/json')) {
    return problemDetails.send(res, 'unsupported_media_type', {
      detail: 'Content-Type must be application/json',
      provided: contentType || 'none',
      supported: ['application/json'],
    });
  }

  next();
}

/**
 * POST /peac/agreements
 * Create new agreement from proposal
 */
export async function createAgreement(req: Request, res: Response): Promise<void> {
  try {
    // Validate proposal structure - check for required fields
    if (
      !req.body ||
      typeof req.body !== 'object' ||
      !req.body.purpose ||
      !req.body.consent ||
      !req.body.pricing_policy ||
      !req.body.terms
    ) {
      return problemDetails.send(res, 'validation_error', {
        detail: 'Invalid agreement proposal structure',
      });
    }

    const proposal = req.body as AgreementProposal;
    const agreementId = generateAgreementId();
    const fingerprint = computeAgreementFingerprint(proposal);
    const now = new Date().toISOString();

    // Create agreement resource
    const agreement: Agreement = {
      id: agreementId,
      fingerprint,
      protocol_version: WIRE_VERSION,
      status: 'valid',
      created_at: now,
      proposal,
    };

    // Store agreement
    agreementStore.set(agreementId, agreement);

    logger.info(
      {
        agreementId,
        fingerprint: fingerprint.substring(0, 8),
        purpose: proposal.purpose,
      },
      'Agreement created'
    );

    // Return 201 with proper headers
    res
      .status(201)
      .location(`/peac/agreements/${agreementId}`)
      .set('ETag', `W/"${fingerprint}"`)
      .set('Cache-Control', 'no-store')
      .json(agreement);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : 'unknown' },
      'Agreement creation failed'
    );

    return problemDetails.send(res, 'internal_error', {
      detail: 'Failed to create agreement',
    });
  }
}

/**
 * GET /peac/agreements/{id}
 * Retrieve agreement with ETag and caching support
 */
export async function getAgreement(req: Request, res: Response): Promise<void> {
  const id = req.params.id;

  // Validate agreement ID format
  if (!id || !/^agr_[A-Za-z0-9]+$/.test(id)) {
    return problemDetails.send(res, 'not_found', { detail: 'Invalid agreement ID format' });
  }

  // Find agreement
  const agreement = agreementStore.get(id);
  if (!agreement) {
    return problemDetails.send(res, 'not_found', { detail: `Agreement ${id} not found` });
  }

  // ETag/If-None-Match handling
  const etag = `W/"${agreement.fingerprint}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Vary', 'Accept, Accept-Encoding');
  const inm = req.header('If-None-Match');
  if (inm && inm === etag) {
    res.setHeader('Cache-Control', 'no-cache');
    res.status(304).end();
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  res.status(200).json(agreement);
}

/**
 * POST /peac/negotiate (deprecated alias)
 * Forwards to createAgreement (deprecation headers set by middleware)
 */
export async function handleNegotiateAlias(req: Request, res: Response): Promise<void> {
  logger.warn(
    {
      path: req.path,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    },
    'Deprecated /peac/negotiate endpoint used'
  );

  // Forward to createAgreement handler
  return createAgreement(req, res);
}

/**
 * Get agreement statistics (for monitoring)
 */
export function getAgreementStats() {
  return agreementStore.getStats();
}
