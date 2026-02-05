# PEAC Privacy Profile for Interaction Evidence (NORMATIVE)

Status: NORMATIVE
Version: 0.1
Last-Updated: 2026-02-05

This document defines the privacy defaults and guidelines for PEAC receipts containing interaction evidence, particularly for AI agent tool calls and automated system interactions.

## 1. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

## 2. Scope

This document applies to PEAC receipts that include:

- Interaction evidence (tool inputs/outputs)
- Agent action records
- API request/response data
- Any extension that may contain user data or secrets

## 3. Privacy principles

### 3.1 Core principles

1. **Minimization**: Capture only what is needed for the receipt's purpose
2. **Hash-by-default**: Prefer cryptographic hashes over verbatim content
3. **No secrets**: Never include credentials, tokens, or keys
4. **Explicit consent**: Verbatim capture requires explicit configuration
5. **Bounded retention**: Define and enforce retention limits

### 3.2 Default posture

The default posture MUST be **privacy-preserving**:

- Hash-only for inputs and outputs by default
- No verbatim content unless explicitly enabled
- No PII unless explicitly required and consented

## 4. Data classification

### 4.1 Never include (MUST NOT)

| Data Type           | Examples                         | Rationale     |
| ------------------- | -------------------------------- | ------------- |
| Credentials         | API keys, tokens, passwords      | Security      |
| Secrets             | Private keys, encryption keys    | Security      |
| Authentication data | Session cookies, JWTs            | Security      |
| Raw PII             | SSN, credit card numbers         | Privacy/Legal |
| Medical data        | PHI, health records              | HIPAA         |
| Financial data      | Bank accounts, full card numbers | PCI-DSS       |

### 4.2 Hash-only by default (SHOULD hash)

| Data Type         | Examples              | Hash Rationale             |
| ----------------- | --------------------- | -------------------------- |
| Tool inputs       | Function arguments    | May contain user queries   |
| Tool outputs      | Function results      | May contain sensitive data |
| Request bodies    | API payloads          | May contain PII            |
| Response bodies   | API responses         | May contain PII            |
| User queries      | Search terms, prompts | Privacy                    |
| Generated content | AI outputs            | Copyright/Privacy          |

### 4.3 May include verbatim (MAY include)

| Data Type            | Examples                 | When Appropriate    |
| -------------------- | ------------------------ | ------------------- |
| Metadata             | Timestamps, status codes | Always              |
| Public identifiers   | URLs, resource IDs       | When not PII        |
| Error codes          | HTTP status, error types | Always              |
| Non-sensitive config | Feature flags            | When not secret     |
| Truncated previews   | First N characters       | With explicit limit |

## 5. Hash-only mode

### 5.1 Algorithm

- Hash function: SHA-256
- Encoding: Lowercase hexadecimal
- Input: UTF-8 encoded string

### 5.2 Schema

For interaction evidence in hash-only mode:

```json
{
  "interaction": {
    "input_hash": {
      "alg": "sha-256",
      "value": "7d8f3d0c9d0b6aebd1c3b8d0ab8f7c1d8c7f1d2b0b2a3f4e5d6c7b8a9f0e1d2c"
    },
    "output_hash": {
      "alg": "sha-256",
      "value": "a3f1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1"
    },
    "timing": {
      "started_at": "2026-02-05T10:23:45Z",
      "ended_at": "2026-02-05T10:23:46Z"
    },
    "result": "success"
  }
}
```

### 5.3 What hash-only proves

- **Integrity**: The exact input/output can be verified by recomputing the hash
- **Binding**: The receipt is bound to specific data without revealing it
- **Non-repudiation**: The issuer attests to having processed this data

### 5.4 What hash-only does NOT prove

- **Content**: The actual data is not revealed
- **Semantics**: What the data means is not captured
- **Context**: Surrounding information is not included

## 6. Redaction mode

### 6.1 When to use

Use redaction when:

- You need some verbatim content for debugging
- Specific fields are known to be safe
- Compliance requires partial disclosure

### 6.2 Redaction strategies

| Strategy      | Description                       | Example                     |
| ------------- | --------------------------------- | --------------------------- |
| Field removal | Remove sensitive fields entirely  | Remove `password` field     |
| Value masking | Replace value with placeholder    | `"api_key": "[REDACTED]"`   |
| Truncation    | Keep only first N characters      | `"query": "How do I..."`    |
| Type-only     | Replace value with type indicator | `"data": "[object: 1.2KB]"` |

### 6.3 Redaction markers

When redacting, use standard markers:

| Marker               | Meaning                           |
| -------------------- | --------------------------------- |
| `[REDACTED]`         | Value intentionally removed       |
| `[TRUNCATED:N]`      | Value truncated to N characters   |
| `[HASH:sha256:...]`  | Value replaced with hash          |
| `[TYPE:object:1234]` | Value replaced with type and size |

