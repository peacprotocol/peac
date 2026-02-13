# Security Policy

## Supported Versions

Currently supported versions for security updates:

| Version   | Supported          |
| --------- | ------------------ |
| 0.10.x    | :white_check_mark: |
| 0.9.x     | :x:                |
| < 0.9     | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow these steps:

1. **DO NOT** open a public issue
2. Email security@peacprotocol.org with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if available)

3. We will acknowledge receipt within 48 hours
4. We will investigate and provide updates within 7 days
5. We will coordinate disclosure timing with you

## Security Measures

### Cryptographic Security

- EdDSA (Ed25519) signatures only
- JWS Compact Serialization
- Key rotation every 30 days
- Hardware security module support

### Input Validation

- Strict JSON schema validation
- SSRF protection on all external calls
- Rate limiting with token buckets
- Request size limits enforced

### Operational Security

- No secrets in code or commits
- Environment-based configuration
- Audit logging for security events
- Automated vulnerability scanning

## Security Checklist for Contributors

Before submitting code:

- [ ] No hardcoded secrets or credentials
- [ ] All user input validated
- [ ] External URLs validated against SSRF
- [ ] Rate limiting considered
- [ ] Error messages don't leak sensitive info
- [ ] Dependencies audited (`pnpm audit`)
- [ ] Security tests written for new features

## Known Security Considerations

### SSRF Protection

All crawler and verification endpoints implement SSRF guards:

- Private IP range blocking
- DNS rebinding protection
- Redirect limit enforcement
- Timeout controls

### DoS Prevention

- Token bucket rate limiting
- Request size limits
- Computation timeouts
- Circuit breakers for external services

### Data Privacy

- No PII in logs
- Structured telemetry with privacy controls
- GDPR-compliant data handling
- Configurable retention policies

## Compliance

The PEAC Protocol aims to comply with:

- OWASP API Security Top 10
- NIST Cybersecurity Framework
- EU GDPR requirements
- California CCPA requirements

## Contact

- Security issues: security@peacprotocol.org
- General inquiries: contact@peacprotocol.org
