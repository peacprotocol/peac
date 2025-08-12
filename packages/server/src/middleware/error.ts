/* istanbul ignore file */
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logging';

const SAFE_ERROR_MESSAGES = new Set([
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
  'rate_limit_exceeded',
  'invalid_request',
  'session_expired',
  'invalid_token',
  'session_revoked',
  'agent_revoked',
  'unauthorized_subject_access',
  'missing_signing_key',
  'invalid_key_config',
  'export_failed',
  'config_rpc_url_required',
  'config_private_key_required',
  'config_chain_id_required',
  'config_invalid_mode',
  'config_usdc_address_required',
  'config_contract_address_required',
  'invalid_url',
  'blocked_scheme',
  'blocked_address',
  'property_invalid',
]);

export function errorHandler(err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) {
  const status = err.statusCode || 500;
  const originalMessage = err.message || 'internal_error';
  
  // Log the actual error for debugging
  logger.error({ error: err, status }, 'Request error occurred');
  
  // Only send safe error messages to client
  const safeMessage = SAFE_ERROR_MESSAGES.has(originalMessage) 
    ? originalMessage 
    : 'internal_error';
    
  res.status(status).json({ ok: false, error: safeMessage });
}
