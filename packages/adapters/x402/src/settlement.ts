/**
 * x402 settlement-proof extraction and observation evidence (v0.12.11).
 *
 * Observational only: PEAC reads what the upstream x402 settlement proof
 * attested when present. PEAC does NOT verify scheme-specific invariants
 * (single-use, time bounds, recipient binding, facilitator binding, max-
 * vs-actual settlement correctness). Those remain the responsibility of
 * the upstream x402 protocol and the per-operator facilitator surfaces;
 * see docs/compatibility/x402-scheme-coverage.md for the three-truth-
 * surface separation.
 *
 * Header read precedence (matches the existing carrier reader at
 * src/carrier.ts):
 *   1. PEAC-Receipt           (PEAC carrier contract)
 *   2. PAYMENT-RESPONSE       (x402 v2)
 *   3. X-PAYMENT-RESPONSE     (x402 v1)
 *
 * If multiple proofs are present, all are returned in precedence order so
 * callers can record duplicates without losing fidelity.
 */

import {
  assertExplicitFinality,
  type StrictnessMode,
  type FinalityGuardOptions,
} from '@peac/adapter-core';

/** Header-bag accepted by the extractor. Lower-case keys are tried first. */
export type HeaderBag = Record<string, string | string[] | undefined>;

/** Source identifier for an extracted settlement proof. */
export type SettlementProofSource = 'PEAC-Receipt' | 'PAYMENT-RESPONSE' | 'X-PAYMENT-RESPONSE';

/** A single settlement-proof artifact extracted from response headers. */
export interface ExtractedSettlementProof {
  source: SettlementProofSource;
  /**
   * Wire version implied by the source header. PEAC-Receipt is wire-
   * neutral and reports `'peac'`; v2 reports `'v2'`; v1 reports `'v1'`.
   */
  wire_version: 'peac' | 'v2' | 'v1';
  /** The raw header value, byte-preserved. */
  raw_value: string;
}

/**
 * Extract any x402 settlement-proof artifacts from the supplied response
 * headers. Returns artifacts in dual-header precedence order (PEAC-Receipt
 * first, then PAYMENT-RESPONSE v2, then X-PAYMENT-RESPONSE v1). An empty
 * array means no settlement proof was supplied; callers MUST NOT treat
 * absence as evidence of settlement.
 *
 * Observation only: this function does not parse or verify the artifacts.
 * Scheme-specific invariants remain upstream responsibility.
 */
export function extractSettlementProofFromHeaders(headers: HeaderBag): ExtractedSettlementProof[] {
  const out: ExtractedSettlementProof[] = [];
  const lower = normalizeHeaders(headers);

  const peac = lower['peac-receipt'];
  if (peac !== undefined) {
    out.push({ source: 'PEAC-Receipt', wire_version: 'peac', raw_value: peac });
  }
  const v2 = lower['payment-response'];
  if (v2 !== undefined) {
    out.push({ source: 'PAYMENT-RESPONSE', wire_version: 'v2', raw_value: v2 });
  }
  const v1 = lower['x-payment-response'];
  if (v1 !== undefined) {
    out.push({ source: 'X-PAYMENT-RESPONSE', wire_version: 'v1', raw_value: v1 });
  }
  return out;
}

function normalizeHeaders(headers: HeaderBag): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    const key = k.toLowerCase();
    if (Array.isArray(v)) {
      out[key] = v.join(', ');
    } else {
      out[key] = v;
    }
  }
  return out;
}

/**
 * Input for fromX402SettlementObservation.
 *
 * Models a single explicit x402 settlement observation. Callers supply
 * the raw extracted proof plus the upstream-asserted offer / settlement
 * fields; the mapper performs no scheme-specific verification. PEAC will
 * reject any attempt to produce settlement evidence from offer-only data.
 */
