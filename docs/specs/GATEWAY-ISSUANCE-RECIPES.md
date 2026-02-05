# PEAC Gateway Issuance Recipes (NORMATIVE + ILLUSTRATIVE)

Status: MIXED (Normative requirements + Illustrative examples)
Version: 0.1
Last-Updated: 2026-02-05

This document describes how to issue PEAC receipts at gateways and edges (CDN, reverse proxy, service mesh). Gateway issuance requires no application code changes.

## 1. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

Sections marked **NORMATIVE** define requirements.
Sections marked **ILLUSTRATIVE** provide implementation sketches.

## 2. Overview

Gateway issuance attaches PEAC receipts at the network edge, before or after traffic reaches application servers.

Benefits:
- No application code changes required
- Single deployment point for platform teams
- Uniform receipt policy across services

## 3. NORMATIVE: Gateway issuer constraints

### 3.1 Claim accuracy

A gateway issuer MUST NOT assert facts it did not observe.

If the gateway cannot safely observe:
- Full response bytes
- Origin-authenticated identity
- Stable request principal

Then it MUST NOT include claims that imply those facts.

### 3.2 Required behaviors

A gateway issuer MUST:
- Sign receipts using an issuer key controlled by the issuer domain
- Publish issuer public keys at `/.well-known/peac-issuer.json`
- Adhere to transport profiles and size budgets
- Protect private keys as production secrets

### 3.3 Transport profile selection

Gateways MUST implement at least one transport profile.

RECOMMENDED: Pointer profile for receipts that may exceed header limits.

If using header delivery:
- Gateways MUST enforce maximum header size
- Gateways MUST fall back to pointer profile when exceeded

## 4. NORMATIVE: Gateway-safe claims

### 4.1 Safe to include

| Claim Type | Examples | Notes |
|------------|----------|-------|
| Request metadata | Method, path, status | Always observable |
| Content digests | SHA-256 of body | If body observed |
| Timing | Request/response timestamps | Always observable |
| Policy decisions | Allow/deny | If gateway enforces |
| Error codes | HTTP status | Always observable |

### 4.2 Requires caution

| Claim Type | Risk | Mitigation |
|------------|------|------------|
| Full body content | Size, secrets | Use digest or truncate |
| Request headers | Auth tokens | Redact sensitive headers |
| Client identity | Privacy | Use opaque identifiers |

### 4.3 Content digests with truncation

If computing a digest over large or streaming responses:
- Use truncation strategy: `sha-256:trunc-64k` or `sha-256:trunc-1m`
- Disclose truncation in the evidence field
- Example: `{"alg": "sha-256:trunc-64k", "value": "7d8f..."}`

## 5. NORMATIVE: Key handling at the edge

### 5.1 Private key protection

Gateway private keys MUST be protected as production secrets:
- Never hardcode in source control
- Store in platform secrets (worker secrets, KMS, vault)
- Rotate per issuer ops baseline

### 5.2 Signing service pattern

If the edge platform cannot safely store private keys:
1. Gateway forwards bounded signing request to internal signer
2. Signer validates request and returns receipt JWS
3. Gateway attaches receipt to response

This separates key material from the edge.

## 6. ILLUSTRATIVE: Cloudflare Worker pattern

### 6.1 Basic implementation

