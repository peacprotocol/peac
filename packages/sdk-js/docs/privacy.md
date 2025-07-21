# PEAC Protocol Privacy Policy & Log Guidance

PEAC is designed privacy-first: **no personal data is logged by default**.

## Key Principles

- **No PII by default.**
- **Agent IDs are hashed in logs** (see `core/privacy`).
- **Logs can be disabled or filtered** with `do_not_log`.
- **GDPR/CCPA ready:** No tracking, easy log minimization.

## Log Policy Example

```yaml
log_policy:
  agent_id: hash
  session: uuid
  ip_address: none
  do_not_log: true  # publisher disables logging for this agent/session
```

## Privacy Controls in Code

- See core/privacy/node/anonymizer.js and core/privacy/python/anonymizer.py.

- All requests are anonymized unless explicitly allowed.

## Compliance

PEAC can help satisfy EU AI Act, GDPR, and similar requirements for web access automation.

For more info, see COMPLIANCE.md.
