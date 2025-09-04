# PEAC over Tempo: Adapter Sketch (v0.9.12 • Dev Phase)

**Date (IST):** 05 Sep 2025, 18:00
**Status:** Tempo Adapter - **Preview (Stubbed Verification)** (stable on-wire; pluggable internals)
**Scope:** Add a **Tempo** payment adapter to PEAC's 402 flow, without changing any wire contracts.

## Objectives

* Enable **Tempo** as a payment rail alongside **x402** and **L402** via the adapter registry.
* Keep **PEAC wire stable**: `PEAC-Receipt` header, Core Receipt v1 fields, AIPREF snapshot, `/.well-known/peac.txt ≤20` lines.
* Normalize settlement evidence into `payment{ rail, status, amount?, evidence{provider_ids[]} }` with optional `ext.tempo` hints.

## Normative invariants (must not change)

* **Header:** `PEAC-Receipt` (no `X-PEAC-*`).
* **Receipt:** `aipref` **always present**; `payment` **required** iff `enforcement.method == "http-402"`.
* **Discovery:** `/.well-known/peac.txt` (≤20 lines) may list rails (order **informative**).
* **Verify API:** Problem Details responses (`application/problem+json`).
* **Neutrality:** rail negotiated via `Accept-Payments` header or deployment config.

## Assumptions (Tempo specifics)

⚠️ Assumption: public Tempo SDK/specs are pending. We model a safe placeholder:

* `Authorization: Tempo <proof>` bearer-style credential.
* Optional headers for demo: `X-Tempo-Tx`, `X-Tempo-Memo`, `X-Tempo-Chain`.
* Network id via env `TEMPO_NET` (e.g., `tempo-testnet`).
  These are *adapter-local*, not on-wire contracts.

## Flow (HTTP-402, rail-agnostic)

### Sequence (numbered)

1. **Client → Origin**: request protected resource.
2. **Middleware** decides payment required.
3. **Negotiation**: choose rail from `Accept-Payments` or default order `[x402, tempo, l402]`.
4. **Origin → Client**: `402 Payment Required` with `WWW-Authenticate` challenge (rail-specific).
5. **Client pays** on chosen rail; retries with proof (e.g., `Authorization: Tempo <proof>`).
6. **Adapter verifies** proof; emits normalized `payment{}`.
7. **Kernel issues** compact JWS; **Origin → Client**: `200 OK` + `PEAC-Receipt: <jws>`.

### ASCII diagram

```
Client                      Origin (@peac/402 + adapter)                  Tempo rail
  |   GET /protected             |                                             |
  |----------------------------->|                                             |
  |                              | needs payment? → yes                        |
  |                              | pick rail (Accept-Payments / default)       |
  |   402 + WWW-Authenticate     |                                             |
  |<-----------------------------|                                             |
  |   (pay via Tempo)            |========================= settlement =======>|
  |   GET /protected             |                                             |
  |   Authorization: Tempo ...   | verify proof → payment{}                    |
  |----------------------------->| build receipt + sign (EdDSA)                |
  |   200 OK + PEAC-Receipt      |                                             |
  |<-----------------------------|                                             |
```

## Discovery (peac.txt)

```
version: 0.9.x
preferences: https://example.com/.well-known/aipref.json
access_control: http-402
payments: [ x402 , tempo , l402 ]
receipts: required
verify: https://example.com/peac/verify
public_keys:
- kid=2025-09-k1, alg=Ed25519, key=MCowBQYDK2VwAyEA...
```

*Order is **informative**; clients/servers negotiate.*

## HTTP details

**Negotiation (request → server)**

* Header (optional): `Accept-Payments: tempo, x402`
* Server default order (configurable): `x402,tempo,l402`

**Challenge (server → client)**

```
HTTP/1.1 402 Payment Required
WWW-Authenticate: X-TEMPO network="tempo-testnet"
```

⚠️ Assumption: scheme token `X-TEMPO` is a temporary hint for preview.

**Proof submission (client → server)**

```
Authorization: Tempo <proof>
X-Tempo-Tx: 0xabc123...
X-Tempo-Chain: tempo-testnet
X-Tempo-Memo: <base64url>
```