```javascript
// Cloudflare Worker for PEAC receipt issuance
export default {
  async fetch(request, env, ctx) {
    // Forward to origin
    const originResponse = await fetch(request);

    // Clone response to read body (note: buffering has limits)
    const responseClone = originResponse.clone();

    // Compute content digest if body is small enough
    let contentDigest = null;
    const contentLength = parseInt(originResponse.headers.get('content-length') || '0');

    if (contentLength > 0 && contentLength <= 1024 * 1024) {
      const bodyBytes = new Uint8Array(await responseClone.arrayBuffer());
      contentDigest = await sha256Hex(bodyBytes);
    }

    // Build receipt claims
    const claims = {
      iss: env.ISSUER_ORIGIN,
      aud: request.headers.get('origin') || 'unknown',
      sub: `${request.method} ${new URL(request.url).pathname}`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
      evidence: {
        response: {
          status: originResponse.status,
          content_type: originResponse.headers.get('content-type'),
        },
      },
    };

    if (contentDigest) {
      claims.evidence.content_digest = {
        alg: 'sha-256',
        value: contentDigest,
      };
    }

    // Sign receipt (implementation depends on your signing library)
    const receiptJws = await signReceipt(claims, env.PEAC_PRIVATE_KEY);

    // Decide transport: header if small, pointer if large
    const maxHeaderBytes = 4096;
    const newResponse = new Response(originResponse.body, originResponse);

    if (receiptJws.length <= maxHeaderBytes) {
      newResponse.headers.set('PEAC-Receipt', receiptJws);
    } else {
      // Use pointer profile
      const receiptDigest = await sha256Hex(new TextEncoder().encode(receiptJws));
      const pointerUrl = await storeReceipt(env, receiptDigest, receiptJws);
      newResponse.headers.set('PEAC-Receipt-Pointer', `${receiptDigest};${pointerUrl}`);
    }

    return newResponse;
  }
};

// Helper functions (pseudocode)
async function sha256Hex(bytes) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function signReceipt(claims, privateKey) {
  // Use @peac/crypto or equivalent
  // Return JWS compact serialization
}

async function storeReceipt(env, digest, jws) {
  // Store in KV, R2, or external storage
  // Return URL for retrieval
  await env.RECEIPT_STORE.put(digest, jws);
  return `https://${env.ISSUER_ORIGIN}/receipts/${digest}`;
}
```

### 6.2 Wrangler configuration

```toml
# wrangler.toml
name = "peac-gateway"
main = "src/worker.js"
compatibility_date = "2024-01-01"

[vars]
ISSUER_ORIGIN = "api.example.com"

[[kv_namespaces]]
binding = "RECEIPT_STORE"
id = "abc123..."

[secrets]
# Set via: wrangler secret put PEAC_PRIVATE_KEY
# PEAC_PRIVATE_KEY = "..."
```

## 7. ILLUSTRATIVE: Nginx/OpenResty pattern

### 7.1 Minimal header-based issuance

```nginx
# nginx.conf
http {
    lua_package_path "/usr/local/openresty/lualib/?.lua;;";

    server {
        listen 443 ssl;
        server_name api.example.com;

        location /api/ {
            proxy_pass http://backend;

            header_filter_by_lua_block {
                local peac = require("peac")

                local claims = {
                    iss = "api.example.com",
                    sub = ngx.req.get_method() .. " " .. ngx.var.uri,
                    iat = os.time(),
                    exp = os.time() + 300,
                    evidence = {
                        response = {
                            status = ngx.status
                        }
                    }
                }

                -- Sign via internal service or embedded library
                local receipt = peac.issue(claims)

                if receipt then
                    ngx.header["PEAC-Receipt"] = receipt
                end
            }
        }
    }
}
```

### 7.2 Using external signing service

```nginx
location /api/ {
    proxy_pass http://backend;

    header_filter_by_lua_block {
        local http = require("resty.http")
        local cjson = require("cjson")

        local httpc = http.new()

        local claims = {
            iss = "api.example.com",
            sub = ngx.req.get_method() .. " " .. ngx.var.uri,
            iat = os.time(),
            exp = os.time() + 300,
            evidence = {
                response = { status = ngx.status }
            }
        }

        local res, err = httpc:request_uri("http://signer-service/sign", {
            method = "POST",
            body = cjson.encode(claims),
            headers = {
                ["Content-Type"] = "application/json",
            },
        })

        if res and res.status == 200 then
            local result = cjson.decode(res.body)
            ngx.header["PEAC-Receipt"] = result.receipt
        end
    }
}
```

## 8. ILLUSTRATIVE: Envoy external processor

### 8.1 ext_proc integration

Envoy's external processing filter allows delegating receipt issuance to a sidecar service.

```yaml
# envoy.yaml
static_resources:
  listeners:
    - address:
        socket_address:
          address: 0.0.0.0
          port_value: 8080
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                http_filters:
                  - name: envoy.filters.http.ext_proc
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.ext_proc.v3.ExternalProcessor
                      grpc_service:
                        envoy_grpc:
                          cluster_name: peac_signer
                      processing_mode:
                        response_header_mode: SEND
                        response_body_mode: NONE
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router
  clusters:
    - name: peac_signer
      connect_timeout: 0.25s
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      http2_protocol_options: {}
      load_assignment:
        cluster_name: peac_signer
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: peac-signer
                      port_value: 9001
```

### 8.2 ext_proc service implementation

```go
// Go implementation of ext_proc service
package main

import (
    "context"
    extproc "github.com/envoyproxy/go-control-plane/envoy/service/ext_proc/v3"
    "google.golang.org/grpc"
)

