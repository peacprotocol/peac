# Receipt Schema (Informative)

A receipt is a verifiable record of terms/settlement.

**Fields (example):**
`id`, `issuer`, `subject`, `purpose`, `terms_hash`, `amount`, `currency`, `method`, `issued_at`, `expires_at`, `signature`.

Receipts SHOULD be DPoP-bound where applicable.
