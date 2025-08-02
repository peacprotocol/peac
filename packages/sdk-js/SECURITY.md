# Security Policy

## Reporting Security Vulnerabilities

PEAC Protocol takes security seriously. If you discover a security vulnerability, please report it responsibly.

### Where to Report

Email: security@peacprotocol.org

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested remediation (if any)

### Response Timeline

- Acknowledgment: Within 48 hours
- Initial assessment: Within 7 days
- Fix timeline: Depends on severity

## Security Considerations

### Policy File Security

PEAC policy files (peac.txt) are public by design. Do not include:
- Private keys or secrets
- Personally identifiable information
- Internal system details

### Transport Security

- Always use HTTPS in production
- Validate SSL certificates
- Implement appropriate timeouts

### Parser Security

When implementing PEAC parsers:
- Validate all input against the schema
- Set reasonable size limits
- Handle malformed content gracefully
- Avoid recursive parsing vulnerabilities

### Signature Verification

If using signed policies:
- Verify signatures before trusting content
- Use established cryptographic libraries
- Rotate keys periodically
- Store private keys securely

## Best Practices

### For Publishers

1. Serve peac.txt over HTTPS only
2. Set appropriate cache headers
3. Monitor access logs for anomalies
4. Keep policies simple and minimal

### For Implementers

1. Validate all parsed content
2. Implement request rate limiting
3. Use timeouts for network requests
4. Log security-relevant events

### For Users

1. Verify the authenticity of PEAC implementations
2. Check policy details before granting access
3. Report suspicious behavior

## Known Limitations

- Policy files are public and can be read by anyone
- No built-in encryption for policy content
- Enforcement depends on implementation compliance

## Security Updates

Security updates will be announced via:
- GitHub security advisories
- Project mailing list (when established)
- CHANGELOG.md notes
