/**
 * gRPC Transport Status Code Parity Tests
 *
 * Verifies that gRPC status codes map correctly to/from HTTP status codes
 * and PEAC error codes.
 */

import { describe, it, expect } from 'vitest';
import {
  GrpcStatus,
  httpStatusToGrpc,
  grpcStatusToHttp,
  peacErrorToGrpc,
  createGrpcError,
  extractReceiptFromMetadata,
  addReceiptToMetadata,
  createSuccessResult,
  createFailureResult,
  getStatusName,
  GrpcMetadataKeys,
  GRPC_TRANSPORT_VERSION,
} from '../src/index.js';

describe('gRPC Transport', () => {
  describe('version', () => {
    it('should export correct version', () => {
      expect(GRPC_TRANSPORT_VERSION).toBe('0.9.20');
    });
  });

  describe('GrpcStatus constants', () => {
    it('should define all standard gRPC status codes', () => {
      expect(GrpcStatus.OK).toBe(0);
      expect(GrpcStatus.CANCELLED).toBe(1);
      expect(GrpcStatus.UNKNOWN).toBe(2);
      expect(GrpcStatus.INVALID_ARGUMENT).toBe(3);
      expect(GrpcStatus.DEADLINE_EXCEEDED).toBe(4);
      expect(GrpcStatus.NOT_FOUND).toBe(5);
      expect(GrpcStatus.ALREADY_EXISTS).toBe(6);
      expect(GrpcStatus.PERMISSION_DENIED).toBe(7);
      expect(GrpcStatus.RESOURCE_EXHAUSTED).toBe(8);
      expect(GrpcStatus.FAILED_PRECONDITION).toBe(9);
      expect(GrpcStatus.ABORTED).toBe(10);
      expect(GrpcStatus.OUT_OF_RANGE).toBe(11);
      expect(GrpcStatus.UNIMPLEMENTED).toBe(12);
      expect(GrpcStatus.INTERNAL).toBe(13);
      expect(GrpcStatus.UNAVAILABLE).toBe(14);
      expect(GrpcStatus.DATA_LOSS).toBe(15);
      expect(GrpcStatus.UNAUTHENTICATED).toBe(16);
    });
  });

  describe('httpStatusToGrpc', () => {
    it('should map success statuses to OK', () => {
      expect(httpStatusToGrpc(200)).toBe(GrpcStatus.OK);
      expect(httpStatusToGrpc(201)).toBe(GrpcStatus.OK);
      expect(httpStatusToGrpc(204)).toBe(GrpcStatus.OK);
    });

    it('should map 400 to INVALID_ARGUMENT', () => {
      expect(httpStatusToGrpc(400)).toBe(GrpcStatus.INVALID_ARGUMENT);
    });

    it('should map 401 to UNAUTHENTICATED', () => {
      expect(httpStatusToGrpc(401)).toBe(GrpcStatus.UNAUTHENTICATED);
    });

    it('should map 402 to FAILED_PRECONDITION', () => {
      expect(httpStatusToGrpc(402)).toBe(GrpcStatus.FAILED_PRECONDITION);
    });

    it('should map 403 to PERMISSION_DENIED', () => {
      expect(httpStatusToGrpc(403)).toBe(GrpcStatus.PERMISSION_DENIED);
    });

    it('should map 404 to NOT_FOUND', () => {
      expect(httpStatusToGrpc(404)).toBe(GrpcStatus.NOT_FOUND);
    });

    it('should map 409 to ABORTED', () => {
      expect(httpStatusToGrpc(409)).toBe(GrpcStatus.ABORTED);
    });

    it('should map 429 to RESOURCE_EXHAUSTED', () => {
      expect(httpStatusToGrpc(429)).toBe(GrpcStatus.RESOURCE_EXHAUSTED);
    });

    it('should map 499 to CANCELLED', () => {
      expect(httpStatusToGrpc(499)).toBe(GrpcStatus.CANCELLED);
    });

    it('should map 500 to INTERNAL', () => {
      expect(httpStatusToGrpc(500)).toBe(GrpcStatus.INTERNAL);
    });

    it('should map 501 to UNIMPLEMENTED', () => {
      expect(httpStatusToGrpc(501)).toBe(GrpcStatus.UNIMPLEMENTED);
    });

    it('should map 503 to UNAVAILABLE', () => {
      expect(httpStatusToGrpc(503)).toBe(GrpcStatus.UNAVAILABLE);
    });

    it('should map 504 to DEADLINE_EXCEEDED', () => {
      expect(httpStatusToGrpc(504)).toBe(GrpcStatus.DEADLINE_EXCEEDED);
    });

    it('should map unknown 4xx to INVALID_ARGUMENT', () => {
      expect(httpStatusToGrpc(418)).toBe(GrpcStatus.INVALID_ARGUMENT);
      expect(httpStatusToGrpc(422)).toBe(GrpcStatus.INVALID_ARGUMENT);
    });

    it('should map unknown 5xx to INTERNAL', () => {
      expect(httpStatusToGrpc(502)).toBe(GrpcStatus.INTERNAL);
      expect(httpStatusToGrpc(599)).toBe(GrpcStatus.INTERNAL);
    });
  });

  describe('grpcStatusToHttp', () => {
    it('should map OK to 200', () => {
      expect(grpcStatusToHttp(GrpcStatus.OK)).toBe(200);
    });

    it('should map CANCELLED to 499', () => {
      expect(grpcStatusToHttp(GrpcStatus.CANCELLED)).toBe(499);
    });

    it('should map INVALID_ARGUMENT to 400', () => {
      expect(grpcStatusToHttp(GrpcStatus.INVALID_ARGUMENT)).toBe(400);
    });

    it('should map UNAUTHENTICATED to 401', () => {
      expect(grpcStatusToHttp(GrpcStatus.UNAUTHENTICATED)).toBe(401);
    });

    it('should map FAILED_PRECONDITION to 402', () => {
      expect(grpcStatusToHttp(GrpcStatus.FAILED_PRECONDITION)).toBe(402);
    });

    it('should map PERMISSION_DENIED to 403', () => {
      expect(grpcStatusToHttp(GrpcStatus.PERMISSION_DENIED)).toBe(403);
    });

    it('should map NOT_FOUND to 404', () => {
      expect(grpcStatusToHttp(GrpcStatus.NOT_FOUND)).toBe(404);
    });

    it('should map ABORTED to 409', () => {
      expect(grpcStatusToHttp(GrpcStatus.ABORTED)).toBe(409);
    });

    it('should map RESOURCE_EXHAUSTED to 429', () => {
      expect(grpcStatusToHttp(GrpcStatus.RESOURCE_EXHAUSTED)).toBe(429);
    });

    it('should map INTERNAL to 500', () => {
      expect(grpcStatusToHttp(GrpcStatus.INTERNAL)).toBe(500);
    });

    it('should map UNIMPLEMENTED to 501', () => {
      expect(grpcStatusToHttp(GrpcStatus.UNIMPLEMENTED)).toBe(501);
    });

    it('should map UNAVAILABLE to 503', () => {
      expect(grpcStatusToHttp(GrpcStatus.UNAVAILABLE)).toBe(503);
    });

    it('should map DEADLINE_EXCEEDED to 504', () => {
      expect(grpcStatusToHttp(GrpcStatus.DEADLINE_EXCEEDED)).toBe(504);
    });
  });

  describe('peacErrorToGrpc - HTTP status parity', () => {
    describe('402 Payment Required -> FAILED_PRECONDITION', () => {
      it('should map E_RECEIPT_MISSING', () => {
        expect(peacErrorToGrpc('E_RECEIPT_MISSING')).toBe(GrpcStatus.FAILED_PRECONDITION);
      });

      it('should map E_RECEIPT_INVALID', () => {
        expect(peacErrorToGrpc('E_RECEIPT_INVALID')).toBe(GrpcStatus.FAILED_PRECONDITION);
      });

      it('should map E_RECEIPT_EXPIRED', () => {
        expect(peacErrorToGrpc('E_RECEIPT_EXPIRED')).toBe(GrpcStatus.FAILED_PRECONDITION);
      });
    });

    describe('401 Unauthorized -> UNAUTHENTICATED', () => {
      it('should map E_TAP_SIGNATURE_MISSING', () => {
        expect(peacErrorToGrpc('E_TAP_SIGNATURE_MISSING')).toBe(GrpcStatus.UNAUTHENTICATED);
      });

      it('should map E_TAP_SIGNATURE_INVALID', () => {
        expect(peacErrorToGrpc('E_TAP_SIGNATURE_INVALID')).toBe(GrpcStatus.UNAUTHENTICATED);
      });

      it('should map E_TAP_TIME_INVALID', () => {
        expect(peacErrorToGrpc('E_TAP_TIME_INVALID')).toBe(GrpcStatus.UNAUTHENTICATED);
      });

      it('should map E_TAP_KEY_NOT_FOUND', () => {
        expect(peacErrorToGrpc('E_TAP_KEY_NOT_FOUND')).toBe(GrpcStatus.UNAUTHENTICATED);
      });

      it('should map E_TAP_REPLAY_PROTECTION_REQUIRED', () => {
        expect(peacErrorToGrpc('E_TAP_REPLAY_PROTECTION_REQUIRED')).toBe(
          GrpcStatus.UNAUTHENTICATED
        );
      });
    });

    describe('400 Bad Request -> INVALID_ARGUMENT', () => {
      it('should map E_TAP_WINDOW_TOO_LARGE', () => {
        expect(peacErrorToGrpc('E_TAP_WINDOW_TOO_LARGE')).toBe(GrpcStatus.INVALID_ARGUMENT);
      });

      it('should map E_TAP_TAG_UNKNOWN', () => {
        expect(peacErrorToGrpc('E_TAP_TAG_UNKNOWN')).toBe(GrpcStatus.INVALID_ARGUMENT);
      });

      it('should map E_TAP_ALGORITHM_INVALID', () => {
        expect(peacErrorToGrpc('E_TAP_ALGORITHM_INVALID')).toBe(GrpcStatus.INVALID_ARGUMENT);
      });
    });

    describe('403 Forbidden -> PERMISSION_DENIED', () => {
      it('should map E_ISSUER_NOT_ALLOWED', () => {
        expect(peacErrorToGrpc('E_ISSUER_NOT_ALLOWED')).toBe(GrpcStatus.PERMISSION_DENIED);
      });
    });

    describe('409 Conflict -> ABORTED', () => {
      it('should map E_TAP_NONCE_REPLAY', () => {
        expect(peacErrorToGrpc('E_TAP_NONCE_REPLAY')).toBe(GrpcStatus.ABORTED);
      });
    });

    describe('500 Internal -> INTERNAL', () => {
      it('should map E_CONFIG_ISSUER_ALLOWLIST_REQUIRED', () => {
        expect(peacErrorToGrpc('E_CONFIG_ISSUER_ALLOWLIST_REQUIRED')).toBe(GrpcStatus.INTERNAL);
      });

      it('should map E_INTERNAL_ERROR', () => {
        expect(peacErrorToGrpc('E_INTERNAL_ERROR')).toBe(GrpcStatus.INTERNAL);
      });
    });

    describe('unknown errors', () => {
      it('should default to INTERNAL for unknown errors', () => {
        expect(peacErrorToGrpc('E_UNKNOWN_ERROR')).toBe(GrpcStatus.INTERNAL);
      });
    });
  });

  describe('createGrpcError', () => {
    it('should create error with correct code', () => {
      const error = createGrpcError('E_RECEIPT_MISSING', 'Receipt required');
      expect(error.code).toBe(GrpcStatus.FAILED_PRECONDITION);
      expect(error.message).toBe('Receipt required');
      expect(error.peacCode).toBe('E_RECEIPT_MISSING');
    });

    it('should include details if provided', () => {
      const error = createGrpcError('E_TAP_NONCE_REPLAY', 'Replay detected', { nonce: 'abc123' });
      expect(error.details).toEqual({ nonce: 'abc123' });
    });
  });

  describe('metadata utilities', () => {
    describe('extractReceiptFromMetadata', () => {
      it('should extract string receipt', () => {
        const metadata = { [GrpcMetadataKeys.RECEIPT]: 'eyJ...' };
        expect(extractReceiptFromMetadata(metadata)).toBe('eyJ...');
      });

      it('should extract first element from array', () => {
        const metadata = { [GrpcMetadataKeys.RECEIPT]: ['eyJ...', 'eyK...'] };
        expect(extractReceiptFromMetadata(metadata)).toBe('eyJ...');
      });

      it('should return null if not present', () => {
        const metadata = {};
        expect(extractReceiptFromMetadata(metadata)).toBeNull();
      });

      it('should return null for undefined', () => {
        const metadata = { [GrpcMetadataKeys.RECEIPT]: undefined };
        expect(extractReceiptFromMetadata(metadata)).toBeNull();
      });

      it('should return null for empty array', () => {
        const metadata = { [GrpcMetadataKeys.RECEIPT]: [] };
        expect(extractReceiptFromMetadata(metadata)).toBeNull();
      });
    });

    describe('addReceiptToMetadata', () => {
      it('should add receipt and type', () => {
        const metadata: Record<string, string | string[]> = {};
        addReceiptToMetadata(metadata, 'eyJ...');
        expect(metadata[GrpcMetadataKeys.RECEIPT]).toBe('eyJ...');
        expect(metadata[GrpcMetadataKeys.RECEIPT_TYPE]).toBe('peac-receipt/0.1');
      });
    });
  });

  describe('verification results', () => {
    describe('createSuccessResult', () => {
      it('should create success without receipt ID', () => {
        const result = createSuccessResult();
        expect(result.ok).toBe(true);
        expect(result.status).toBe(GrpcStatus.OK);
        expect(result.error).toBeUndefined();
        expect(result.receiptId).toBeUndefined();
      });

      it('should create success with receipt ID', () => {
        const result = createSuccessResult('rid_12345');
        expect(result.ok).toBe(true);
        expect(result.status).toBe(GrpcStatus.OK);
        expect(result.receiptId).toBe('rid_12345');
      });
    });

    describe('createFailureResult', () => {
      it('should create failure result', () => {
        const error = createGrpcError('E_RECEIPT_MISSING', 'No receipt');
        const result = createFailureResult(error);
        expect(result.ok).toBe(false);
        expect(result.status).toBe(GrpcStatus.FAILED_PRECONDITION);
        expect(result.error).toBe(error);
      });
    });
  });

  describe('getStatusName', () => {
    it('should return correct names', () => {
      expect(getStatusName(GrpcStatus.OK)).toBe('OK');
      expect(getStatusName(GrpcStatus.UNAUTHENTICATED)).toBe('UNAUTHENTICATED');
      expect(getStatusName(GrpcStatus.FAILED_PRECONDITION)).toBe('FAILED_PRECONDITION');
      expect(getStatusName(GrpcStatus.PERMISSION_DENIED)).toBe('PERMISSION_DENIED');
      expect(getStatusName(GrpcStatus.ABORTED)).toBe('ABORTED');
      expect(getStatusName(GrpcStatus.INTERNAL)).toBe('INTERNAL');
    });

    it('should return UNKNOWN for invalid codes', () => {
      expect(getStatusName(99 as never)).toBe('UNKNOWN');
    });
  });

  describe('metadata keys', () => {
    it('should define standard keys', () => {
      expect(GrpcMetadataKeys.RECEIPT).toBe('peac-receipt');
      expect(GrpcMetadataKeys.RECEIPT_TYPE).toBe('peac-receipt-type');
      expect(GrpcMetadataKeys.TAP_SIGNATURE).toBe('peac-tap-signature');
      expect(GrpcMetadataKeys.TAP_SIGNATURE_INPUT).toBe('peac-tap-signature-input');
      expect(GrpcMetadataKeys.ERROR_CODE).toBe('peac-error-code');
      expect(GrpcMetadataKeys.REQUEST_ID).toBe('peac-request-id');
    });
  });
});
