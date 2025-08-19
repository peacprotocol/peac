/**
 * PEAC Protocol v0.9.6 Privacy HTTP API
 *
 * REST API for data protection and privacy features with:
 * - GDPR/CCPA compliance endpoints
 * - Data subject requests
 * - Consent management
 * - Privacy reporting
 */

import { Router, Request, Response } from 'express';
import { logger } from '../logging';
import { problemDetails } from '../http/problems';
import { rateLimitMiddleware } from '../middleware/rateLimit';
import { DataProtectionManager } from './data-protection';
import { validateDataRequest, validateConsentRequest } from '../validation';

export function createPrivacyRouter(dataProtection: DataProtectionManager): Router {
  const router = Router();

  // POST /privacy/consent - Record user consent
  router.post(
    '/consent',
    rateLimitMiddleware('standard'),
    validateConsentRequest,
    async (req: Request, res: Response) => {
      try {
        const { userId, purposes, source, expiresAt, ipAddress, userAgent } = req.body;

        // Validate user exists and can give consent
        if (!userId || typeof userId !== 'string') {
          return problemDetails.send(res, 'validation_error', {
            detail: 'Valid user ID is required',
          });
        }

        // Record consent
        dataProtection.recordConsent({
          userId,
          purposes: purposes || [],
          source: source || 'explicit',
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          ipAddress: ipAddress || req.ip,
          userAgent: userAgent || req.get('User-Agent'),
        });

        logger.info(
          {
            userId,
            purposes,
            requestId: res.get('X-Request-Id'),
          },
          'Consent recorded',
        );

        res.status(201).json({
          message: 'Consent recorded successfully',
          userId,
          purposes,
          recordedAt: new Date().toISOString(),
        });
      } catch (error) {
        logger.error({ error }, 'Failed to record consent');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to record consent',
        });
      }
    },
  );

  // DELETE /privacy/consent/:userId - Withdraw consent
  router.delete(
    '/consent/:userId',
    rateLimitMiddleware('standard'),
    async (req: Request, res: Response) => {
      try {
        const { userId } = req.params;
        const { purposes } = req.query;

        const purposeList = purposes
          ? Array.isArray(purposes)
            ? (purposes as string[])
            : [purposes as string]
          : undefined;

        dataProtection.withdrawConsent(userId, purposeList);

        logger.info(
          {
            userId,
            purposes: purposeList,
            requestId: res.get('X-Request-Id'),
          },
          'Consent withdrawn',
        );

        res.json({
          message: 'Consent withdrawn successfully',
          userId,
          purposes: purposeList || 'all',
          withdrawnAt: new Date().toISOString(),
        });
      } catch (error) {
        logger.error({ error, userId: req.params.userId }, 'Failed to withdraw consent');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to withdraw consent',
        });
      }
    },
  );

  // GET /privacy/consent/:userId - Check consent status
  router.get(
    '/consent/:userId',
    rateLimitMiddleware('standard'),
    async (req: Request, res: Response) => {
      try {
        const { userId } = req.params;
        const { purpose } = req.query;

        if (purpose && typeof purpose === 'string') {
          const hasConsent = dataProtection.hasValidConsent(userId, purpose);

          res.json({
            userId,
            purpose,
            hasValidConsent: hasConsent,
            checkedAt: new Date().toISOString(),
          });
        } else {
          // Return all consent records for user
          const auditTrail = dataProtection.getUserAuditTrail(userId);
          const consentEvents = auditTrail.filter((event) => event.action.startsWith('consent.'));

          res.json({
            userId,
            consentHistory: consentEvents,
            checkedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        logger.error({ error, userId: req.params.userId }, 'Failed to check consent');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to check consent status',
        });
      }
    },
  );

  // POST /privacy/request - Create data subject request
  router.post(
    '/request',
    rateLimitMiddleware('privacy'),
    validateDataRequest,
    async (req: Request, res: Response) => {
      try {
        const { type, userId, metadata } = req.body;

        // Validate request type
        const validTypes = ['access', 'export', 'delete', 'rectification', 'portability'];
        if (!validTypes.includes(type)) {
          return problemDetails.send(res, 'validation_error', {
            detail: `Invalid request type. Must be one of: ${validTypes.join(', ')}`,
          });
        }

        // Create data request
        const dataRequest = dataProtection.createDataRequest({
          type,
          userId,
          metadata: metadata || {},
        });

        logger.info(
          {
            requestId: dataRequest.id,
            type,
            userId,
            httpRequestId: res.get('X-Request-Id'),
          },
          'Data subject request created',
        );

        res.status(201).json({
          requestId: dataRequest.id,
          type: dataRequest.type,
          userId: dataRequest.userId,
          status: dataRequest.status,
          requestedAt: dataRequest.requestedAt.toISOString(),
          estimatedCompletionTime: getEstimatedCompletionTime(type),
        });
      } catch (error) {
        logger.error({ error }, 'Failed to create data request');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to create data subject request',
        });
      }
    },
  );

  // GET /privacy/request/:requestId - Get request status
  router.get(
    '/request/:requestId',
    rateLimitMiddleware('standard'),
    async (req: Request, res: Response) => {
      try {
        const { requestId } = req.params;

        // In a real implementation, would query from persistent storage
        // For now, return simulated response
        res.json({
          requestId,
          status: 'processing',
          requestedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          estimatedCompletion: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
          progress: {
            step: 'data_collection',
            percentage: 45,
            description: 'Collecting data from internal systems',
          },
        });
      } catch (error) {
        logger.error({ error, requestId: req.params.requestId }, 'Failed to get request status');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to retrieve request status',
        });
      }
    },
  );

  // POST /privacy/mask - Mask PII in data
  router.post('/mask', rateLimitMiddleware('standard'), async (req: Request, res: Response) => {
    try {
      const { data, level } = req.body;

      if (!data) {
        return problemDetails.send(res, 'validation_error', {
          detail: 'Data to mask is required',
        });
      }

      const maskingLevel = level === 'full' ? 'full' : 'partial';
      const maskedData = dataProtection.maskPII(data, maskingLevel);

      res.json({
        maskedData,
        level: maskingLevel,
        maskedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to mask data');
      problemDetails.send(res, 'internal_error', {
        detail: 'Failed to mask PII data',
      });
    }
  });

  // POST /privacy/detect-pii - Detect PII in data
  router.post(
    '/detect-pii',
    rateLimitMiddleware('standard'),
    async (req: Request, res: Response) => {
      try {
        const { data } = req.body;

        if (!data) {
          return problemDetails.send(res, 'validation_error', {
            detail: 'Data to analyze is required',
          });
        }

        const detection = dataProtection.detectPII(data);

        res.json({
          ...detection,
          analyzedAt: new Date().toISOString(),
          recommendation: detection.detected
            ? 'PII detected - consider encryption or masking'
            : 'No PII patterns detected',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to detect PII');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to analyze data for PII',
        });
      }
    },
  );

  // GET /privacy/retention/:dataType - Get retention requirements
  router.get(
    '/retention/:dataType',
    rateLimitMiddleware('standard'),
    async (req: Request, res: Response) => {
      try {
        const { dataType } = req.params;

        const requirements = dataProtection.getRetentionRequirements(dataType);

        if (!requirements) {
          return problemDetails.send(res, 'resource_not_found', {
            detail: `No retention requirements found for data type: ${dataType}`,
          });
        }

        res.json({
          dataType,
          classification: requirements,
          retrievedAt: new Date().toISOString(),
        });
      } catch (error) {
        logger.error(
          { error, dataType: req.params.dataType },
          'Failed to get retention requirements',
        );
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to retrieve retention requirements',
        });
      }
    },
  );

  // GET /privacy/audit/:userId - Get user audit trail
  router.get(
    '/audit/:userId',
    rateLimitMiddleware('standard'),
    async (req: Request, res: Response) => {
      try {
        const { userId } = req.params;
        const { from, to, limit } = req.query;

        const fromDate = from ? new Date(from as string) : undefined;
        const toDate = to ? new Date(to as string) : undefined;
        const auditLimit = limit ? parseInt(limit as string, 10) : 100;

        let auditTrail = dataProtection.getUserAuditTrail(userId, fromDate, toDate);

        // Apply limit
        if (auditTrail.length > auditLimit) {
          auditTrail = auditTrail.slice(0, auditLimit);
        }

        res.json({
          userId,
          auditTrail,
          totalEvents: auditTrail.length,
          period: {
            from: fromDate?.toISOString(),
            to: toDate?.toISOString(),
          },
          retrievedAt: new Date().toISOString(),
        });
      } catch (error) {
        logger.error({ error, userId: req.params.userId }, 'Failed to get audit trail');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to retrieve audit trail',
        });
      }
    },
  );

  // GET /privacy/compliance/report - Generate compliance report
  router.get(
    '/compliance/report',
    rateLimitMiddleware('standard'),
    async (_req: Request, res: Response) => {
      try {
        const report = dataProtection.generateComplianceReport();

        res.json({
          ...report,
          reportVersion: '1.0',
          generatedFor: 'PEAC Protocol v0.9.6',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to generate compliance report');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to generate compliance report',
        });
      }
    },
  );

  // POST /privacy/anonymize - Anonymize data for analytics
  router.post(
    '/anonymize',
    rateLimitMiddleware('standard'),
    async (req: Request, res: Response) => {
      try {
        const { data } = req.body;

        if (!data || typeof data !== 'object') {
          return problemDetails.send(res, 'validation_error', {
            detail: 'Valid data object is required',
          });
        }

        const anonymizedData = dataProtection.anonymizeForAnalytics(data);

        res.json({
          anonymizedData,
          originalFields: Object.keys(data).length,
          anonymizedFields: Object.keys(anonymizedData).length,
          anonymizedAt: new Date().toISOString(),
        });
      } catch (error) {
        logger.error({ error }, 'Failed to anonymize data');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to anonymize data',
        });
      }
    },
  );

  // Helper method
  function getEstimatedCompletionTime(requestType: string): string {
    const completionDays = {
      access: 30, // GDPR Article 15
      export: 30, // GDPR Article 20
      delete: 30, // GDPR Article 17
      rectification: 30, // GDPR Article 16
      portability: 30, // GDPR Article 20
    };

    const days = (completionDays as Record<string, number>)[requestType] || 30;
    const completionDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    return completionDate.toISOString();
  }

  return router;
}

// Add privacy-specific problem types
problemDetails.addProblemType('privacy_consent_required', {
  type: 'https://peacprotocol.org/problems/privacy-consent-required',
  title: 'Consent Required',
  status: 403,
});

problemDetails.addProblemType('privacy_request_pending', {
  type: 'https://peacprotocol.org/problems/privacy-request-pending',
  title: 'Privacy Request Pending',
  status: 409,
});

problemDetails.addProblemType('privacy_data_not_found', {
  type: 'https://peacprotocol.org/problems/privacy-data-not-found',
  title: 'Privacy Data Not Found',
  status: 404,
});