### 6.4 Example redacted interaction

```json
{
  "interaction": {
    "input": {
      "tool": "web_search",
      "query": "[TRUNCATED:20]How do I reset my...",
      "api_key": "[REDACTED]"
    },
    "output_hash": {
      "alg": "sha-256",
      "value": "a3f1b2c3..."
    },
    "timing": {
      "started_at": "2026-02-05T10:23:45Z",
      "ended_at": "2026-02-05T10:23:46Z"
    },
    "result": "success"
  }
}
```

## 7. Verbatim mode

### 7.1 When appropriate

Verbatim capture MAY be used when:

- Data is explicitly public (e.g., public API responses)
- User has consented to full capture
- Audit requirements mandate full records
- Debugging requires exact reproduction

### 7.2 Requirements for verbatim mode

If using verbatim mode:

- MUST NOT include data classified as "Never include"
- MUST document what is captured
- MUST enforce size limits
- SHOULD encrypt sensitive receipts at rest
- SHOULD implement access controls

### 7.3 Size limits for verbatim

| Field             | Maximum Size | Behavior if Exceeded |
| ----------------- | ------------ | -------------------- |
| `input_verbatim`  | 64 KB        | Truncate or hash     |
| `output_verbatim` | 64 KB        | Truncate or hash     |
| Total extension   | 256 KB       | Reject or truncate   |

## 8. Retention guidelines

### 8.1 Recommended retention periods

| Purpose                | Retention      | Rationale              |
| ---------------------- | -------------- | ---------------------- |
| Real-time verification | 1 hour         | Immediate use          |
| Audit trail            | 90 days        | Standard audit period  |
| Compliance             | Per regulation | Legal requirement      |
| Dispute resolution     | 2 years        | Statute of limitations |
| Permanent record       | Indefinite     | Business requirement   |

### 8.2 Retention implementation

- Receipts SHOULD include `exp` claim aligned with retention
- Storage systems SHOULD enforce automatic deletion
- Dispute bundles MAY extend retention for specific receipts

## 9. GDPR considerations

### 9.1 Personal data in receipts

If receipts may contain personal data:

- Treat entire receipt as potentially containing PII
- Apply appropriate access controls
- Support data subject access requests
- Support right to erasure (with audit trail)

### 9.2 Legal basis

Common legal bases for PEAC receipts:

- **Legitimate interest**: Fraud prevention, audit trails
- **Contract performance**: Settlement proof
- **Legal obligation**: Regulatory compliance

### 9.3 Data subject rights

| Right         | Implementation                                   |
| ------------- | ------------------------------------------------ |
| Access        | Provide receipt copies on request                |
| Rectification | Receipts are immutable; issue correction receipt |
| Erasure       | Delete receipts; retain hash for audit           |
| Portability   | Export receipts in standard format               |

## 10. Implementation guidance

### 10.1 Default configuration

```typescript
const defaultPrivacyConfig = {
  mode: 'hash-only', // Default to hash-only
  verbatim: false, // No verbatim by default
  redaction: {
    enabled: true,
    fields: ['api_key', 'token', 'password', 'secret'],
  },
  truncation: {
    enabled: true,
    maxLength: 100,
  },
  retention: {
    defaultTTL: 90 * 24 * 60 * 60, // 90 days in seconds
  },
};
```

### 10.2 Redaction hook

```typescript
function redactBeforeSigning(input: unknown): unknown {
  // Deep clone to avoid mutation
  const redacted = structuredClone(input);

  // Remove known sensitive fields
  const sensitiveFields = ['api_key', 'token', 'password', 'secret', 'authorization'];
  removeSensitiveFields(redacted, sensitiveFields);

  // Truncate long strings
  truncateStrings(redacted, 100);

  return redacted;
}
```

### 10.3 Hash utility

```typescript
async function hashValue(value: unknown): Promise<string> {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
```

## 11. Security considerations

### 11.1 Hash collision resistance

- SHA-256 provides 128 bits of collision resistance
- Sufficient for integrity verification
- Not suitable for hiding low-entropy data (e.g., boolean values)

### 11.2 Timing attacks

- Hashing does not hide timing information
- `timing.started_at` and `timing.ended_at` reveal processing duration
- Consider if timing is sensitive for your use case

### 11.3 Metadata inference

Even with hash-only mode:

- Tool name reveals what was called
- Timing reveals when
- Success/failure reveals outcome
- Consider if this metadata is sensitive

## 12. Conformance

### 12.1 Minimum requirements

A conformant implementation MUST:

- Default to hash-only mode
- Never include data classified as "Never include"
- Enforce size limits
- Support redaction for known sensitive fields

### 12.2 Recommended

A conformant implementation SHOULD:

- Provide configurable privacy modes
- Support custom redaction rules
- Log privacy-related decisions
- Document data handling practices
