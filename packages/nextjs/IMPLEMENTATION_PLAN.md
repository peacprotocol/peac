# @peac/nextjs v0.1 - Implementation Plan

**Package:** `@peac/nextjs`
**Layer:** 5 (Applications)
**Version:** 0.1.0
**Timeline:** 5 days
**Status:** PLANNING

## Overview

Minimal Next.js integration package providing route handler wrappers and helpers to serve PEAC policy files. Designed for Next.js App Router (Next.js 13+).

**Goals:**
- Zero-config route handler wrapper with PEAC receipt verification
- Helpers to serve `peac.txt`, `aipref.json`, `llms.txt`, `ai-policy.md`
- TypeScript-first with excellent DX
- No heavy opinions - developers retain full control

**Non-Goals:**
- Pages Router support (App Router only)
- Middleware (use `@peac/middleware-nextjs` for Edge Runtime)
- Client-side components
- Full-stack auth flows

## Package Structure

```
packages/nextjs/
├── src/
│   ├── index.ts                    # Main exports
│   ├── withPeac.ts                 # Route handler wrapper
│   ├── helpers/
│   │   ├── servePeacTxt.ts         # Serve peac.txt
│   │   ├── serveAiprefJson.ts      # Serve aipref.json
│   │   ├── serveLlmsTxt.ts         # Serve llms.txt
│   │   └── serveAiPolicyMd.ts      # Serve ai-policy.md
│   ├── types.ts                    # TypeScript types
│   └── errors.ts                   # Error handling
├── tests/
│   ├── withPeac.test.ts            # Route wrapper tests
│   ├── helpers.test.ts             # Helper function tests
│   └── integration.test.ts         # End-to-end tests
├── examples/
│   ├── basic-api/                  # Basic API route example
│   ├── policy-files/               # Serving policy files
│   └── custom-error-handling/      # Custom error handling
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## API Design

### 1. `withPeac()` - Route Handler Wrapper

```typescript
import { withPeac } from '@peac/nextjs';
import type { NextRequest } from 'next/server';

export const POST = withPeac(
  async (req: NextRequest, context: { claims: ReceiptClaims }) => {
    // Handler has verified receipt in context.claims
    const { payment, auth, policy } = context.claims;

    // Your business logic here
    return Response.json({ status: 'ok', payment });
  },
  {
    issuer: 'https://publisher.example',
    audience: 'https://agent.example',
    jwksUri: 'https://publisher.example/.well-known/jwks.json',
    mode: 'tap_only', // 'tap_only' | 'receipt_or_tap' | 'unsafe_no_tap'
    requireReplay: false, // Optional: enforce replay protection
    onError: (error) => {
      // Custom error handling
      console.error('PEAC verification failed:', error);
      return Response.json({ error: error.message }, { status: error.status });
    },
  }
);
```

**Behavior:**
1. Extract receipt from `PEAC-Receipt` header or `Payment-Signature` header (TAP mode)
2. Call `verify()` with provided options
3. On success: inject `claims` into handler context
4. On failure: return 401/402 error response (customizable via `onError`)
5. Pass through to handler with verified claims

### 2. Policy File Helpers

```typescript
// app/peac.txt/route.ts
import { servePeacTxt } from '@peac/nextjs';
import type { PolicyDocument } from '@peac/policy-kit';

const policy: PolicyDocument = {
  version: 'peac-policy/0.1',
  rules: [
    { subject: { type: 'agent' }, purpose: 'crawl', effect: 'allow' },
    { subject: { type: 'agent' }, purpose: 'train', effect: 'deny' },
  ],
};

export const GET = servePeacTxt(policy, {
  peacVersion: '0.9.28',
  attribution: 'required',
  rateLimit: '100/hour',
  contact: 'admin@example.com',
});
```

```typescript
// app/aipref.json/route.ts
import { serveAiprefJson } from '@peac/nextjs';

