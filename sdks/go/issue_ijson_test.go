package peac

import (
	"testing"
	"time"
)

// A record the issuer accepts must be admitted by the same SDK's verifier. Non-ASCII but
// well-formed values (accented text, CJK, an emoji) round-trip. Written with escapes so the code
// points do not depend on source encoding.
func TestIssue_UTF8RoundTripSymmetry(t *testing.T) {
	key := testSigningKey(t)
	result, err := Issue(IssueOptions{
		Iss:        "https://example.com",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/test",
		SigningKey: key,
		Kid:        "test-key-1",
		Sub:        "https://sub.example.com/caf\u00e9",
		Extensions: map[string]any{
			"note":   "caf\u00e9 \U0001F600",
			"\u00e9": "value",
			"nested": map[string]any{
				"list": []any{"a", "\u4e2d\u6587", true, float64(42)},
			},
		},
	})
	if err != nil {
		t.Fatalf("valid non-ASCII issuance failed: %v", err)
	}
	vr := VerifyLocal(result.JWS, VerifyLocalOptions{PublicKey: key.PublicKey()})
	if !vr.Valid {
		t.Fatalf("issued record did not verify: %s %s", vr.ErrorCode, vr.ErrorMessage)
	}
}

// Invalid UTF-8 in any caller-controlled claim string is rejected before marshaling, with the field
// path, so encoding/json cannot silently replace it with U+FFFD and sign a mutated identifier.
func TestIssue_RejectsInvalidUTF8(t *testing.T) {
	key := testSigningKey(t)
	const badByte = "\xff" // a lone 0xFF is not valid UTF-8

	base := func() IssueOptions {
		return IssueOptions{
			Iss:        "https://example.com",
			Kind:       KindEvidence,
			Type:       "org.peacprotocol/test",
			SigningKey: key,
			Kid:        "test-key-1",
		}
	}

	cases := []struct {
		name   string
		field  string
		mutate func(*IssueOptions)
	}{
		{"iss", "iss", func(o *IssueOptions) { o.Iss = "https://example.com/" + badByte }},
		{"sub", "sub", func(o *IssueOptions) { o.Sub = "https://sub.example.com/" + badByte }},
		{"type", "type", func(o *IssueOptions) { o.Type = "org.peacprotocol/" + badByte }},
		{"actor.id", "actor.id", func(o *IssueOptions) { o.Actor = &ActorBinding{ID: "urn:actor:" + badByte} }},
		{"actor.role", "actor.role", func(o *IssueOptions) {
			o.Actor = &ActorBinding{ID: "urn:actor:ok", Role: badByte}
		}},
		{"actor.proof_types[0]", "actor.proof_types[0]", func(o *IssueOptions) {
			o.Actor = &ActorBinding{ID: "urn:actor:ok", ProofTypes: []string{badByte}}
		}},
		{"policy.digest", "policy.digest", func(o *IssueOptions) { o.Policy = &PolicyBlock{Digest: badByte} }},
		{"policy.uri", "policy.uri", func(o *IssueOptions) {
			o.Policy = &PolicyBlock{Digest: "sha-256:ok", URI: badByte}
		}},
		{"policy.version", "policy.version", func(o *IssueOptions) {
			o.Policy = &PolicyBlock{Digest: "sha-256:ok", Version: badByte}
		}},
		{"ext value", "ext.k", func(o *IssueOptions) { o.Extensions = map[string]any{"k": badByte} }},
		{"ext member name", "ext (member name)", func(o *IssueOptions) { o.Extensions = map[string]any{badByte: "v"} }},
		{"nested ext value", "ext.outer.inner", func(o *IssueOptions) {
			o.Extensions = map[string]any{"outer": map[string]any{"inner": badByte}}
		}},
		{"nested ext member name", "ext.outer (member name)", func(o *IssueOptions) {
			o.Extensions = map[string]any{"outer": map[string]any{badByte: "v"}}
		}},
		{"rid via custom generator", "rid", func(o *IssueOptions) { o.IDGen = NewFixedIDGenerator("rid-" + badByte) }},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			opts := base()
			tc.mutate(&opts)
			_, err := Issue(opts)
			ie := requireIssueError(t, err)
			if ie.Code != ErrCodeInvalidUTF8 {
				t.Fatalf("code = %q, want %q", ie.Code, ErrCodeInvalidUTF8)
			}
			if ie.Field != tc.field {
				t.Fatalf("field = %q, want %q", ie.Field, tc.field)
			}
		})
	}
}

