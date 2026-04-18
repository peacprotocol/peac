# Reference verifier — deployment recipes

The OSS reference verifier lives at [`apps/api/`](../../apps/api/). It is self-hostable, tenantless, and carries no managed-service SLA. The contract is documented at [`packages/schema/openapi/verify.yaml`](../../packages/schema/openapi/verify.yaml) and [`docs/HOSTED_VERIFY_CONTRACT.md`](../../docs/HOSTED_VERIFY_CONTRACT.md).

This directory carries lightweight deployment recipes for running the reference verifier yourself.

| Recipe                                     | Use when                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| [`Dockerfile`](Dockerfile)                 | Build a container image of the reference verifier.                        |
| [`docker-compose.yml`](docker-compose.yml) | Run the reference verifier locally for development with a single command. |
| [`cloudflare/`](cloudflare/)               | Deploy the reference verifier as a Cloudflare Worker.                     |
| [`smoke.sh`](smoke.sh)                     | End-to-end smoke test; brings up the container and hits `/v1/verify`.     |

## Quick start

Build and run with Docker Compose:

```bash
cd surfaces/reference-verifier
docker compose up -d
curl -s http://localhost:3000/health
```

Run the smoke script:

```bash
bash smoke.sh
```

Build a standalone image:

```bash
docker build -f Dockerfile -t peac-reference-verifier:local ../..
docker run --rm -p 3000:3000 peac-reference-verifier:local
```

Deploy as a Cloudflare Worker:

```bash
cd cloudflare
npx wrangler deploy
```

## Scope

The reference verifier is an offline-first verification service. It does not require any database, cache, or persistent state beyond an optional JWKS cache. SSRF-safe fetches bound every outbound request.

The recipes here are sufficient for local evaluation, development, CI smoke tests, and single-tenant self-hosted deployments. Multi-tenant hosted operation (SLA, billing, authenticated access, logging plane, multi-region failover) is out of scope for these recipes.

For the normative runtime contract, see [`packages/schema/openapi/verify.yaml`](../../packages/schema/openapi/verify.yaml). For the security model, see [`apps/api/THREATS.md`](../../apps/api/THREATS.md).
