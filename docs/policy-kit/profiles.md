# Policy Profiles

Policy profiles are pre-built policy templates for common publisher archetypes. Instead of writing policies from scratch, you can start with a profile that matches your use case.

## Available Profiles

| Profile ID     | Name                 | Default | Receipt | Use Case                       |
| -------------- | -------------------- | ------- | ------- | ------------------------------ |
| `news-media`   | News Media Publisher | deny    | yes     | News sites, journalism         |
| `api-provider` | API Provider         | deny    | yes     | Developer docs, API references |
| `open-source`  | Open Source Project  | allow   | no      | OSS documentation, wikis       |
| `saas-docs`    | SaaS Documentation   | allow   | no      | Product docs, help centers     |

## Quick Start

### List Available Profiles

```bash
peac policy list-profiles
```

Output:

```
Available Policy Profiles:

  api-provider
    Name: API Provider
    Default: deny
    Rules: 3
    Requires receipt: yes
    Required params: contact

  news-media
    Name: News Media Publisher
    Default: deny
    Rules: 3
    Requires receipt: yes
    Required params: contact

  open-source
    Name: Open Source Project
    Default: allow
    Rules: 0

  saas-docs
    Name: SaaS Documentation
    Default: allow
    Rules: 1
```

### View Profile Details

```bash
peac policy show-profile news-media
```

### Create Policy from Profile

```bash
peac policy init --profile news-media
```

This creates a `peac-policy.yaml` based on the news-media profile.

## Profile Details

### news-media

For news organizations and media publishers. Protects content while allowing search visibility.

**Policy:**

- Default: deny (explicit permission required)
- Allows: crawl, index, search, ai_index
- Blocks: train
- Reviews: inference, ai_input (requires receipt)

**Parameters:**

| Parameter       | Required | Description                 | Example                |
| --------------- | -------- | --------------------------- | ---------------------- |
| `contact`       | yes      | Licensing contact email     | licensing@example.com  |
| `rate_limit`    | no       | Access rate limit           | 100/hour               |
| `negotiate_url` | no       | URL for license negotiation | https://example.com/ai |

**Example:**

```yaml
# peac-policy.yaml (from news-media profile)
version: 'peac-policy/0.1'
name: News Media Policy

defaults:
  decision: deny
  reason: Default deny - explicit permission required

rules:
  - name: allow-search-indexing
    purpose: [crawl, index, search, ai_index]
    decision: allow
    reason: Allow discovery and search engine indexing

  - name: block-training
    purpose: train
    decision: deny
    reason: Training requires explicit licensing agreement

  - name: inference-needs-receipt
    purpose: [inference, ai_input]
    decision: review
    reason: Inference access requires valid PEAC receipt
```

### api-provider

For API documentation sites and developer portals. Protects API design IP while enabling discoverability.

**Policy:**

- Default: deny
- Allows: crawl, index, search, ai_index
- Blocks: train
- Reviews: inference, ai_input (requires receipt)

**Parameters:**

| Parameter       | Required | Description                | Example                 |
| --------------- | -------- | -------------------------- | ----------------------- |
| `contact`       | yes      | Developer relations email  | api-support@example.com |
| `rate_limit`    | no       | Rate limit for docs access | 200/hour                |
| `negotiate_url` | no       | API access negotiation URL | https://example.com/api |

### open-source

For open source projects. Fully open access including AI training.

**Policy:**

- Default: allow (all access permitted)
- No restrictions

**Parameters:**

| Parameter     | Required | Description             | Example                |
| ------------- | -------- | ----------------------- | ---------------------- |
| `contact`     | no       | Maintainer email        | maintainer@example.com |
| `attribution` | no       | Attribution requirement | required, optional     |

### saas-docs

For SaaS product documentation. Open for discovery, closed for training.

**Policy:**

- Default: allow
- Blocks: train

**Parameters:**

| Parameter    | Required | Description           | Example          |
| ------------ | -------- | --------------------- | ---------------- |
| `contact`    | no       | Contact email         | docs@example.com |
| `rate_limit` | no       | Rate limit for access | 500/hour         |

## Programmatic Usage

### Using Profiles in Code

```typescript
import {
  listProfiles,
  loadProfile,
  getProfileSummary,
  validateProfileParams,
  customizeProfile,
} from '@peac/policy-kit';

// List available profiles
const profileIds = listProfiles();
// ['api-provider', 'news-media', 'open-source', 'saas-docs']

// Get profile summary
const summary = getProfileSummary('news-media');
console.log(summary.name); // 'News Media Publisher'
console.log(summary.requiresReceipt); // true
console.log(summary.requiredParams); // ['contact']

// Load full profile
const profile = loadProfile('news-media');
console.log(profile.policy.defaults.decision); // 'deny'

// Validate parameters
const result = validateProfileParams('news-media', {
  contact: 'licensing@example.com',
  rate_limit: '100/hour',
});
if (!result.valid) {
  console.error(result.errors);
}

// Customize profile with parameters
const customized = customizeProfile('news-media', {
  contact: 'licensing@example.com',
});
console.log(customized.policy); // PolicyDocument
console.log(customized.appliedDefaults); // { requirements: { receipt: true }, rate_limit: {...} }
```

### Type Definitions

```typescript
import type { ProfileId, ProfileDefinition } from '@peac/policy-kit';

// ProfileId is a union type
type ProfileId = 'api-provider' | 'news-media' | 'open-source' | 'saas-docs';

// ProfileDefinition structure
interface ProfileDefinition {
  id: string;
  name: string;
  description: string;
  policy: PolicyDocument;
  parameters?: Record<string, ProfileParameter>;
  defaults?: {
    requirements?: { receipt?: boolean };
    rate_limit?: RateLimitConfig;
  };
}
```

## Automation

### JSON Output for Scripts

```bash
# List profiles as JSON
peac policy list-profiles --json

# Show profile as JSON
peac policy show-profile news-media --json

# Validate and output JSON
peac policy validate peac-policy.yaml --json
```

### CI/CD Integration

```bash
# Create policy from profile (auto-confirm overwrite)
peac policy init --profile news-media --yes

# Generate artifacts to stdout for piping
peac policy generate peac-policy.yaml --out -

# Strict mode: exit non-zero on warnings
peac policy validate peac-policy.yaml --strict
```

## Next Steps

- [Policy Kit Quickstart](./quickstart.md) - Getting started
- [README](../../README.md) - Full documentation