Headers are **adapter-local** and may be removed once official fields exist.

## Receipt example (unchanged wire)

```json
{
  "enforcement": { "method": "http-402", "status": "fulfilled" },
  "payment": {
    "rail": "tempo",
    "status": "settled",
    "amount": { "value": "2.50", "currency": "USD" },
    "evidence": {
      "provider_ids": [
        "tempo:tx:0xabc123...",
        "tempo:chain:tempo-testnet",
        "tempo:memo:SGVsbG8"
      ]
    }
  },
  "aipref": {
    "status": "active",
    "checked_at": "2025-09-05T12:30:00Z",
    "snapshot": { "ai_train": false, "ai_crawl": true, "sources":[{"type":"peac.txt"}] }
  },
  "issued_at": "2025-09-05T12:30:00Z",
  "kid": "2025-09-k1"
  /* "ext": { "tempo": { "block": 12345, "tx": "0xabc...", "memo_digest": "sha256:..." } } */
}
```

## Adapter interface & stub (TypeScript, byte-tight)

```ts
// pkgs/402-tempo/index.ts
import type { PayAdapter, IssueCtx, Rec } from '@peac/core/adapter'

export function payTempo(env:any): PayAdapter {
  return {
    name: 'tempo',
    kind: 'pay',
    challenge(ctx: IssueCtx) {
      const net = env.TEMPO_NET || 'tempo-testnet'
      return { scheme: 'X-TEMPO', detail: `network="${net}"` } // preview-only
    },
    async settle(ctx: IssueCtx) {
      const auth = ctx.headers['authorization'] || ''
      const m = auth.match(/^Tempo\s+(.+)/i)
      if (!m) return { ok:false }

      // ⚠️ Assumption: placeholder verification; replace with official SDK/API.
      const proof = m[1]
      const ok = proof.length >= 32 && !/[^A-Za-z0-9._~\-]/.test(proof)

      if (!ok) return { ok:false }
      const payment: Rec['payment'] = {
        rail: 'tempo',
        status: 'settled',
        evidence: { provider_ids: [
          `tempo:tx:${ctx.headers['x-tempo-tx']||'demo-tx'}`,
          `tempo:chain:${ctx.headers['x-tempo-chain']||env.TEMPO_NET||'tempo-testnet'}`,
          ctx.headers['x-tempo-memo'] ? `tempo:memo:${ctx.headers['x-tempo-memo']}` : ''
        ].filter(Boolean) }
      }
      return { ok:true, payment }
    }
  }
}
```

**Registry & negotiation (configurable order)**

```ts
// pkgs/402/register.ts
import { payX402 }  from '@peac/402-x402'
import { payTempo } from '@peac/402-tempo'
import { payL402 }  from '@peac/402-l402'

export function defaultPayChain(env:any){
  const order = (env.PEAC_PAY_ORDER ?? 'x402,tempo,l402').split(',').map(s=>s.trim())
  const map = { x402: payX402(env), tempo: payTempo(env), l402: payL402(env) }
  return order.map(k => map[k]).filter(Boolean)
}
```

## Evidence mapping (normalized → provider\_ids\[])

| Source datum (Tempo) | Receipt mapping          |
| -------------------- | ------------------------ |
| Tx hash              | `tempo:tx:<hash>`        |
| Chain/network id     | `tempo:chain:<id>`       |
| Memo / reference     | `tempo:memo:<base64url>` |

Keep values **URL-safe** (base64url, no padding). Use `ext.tempo` **only** when strictly needed.

## Security & perf

* **No network by default** in preview; guard future RPC/SaaS calls with allow-lists, timeouts, and SSRF protections.
* Rate-limit 402 endpoints; cap header/body sizes; schema-validate input before logic.
* Constant-time compare for token digests; strip untrusted control chars.
* Perf budgets: **sign p95 < 10 ms**, **verify p95 < 5 ms**, **≥1k rps** on a small VM.

## Errors (verify API, RFC 9457)

* 400 `type:"about:blank"`, `title:"Invalid receipt"`, `detail:"schema violation: payment required for http-402"`.
* 401 `title:"Invalid proof"`, `detail:"Tempo proof rejected"` (adapter preview).
* 503 `title:"Rail unavailable"`, `detail:"Tempo adapter disabled"`.