// Classes that survive marshaling as valid JSON (Unicode noncharacters, which RFC 7493 forbids, and
// numbers outside the safe numeric range, which PEAC's stricter admission rule rejects) fail the
// PEAC raw JSON admission profile gate, the same gate the verifier applies. Without it the issuer
// could emit a payload its own VerifyLocal rejects. The injectable clock and exp cases show a
// generated numeric input reaching the gate, the numeric analogue of the custom rid generator.
func TestIssue_RejectsInvalidJSONProfile(t *testing.T) {
	key := testSigningKey(t)
	base := func() IssueOptions {
		return IssueOptions{
			Iss:        "https://example.com",
			Kind:       KindEvidence,
			Type:       "org.peacprotocol/test",
			SigningKey: key,
			Kid:        "test-key-1",
		}
	}

	cases := []struct {
		name   string
		mutate func(*IssueOptions)
	}{
		{"noncharacter in ext string (valid UTF-8, not I-JSON)", func(o *IssueOptions) {
			o.Extensions = map[string]any{"k": "x\ufdd0"}
		}},
		{"noncharacter in type", func(o *IssueOptions) {
			o.Type = "org.peacprotocol/x\uffff"
		}},
		{"ext float64 magnitude above the safe range", func(o *IssueOptions) {
			o.Extensions = map[string]any{"n": 1e300}
		}},
		{"exp int64 above the safe range", func(o *IssueOptions) {
			o.Exp = int64(1) << 60
		}},
		{"iat above the safe range via a custom clock", func(o *IssueOptions) {
			o.Clock = FixedClock{Time: time.Unix(int64(1)<<60, 0)}
		}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			opts := base()
			tc.mutate(&opts)
			_, err := Issue(opts)
			ie := requireIssueError(t, err)
			if ie.Code != ErrCodeInvalidJSONProfile {
				t.Fatalf("code = %q, want %q (msg: %s)", ie.Code, ErrCodeInvalidJSONProfile, ie.Message)
			}
		})
	}
}

// A record that would previously verify only because its identifier was mutated to U+FFFD now fails
// closed at issuance instead. The symmetry guarantee: no emitted record, no silent mutation.
func TestIssue_InvalidUTF8NeverEmitsMutatedRecord(t *testing.T) {
	key := testSigningKey(t)
	_, err := Issue(IssueOptions{
		Iss:        "https://example.com",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/test",
		SigningKey: key,
		Kid:        "test-key-1",
		IDGen:      NewFixedIDGenerator("rid-\xff-mutated"),
	})
	if err == nil {
		t.Fatal("expected issuance to reject an invalid-UTF-8 rid, but it succeeded")
	}
}

// The extension walk fails closed on any value type outside the JSON builtins. In the Issue() flow
// evidence.ValidateValue rejects such types first; this exercises the walk's own defensive branch
// directly so it cannot be silently skipped.
func TestValidateExtUTF8_FailsClosedOnUnexpectedType(t *testing.T) {
	err := validateExtUTF8(map[string]any{"x": 42}, 100000) // Go int, not a JSON builtin
	ie := requireIssueError(t, err)
	if ie.Code != ErrCodeInvalidType {
		t.Fatalf("code = %q, want %q", ie.Code, ErrCodeInvalidType)
	}
}

// The walk honors the node ceiling it is given rather than an internal default, so a caller that
// raises EvidenceLimits.MaxTotalNodes is not silently capped by a second constant.
func TestValidateExtUTF8_HonorsSuppliedNodeLimit(t *testing.T) {
	ext := map[string]any{"a": "x", "b": "y", "c": "z"} // root map plus three entries

	if err := validateExtUTF8(ext, 100000); err != nil {
		t.Fatalf("a generous limit should accept a small valid graph: %v", err)
	}

	err := validateExtUTF8(ext, 1) // one node allowed; the graph has more
	ie := requireIssueError(t, err)
	if ie.Code != ErrCodeInvalidType {
		t.Fatalf("code = %q, want %q", ie.Code, ErrCodeInvalidType)
	}
}

func requireIssueError(t *testing.T, err error) *IssueError {
	t.Helper()
	if err == nil {
		t.Fatal("expected an error, got nil")
	}
	ie, ok := err.(*IssueError)
	if !ok {
		t.Fatalf("error type = %T, want *IssueError (%v)", err, err)
	}
	return ie
}
