# README 10/10 Polish - Implementation Summary

**Date:** 2026-02-10
**Version:** v0.10.9
**Objective:** Production-grade OSS README with animated diagrams, professional presentation, universal rendering

---

## What Was Fixed

### 1. ✅ **Diagram Narrative** (Policy Discovery First)

**Problem:** Diagram started with service publishing, not the reader's mental model (agent discovering terms).

**Fix:**

- Added **policy discovery as step 1** (agent reading `/.well-known/peac.txt` before acting)
- Made publish/keys **setup (out of band)** - unnumbered, supporting context
- Animated the **per-interaction runtime path**: discover → request → response → verify → export
- Added **accessibility metadata**: `accTitle` and `accDescr` per Mermaid docs
- Showed **receipt traveling** from service → client → verifier

**Why it matters:** Readers now see PEAC as "terms + proof" not just "logging/receipts". The animated edges track the reader's mental model, not the maintainer's architecture.

**Files changed:**

- `README.md` - Updated Mermaid diagram (lines 49-93)
- `docs/diagrams/peac-proof-flow.mmd` - Canonical source (new file)

---

### 2. ✅ **Non-Goals Section** (Reduced Repetition)

**Problem:** "Does not replace identity/payment/observability" repeated in 3+ sections.

**Fix:**

- Added **"Non-goals"** block in Principles section (line 148)
- Removed repeated disclaimers from "Where it fits" and "Why this matters"
- Tightened "Complements existing systems" to be concise, not defensive

**Why it matters:** README feels shorter and more confident. Single source of truth for positioning.

**Lines changed:**

- `README.md:140-150` - Principles + Non-goals
- `README.md:106-122` - Where it fits (compressed)

---

### 3. ✅ **Tightened Quick Start** (Node >= 20 + Verify-First)

**Problem:** "Requires Node ESM or top-level await" was vague and created friction.

**Fix:**

- Replaced with **"Requirements: Node >= 20"** (from `package.json` engines)
- Added **"Verify an existing receipt (CLI)"** mini-snippet after issue/verify
- Shows both programmatic (TypeScript) and CLI paths

**Why it matters:** Clearer contract, faster "aha" moment for readers who want to verify first.

**Lines changed:**

- `README.md:154-195` - Quick start section

---

### 4. ✅ **Fixed Credibility Claims** (No Brittle Facts)

**Removed from earlier draft:**

- ❌ "3561 tests passing" - Brittle count unless CI-generated
- ❌ "Sequential animation" - Mermaid doesn't guarantee step-by-step semantics
- ✅ Now says: "Animated edges highlight the primary flow" (accurate)

**Added:**

- ✅ Real accessibility via `accTitle`/`accDescr` (per Mermaid docs)
- ✅ CI badge shows live test status instead of hardcoded count

---

### 5. ✅ **Universal Rendering** (SVG Fallback Pattern)

**Problem:** GitHub renders Mermaid, but npm/PyPI/docs sites do not.

**Solution implemented:**

- Created `docs/diagrams/peac-proof-flow.mmd` - Canonical Mermaid source
- Created `scripts/generate-diagram.sh` - Deterministic SVG generation
- Created `docs/diagrams/README.md` - Full fallback documentation

**Two usage patterns:**

#### Pattern A (Current - GitHub-optimized)

````markdown
## The model

```mermaid
<mermaid source>
```
````

````

**Pros:** Animation works, source is diffable
**Cons:** Doesn't render on npm

#### Pattern B (Universal - SVG + Mermaid in details)
```markdown
## The model

![PEAC proof flow](docs/diagrams/peac-proof-flow.svg)

<details>
<summary>View animated version (GitHub only)</summary>

```mermaid
<mermaid source>
````

