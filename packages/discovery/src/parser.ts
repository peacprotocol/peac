/**
 * @peac/disc/parser - peac.txt parser with ≤20 lines enforcement
 * ABNF-compliant discovery document parsing
 */

import type { PeacDiscovery, ParseResult, PublicKeyInfo, ValidationOptions } from './types.js';

const MAX_LINES = 20;
const FIELD_PATTERNS = {
  preferences: /^preferences:\s*(.+)$/,
  access_control: /^access_control:\s*(.+)$/,
  payments: /^payments:\s*\[([^\]]+)\]$/,
  provenance: /^provenance:\s*(.+)$/,
  receipts: /^receipts:\s*(required|optional)$/,
  verify: /^verify:\s*(.+)$/,
  public_keys: /^public_keys:\s*\[([^\]]+)\]$/,
};

export function parse(content: string, options: ValidationOptions = {}): ParseResult {
  const maxLines = options.maxLines ?? MAX_LINES;
  const errors: string[] = [];
  const data: PeacDiscovery = {};

  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  // Enforce line limit
  if (lines.length > maxLines) {
    return {
      valid: false,
      errors: [`Line limit exceeded: ${lines.length} > ${maxLines}`],
      lineCount: lines.length,
    };
  }

  // Parse each line
  for (const [index, line] of lines.entries()) {
    let matched = false;

    for (const [field, pattern] of Object.entries(FIELD_PATTERNS)) {
      const match = line.match(pattern);
      if (match) {
        matched = true;
        try {
          switch (field) {
            case 'preferences':
            case 'access_control':
            case 'provenance':
            case 'verify':
              data[field] = match[1].trim();
              break;
            case 'receipts':
              data.receipts = match[1] as 'required' | 'optional';
              break;
            case 'payments':
              data.payments = parseArray(match[1]);
              break;
            case 'public_keys':
              data.public_keys = parsePublicKeys(match[1]);
              break;
          }
        } catch (error) {
          errors.push(
            `Line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        break;
      }
    }

    if (!matched) {
      errors.push(`Line ${index + 1}: Invalid format: ${line}`);
    }
  }

  // Validate required fields
  if (!data.verify) {
    errors.push('Missing required field: verify');
  }

  return {
    valid: errors.length === 0,
    data: errors.length === 0 ? data : undefined,
    errors: errors.length > 0 ? errors : undefined,
    lineCount: lines.length,
  };
}

function parseArray(content: string): string[] {
  return content
    .split(',')
    .map((item) => item.trim().replace(/^["']|["']$/g, ''))
    .filter((item) => item.length > 0);
}

function parsePublicKeys(content: string): PublicKeyInfo[] {
  const keyStrings = parseArray(content);
  const keys: PublicKeyInfo[] = [];

  for (const keyString of keyStrings) {
    const keyMatch = keyString.match(/^([^:]+):([^:]+):(.+)$/);
    if (!keyMatch) {
      throw new Error(`Invalid public key format: ${keyString}`);
    }

    keys.push({
      kid: keyMatch[1],
      alg: keyMatch[2],
      key: keyMatch[3],
    });
  }

  return keys;
}

export function emit(data: PeacDiscovery): string {
  const lines: string[] = [];

  if (data.preferences) {
    lines.push(`preferences: ${data.preferences}`);
  }

  if (data.access_control) {
    lines.push(`access_control: ${data.access_control}`);
  }

  if (data.payments && data.payments.length > 0) {
    const paymentsStr = data.payments.map((p) => `"${p}"`).join(', ');
    lines.push(`payments: [${paymentsStr}]`);
  }

  if (data.provenance) {
    lines.push(`provenance: ${data.provenance}`);
  }

  if (data.receipts) {
    lines.push(`receipts: ${data.receipts}`);
  }

  if (data.verify) {
    lines.push(`verify: ${data.verify}`);
  }

  if (data.public_keys && data.public_keys.length > 0) {
    const keysStr = data.public_keys.map((k) => `"${k.kid}:${k.alg}:${k.key}"`).join(', ');
    lines.push(`public_keys: [${keysStr}]`);
  }

  // Enforce line limit during emission
  if (lines.length > MAX_LINES) {
    throw new Error(`Generated peac.txt exceeds ${MAX_LINES} lines: ${lines.length}`);
  }

  return lines.join('\n');
}

export function validate(content: string): boolean {
  const result = parse(content);
  return result.valid;
}
