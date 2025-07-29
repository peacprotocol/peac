# PEAC Protocol Privacy & Log Policy

## Overview
PEAC aims for maximum privacy and GDPR/CCPA alignment. The protocol:
- Never logs raw user or agent PII.
- All logs are anonymized using a SHA-256 hash.
- Data minimization is enforced by default.

## Logged Fields
- Timestamp (ISO)
- Anonymized agent ID (SHA-256)
- Request path
- Privacy flag (do_not_log: true/false)

## Anonymization
All agent/user IDs are hashed client-side before storage. Raw values are never written to disk.

## Privacy Flags
- If `do_not_log: true` is set, no request data is logged except the minimal timestamp for auditability.

## GDPR Compliance
This module can be audited and disabled per jurisdiction. Full data minimization by design.
