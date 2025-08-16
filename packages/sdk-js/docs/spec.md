# PEAC Protocol Specification v0.9.2

## Abstract

PEAC (Programmable Economic Access, Attribution & Consent) Protocol defines a standardized method for expressing machine-readable policies governing access to web resources. This specification describes the protocol's core components, data formats, and implementation requirements.

## 1. Introduction

PEAC Protocol enables content owners to specify programmatic policies for:

- Access control and consent management
- Economic terms and payment requirements
- Attribution and provenance tracking
- Regulatory compliance declarations

The protocol uses a simple text file (peac.txt) placed at the domain root, following established patterns like robots.txt.

## 2. Protocol Components

### 2.1 Policy File

The canonical policy file is `peac.txt`, located at the domain root:

```
https://example.com/peac.txt
```

Alternative locations in order of precedence:

1. `/peac.txt` (primary)
2. `/.well-known/peac` (fallback)
3. `/.well-known/peac.json` (JSON format)

### 2.2 File Format

PEAC policies use YAML format by default. JSON is supported as an alternative.

#### Minimal Valid Policy

```yaml
version: 0.9.2
protocol: peac
policy:
  consent:
    default: allowed
```

#### Complete Example

```yaml
version: 0.9.2
protocol: peac

metadata:
  domain: example.com
  updated: 2025-08-02T00:00:00Z

policy:
  consent:
    default: contact
    ai_training:
      allowed: conditional
      conditions:
        - payment_required: true
        - attribution_required: true

  economics:
    pricing_models:
      ai_training:
        per_gb: 0.01
        currency: USD
    payment_processors:
      - type: stripe
        endpoint: https://pay.example.com/stripe

  attribution:
    required: true
    format: "Source: {url}"
    verification_endpoint: /verify-attribution

  compliance:
    jurisdictions:
      eu:
        gdpr: true
        ai_act: true
      us:
        ccpa: true
```

## 3. Schema Definition

### 3.1 Required Fields

| Field    | Type   | Description                            |
| -------- | ------ | -------------------------------------- |
| version  | string | Protocol version (semantic versioning) |
| protocol | string | Must be "peac"                         |
| policy   | object | Policy definitions                     |

### 3.2 Policy Object

The policy object contains subsections defining different aspects of access control.

#### Consent Section

Defines access permissions for different use cases.

```yaml
consent:
  default: <allowed|denied|contact>
  <use_case>:
    allowed: <true|false|conditional>
    conditions: [array of condition objects]
```

#### Economics Section

Specifies pricing and payment requirements.

```yaml
economics:
  pricing_models:
    <model_name>: <pricing_parameters>
  payment_processors:
    - type: <processor_name>
      endpoint: <url>
```

#### Attribution Section

Defines attribution requirements and formats.

```yaml
attribution:
  required: <true|false>
  format: <string template>
  verification_endpoint: <url>
```

#### Compliance Section

Declares regulatory compliance status.

```yaml
compliance:
  jurisdictions:
    <jurisdiction_code>:
      <regulation_name>: <true|false>
```

## 4. Request/Response Flow

### 4.1 Agent Request Headers

Agents SHOULD include these headers when accessing resources:

```
X-PEAC-Agent-ID: <unique_identifier>
X-PEAC-Agent-Type: <ai_crawler|bot|human|api>
X-PEAC-Purpose: <use_case>
X-PEAC-Attribution-Consent: <true|false>
```

### 4.2 Server Response Headers

Servers MAY include these headers in responses:

```
X-PEAC-Version: 0.9.2
X-PEAC-Payment-Required: <processor_name>
X-PEAC-Attribution-Required: <true|false>
```

### 4.3 HTTP Status Codes

- `200 OK`: Access granted
- `402 Payment Required`: Payment needed for access
- `403 Forbidden`: Access denied based on policy
- `451 Unavailable For Legal Reasons`: Compliance restriction

## 5. Signature and Verification

### 5.1 Signature Methods

PEAC supports multiple signature algorithms:

- Ed25519 (recommended)
- ECDSA with secp256k1
- RSA-2048 (legacy support)

### 5.2 Signature Format

Signatures are included in the policy file:

```yaml
signature:
  algorithm: ed25519
  public_key: <base64_encoded_key>
  signature: <base64_encoded_signature>
```

## 6. Discovery Mechanisms

Agents MUST attempt discovery in this order:

1. Direct file access (`/peac.txt`)
2. Well-known location (`/.well-known/peac`)
3. HTTP Link header
4. HTML meta tag

## 7. Caching

- Policies SHOULD be cached according to HTTP cache headers
- Default cache duration: 3600 seconds
- Agents MUST respect cache control directives

## 8. Security Considerations

### 8.1 Transport Security

- HTTPS MUST be used in production environments
- HTTP is permitted only for local development

### 8.2 Input Validation

- Parsers MUST validate against the schema
- Unknown fields SHOULD be preserved but ignored
- Malformed policies MUST be rejected

### 8.3 Privacy

- Policies SHOULD NOT contain personally identifiable information
- Agent identifiers SHOULD be pseudonymous

## 9. Extensibility

### 9.1 Custom Fields

Implementations MAY add custom fields under the `x-` prefix:

```yaml
policy:
  x-custom-field: value
```

### 9.2 Version Compatibility

- Parsers MUST accept policies from the same major version
- Minor version differences SHOULD NOT break compatibility

## 10. References

- YAML 1.2 Specification
- JSON RFC 8259
- HTTP/1.1 RFC 7231
- robots.txt de facto standard
