// Package bench carries the stable benchmark subset the regression-
// aware Go benchmark gate enforces against a committed baseline.
//
// Every exported benchmark in this file is prefixed `BenchmarkVerify_Stable_`.
// The gate (scripts/go-bench-gate.mjs) only evaluates benchmarks with that
// prefix; noisy or exploratory benchmarks live elsewhere and do not
// participate in regression detection.
//
// The suite is deliberately narrow: JCS canonicalization and SHA-256
// hashing of a canonical payload, because both operations are
// deterministic, pure CPU-bound, and heavily exercised on every
// issue / verify path.
package bench

import (
	"testing"

	peac "github.com/peacprotocol/peac/sdks/go"
)

// stableInputSmall is the small canonicalization fixture. Matches the
// shape of a minimal interaction record claims object.
var stableInputSmall = []byte(`{"iss":"https://publisher.example","sub":"agent:example","iat":1735992000,"jti":"rec_abc123"}`)

// stableInputNested is the nested canonicalization fixture. Keys are
// intentionally out of sort order so the canonicalizer performs the
// full walk on every iteration.
var stableInputNested = []byte(`{
  "z_last": {"b": 2, "a": 1},
  "a_first": {"z": 26, "y": 25},
  "m_middle": [3, 1, 4, 1, 5, 9, 2, 6]
}`)

// BenchmarkVerify_Stable_JCSSmall canonicalizes a flat claims object.
// Pair with the baseline `verify_stable_jcs_small_ns_per_op` metric.
func BenchmarkVerify_Stable_JCSSmall(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, err := peac.Canonicalize(stableInputSmall)
		if err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkVerify_Stable_JCSNested canonicalizes a nested object with
// sort work at multiple levels. Pair with the baseline
// `verify_stable_jcs_nested_ns_per_op` metric.
func BenchmarkVerify_Stable_JCSNested(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, err := peac.Canonicalize(stableInputNested)
		if err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkVerify_Stable_JCSHash computes the JCS+SHA-256 hash of the
// nested fixture, exercising both canonicalization and hashing in one
// unit. Pair with the baseline `verify_stable_jcs_hash_ns_per_op`
// metric.
func BenchmarkVerify_Stable_JCSHash(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, err := peac.JCSHash(stableInputNested)
		if err != nil {
			b.Fatal(err)
		}
	}
}
