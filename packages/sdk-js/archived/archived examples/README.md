# PEAC Protocol Examples

Overview of pricing.txt files:

- `created_at` field is now included in all examples to enable session expiry and demonstrate protocol best practices.
- `pricing.txt`: Starter template for basic access.
- `minimal-pricing.txt`: Deny-by-default baseline.
- `full-pricing.txt`: Comprehensive with attribution, units, and conditions.

Deploy to domain root and validate against pricing.schema.json.

> **Note:** If you see `unknown format "date-time"` when using ajv-cli, this is just a warning.  
> The PEAC Protocol CLI is the authoritative validator for all YAML-based pricing files.
