import type { Request, Response } from 'express';
import { metrics } from '../metrics';
import { verifySession } from '../core/session';
import {
  verifyAgentDescriptor,
  checkPurposeAllowed,
  type AgentDescriptor,
} from '../agents/identity';
import { verifyDPoP } from '../crypto/dpop';
import { calculateJwkThumbprint } from 'jose';
import { validatePropertyClaims } from '../property/rights';

type Reason =
  | 'agent_invalid'
  | 'purpose_not_allowed'
  | 'session_missing'
  | 'session_invalid'
  | 'missing_attribution'
  | 'dpop_missing'
  | 'dpop_invalid'
  | 'dpop_thumbprint_mismatch'
  | 'bad_request';

function attributionOutcome(req: Request) {
  if (req.headers['x-attribution']) {
    metrics.attributionCompliance.inc({ outcome: 'pass' });
    return true;
  }
  metrics.attributionCompliance.inc({ outcome: 'missing' });
  return false;
}

function fullUrl(req: Request): string {
  const host = req.get('host');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  return `${proto}://${host}${req.originalUrl}`;
}

export async function handleVerify(req: Request, res: Response): Promise<void> {
  // v0.9.12: Version header handled by middleware (peac-version)

  const hasAttribution = attributionOutcome(req);

  const body = req.body;
  if (!body || typeof body !== 'object') {
    metrics.verifyTotal.inc({ outcome: 'failure' });
    return void res.status(400).json({ ok: false, reasons: ['bad_request'] as Reason[] });
  }

  const agentDescriptor = body.agentDescriptor as AgentDescriptor | undefined;
  const expectedPurpose = body.expectedPurpose as string | undefined;
  if (
    !agentDescriptor ||
    typeof agentDescriptor !== 'object' ||
    typeof agentDescriptor.signature !== 'string' ||
    !expectedPurpose
  ) {
    const reasons: Reason[] = ['bad_request'];
    if (!hasAttribution) reasons.unshift('missing_attribution');
    metrics.verifyTotal.inc({ outcome: 'failure' });
    return void res.status(400).json({ ok: false, reasons });
  }

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    const reasons: Reason[] = ['session_missing'];
    if (!hasAttribution) reasons.unshift('missing_attribution');
    metrics.verifyTotal.inc({ outcome: 'failure' });
    return void res.status(401).json({ ok: false, reasons });
  }

  const token = auth.slice(7);
  let sessionPayload: {
    sub?: string;
    cnf?: { jkt: string };
    resource?: string;
  };
  try {
    sessionPayload = await verifySession(token);
  } catch {
    const reasons: Reason[] = ['session_invalid'];
    if (!hasAttribution) reasons.unshift('missing_attribution');
    metrics.verifyTotal.inc({ outcome: 'failure' });
    return void res.status(401).json({ ok: false, reasons });
  }

  let agentJwk;
  try {
    const verified = await verifyAgentDescriptor(agentDescriptor);
    agentJwk = verified.jwk;
  } catch {
    const reasons: Reason[] = ['agent_invalid'];
    if (!hasAttribution) reasons.unshift('missing_attribution');
    metrics.verifyTotal.inc({ outcome: 'failure' });
    return void res.status(403).json({ ok: false, reasons });
  }

  // Property Rights (Preview): validate if present, count metrics, never fail /verify
  if (agentDescriptor.property) {
    try {
      validatePropertyClaims(agentDescriptor.property);
      metrics.propertyClaimsTotal?.inc({ source: 'descriptor', valid: 'true' });
    } catch {
      metrics.propertyClaimsTotal?.inc({
        source: 'descriptor',
        valid: 'false',
      });
      // do not fail verification
    }
  }

  const purposeAllowed = checkPurposeAllowed(agentDescriptor, expectedPurpose);
  if (!purposeAllowed) {
    const reasons: Reason[] = ['purpose_not_allowed'];
    if (!hasAttribution) reasons.unshift('missing_attribution');
    metrics.verifyTotal.inc({ outcome: 'failure' });
    return void res.status(403).json({ ok: false, reasons });
  }

  if (sessionPayload?.cnf?.jkt) {
    const dpop = req.headers['dpop'] as string | undefined;
    if (!dpop) {
      const reasons: Reason[] = ['dpop_missing'];
      if (!hasAttribution) reasons.unshift('missing_attribution');
      metrics.verifyTotal.inc({ outcome: 'failure' });
      return void res.status(401).json({ ok: false, reasons });
    }
    const jkt = await calculateJwkThumbprint(agentJwk, 'sha256');
    if (jkt !== sessionPayload.cnf.jkt) {
      const reasons: Reason[] = ['dpop_thumbprint_mismatch'];
      if (!hasAttribution) reasons.unshift('missing_attribution');
      metrics.verifyTotal.inc({ outcome: 'failure' });
      return void res.status(401).json({ ok: false, reasons });
    }
    const url = fullUrl(req);
    try {
      await verifyDPoP(dpop, agentJwk, { htm: req.method, htu: url });
    } catch {
      const reasons: Reason[] = ['dpop_invalid'];
      if (!hasAttribution) reasons.unshift('missing_attribution');
      metrics.verifyTotal.inc({ outcome: 'failure' });
      return void res.status(401).json({ ok: false, reasons });
    }
  }

  metrics.verifyTotal.inc({ outcome: 'success' });
  return void res.status(200).json({
    ok: true,
    subject: sessionPayload?.sub ?? undefined,
    resource: sessionPayload?.resource ?? undefined,
  });
}
