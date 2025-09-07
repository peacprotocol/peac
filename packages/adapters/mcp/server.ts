#!/usr/bin/env node
/**
 * PEAC MCP (Model Context Protocol) stdio server v0.9.12.1
 * Implements JSON-RPC 2.0 over stdio for Claude and compatible agents
 */

import * as readline from 'node:readline';
import { signReceipt, signPurgeReceipt } from '@peac/core/sign.js';
import { verifyReceipt, verifyBulk } from '@peac/core/verify.js';
import { Receipt, PurgeReceipt, SignOpts, KeySet } from '@peac/core/types.js';
import { VERSION_CONFIG, FEATURES } from '@peac/core/config.js';

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
};

type JsonRpcNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: any;
};

class PeacMcpServer {
  private rl: readline.Interface;
  private keys: KeySet = {};
  private privateKey: SignOpts['privateKey'] | null = null;
  private currentKid: string = '';

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    this.setupEventHandlers();
    this.advertiseCapabilities();
  }

  private setupEventHandlers(): void {
    this.rl.on('line', async (line: string) => {
      try {
        const request: JsonRpcRequest = JSON.parse(line);
        await this.handleRequest(request);
      } catch (error) {
        this.sendError(null, -32700, 'Parse error', { error: error.message });
      }
    });

    this.rl.on('close', () => {
      process.exit(0);
    });

    process.on('SIGINT', () => {
      this.rl.close();
    });
  }

  private advertiseCapabilities(): void {
    // Send initial capabilities advertisement
    this.sendNotification('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: 'peac-receipts',
        version: VERSION_CONFIG.CURRENT_PROTOCOL
      }
    });

    // Advertise available tools
    this.sendNotification('tools/list', {
      tools: [
        {
          name: 'receipt_issue',
          description: 'Issue a PEAC receipt (receipt@1.1)',
          inputSchema: {
            type: 'object',
            properties: {
              subject: { type: 'string', format: 'uri' },
              purpose: { type: 'string', enum: ['train-ai', 'train-genai', 'search', 'evaluation', 'other'] },
              crawler_type: { type: 'string', enum: ['bot', 'agent', 'hybrid', 'browser', 'migrating', 'test', 'unknown'] },
              options: { type: 'object' }
            },
            required: ['subject', 'purpose']
          }
        },
        {
          name: 'receipt_verify',
          description: 'Verify a PEAC receipt',
          inputSchema: {
            type: 'object',
            properties: {
              jws: { type: 'string' },
              keys: { type: 'object' }
            },
            required: ['jws']
          }
        },
        {
          name: 'receipts_bulk_verify',
          description: 'Bulk verify NDJSON receipts',
          inputSchema: {
            type: 'object',
            properties: {
              ndjson: { type: 'string' },
              keys: { type: 'object' }
            },
            required: ['ndjson']
          }
        },
        {
          name: 'purge_issue',
          description: 'Issue a purge receipt (purge@1.0)',
          inputSchema: {
            type: 'object',
            properties: {
              subject: { type: 'string', format: 'uri' },
              corpus: { type: 'string' },
              erasure_basis: { type: 'string', enum: ['gdpr', 'ccpa', 'contractual', 'other'] }
            },
            required: ['subject', 'corpus']
          }
        }
      ]
    });
  }

  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    try {
      switch (request.method) {
        case 'initialize':
          this.sendResponse(request.id, { capabilities: { tools: {} } });
          break;

        case 'tools/call':
          await this.handleToolCall(request);
          break;

        case 'receipt_issue':
          await this.handleReceiptIssue(request);
          break;

        case 'receipt_verify':
          await this.handleReceiptVerify(request);
          break;

        case 'receipts_bulk_verify':
          await this.handleBulkVerify(request);
          break;

        case 'purge_issue':
          await this.handlePurgeIssue(request);
          break;

        default:
          this.sendError(request.id, -32601, 'Method not found');
      }
    } catch (error) {
      this.sendError(request.id, -32000, 'Internal error', { error: error.message });
    }
  }

  private async handleToolCall(request: JsonRpcRequest): Promise<void> {
    const { name, arguments: args } = request.params || {};

    switch (name) {
      case 'receipt_issue':
        await this.handleReceiptIssue({ ...request, params: args });
        break;
      case 'receipt_verify':
        await this.handleReceiptVerify({ ...request, params: args });
        break;
      case 'receipts_bulk_verify':
        await this.handleBulkVerify({ ...request, params: args });
        break;
      case 'purge_issue':
        await this.handlePurgeIssue({ ...request, params: args });
        break;
      default:
        this.sendError(request.id, -32602, 'Invalid tool name');
    }
  }

  private async handleReceiptIssue(request: JsonRpcRequest): Promise<void> {
    const { subject, purpose, crawler_type, options } = request.params || {};

    if (!subject || !purpose) {
      this.sendError(request.id, -32602, 'Missing required parameters: subject, purpose');
      return;
    }

    if (!this.privateKey || !this.currentKid) {
      this.sendError(request.id, -32603, 'Server not configured with signing keys');
      return;
    }

    try {
      // Build receipt from parameters
      const receipt: Receipt = {
        version: '1.1',
        protocol_version: VERSION_CONFIG.CURRENT_PROTOCOL,
        wire_version: VERSION_CONFIG.REQUIRED_WIRE_RECEIPT,
        subject: {
          uri: subject,
          ...options?.subject
        },
        aipref: {
          status: options?.aipref?.status || 'not_found',
          ...options?.aipref
        },
        purpose,
        enforcement: {
          method: options?.enforcement?.method || 'none',
          ...options?.enforcement
        },
        crawler_type: crawler_type || 'agent', // Default for MCP context
        issued_at: new Date().toISOString(),
        kid: this.currentKid,
        signature_media_type: 'application/peac-receipt+jws',
        ...options?.additional
      };

      // Apply payment requirement invariant
      if (receipt.enforcement.method === 'http-402' && options?.payment) {
        receipt.payment = options.payment;
      }

      const signOpts: SignOpts = {
        kid: this.currentKid,
        privateKey: this.privateKey
      };

      const jws = await signReceipt(receipt, signOpts);

      this.sendResponse(request.id, {
        receipt,
        jws,
        content: [{
          type: 'text',
          text: `PEAC receipt issued for ${subject}`
        }]
      });

    } catch (error) {
      this.sendError(request.id, -32000, 'Receipt signing failed', { error: error.message });
    }
  }

  private async handleReceiptVerify(request: JsonRpcRequest): Promise<void> {
    const { jws, keys } = request.params || {};

    if (!jws) {
      this.sendError(request.id, -32602, 'Missing required parameter: jws');
      return;
    }

    const keyset = keys || this.keys;
    if (Object.keys(keyset).length === 0) {
      this.sendError(request.id, -32603, 'No public keys available for verification');
      return;
    }

    try {
      const result = await verifyReceipt(jws, keyset);

      this.sendResponse(request.id, {
        valid: true,
        receipt: result.receipt,
        header: result.hdr,
        content: [{
          type: 'text',
          text: `Receipt verified successfully. Subject: ${result.receipt.subject.uri}, Purpose: ${result.receipt.purpose}`
        }]
      });

    } catch (error) {
      this.sendResponse(request.id, {
        valid: false,
        error: error.message,
        content: [{
          type: 'text',
          text: `Receipt verification failed: ${error.message}`
        }]
      });
    }
  }

  private async handleBulkVerify(request: JsonRpcRequest): Promise<void> {
    const { ndjson, keys } = request.params || {};

    if (!ndjson || typeof ndjson !== 'string') {
      this.sendError(request.id, -32602, 'Missing or invalid parameter: ndjson');
      return;
    }

    const keyset = keys || this.keys;
    if (Object.keys(keyset).length === 0) {
      this.sendError(request.id, -32603, 'No public keys available for verification');
      return;
    }

    try {
      const lines = ndjson.trim().split('\n');
      const jwsArray = lines.map(line => {
        try {
          const obj = JSON.parse(line);
          return obj.jws || line; // Support both wrapped and raw JWS
        } catch {
          return line; // Assume raw JWS
        }
      });

      const results = await verifyBulk(jwsArray, keyset);
      const validCount = results.filter(r => r.valid).length;

      this.sendResponse(request.id, {
        total: results.length,
        valid: validCount,
        invalid: results.length - validCount,
        results,
        content: [{
          type: 'text',
          text: `Bulk verification complete: ${validCount}/${results.length} receipts valid`
        }]
      });

    } catch (error) {
      this.sendError(request.id, -32000, 'Bulk verification failed', { error: error.message });
    }
  }

  private async handlePurgeIssue(request: JsonRpcRequest): Promise<void> {
    const { subject, corpus, erasure_basis } = request.params || {};

    if (!subject || !corpus) {
      this.sendError(request.id, -32602, 'Missing required parameters: subject, corpus');
      return;
    }

    if (!this.privateKey || !this.currentKid) {
      this.sendError(request.id, -32603, 'Server not configured with signing keys');
      return;
    }

    try {
      const purgeReceipt: PurgeReceipt = {
        version: '1.0',
        protocol_version: VERSION_CONFIG.CURRENT_PROTOCOL,
        wire_version: VERSION_CONFIG.REQUIRED_WIRE_PURGE,
        action: 'purge',
        subject: {
          uri: subject
        },
        corpus: {
          id: corpus
        },
        erasure_basis,
        performed_at: new Date().toISOString(),
        kid: this.currentKid,
        signature_media_type: 'application/peac-purge+jws'
      };

      const signOpts: SignOpts = {
        kid: this.currentKid,
        privateKey: this.privateKey
      };

      const jws = await signPurgeReceipt(purgeReceipt, signOpts);

      this.sendResponse(request.id, {
        purge_receipt: purgeReceipt,
        jws,
        content: [{
          type: 'text',
          text: `Purge receipt issued for ${subject} from corpus ${corpus}`
        }]
      });

    } catch (error) {
      this.sendError(request.id, -32000, 'Purge receipt signing failed', { error: error.message });
    }
  }

  private sendResponse(id: any, result: any): void {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      result
    };
    this.write(response);
  }

  private sendError(id: any, code: number, message: string, data?: any): void {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message, data }
    };
    this.write(response);
  }

  private sendNotification(method: string, params?: any): void {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params
    };
    this.write(notification);
  }

  private write(obj: any): void {
    process.stdout.write(JSON.stringify(obj) + '\n');
  }

  // Configuration methods (called via environment or separate config)
  setKeys(keys: KeySet): void {
    this.keys = keys;
  }

  setSigningKey(kid: string, privateKey: SignOpts['privateKey']): void {
    this.currentKid = kid;
    this.privateKey = privateKey;
  }
}

// Auto-start if running as main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new PeacMcpServer();

  // Load configuration from environment
  if (process.env.PEAC_PRIVATE_KEY && process.env.PEAC_KID) {
    try {
      const privateKey = JSON.parse(process.env.PEAC_PRIVATE_KEY);
      server.setSigningKey(process.env.PEAC_KID, privateKey);
    } catch (error) {
      console.error('Failed to load private key from environment:', error);
      process.exit(1);
    }
  }

  if (process.env.PEAC_PUBLIC_KEYS) {
    try {
      const keys = JSON.parse(process.env.PEAC_PUBLIC_KEYS);
      server.setKeys(keys);
    } catch (error) {
      console.error('Failed to load public keys from environment:', error);
    }
  }

  console.error('PEAC MCP server started');
}

export { PeacMcpServer };