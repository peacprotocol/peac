# PEAC Protocol API Reference

Version: 0.9.2

## Overview

The PEAC Protocol SDK (`@peacprotocol/core`) provides programmatic access to PEAC functionality including policy parsing, validation, and basic payment integration.

## Installation

```bash
npm install @peacprotocol/core
```

## Core Classes

### Parser

Parses PEAC policy files from URLs or local filesystem.

#### Methods

##### `parse(url: string): Promise<PolicyObject>`

Fetches and parses a PEAC policy from a URL.

```javascript
const { Parser } = require('@peacprotocol/core');

const policy = await Parser.parse('https://example.com/peac.txt');
console.log(policy.version); // "0.9.2"
```

##### `parseFile(path: string): Promise<PolicyObject>`

Parses a local PEAC policy file.

```javascript
const policy = await Parser.parseFile('./peac.txt');
```

### Validator

Validates policy objects against the PEAC schema.

#### Methods

##### `validate(policy: PolicyObject): ValidationResult`

Validates a parsed policy object.

```javascript
const { Validator } = require('@peacprotocol/core');

const result = Validator.validate(policy);
if (!result.valid) {
  console.error(result.errors);
}
```

### PolicyObject

Represents a parsed PEAC policy.

#### Properties

| Property  | Type   | Description             |
| --------- | ------ | ----------------------- |
| version   | string | Protocol version        |
| protocol  | string | Always "peac"           |
| policy    | object | Policy definitions      |
| metadata  | object | Optional metadata       |
| signature | object | Optional signature data |

#### Methods

##### `requiresPayment(useCase: string): boolean`

Checks if a use case requires payment.

```javascript
if (policy.requiresPayment('ai_training')) {
  // Handle payment requirement
}
```

##### `getAttribution(useCase: string): AttributionRequirement`

Gets attribution requirements for a use case.

```javascript
const attribution = policy.getAttribution('ai_training');
if (attribution.required) {
  console.log(attribution.format);
}
```

### PEACClient

Client for interacting with PEAC-enabled services.

#### Methods

##### `requestAccess(domain: string, params: AccessRequest): Promise<AccessResponse>`

Requests access to a resource.

```javascript
const { PEACClient } = require('@peacprotocol/core');

const client = new PEACClient();
const response = await client.requestAccess('example.com', {
  purpose: 'ai_training',
  volume: '10GB',
  agentId: 'my-agent-001',
});

if (response.granted) {
  // Access granted
  if (response.paymentRequired) {
    // Handle payment
  }
}
```

## Type Definitions

### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}
```

### AccessRequest

```typescript
interface AccessRequest {
  purpose: string;
  volume?: string;
  agentId: string;
  attributionConsent?: boolean;
}
```

### AccessResponse

```typescript
interface AccessResponse {
  granted: boolean;
  reason?: string;
  paymentRequired?: boolean;
  paymentUrl?: string;
  attributionFormat?: string;
}
```

### AttributionRequirement

```typescript
interface AttributionRequirement {
  required: boolean;
  format?: string;
  verificationEndpoint?: string;
}
```

## Error Handling

The SDK uses standard JavaScript error handling. All async methods return Promises that may reject with errors.

Common error types:

- `ParseError`: Invalid policy format
- `ValidationError`: Policy validation failed
- `NetworkError`: Failed to fetch policy
- `NotFoundError`: Policy file not found

```javascript
try {
  const policy = await Parser.parse('example.com');
} catch (error) {
  if (error instanceof ParseError) {
    console.error('Invalid policy format:', error.message);
  }
}
```

## Configuration

The SDK can be configured via environment variables:

| Variable        | Description                     | Default              |
| --------------- | ------------------------------- | -------------------- |
| PEAC_CACHE_TTL  | Policy cache duration (seconds) | 3600                 |
| PEAC_USER_AGENT | User agent for requests         | "@peacprotocol/core" |
| PEAC_TIMEOUT    | Request timeout (ms)            | 10000                |

## Examples

### Basic Usage

```javascript
const { Parser, PEACClient } = require('@peacprotocol/core');

async function accessContent() {
  // Parse publisher policy
  const policy = await Parser.parse('publisher.com');

  // Check requirements
  if (policy.requiresPayment('ai_training')) {
    console.log('Payment required');
  }

  // Request access
  const client = new PEACClient();
  const access = await client.requestAccess('publisher.com', {
    purpose: 'ai_training',
    agentId: 'my-bot-001',
  });

  if (access.granted) {
    console.log('Access granted');
  }
}
```

### With Error Handling

```javascript
async function safeAccess() {
  try {
    const policy = await Parser.parse('example.com');
    const result = Validator.validate(policy);

    if (!result.valid) {
      console.error('Invalid policy:', result.errors);
      return;
    }

    // Proceed with valid policy
  } catch (error) {
    console.error('Failed to parse policy:', error);
  }
}
```