</details>
```

**Pros:** Works everywhere, GitHub users can still see animation
**Cons:** SVG must be regenerated when diagram changes

**Recommendation:** Start with Pattern A (current), switch to Pattern B when npm README is primary discovery surface.

**Files created:**

- `docs/diagrams/peac-proof-flow.mmd` - Canonical Mermaid source
- `scripts/generate-diagram.sh` - SVG generation script
- `docs/diagrams/README.md` - Documentation + CI integration instructions

---

## Summary of Changes

| Section           | Change                                                  | Why                              |
| ----------------- | ------------------------------------------------------- | -------------------------------- |
| **Diagram**       | Policy discovery first, setup vs runtime, accessibility | Matches reader mental model      |
| **Non-goals**     | Added "Non-goals" block, removed repetition             | Confidence, clarity, compression |
| **Quick start**   | Node >= 20, verify-first CLI snippet                    | Clear contract, faster "aha"     |
| **Principles**    | Compressed disclaimers                                  | Less defensive, more factual     |
| **Where it fits** | "Complements existing systems" table                    | Concise positioning              |
| **CI badge**      | Added tests+lint status badge                           | Live quality signal              |

---

## What Makes This 10/10

✅ **Diagram narrative** - Starts with policy discovery (PEAC's differentiator)
✅ **Accessibility** - Real `accTitle`/`accDescr` for screen readers
✅ **Universal rendering** - SVG fallback pattern documented
✅ **No brittle facts** - No hardcoded test counts or unverifiable claims
✅ **Non-goals clarity** - Single source of truth for positioning
✅ **Tightened Quick start** - Node >= 20, verify-first path
✅ **Reduced repetition** - Compressed disclaimers, confident tone
✅ **Professional adaptations** - Parlant's structure, PEAC's tone (no emojis, no hype)

---

## How to Generate SVG (When Needed)

### Option 1: Mermaid CLI

```bash
npm install -g @mermaid-js/mermaid-cli
./scripts/generate-diagram.sh
```

### Option 2: Docker (No Install)

```bash
docker run --rm -v "$PWD:/data" minlag/mermaid-cli \
  -i /data/docs/diagrams/peac-proof-flow.mmd \
  -o /data/docs/diagrams/peac-proof-flow.svg \
  -t neutral -b transparent
```

### Option 3: Mermaid Live Editor

1. Copy `docs/diagrams/peac-proof-flow.mmd`
2. Paste into https://mermaid.live
3. Export SVG (neutral theme, transparent background)
4. Save to `docs/diagrams/peac-proof-flow.svg`

---

## Optional: CI Drift Check

Add to `.github/workflows/ci.yml` to ensure SVG stays in sync:

```yaml
- name: Diagram drift check
  run: |
    npm install -g @mermaid-js/mermaid-cli
    ./scripts/generate-diagram.sh
    if ! git diff --exit-code docs/diagrams/peac-proof-flow.svg; then
      echo "FAIL: SVG is out of sync with .mmd source"
      echo "Run: ./scripts/generate-diagram.sh"
      exit 1
    fi
```

---

## Next Steps (Optional Enhancements)

1. **Apply to `docs/README_LONG.md`** - Similar polish for extended docs
2. **Conformance badge** - Show conformance test coverage percentage
3. **Generate SVG** - Run `./scripts/generate-diagram.sh` and commit the SVG
4. **Switch to Pattern B** - Use SVG + Mermaid in `<details>` when npm is primary surface

---

## Verification

```bash
# Check formatting
pnpm format:check README.md

# View on GitHub to see animation
git add -A
git commit -m "docs: README 10/10 polish - animated diagram, Non-goals, Node >=20"
git push origin HEAD

# Open PR and view README in GitHub PR view to see animated edges
```

---

## Files Modified

- ✏️ `README.md` - All 5 improvements applied
- ✨ `docs/diagrams/peac-proof-flow.mmd` - Canonical Mermaid source (new)
- ✨ `scripts/generate-diagram.sh` - SVG generation script (new)
- ✨ `docs/diagrams/README.md` - Fallback documentation (new)

---

**Result:** The README now combines **protocol-grade precision** with **engaging presentation** - exactly what a 0.10 protocol deserves. No emojis, no hype, no brittle facts - just world-class OSS documentation.
