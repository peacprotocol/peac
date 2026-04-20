# Case study: {external-party-name}

**External party:** `{party-name}`
**Integration surface:** `{api-verify | api-issue | mcp-tool-call | a2a | x402 | acp | commerce-evidence | runtime-governance-export}`
**Verifiable artifact:** `{public URL, signed record URL, or pinned commit SHA}`
**Captured on:** `{YYYY-MM-DD}`
**Re-verified on:** `{YYYY-MM-DD}`

## Context

One short paragraph describing what the external party does and why PEAC is in the picture. Keep it neutral and factual. Do not infer intent or attribute future commitments to the party.

## What the artifact attests

Name the specific PEAC primitive the external party exercises. For example: "Party X issues a signed PEAC record on every API response, with a declared purpose and the receipt carried in the `PEAC-Receipt` response header." Describe only what the captured artifact proves; do not extrapolate.

## Evaluator reproduction

Step-by-step instructions a third party can run end to end without access to internal tooling. Prefer commands over prose.

```bash
# Example (verify a captured record)
curl -s https://example.com/peac/sample-record.jws > sample-record.jws
node -e "
  const fs = require('fs');
  const jws = fs.readFileSync('sample-record.jws', 'utf8').trim();
  fetch('http://localhost:3000/v1/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ receipt: jws }),
  }).then((r) => r.json()).then(console.log);
"
```

## Admissibility checklist (enforced by docs/case-studies/README.md)

- [ ] External party named above is independent of Originary.
- [ ] Verifiable artifact above is a public URL or a signed record that verifies against a non-PEAC-authored issuer.
- [ ] Integration surface is one of the named surfaces.
- [ ] Evaluator reproduction is runnable by a third party.

## References

- [`docs/case-studies/README.md`](README.md) admissibility rules.
- [`docs/release-notes/`](../release-notes/) per-release external-proof summaries.
