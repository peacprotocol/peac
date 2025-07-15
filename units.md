# PEAC Protocol Custom Units

Custom units for metering access:

- **per-byte**: For data, text, or file-size-based pricing.
- **per-request**: For API or endpoint invocations.
- **per-second**: For time-bound access, e.g., streaming.

These standardized units are enforced via schema validation.

---

## Extending Units with Metadata

For advanced use cases (e.g., SaaS, AI, licensing platforms), PEAC supports non-standardized units through the `metadata` field in `agent_rules`. These are **not enforced** by the PEAC schema or SDK but can be agreed upon bilaterally between agents and publishers.

Examples:
- `unit_name: per-token` (e.g., LLM token usage)
- `unit_name: per-pdf`
- `unit_name: per-image`
- `unit_name: per-10-rows` (e.g., for CSV or tabular datasets)

These should be interpreted via mutual agreement or external contracts (e.g., Stripe, GitHub license checks). Useful for pricing content types not well modeled by standard units.

---

## Implementation Notes

- PEAC encourages unit usage to align with **real-world value metrics**.
- Publishers may use these custom units to **differentiate pricing per media/content type**.
- Agents should check for `metadata.unit_name` to handle these cases.

See `spec.md` and `examples/full-pricing.txt` for context.