export const GET = serveAiprefJson({
  version: '1.0',
  preferences: {
    training: 'deny',
    inference: 'allow',
  },
});
```

```typescript
// app/llms.txt/route.ts
import { serveLlmsTxt } from '@peac/nextjs';

export const GET = serveLlmsTxt({
  allowed: ['crawl', 'index'],
  denied: ['train'],
  contact: 'ai@example.com',
});
```

```typescript
// app/ai-policy.md/route.ts
import { serveAiPolicyMd } from '@peac/nextjs';
import type { PolicyDocument } from '@peac/policy-kit';

const policy: PolicyDocument = { /* ... */ };

export const GET = serveAiPolicyMd(policy, {
  includeAttribution: true,
  includeExamples: false,
});
```

## Implementation Steps

### Day 1: Core Route Wrapper

**File:** `src/withPeac.ts`

```typescript
import type { NextRequest } from 'next/server';
import { verify, type VerifyOptions, type VerifyResult } from '@peac/protocol';
import { PEACError } from '@peac/kernel';

export interface WithPeacOptions extends Omit<VerifyOptions, 'receipt'> {
  onError?: (error: PEACError) => Response;
}

export interface PeacContext {
  claims: ReceiptClaims;
}

type PeacHandler = (req: NextRequest, context: PeacContext) => Promise<Response> | Response;

export function withPeac(
  handler: PeacHandler,
  options: WithPeacOptions
): (req: NextRequest) => Promise<Response> {
  return async (req: NextRequest): Promise<Response> => {
    try {
      // 1. Extract receipt from headers
      const receipt = extractReceipt(req);
      if (!receipt) {
        return new Response(
          JSON.stringify({
            type: 'https://peacprotocol.org/errors#E_TAP_MISSING',
            title: 'Receipt Required',
            status: 402,
            detail: 'PEAC receipt or TAP signature required',
          }),
          {
            status: 402,
            headers: {
              'Content-Type': 'application/problem+json',
              'WWW-Authenticate': 'PEAC realm="peac", error="missing_receipt"',
            },
          }
        );
      }

      // 2. Verify receipt
      const result: VerifyResult = await verify(receipt, {
        ...options,
        receipt, // Add receipt to options
      });

      // 3. Pass verified claims to handler
      return await handler(req, { claims: result.claims });
    } catch (error) {
      // 4. Handle verification errors
      if (options.onError) {
        return options.onError(error as PEACError);
      }

      // Default error response
      const peacError = error as PEACError;
      return new Response(
        JSON.stringify({
          type: `https://peacprotocol.org/errors#${peacError.code}`,
          title: peacError.message,
          status: peacError.status || 401,
          detail: peacError.detail || peacError.message,
        }),
        {
          status: peacError.status || 401,
          headers: {
            'Content-Type': 'application/problem+json',
            'WWW-Authenticate': buildWwwAuthenticate(peacError),
          },
        }
      );
    }
  };
}

function extractReceipt(req: NextRequest): string | null {
  // Check PEAC-Receipt header first
  const peacReceipt = req.headers.get('PEAC-Receipt');
  if (peacReceipt) return peacReceipt;

  // Check Payment-Signature header (TAP mode)
  const tapSig = req.headers.get('Payment-Signature');
  if (tapSig) return tapSig;

  return null;
}

function buildWwwAuthenticate(error: PEACError): string {
  return `PEAC realm="peac", error="${error.code.toLowerCase().replace(/^e_/, '')}"`;
}
```

**Acceptance Criteria:**
- ✅ Extract receipt from `PEAC-Receipt` or `Payment-Signature` headers
- ✅ Call `verify()` with provided options
- ✅ Return verified claims to handler
- ✅ Return RFC 9457 problem+json on errors
- ✅ Support custom error handlers via `onError` option
- ✅ Add `WWW-Authenticate` header on 401/402 errors

### Day 2: Policy File Helpers

**Files:** `src/helpers/servePeacTxt.ts`, `src/helpers/serveAiprefJson.ts`, `src/helpers/serveLlmsTxt.ts`, `src/helpers/serveAiPolicyMd.ts`

```typescript
// src/helpers/servePeacTxt.ts
import { compilePeacTxt, type PolicyDocument } from '@peac/policy-kit';

