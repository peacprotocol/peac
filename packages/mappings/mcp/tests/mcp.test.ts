/**
 * Tests for MCP (Model Context Protocol) integration
 */

import { describe, it, expect } from 'vitest';
import {
  attachReceipt,
  extractReceipt,
  hasReceipt,
  createPaidToolResponse,
  type MCPToolResponse,
} from '../src/index';

describe('MCP integration', () => {
  describe('attachReceipt', () => {
    it('should attach PEAC receipt to MCP tool response', () => {
      const toolResponse: MCPToolResponse = {
        tool: 'search_api',
        result: {
          query: 'artificial intelligence',
          results: [{ title: 'AI Overview', url: 'https://example.com/ai' }],
        },
        metadata: {
          execution_time_ms: 150,
        },
      };

      const receiptJWS = 'eyJhbGciOiJFZERTQSIsInR5cCI6InBlYWMucmVjZWlwdC8wLjkifQ.eyJpc3MiOi...';

      const withReceipt = attachReceipt(toolResponse, receiptJWS);

      expect(withReceipt.tool).toBe('search_api');
      expect(withReceipt.result).toEqual(toolResponse.result);
      expect(withReceipt.peac_receipt).toBe(receiptJWS);
      expect(withReceipt.metadata).toEqual({ execution_time_ms: 150 });
    });

    it('should preserve all fields from original response', () => {
      const toolResponse: MCPToolResponse = {
        tool: 'compute_api',
        result: { output: 42 },
        custom_field: 'custom_value',
        another_field: 123,
      };

      const receiptJWS = 'eyJ...';

      const withReceipt = attachReceipt(toolResponse, receiptJWS);

      expect(withReceipt.custom_field).toBe('custom_value');
      expect(withReceipt.another_field).toBe(123);
      expect(withReceipt.peac_receipt).toBe(receiptJWS);
    });
  });

  describe('extractReceipt', () => {
    it('should extract PEAC receipt from MCP tool response', () => {
      const toolResponse = {
        tool: 'search_api',
        result: { data: 'result' },
        peac_receipt: 'eyJhbGc...',
      };

      const extracted = extractReceipt(toolResponse);

      expect(extracted).toBe('eyJhbGc...');
    });

    it('should return null if no receipt present', () => {
      const toolResponse = {
        tool: 'search_api',
        result: { data: 'result' },
      };

      const extracted = extractReceipt(toolResponse);

      expect(extracted).toBeNull();
    });

    it('should return null if receipt is empty string', () => {
      const toolResponse = {
        tool: 'search_api',
        result: { data: 'result' },
        peac_receipt: '',
      };

      const extracted = extractReceipt(toolResponse);

      expect(extracted).toBeNull();
    });
  });

  describe('hasReceipt', () => {
    it('should return true if receipt is present', () => {
      const toolResponse = {
        tool: 'search_api',
        result: { data: 'result' },
        peac_receipt: 'eyJhbGc...',
      };

      expect(hasReceipt(toolResponse)).toBe(true);
    });

    it('should return false if no receipt present', () => {
      const toolResponse = {
        tool: 'search_api',
        result: { data: 'result' },
      };

      expect(hasReceipt(toolResponse)).toBe(false);
    });

    it('should return false if receipt is empty string', () => {
      const toolResponse = {
        tool: 'search_api',
        result: { data: 'result' },
        peac_receipt: '',
      };

      expect(hasReceipt(toolResponse)).toBe(false);
    });
  });

  describe('createPaidToolResponse', () => {
    it('should create MCP tool response with PEAC receipt', () => {
      const response = createPaidToolResponse(
        'premium_search',
        {
          query: 'quantum computing',
          results: [{ title: 'Quantum Overview', url: 'https://example.com/quantum' }],
        },
        'eyJhbGc...',
        {
          cost_usd: 0.05,
          execution_time_ms: 200,
        }
      );

      expect(response.tool).toBe('premium_search');
      expect(response.result).toEqual({
        query: 'quantum computing',
        results: [{ title: 'Quantum Overview', url: 'https://example.com/quantum' }],
      });
      expect(response.peac_receipt).toBe('eyJhbGc...');
      expect(response.metadata).toEqual({
        cost_usd: 0.05,
        execution_time_ms: 200,
      });
    });

    it('should create response without metadata if not provided', () => {
      const response = createPaidToolResponse('basic_tool', { output: 'success' }, 'eyJhbGc...');

      expect(response.tool).toBe('basic_tool');
      expect(response.result).toEqual({ output: 'success' });
      expect(response.peac_receipt).toBe('eyJhbGc...');
      expect(response.metadata).toBeUndefined();
    });
  });

  describe('Round-trip: attach and extract', () => {
    it('should correctly round-trip receipt attachment and extraction', () => {
      const originalResponse: MCPToolResponse = {
        tool: 'data_api',
        result: { data: [1, 2, 3, 4, 5] },
        metadata: { rows: 5 },
      };

      const receiptJWS =
        'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSJ9.signature';

      // Attach
      const withReceipt = attachReceipt(originalResponse, receiptJWS);

      // Verify presence
      expect(hasReceipt(withReceipt)).toBe(true);

      // Extract
      const extracted = extractReceipt(withReceipt);

      // Verify extracted matches original
      expect(extracted).toBe(receiptJWS);
    });
  });

  describe('Golden Vector: MCP Tool Response with PEAC Receipt', () => {
    it('should produce a complete MCP tool response with receipt', () => {
      const toolResponse = createPaidToolResponse(
        'ai_completion',
        {
          prompt: 'Explain quantum entanglement',
          completion: 'Quantum entanglement is a phenomenon where...',
          tokens_used: 150,
        },
        'eyJhbGciOiJFZERTQSIsInR5cCI6InBlYWMucmVjZWlwdC8wLjkiLCJraWQiOiIyMDI1LTAxLTI2VDEyOjAwOjAwWiJ9.eyJpc3MiOiJodHRwczovL21lcmNoYW50LmV4YW1wbGUuY29tIiwiYXVkIjoiaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20iLCJpYXQiOjE3Mzc4OTI4MDAsInJpZCI6IjAxOTNjNGQwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDAwMCIsImFtdCI6MTUwLCJjdXIiOiJVU0QiLCJwYXltZW50Ijp7InNjaGVtZSI6InN0cmlwZSIsInJlZmVyZW5jZSI6ImNzX3Rlc3RfZ29sZGVuIiwiYW1vdW50IjoxNTAsImN1cnJlbmN5IjoiVVNEIn19.signature',
        {
          cost_usd: 0.015,
          model: 'gpt-4',
          execution_time_ms: 1200,
        }
      );

      // Verify structure
      expect(toolResponse.tool).toBe('ai_completion');
      expect(toolResponse.peac_receipt).toBeDefined();
      expect(toolResponse.peac_receipt!.split('.')).toHaveLength(3);

      // Verify receipt is extractable
      const extracted = extractReceipt(toolResponse);
      expect(extracted).toBeTruthy();

      // Log golden vector
      console.log('\n=== GOLDEN VECTOR: MCP Tool Response with PEAC Receipt ===');
      console.log(JSON.stringify(toolResponse, null, 2));
      console.log('==========================================================\n');
    });
  });
});
