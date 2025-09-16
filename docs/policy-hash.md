# Policy Hash Algorithm

## Normative Algorithm

The canonical policy hash algorithm combines RFC 8785 JSON Canonical Serialization (JCS) with URL normalization to produce deterministic hashes for policy comparison.

### Process

1. **URL Normalization**: Apply RFC 3986 URL normalization rules
2. **JSON Canonicalization**: Apply RFC 8785 JCS to the normalized policy object
3. **Hash Computation**: SHA-256 digest of the canonical JSON string
4. **Base64url Encoding**: Encode the digest using base64url (RFC 4648)

### URL Normalization Rules

- Scheme and host converted to lowercase
- Default ports removed (`:80` for http, `:443` for https)
- Dot segments resolved per RFC 3986
- Only unreserved characters percent-decoded (A-Z a-z 0-9 - . \_ ~)
- Query parameter order preserved
- Trailing slashes preserved

### Implementation

```typescript
import { canonicalPolicyHash } from '@peac/core';

const policy = {
  resource: 'https://example.com/path',
  purpose: 'training',
  timestamp: '2025-01-01T00:00:00Z',
};

const hash = await canonicalPolicyHash(policy);
// Returns: base64url-encoded SHA-256 digest
```

## Test Vectors

### Vector 1: Basic Policy

**Input:**

```json
{
  "resource": "https://Example.com:443/Path/../file.txt",
  "purpose": "training"
}
```

**Normalized:**

```json
{
  "purpose": "training",
  "resource": "https://example.com/file.txt"
}
```

**Canonical JSON:**

```
{"purpose":"training","resource":"https://example.com/file.txt"}
```

**Expected Hash:**

```
YkNBV_ZjNGVhNGU4ZTIxMzlkZjcyYWQ3NDJjOGY0YTM4
```

### Vector 2: Complex Policy with Array

**Input:**

```json
{
  "resources": ["https://Example.com:443/", "http://localhost:80/test"],
  "timestamp": 1704067200,
  "metadata": {
    "agent": "test-bot",
    "version": "1.0"
  }
}
```

**Normalized:**

```json
{
  "metadata": {
    "agent": "test-bot",
    "version": "1.0"
  },
  "resources": ["https://example.com/", "http://localhost/test"],
  "timestamp": 1704067200
}
```

**Expected Hash:**

```
QzFiY2Y4NmE0ZDc1YzMxOGQ2ZmQzOTRlYzRhNzEyODQ
```

### Vector 3: Unicode and Special Characters

**Input:**

```json
{
  "name": "Test Policy",
  "description": "Policy with unicode: 你好",
  "url": "https://example.com/path%20with%20spaces"
}
```

**Normalized:**

```json
{
  "description": "Policy with unicode: 你好",
  "name": "Test Policy",
  "url": "https://example.com/path%20with%20spaces"
}
```

**Expected Hash:**

```
ZGY3NDQ1NzA2YzBkNWE4NTIzNGI5Yjk2ZjNkMTU4Y2E
```

## Implementation Notes

- Hash computation MUST be deterministic across platforms
- URL normalization MUST preserve semantic equivalence
- JSON key ordering MUST be lexicographic (Unicode code point order)
- Number serialization MUST use shortest form without exponential notation
- String escaping MUST follow JSON specification exactly