type peacProcessor struct {
    extproc.UnimplementedExternalProcessorServer
    signer *PeacSigner
}

func (p *peacProcessor) Process(stream extproc.ExternalProcessor_ProcessServer) error {
    for {
        req, err := stream.Recv()
        if err != nil {
            return err
        }

        switch v := req.Request.(type) {
        case *extproc.ProcessingRequest_ResponseHeaders:
            // Generate receipt based on response headers
            receipt, err := p.signer.Sign(PeacClaims{
                Iss: "api.example.com",
                Sub: v.ResponseHeaders.Headers.Headers[":path"],
                // ... other claims
            })
            if err != nil {
                continue
            }

            // Add receipt header to response
            resp := &extproc.ProcessingResponse{
                Response: &extproc.ProcessingResponse_ResponseHeaders{
                    ResponseHeaders: &extproc.HeadersResponse{
                        Response: &extproc.CommonResponse{
                            HeaderMutation: &extproc.HeaderMutation{
                                SetHeaders: []*core.HeaderValueOption{
                                    {
                                        Header: &core.HeaderValue{
                                            Key:   "PEAC-Receipt",
                                            Value: receipt,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }

            if err := stream.Send(resp); err != nil {
                return err
            }
        }
    }
}
```

## 9. NORMATIVE: Pointer profile at gateway

### 9.1 Requirements

When using `PEAC-Receipt-Pointer`:
- MUST include SHA-256 digest binding
- Digest MUST cover exact receipt JWS bytes
- URL MUST be HTTPS
- Storage SHOULD be immutable by digest key

### 9.2 Storage options

| Storage | Pros | Cons |
|---------|------|------|
| CDN (Cloudflare R2, S3) | Fast, scalable | Cost |
| KV store | Simple | Size limits |
| Dedicated receipt service | Control | Complexity |

### 9.3 Cache headers

Receipt storage SHOULD return:
```
Cache-Control: public, max-age=31536000, immutable
Content-Type: application/jose
```

## 10. When to use gateway vs application

### 10.1 Gateway recommended

| Scenario | Why Gateway |
|----------|-------------|
| Fast pilot deployment | No code changes |
| Uniform receipt policy | Single config point |
| Legacy services | Can't modify code |
| Platform team ownership | Centralized control |

### 10.2 Application recommended

| Scenario | Why Application |
|----------|-----------------|
| Per-endpoint semantics | Custom claims |
| Deep domain claims | Business-level evidence |
| Precise identity | Tied to app auth |
| Complex signing logic | Conditional receipts |

### 10.3 Hybrid approach

Many deployments use both:
- Gateway for baseline receipts everywhere
- Applications for richer receipts where needed

Gateway receipts and application receipts MAY coexist:
- Multiple `PEAC-Receipt` headers allowed
- Verifiers process all receipts

## 11. Privacy at the gateway

### 11.1 Default minimization

Gateways SHOULD default to privacy-minimizing receipts:
- Do not include request headers or payloads
- Prefer digests over verbatim content
- Enforce size limits on evidence/extension data

### 11.2 Interaction evidence

If attaching interaction evidence at gateway:
- Default capture mode MUST be "hash-only"
- Explicit opt-in required for verbatim capture
- See PRIVACY-PROFILE.md for details

## 12. Operational considerations

### 12.1 Key distribution

- All gateway instances MUST use the same signing keys
- Use platform secrets management (KMS, Vault)
- Rotate per issuer ops baseline

### 12.2 Monitoring

| Metric | Description |
|--------|-------------|
| `receipts_issued_total` | Counter by status |
| `receipt_size_bytes` | Histogram |
| `signing_latency_ms` | Histogram |
| `pointer_fallback_total` | Counter of pointer usage |

### 12.3 Error handling

| Error | Behavior |
|-------|----------|
| Signing failure | Log, omit receipt, continue |
| Storage failure | Log, omit pointer, continue |
| Key unavailable | Alert, fail open or closed (configurable) |

## 13. Implementation checklist

### 13.1 Required

- [ ] Secure key storage
- [ ] Transport profile compliance
- [ ] Size limit enforcement
- [ ] JWKS endpoint published

### 13.2 Recommended

- [ ] Pointer profile support
- [ ] Content digest computation
- [ ] Privacy-preserving defaults
- [ ] Monitoring and alerting
- [ ] Graceful degradation on errors
