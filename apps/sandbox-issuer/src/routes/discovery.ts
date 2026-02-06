/**
 * Discovery endpoints
 *
 * GET /.well-known/peac-issuer.json -- Issuer configuration
 * GET /.well-known/jwks.json -- Public keys
 */

import type { Context } from 'hono';
import { getPublicJwk, resolveKeys } from '../keys.js';
import { resolveIssuerUrl } from '../config.js';

export async function issuerConfigHandler(c: Context) {
  const keys = await resolveKeys();
  const isEphemeral = keys.mode === 'ephemeral';
  const issuerUrl = resolveIssuerUrl(c);

  const config = {
    version: 'peac-issuer/0.1',
    issuer: issuerUrl,
    jwks_uri: `${issuerUrl}/.well-known/jwks.json`,
    receipt_versions: ['peac-receipt/0.1'],
    algorithms: ['EdDSA'],
    ...(isEphemeral ? { sandbox_mode: 'ephemeral' } : {}),
  };

  c.header('Content-Type', 'application/json');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.json(config);
}

export async function jwksHandler(c: Context) {
  const jwk = await getPublicJwk();

  c.header('Content-Type', 'application/json');
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ keys: [jwk] });
}