export interface X402SettlementObservationInput {
  /** Settlement-proof artifact, e.g. one element of extractSettlementProofFromHeaders. */
  proof: ExtractedSettlementProof;
  /** x402 scheme identifier as asserted by upstream. Preserved verbatim. */
  scheme: string;
  /** Network identifier as asserted by upstream. Preserved verbatim. */
  network: string;
  /** Asset identifier as asserted by upstream. */
  asset: string;
  /** Currency code as asserted by upstream. Required in strict mode. */
  currency: string;
  /** Settled amount in minor units (smallest currency unit). */
  amount_minor: string;
  /** Environment as asserted by upstream. */
  env: 'live' | 'test';
  /** Recipient (payTo) address from the proof. Preserved verbatim. */
  pay_to?: string;
  /** Optional facilitator identifier; PEAC does not bind facilitators. */
  facilitator?: string;
  /** Optional offer reference for correlation. Observation only. */
  offer_reference?: string;
}

/** Output of fromX402SettlementObservation. */
export interface X402SettlementEvidence {
  rail: 'x402';
  reference: string;
  amount: number;
  currency: string;
  asset: string;
  env: 'live' | 'test';
  evidence: {
    commerce_event: 'settlement';
    x402_scheme: string;
    x402_network: string;
    x402_pay_to?: string;
    x402_facilitator?: string;
    x402_offer_reference?: string;
    proofs: {
      x402: {
        settlement: {
          source: SettlementProofSource;
          wire_version: 'peac' | 'v2' | 'v1';
          raw_value: string;
        };
      };
    };
  };
}

export interface X402SettlementOptions {
  mode?: StrictnessMode;
  warn?: FinalityGuardOptions['warn'];
}

/**
 * Map an explicit x402 settlement observation to PEAC commerce evidence
 * with commerce.event = 'settlement'. Routes through the mapper-boundary
 * finality-synthesis guard. Refuses synthesis from offer-only data: the
 * caller MUST supply an extracted settlement-proof artifact whose
 * wire_version is one of 'peac' | 'v2' | 'v1'. Empty input rejects in
 * all strictness modes (rule 1).
 *
 * Observation only: PEAC does not verify scheme invariants; the proof is
 * preserved verbatim under proofs.x402.settlement.
 */
export function fromX402SettlementObservation(
  input: X402SettlementObservationInput,
  options: X402SettlementOptions = {}
): X402SettlementEvidence {
  if (!input.scheme) {
    throw new Error('x402 settlement observation missing scheme');
  }
  if (!input.network) {
    throw new Error('x402 settlement observation missing network');
  }
  if (!/^-?[0-9]+$/.test(input.amount_minor)) {
    throw new Error('x402 settlement observation amount_minor must be a base-10 integer string');
  }

  const hasExplicitUpstreamArtifact =
    input.proof !== undefined &&
    typeof input.proof.raw_value === 'string' &&
    input.proof.raw_value.length > 0;

  assertExplicitFinality(
    {
      event: 'settlement',
      hasExplicitUpstreamArtifact,
      currency: input.currency,
      env: input.env,
      envExplicit: input.env === 'live' || input.env === 'test',
    },
    {
      mode: options.mode,
      warn: options.warn,
      pointer: '/proofs/x402/settlement',
    }
  );

  const amount = parseInt(input.amount_minor, 10);
  return {
    rail: 'x402',
    reference: input.offer_reference ?? input.proof.source,
    amount,
    currency: input.currency.toUpperCase(),
    asset: input.asset,
    env: input.env,
    evidence: {
      commerce_event: 'settlement',
      x402_scheme: input.scheme,
      x402_network: input.network,
      ...(input.pay_to !== undefined ? { x402_pay_to: input.pay_to } : {}),
      ...(input.facilitator !== undefined ? { x402_facilitator: input.facilitator } : {}),
      ...(input.offer_reference !== undefined
        ? { x402_offer_reference: input.offer_reference }
        : {}),
      proofs: {
        x402: {
          settlement: {
            source: input.proof.source,
            wire_version: input.proof.wire_version,
            raw_value: input.proof.raw_value,
          },
        },
      },
    },
  };
}
