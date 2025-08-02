# Getting Started with PEAC Protocol

This guide will help you implement PEAC Protocol for your website or application.

## Overview

PEAC Protocol enables you to:
- Control how automated systems access your content
- Set payment requirements for different use cases
- Require attribution for content usage
- Declare regulatory compliance

## Prerequisites

- A web domain where you can host files
- Basic understanding of YAML or JSON
- Node.js 16+ (optional, for using the SDK)

## Step 1: Create Your peac.txt File

Create a file named `peac.txt` with your content policies:

```yaml
# peac.txt - Basic example
version: 0.9.2
protocol: peac

policy:
  consent:
    default: allowed
    ai_training: conditional
    
  economics:
    pricing_models:
      ai_training:
        per_gb: 0.01
        currency: USD
        
  attribution:
    required: true
    format: "Content from {url}"
```

### Understanding the Structure

- **version**: The PEAC Protocol version (use 0.9.2)
- **protocol**: Must be "peac"
- **policy**: Contains your access rules
  - **consent**: Who can access your content
  - **economics**: Payment requirements
  - **attribution**: How to credit your content
  - **compliance**: Regulatory declarations (optional)

## Step 2: Customize Your Policies

### Consent Options

```yaml
consent:
  default: allowed      # or 'denied' or 'contact'
  ai_training: denied   # Block AI training
  web_scraping: allowed # Allow general scraping
  api_access: conditional # Require conditions
```

### Payment Configuration

```yaml
economics:
  pricing_models:
    ai_training:
      per_gb: 0.01
      currency: USD
    api_access:
      per_request: 0.001
      currency: USD
  payment_processors:
    - type: stripe
      endpoint: https://pay.yourdomain.com/stripe
```

### Attribution Requirements

```yaml
attribution:
  required: true
  format: "Source: {url} by {author}"
  verification_endpoint: https://yourdomain.com/verify
```

## Step 3: Validate Your Configuration

### Using the CLI

```bash
# Install PEAC CLI
npm install -g @peacprotocol/core

# Validate your file
npx peac validate peac.txt
```

### Manual Validation

Ensure your file:
- Is valid YAML or JSON
- Contains required fields (version, protocol, policy)
- Uses correct field names and types

## Step 4: Deploy Your peac.txt

Upload your `peac.txt` file to your domain root:

```
https://yourdomain.com/peac.txt
```

The file should be:
- Publicly accessible
- Served with `Content-Type: text/plain` or `application/yaml`
- Available over HTTPS

## Step 5: Test Your Implementation

### Check File Accessibility

```bash
curl https://yourdomain.com/peac.txt
```

### Parse Your Policy

```javascript
const { Parser } = require('@peacprotocol/core');

const policy = await Parser.parse('yourdomain.com');
console.log(policy);
```

## Common Patterns

### Free Access with Attribution

```yaml
policy:
  consent:
    default: allowed
  attribution:
    required: true
    format: "Via {url}"
```

### Paid AI Training Access

```yaml
policy:
  consent:
    ai_training: conditional
  economics:
    pricing_models:
      ai_training:
        per_gb: 0.05
        currency: USD
```

### Research Exception

```yaml
policy:
  consent:
    default: denied
    academic_research: allowed
  attribution:
    required: true
    format: "Research data from {url}"
```

## Next Steps

- Review the [Protocol Specification](../spec.md) for advanced features
- See the [API Reference](api-reference.md) for SDK usage
- Check the [Compliance Guide](compliance-guide.md) for regulatory information

## Getting Help

- GitHub Issues: Technical questions and bug reports
- Email: contact@peacprotocol.org