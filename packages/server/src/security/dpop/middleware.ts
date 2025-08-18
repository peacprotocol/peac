import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../../logging';
import { metrics } from '../../metrics';
import { problemDetails } from '../../http/problems';

export interface DPoPConfig {
  enabled: boolean;
  nonceCacheTTL: number;
  clockSkewSeconds: number;
  algorithms: string[];
}

export class DPoPMiddleware {
  constructor(private config: DPoPConfig) {}

  verify() {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!this.config.enabled) {
        return next();
      }

      const dpopHeader = req.get('DPoP');
      if (!dpopHeader) {
        metrics.dpopValidationErrors.inc({ reason: 'missing_header' });
        return problemDetails.send(res, 'authentication_required', {
          detail: 'DPoP proof required',
        });
      }

      try {
        // Full DPoP verification in future PR
        // For now, return 501 to indicate not fully implemented
        if (process.env.PEAC_DPOP_STRICT === 'true') {
          return problemDetails.send(res, 'not_implemented', {
            detail: 'DPoP verification not yet fully implemented',
          });
        }

        // Basic structure validation only for PR-1
        const parts = dpopHeader.split('.');
        if (parts.length !== 3) {
          metrics.dpopValidationErrors.inc({ reason: 'invalid_structure' });
          return problemDetails.send(res, 'authentication_required', {
            detail: 'Invalid DPoP proof structure',
          });
        }

        logger.debug({ dpop: dpopHeader.substring(0, 20) }, 'DPoP header present');
        next();
      } catch (error) {
        metrics.dpopValidationErrors.inc({ reason: 'verification_failed' });
        logger.error({ error }, 'DPoP verification failed');
        return problemDetails.send(res, 'authentication_required', {
          detail: 'DPoP verification failed',
        });
      }
    };
  }

  generateNonce(): string {
    return Buffer.from(randomUUID()).toString('base64url');
  }
}

const dpopConfig: DPoPConfig = {
  enabled: process.env.PEAC_DPOP_ENABLED === 'true',
  nonceCacheTTL: 300,
  clockSkewSeconds: 60,
  algorithms: ['ES256', 'RS256'],
};

export const dpopMiddleware = new DPoPMiddleware(dpopConfig);
