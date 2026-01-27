# Pay-Per-Crawl Example

Demonstrates the complete PEAC flow for AI crawlers with policy evaluation.

## What This Shows

1. **Policy Definition** - YAML-based policy with rules for different subjects
2. **Artifact Generation** - Compile policy to peac.txt and robots.txt snippets
3. **Policy Evaluation** - Determine access requirements based on subject/purpose
4. **Receipt Flow** - Obtain and verify receipts for paid access

## Policy Concepts

| Term             | Description                                           |
| ---------------- | ----------------------------------------------------- |
| `subject`        | Who is requesting access (type + labels)              |
| `purpose`        | Why they want access (crawl, index, train, etc.)      |
| `licensing_mode` | Payment arrangement (pay_per_use, subscription, etc.) |
| `decision`       | allow, deny, or review                                |
| `receipts`       | required, optional, or omit                           |

## Example Policy Rules

```yaml
rules:
  # Subscribed agents get free access
  - subject:
      type: agent
      labels: [subscribed]
    purpose: crawl
    decision: allow
    receipts: omit

  # AI crawlers must pay
  - subject:
      type: agent
      labels: [ai-crawler]
    purpose: crawl
    licensing_mode: pay_per_use
    decision: allow
    receipts: required

  # Training is denied
  - purpose: train
    decision: deny
```

## Prerequisites

From the repository root:

```bash
pnpm install
pnpm build
```

## Running the Demo

```bash
cd examples/pay-per-crawl
pnpm demo
```

## Key Outputs

### peac.txt

Discovery file for PEAC-aware agents:

```
# PEAC Policy v0.1
# https://www.peacprotocol.org

PEAC-Version: 0.9
Contact: https://publisher.example.com/contact
Attribution: required
...
```

### robots.txt Snippet

For integration with existing robots.txt:

```
# PEAC Policy
# See https://publisher.example.com/.well-known/peac.txt
User-agent: *
...
```

## No External Dependencies

This example uses local policy parsing and simulated receipts.
No network calls, no secrets required.
