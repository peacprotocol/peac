import { Receipt, ValidationResult } from './types.js';

/**
 * Validates that conditional fields are present based on enforcement method
 */
export function validateConditionalFields(receipt: Receipt): ValidationResult {
  const errors: Array<{ path: string; message: string; value?: unknown }> = [];

  // Payment required when enforcement method is http-402
  if (receipt.enforcement.method === 'http-402') {
    if (!receipt.payment) {
      errors.push({
        path: 'payment',
        message: 'Payment is required when enforcement.method is "http-402"',
        value: undefined,
      });
    } else {
      // Validate payment fields
      if (!receipt.payment.scheme) {
        errors.push({
          path: 'payment.scheme',
          message: 'payment.scheme is required when enforcement.method is "http-402"',
          value: receipt.payment.scheme,
        });
      }
      if (!receipt.payment.amount) {
        errors.push({
          path: 'payment.amount',
          message: 'payment.amount is required when enforcement.method is "http-402"',
          value: receipt.payment.amount,
        });
      }
      if (!receipt.payment.currency) {
        errors.push({
          path: 'payment.currency',
          message: 'payment.currency is required when enforcement.method is "http-402"',
          value: receipt.payment.currency,
        });
      }
    }
  }

  // AIPREF object must always be present
  if (!receipt.aipref) {
    errors.push({
      path: 'aipref',
      message: 'AIPREF object is required',
      value: undefined,
    });
  }

  // Validate iat is a number (Unix timestamp)
  if (typeof receipt.iat !== 'number' || receipt.iat <= 0) {
    errors.push({
      path: 'iat',
      message: 'iat must be a positive Unix timestamp',
      value: receipt.iat,
    });
  }

  // Validate protocol_version pattern
  const protocolVersionPattern = /^\d+\.\d+\.\d+(\.\d+)?$/;
  if (!protocolVersionPattern.test(receipt.protocol_version)) {
    errors.push({
      path: 'protocol_version',
      message: 'protocol_version must match pattern ^\\d+\\.\\d+\\.\\d+(\\d+)?$',
      value: receipt.protocol_version,
    });
  }

  // Validate wire_version pattern
  const wireVersionPattern = /^\d+\.\d+$/;
  if (!wireVersionPattern.test(receipt.wire_version)) {
    errors.push({
      path: 'wire_version',
      message: 'wire_version must match pattern ^\\d+\\.\\d+$',
      value: receipt.wire_version,
    });
  }

  // Validate crawler_type enum
  const validCrawlerTypes = ['bot', 'agent', 'hybrid', 'browser', 'migrating', 'test', 'unknown'];
  if (!validCrawlerTypes.includes(receipt.crawler_type)) {
    errors.push({
      path: 'crawler_type',
      message: `crawler_type must be one of: ${validCrawlerTypes.join(', ')}`,
      value: receipt.crawler_type,
    });
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Version compatibility check
 */
export function isCompatible(clientVersion: string, serverVersions: string[]): boolean {
  // For now, require exact match
  return serverVersions.includes(clientVersion);
}