export interface ServePeacTxtOptions {
  peacVersion?: string;
  attribution?: 'required' | 'recommended' | 'optional';
  rateLimit?: string;
  negotiate?: boolean;
  contact?: string;
}

export function servePeacTxt(
  policy: PolicyDocument,
  options: ServePeacTxtOptions = {}
): () => Response {
  return () => {
    const peacTxt = compilePeacTxt(policy, {
      peacVersion: options.peacVersion || '0.9.28',
      attribution: options.attribution || 'recommended',
      rateLimit: options.rateLimit,
      negotiate: options.negotiate || false,
      contact: options.contact,
    });

    return new Response(peacTxt, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  };
}
```

```typescript
// src/helpers/serveAiprefJson.ts
export interface AiprefPreferences {
  version: string;
  preferences: {
    training?: 'allow' | 'deny';
    inference?: 'allow' | 'deny';
    indexing?: 'allow' | 'deny';
  };
}

export function serveAiprefJson(prefs: AiprefPreferences): () => Response {
  return () => {
    return Response.json(prefs, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    });
  };
}
```

```typescript
// src/helpers/serveLlmsTxt.ts
export interface LlmsTxtOptions {
  allowed: string[];
  denied: string[];
  contact?: string;
}

export function serveLlmsTxt(options: LlmsTxtOptions): () => Response {
  return () => {
    const lines = [
      '# LLM Policy',
      '',
      '## Allowed',
      ...options.allowed.map((p) => `- ${p}`),
      '',
      '## Denied',
      ...options.denied.map((p) => `- ${p}`),
    ];

    if (options.contact) {
      lines.push('', `## Contact`, options.contact);
    }

    return new Response(lines.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  };
}
```

```typescript
// src/helpers/serveAiPolicyMd.ts
import { renderPolicyMarkdown, type PolicyDocument } from '@peac/policy-kit';

export interface ServeAiPolicyMdOptions {
  includeAttribution?: boolean;
  includeExamples?: boolean;
}

export function serveAiPolicyMd(
  policy: PolicyDocument,
  options: ServeAiPolicyMdOptions = {}
): () => Response {
  return () => {
    const markdown = renderPolicyMarkdown(policy, {
      includeAttribution: options.includeAttribution ?? true,
      includeExamples: options.includeExamples ?? false,
    });

    return new Response(markdown, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  };
}
```

**Acceptance Criteria:**
- ✅ `servePeacTxt()` compiles policy to peac.txt format
- ✅ `serveAiprefJson()` returns AIPREF JSON with proper cache headers
- ✅ `serveLlmsTxt()` generates llms.txt from allowed/denied lists
- ✅ `serveAiPolicyMd()` renders policy as markdown
- ✅ All helpers return proper content-type headers
- ✅ All helpers add cache-control headers (public, max-age=3600)

### Day 3: TypeScript Types and Error Handling

**File:** `src/types.ts`

```typescript
import type { ReceiptClaims } from '@peac/schema';
import type { PEACError } from '@peac/kernel';
import type { NextRequest } from 'next/server';

export interface PeacContext {
  claims: ReceiptClaims;
}

export type PeacHandler = (
  req: NextRequest,
  context: PeacContext
) => Promise<Response> | Response;

export interface WithPeacOptions {
  issuer: string;
  audience: string;
  jwksUri: string;
  mode?: 'tap_only' | 'receipt_or_tap' | 'unsafe_no_tap';
  requireReplay?: boolean;
  onError?: (error: PEACError) => Response;
}

export interface ServePeacTxtOptions {
  peacVersion?: string;
  attribution?: 'required' | 'recommended' | 'optional';
  rateLimit?: string;
  negotiate?: boolean;
  contact?: string;
}

export interface AiprefPreferences {
  version: string;
  preferences: {
    training?: 'allow' | 'deny';
    inference?: 'allow' | 'deny';
    indexing?: 'allow' | 'deny';
  };
}

export interface LlmsTxtOptions {
  allowed: string[];
  denied: string[];
  contact?: string;
}

export interface ServeAiPolicyMdOptions {
  includeAttribution?: boolean;
  includeExamples?: boolean;
}
```

**File:** `src/errors.ts`

```typescript
import { PEACError } from '@peac/kernel';

export function createProblemResponse(error: PEACError): Response {
  return new Response(
    JSON.stringify({
      type: `https://peacprotocol.org/errors#${error.code}`,
      title: error.message,
      status: error.status || 500,
      detail: error.detail || error.message,
    }),
    {
      status: error.status || 500,
      headers: {
        'Content-Type': 'application/problem+json',
        'WWW-Authenticate': buildWwwAuthenticate(error),
      },
    }
  );
}

function buildWwwAuthenticate(error: PEACError): string {
  const errorCode = error.code.toLowerCase().replace(/^e_/, '');
  return `PEAC realm="peac", error="${errorCode}"`;
}
```

**Acceptance Criteria:**
- ✅ All TypeScript types exported from `src/types.ts`
- ✅ `createProblemResponse()` generates RFC 9457 responses
- ✅ `buildWwwAuthenticate()` formats error code for WWW-Authenticate header
- ✅ Full type safety for all public APIs

### Day 4: Testing

**File:** `tests/withPeac.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { withPeac } from '../src/withPeac';
import type { NextRequest } from 'next/server';

describe('withPeac', () => {
  it('should verify receipt and pass claims to handler', async () => {
    const handler = vi.fn(async (req, context) => {
      return Response.json({ payment: context.claims.payment });
    });

    const wrappedHandler = withPeac(handler, {
      issuer: 'https://publisher.example',
      audience: 'https://agent.example',
      jwksUri: 'https://publisher.example/.well-known/jwks.json',
    });

    const req = new Request('http://localhost:3000/api/test', {
      method: 'POST',
      headers: {
        'PEAC-Receipt': 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXUyJ9...',
      },
    }) as NextRequest;

    const response = await wrappedHandler(req);
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(req, expect.objectContaining({ claims: expect.any(Object) }));
  });

  it('should return 402 when receipt is missing', async () => {
    const handler = vi.fn();
    const wrappedHandler = withPeac(handler, {
      issuer: 'https://publisher.example',
      audience: 'https://agent.example',
      jwksUri: 'https://publisher.example/.well-known/jwks.json',
    });

    const req = new Request('http://localhost:3000/api/test', {
      method: 'POST',
    }) as NextRequest;

    const response = await wrappedHandler(req);
    expect(response.status).toBe(402);
    expect(response.headers.get('WWW-Authenticate')).toContain('PEAC realm="peac"');
  });

  it('should call custom error handler on verification failure', async () => {
    const onError = vi.fn(() => Response.json({ custom: 'error' }, { status: 403 }));
    const handler = vi.fn();
    const wrappedHandler = withPeac(handler, {
      issuer: 'https://publisher.example',
      audience: 'https://agent.example',
      jwksUri: 'https://publisher.example/.well-known/jwks.json',
      onError,
    });

    const req = new Request('http://localhost:3000/api/test', {
      method: 'POST',
      headers: {
        'PEAC-Receipt': 'invalid-receipt',
      },
    }) as NextRequest;

    const response = await wrappedHandler(req);
    expect(onError).toHaveBeenCalled();
    expect(response.status).toBe(403);
  });
});
```

**File:** `tests/helpers.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { servePeacTxt, serveAiprefJson, serveLlmsTxt, serveAiPolicyMd } from '../src/index';

describe('Policy File Helpers', () => {
  it('servePeacTxt should return peac.txt content', async () => {
    const policy = {
      version: 'peac-policy/0.1' as const,
      rules: [
        { subject: { type: 'agent' as const }, purpose: 'crawl' as const, effect: 'allow' as const },
      ],
    };

    const handler = servePeacTxt(policy);
    const response = handler();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/plain');
    expect(response.headers.get('Cache-Control')).toContain('public');

    const text = await response.text();
    expect(text).toContain('peac-version:');
  });

  it('serveAiprefJson should return AIPREF JSON', async () => {
    const prefs = {
      version: '1.0',
      preferences: {
        training: 'deny' as const,
        inference: 'allow' as const,
      },
    };

    const handler = serveAiprefJson(prefs);
    const response = handler();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');

    const json = await response.json();
    expect(json.preferences.training).toBe('deny');
  });

  it('serveLlmsTxt should return llms.txt content', async () => {
    const handler = serveLlmsTxt({
      allowed: ['crawl', 'index'],
      denied: ['train'],
      contact: 'admin@example.com',
    });

    const response = handler();
    expect(response.status).toBe(200);

    const text = await response.text();
    expect(text).toContain('## Allowed');
    expect(text).toContain('- crawl');
    expect(text).toContain('## Contact');
  });

  it('serveAiPolicyMd should return markdown policy', async () => {
    const policy = {
      version: 'peac-policy/0.1' as const,
      rules: [
        { subject: { type: 'agent' as const }, purpose: 'train' as const, effect: 'deny' as const },
      ],
    };

    const handler = serveAiPolicyMd(policy, { includeAttribution: true });
    const response = handler();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/markdown');

    const text = await response.text();
    expect(text).toContain('#'); // Markdown heading
  });
});
```

**Acceptance Criteria:**
- ✅ 40+ tests covering all public APIs
- ✅ Receipt verification success/failure paths
- ✅ Missing receipt (402 response)
- ✅ Custom error handlers
- ✅ All policy file helpers
- ✅ Content-Type and Cache-Control headers
- ✅ Integration tests with Next.js Request/Response

### Day 5: Documentation and Examples

**File:** `README.md`

```markdown
# @peac/nextjs

Next.js integration for PEAC Protocol - route handler wrappers and policy file helpers.

## Installation

```bash
pnpm add @peac/nextjs @peac/protocol @peac/policy-kit
```

## Quick Start

### 1. Protect API Route with Receipt Verification

```typescript
// app/api/inference/route.ts
import { withPeac } from '@peac/nextjs';
import type { NextRequest } from 'next/server';

export const POST = withPeac(
  async (req: NextRequest, context) => {
    // Handler receives verified claims
    const { payment, auth, policy } = context.claims;

    // Your business logic
    return Response.json({
      status: 'ok',
      payment: payment.amount,
    });
  },
  {
    issuer: 'https://publisher.example',
    audience: 'https://agent.example',
    jwksUri: 'https://publisher.example/.well-known/jwks.json',
    mode: 'tap_only',
  }
);
```

### 2. Serve Policy Files

```typescript
// app/peac.txt/route.ts
import { servePeacTxt } from '@peac/nextjs';

const policy = {
  version: 'peac-policy/0.1',
  rules: [
    { subject: { type: 'agent' }, purpose: 'crawl', effect: 'allow' },
    { subject: { type: 'agent' }, purpose: 'train', effect: 'deny' },
  ],
};

export const GET = servePeacTxt(policy, {
  peacVersion: '0.9.28',
  attribution: 'required',
  contact: 'admin@example.com',
});
```

```typescript
// app/aipref.json/route.ts
import { serveAiprefJson } from '@peac/nextjs';

export const GET = serveAiprefJson({
  version: '1.0',
  preferences: {
    training: 'deny',
    inference: 'allow',
  },
});
```

## API Reference

### `withPeac(handler, options)`

Wraps a Next.js route handler with PEAC receipt verification.

**Parameters:**
- `handler: PeacHandler` - Your route handler function
- `options: WithPeacOptions` - Verification options

**Returns:** Next.js route handler with receipt verification

**Options:**
- `issuer: string` - Expected receipt issuer URL
- `audience: string` - Expected receipt audience URL
- `jwksUri: string` - JWKS endpoint for signature verification
- `mode?: 'tap_only' | 'receipt_or_tap' | 'unsafe_no_tap'` - Verification mode (default: `tap_only`)
- `requireReplay?: boolean` - Enforce replay protection (default: `false`)
- `onError?: (error) => Response` - Custom error handler

### `servePeacTxt(policy, options)`

Generates peac.txt route handler from PolicyDocument.

**Parameters:**
- `policy: PolicyDocument` - PEAC policy document
- `options?: ServePeacTxtOptions` - Compilation options

**Returns:** Next.js GET route handler

### `serveAiprefJson(prefs)`

Generates aipref.json route handler.

**Parameters:**
- `prefs: AiprefPreferences` - AIPREF preferences object

**Returns:** Next.js GET route handler

### `serveLlmsTxt(options)`

Generates llms.txt route handler.

**Parameters:**
- `options: LlmsTxtOptions` - Allowed/denied purposes and contact

**Returns:** Next.js GET route handler

### `serveAiPolicyMd(policy, options)`

Generates ai-policy.md route handler.

**Parameters:**
- `policy: PolicyDocument` - PEAC policy document
- `options?: ServeAiPolicyMdOptions` - Rendering options

**Returns:** Next.js GET route handler

## Examples

See `examples/` directory for complete examples:
- `examples/basic-api/` - Basic protected API route
- `examples/policy-files/` - Serving all policy file formats
- `examples/custom-error-handling/` - Custom error responses

## License

Apache-2.0

---

Built with PEAC Protocol by [Originary](https://originary.com)
```

**File:** `examples/basic-api/README.md`

```markdown
# Basic API Route Example

Minimal example of protecting a Next.js API route with PEAC receipt verification.

## Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Create `.env.local`:
   ```env
   PEAC_ISSUER=https://publisher.example
   PEAC_AUDIENCE=https://agent.example
   PEAC_JWKS_URI=https://publisher.example/.well-known/jwks.json
   ```

3. Run dev server:
   ```bash
   pnpm dev
   ```

## Test

```bash
curl -X POST http://localhost:3000/api/inference \
  -H "PEAC-Receipt: eyJhbGciOiJFZERTQSIsInR5cCI6IkpXUyJ9..." \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello world"}'
```

Expected response (200 OK):
```json
{
  "status": "ok",
  "payment": {
    "amount": "100",
    "currency": "USD"
  }
}
```

Without receipt (402 Payment Required):
```json
{
  "type": "https://peacprotocol.org/errors#E_TAP_MISSING",
  "title": "Receipt Required",
  "status": 402,
  "detail": "PEAC receipt or TAP signature required"
}
```
```

**Acceptance Criteria:**
- ✅ Comprehensive README with quick start, API reference, examples
- ✅ 3 complete examples in `examples/` directory
- ✅ TypeScript types documented
- ✅ Error handling patterns documented
- ✅ Test examples with curl commands

## Dependencies

```json
{
  "name": "@peac/nextjs",
  "version": "0.1.0",
  "description": "Next.js integration for PEAC Protocol",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src tests"
  },
  "peerDependencies": {
    "next": ">=13.0.0"
  },
  "dependencies": {
    "@peac/protocol": "workspace:*",
    "@peac/policy-kit": "workspace:*",
    "@peac/kernel": "workspace:*",
    "@peac/schema": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "next": "^14.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.2.0",
    "tsup": "^8.0.0",
    "eslint": "^8.56.0"
  },
  "keywords": [
    "peac",
    "nextjs",
    "receipts",
    "policy",
    "verification"
  ],
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/peacprotocol/peac.git",
    "directory": "packages/nextjs"
  }
}
```

## Testing Strategy

### Unit Tests (30 tests)
- `withPeac()` wrapper (10 tests)
  - Successful verification with claims injection
  - Missing receipt (402 response)
  - Invalid receipt (401 response)
  - TAP mode header extraction
  - Custom error handler
  - Mode variations (tap_only, receipt_or_tap)
  - WWW-Authenticate header formatting
  - Problem+json response structure
  - JWKS fetch errors
  - Replay protection enforcement

- Policy file helpers (20 tests)
  - `servePeacTxt()` compilation and headers
  - `serveAiprefJson()` JSON format and cache headers
  - `serveLlmsTxt()` text formatting
  - `serveAiPolicyMd()` markdown rendering
  - Optional parameters for each helper
  - Content-Type headers for each format
  - Cache-Control headers

### Integration Tests (10 tests)
- End-to-end Next.js route testing
- Request/Response object handling
- Header extraction from NextRequest
- Error response formatting
- Context injection to handlers

## Error Codes

All error responses follow RFC 9457 (Problem Details for HTTP APIs):

| Status | Code | Description |
|--------|------|-------------|
| 402 | E_TAP_MISSING | PEAC receipt or TAP signature required |
| 401 | E_TAP_SIGNATURE_INVALID | Signature verification failed |
| 401 | E_TAP_TIME_INVALID | Receipt outside time window |
| 401 | E_TAP_KEY_NOT_FOUND | Key ID not in JWKS |
| 403 | E_TAP_ISSUER_NOT_ALLOWED | Issuer not in allowlist |
| 409 | E_TAP_REPLAY_DETECTED | Nonce already used |

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Handler overhead | < 2ms | Time added by withPeac() wrapper |
| Policy file generation | < 5ms | servePeacTxt() compilation |
| Memory footprint | < 100KB | Per request |

## Security Considerations

1. **Receipt Validation**: Always validate receipt issuer and audience
2. **Replay Protection**: Enable `requireReplay: true` for high-value operations
3. **Error Handling**: Never expose sensitive data in error messages
4. **JWKS Caching**: Cache JWKS responses to prevent DoS via repeated fetches
5. **Mode Selection**: Use `tap_only` in production, `unsafe_no_tap` only for dev/testing

## Timeline

- **Day 1**: Core route wrapper (`withPeac`) - 8 hours
- **Day 2**: Policy file helpers (4 functions) - 8 hours
- **Day 3**: TypeScript types + error handling - 6 hours
- **Day 4**: Testing (40 tests) - 10 hours
- **Day 5**: Documentation + examples - 8 hours

**Total**: 5 days (40 hours)

## Acceptance Criteria

### P0 - MUST SHIP
- ✅ `withPeac()` route handler wrapper with receipt verification
- ✅ Extract receipt from `PEAC-Receipt` or `Payment-Signature` headers
- ✅ Inject verified claims into handler context
- ✅ Return RFC 9457 problem+json on errors
- ✅ Custom error handler support
- ✅ All 4 policy file helpers (peac.txt, aipref.json, llms.txt, ai-policy.md)
- ✅ 40+ tests with 100% coverage
- ✅ TypeScript types exported
- ✅ README with API reference and examples

### P1 - SHOULD SHIP
- ⚠️ 3 complete examples in `examples/` directory
- ⚠️ Replay protection integration
- ⚠️ JWKS caching guidance

### P2 - NICE TO HAVE
- ⚠️ Client-side helper for sending receipts
- ⚠️ Middleware integration guidance

## Notes

- **App Router Only**: Pages Router not supported (use middleware for global protection)
- **Edge Runtime**: For edge middleware, use `@peac/middleware-nextjs` instead
- **No Opinions**: Minimal abstraction, developers retain full control
- **TypeScript First**: Full type safety out of the box

---

**Status:** PLANNING
**Owner:** @peac/nextjs team
**Estimated Completion:** 5 days after start
