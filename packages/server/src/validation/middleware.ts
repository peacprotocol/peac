import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { problemDetails } from '../http/problems';
import { logger } from '../logging';
import { schemaRegistry, SchemaKey, ValidationResult } from './schemas';

/**
 * Validation middleware factory for PEAC Protocol v0.9.6
 * Provides comprehensive, type-safe validation with detailed error reporting
 */

export interface ValidationConfig {
  body?: SchemaKey | z.ZodSchema;
  params?: SchemaKey | z.ZodSchema;
  query?: SchemaKey | z.ZodSchema;
  headers?: SchemaKey | z.ZodSchema;
  stripUnknown?: boolean;
  abortEarly?: boolean;
}

/**
 * Validates data against a Zod schema
 */
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof ZodError) {
      return { success: false, errors: error };
    }
    throw error;
  }
}

/**
 * Formats Zod validation errors into user-friendly messages
 */
export function formatValidationErrors(error: ZodError): string[] {
  return error.errors.map((err) => {
    const path = err.path.length > 0 ? err.path.join('.') : 'root';
    return `${path}: ${err.message}`;
  });
}

/**
 * Gets schema from registry or returns the schema directly
 */
function getSchema(schemaOrKey: SchemaKey | z.ZodSchema): z.ZodSchema {
  if (typeof schemaOrKey === 'string') {
    const schema = schemaRegistry[schemaOrKey];
    if (!schema) {
      throw new Error(`Schema not found in registry: ${schemaOrKey}`);
    }
    return schema;
  }
  return schemaOrKey;
}

/**
 * Express middleware for request validation
 */
export function validate(config: ValidationConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const validationErrors: string[] = [];
    const requestId = res.get('X-Request-Id') || 'unknown';

    try {
      // Validate request body
      if (config.body) {
        const schema = getSchema(config.body);
        const result = validateData(schema, req.body);

        if (!result.success && result.errors) {
          const errors = formatValidationErrors(result.errors);
          validationErrors.push(...errors.map((err) => `body.${err}`));
        } else if (result.success && result.data) {
          req.body = result.data;
        }
      }

      // Validate request parameters
      if (config.params) {
        const schema = getSchema(config.params);
        const result = validateData(schema, req.params);

        if (!result.success && result.errors) {
          const errors = formatValidationErrors(result.errors);
          validationErrors.push(...errors.map((err) => `params.${err}`));
        } else if (result.success && result.data) {
          req.params = result.data;
        }
      }

      // Validate query parameters
      if (config.query) {
        const schema = getSchema(config.query);
        const result = validateData(schema, req.query);

        if (!result.success && result.errors) {
          const errors = formatValidationErrors(result.errors);
          validationErrors.push(...errors.map((err) => `query.${err}`));
        } else if (result.success && result.data) {
          req.query = result.data;
        }
      }

      // Validate headers
      if (config.headers) {
        const schema = getSchema(config.headers);
        const result = validateData(schema, req.headers);

        if (!result.success && result.errors) {
          const errors = formatValidationErrors(result.errors);
          validationErrors.push(...errors.map((err) => `headers.${err}`));
        }
      }

      // If validation failed, return error response
      if (validationErrors.length > 0) {
        logger.warn(
          {
            requestId,
            path: req.path,
            method: req.method,
            validationErrors,
            body: req.body,
            query: req.query,
            params: req.params,
          },
          'Request validation failed',
        );

        return problemDetails.send(res, 'validation_error', {
          detail: 'Request validation failed',
          invalid_params: validationErrors,
        });
      }

      next();
    } catch (error) {
      logger.error(
        {
          requestId,
          path: req.path,
          method: req.method,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Validation middleware error',
      );

      return problemDetails.send(res, 'internal_error', {
        detail: 'Validation processing failed',
      });
    }
  };
}

/**
 * Validates specific data outside of Express middleware context
 */
export function validateSchema(schemaKey: SchemaKey, data: unknown): unknown {
  const schema = schemaRegistry[schemaKey];
  if (!schema) {
    throw new Error(`Schema not found: ${schemaKey}`);
  }

  return schema.parse(data);
}

/**
 * Safely validates data and returns result without throwing
 */
export function safeValidate<T = unknown>(
  schemaKey: SchemaKey,
  data: unknown,
): ValidationResult<T> {
  try {
    const validData = validateSchema(schemaKey, data) as T;
    return { success: true, data: validData };
  } catch (error) {
    if (error instanceof ZodError) {
      return { success: false, errors: error };
    }
    throw error;
  }
}

/**
 * Middleware specifically for idempotency key validation
 */
export function validateIdempotencyKey(req: Request, res: Response, next: NextFunction): void {
  const idempotencyKey = req.get('Idempotency-Key');

  if (idempotencyKey) {
    const result = safeValidate('header.idempotencyKey', idempotencyKey);

    if (!result.success && result.errors) {
      const errors = formatValidationErrors(result.errors);
      return problemDetails.send(res, 'validation_error', {
        detail: 'Invalid Idempotency-Key header',
        invalid_params: errors,
      });
    }
  }

  next();
}

/**
 * Middleware for validating Accept headers
 */
export function validateAcceptHeader(req: Request, res: Response, next: NextFunction): void {
  const acceptHeader = req.get('Accept');

  if (acceptHeader) {
    const result = safeValidate('header.accept', acceptHeader);

    if (!result.success && result.errors) {
      return problemDetails.send(res, 'not_acceptable', {
        detail: 'Unsupported Accept header',
        supported_types: ['application/json', 'application/problem+json', 'application/*', '*/*'],
      });
    }
  }

  next();
}

/**
 * Middleware for webhook signature validation
 */
export function validateWebhookSignature(req: Request, res: Response, next: NextFunction): void {
  const signature = req.get('Peac-Signature');

  if (!signature) {
    return problemDetails.send(res, 'webhook_authentication_failed', {
      detail: 'Missing Peac-Signature header',
    });
  }

  const result = safeValidate('header.hmacSignature', signature);

  if (!result.success && result.errors) {
    const errors = formatValidationErrors(result.errors);
    return problemDetails.send(res, 'webhook_authentication_failed', {
      detail: 'Invalid Peac-Signature header format',
      invalid_params: errors,
    });
  }

  next();
}

// Type-safe validation decorators for specific endpoints
export const validatePaymentCreation = validate({
  body: 'payment.create',
});

export const validatePaymentQuery = validate({
  query: 'payment.listQuery',
});

export const validateNegotiationCreation = validate({
  body: 'negotiation.create',
});

export const validateNegotiationAccept = validate({
  body: 'negotiation.accept',
  params: 'param.id',
});

export const validateNegotiationReject = validate({
  body: 'negotiation.reject',
  params: 'param.id',
});

export const validateNegotiationQuery = validate({
  query: 'negotiation.listQuery',
});

export const validateResourceId = validate({
  params: 'param.id',
});

export const validateWebhookPayload = validate({
  body: 'webhook.payload',
});

// Privacy validation middleware
export const validateConsentRequest = validate({
  body: 'privacy.consentRequest',
});

export const validateDataRequest = validate({
  body: 'privacy.dataRequest',
});

export const validatePrivacyQuery = validate({
  query: 'privacy.query',
});