## Tests (CI gates)

* **Parity:** fixtures for `rail=x402`, `rail=tempo`, `rail=l402` all pass issue/verify.
* **Negotiation:** `Accept-Payments: tempo` yields a Tempo challenge even if x402 is first.
* **Security:** reject malformed proofs; header injection attempts; oversize memos.
* **peac.txt:** ABNF validator; ≤20 lines; examples list `tempo`.

## Config

* `PEAC_PAY_ORDER=x402,tempo,l402`
* `TEMPO_NET=tempo-testnet`
* (Future) `TEMPO_RPC_URL`, `TEMPO_APP_ID` (behind feature flag)

## Rollout plan (safe)

* **0.9.12:** ship **Tempo adapter (preview)** + docs + tests; on-wire unchanged.
* **0.9.13+:** swap placeholder verification for official SDK/API; add richer evidence mapping and optional on-chain anchor events.

---

## One-liner demos (curl) - All Rails

### Tempo Rail
```bash
# 1) Get Tempo challenge
curl -i https://api.example.com/protected -H 'Accept-Payments: tempo'

# 2) Pay via Tempo (preview)
curl -i https://api.example.com/protected \
  -H 'Authorization: Tempo DEMO_PROOF_TOKEN_1234567890abcdef...' \
  -H 'X-Tempo-Tx: 0xabc123' -H 'X-Tempo-Chain: tempo-testnet' -H 'X-Tempo-Memo: SGVsbG8='

# 3) Verify receipt
peac verify --jws "<PEAC-Receipt>"
```

### x402 Rail (Coinbase)
```bash
# 1) Get x402 challenge  
curl -i https://api.example.com/protected -H 'Accept-Payments: x402'

# 2) Pay via x402/USDC
curl -i https://api.example.com/protected \
  -H 'Authorization: Bearer <x402_payment_token>' \
  -H 'X-Payment-Rail: x402' -H 'X-Payment-Tx: 0xdef456...'

# 3) Verify receipt
peac verify --jws "<PEAC-Receipt>"
```

### L402 Rail (Lightning/LSAT)
```bash
# 1) Get L402 challenge
curl -i https://api.example.com/protected -H 'Accept-Payments: l402'

# 2) Pay via Lightning Network
curl -i https://api.example.com/protected \
  -H 'Authorization: LSAT <macaroon>:<preimage>' \
  -H 'X-Lightning-Invoice: lnbc...'

# 3) Verify receipt
peac verify --jws "<PEAC-Receipt>"
```

### Stripe Rail (Traditional)
```bash
# 1) Get Stripe challenge
curl -i https://api.example.com/protected -H 'Accept-Payments: stripe'

# 2) Pay via Stripe
curl -i https://api.example.com/protected \
  -H 'Authorization: Bearer sk_test_...' \
  -H 'X-Stripe-Payment-Intent: pi_1234567890abcdef'

# 3) Verify receipt
peac verify --jws "<PEAC-Receipt>"
```

### Bridge.xyz Integration (Cross-Chain)
```bash
# 1) Get challenge with bridge preference
curl -i https://api.example.com/protected -H 'Accept-Payments: x402' \
  -H 'X-Bridge-From: ethereum' -H 'X-Bridge-To: base'

# 2) Pay via Bridge.xyz cross-chain
curl -i https://api.example.com/protected \
  -H 'Authorization: Bearer <bridge_payment_token>' \
  -H 'X-Bridge-Tx: 0x789abc...' -H 'X-Bridge-Route: eth→base→usdc'

# 3) Verify receipt (includes bridge metadata)
peac verify --jws "<PEAC-Receipt>"
```

### Multi-Rail Negotiation (Client Preference)
```bash
# Client prefers order: tempo > x402 > l402 > stripe
curl -i https://api.example.com/protected \
  -H 'Accept-Payments: tempo;q=1.0, x402;q=0.9, l402;q=0.8, stripe;q=0.7'
```

This approach gives you: stable **wire**, complete **multi-rail neutrality**, immediate **Tempo** story, **x402/Bridge.xyz cross-chain** support, and safe evolution paths for each rail as specs mature.