package peac

import (
	"testing"
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
		{"policy.digest", "policy.digest", func(o *IssueOptions) { o.Policy = &PolicyBlock{Digest: badByte} }},
		{"ext value", "ext.k", func(o *IssueOptions) { o.Extensions = map[string]any{"k": badByte} }},
		{"ext member name", "ext (member name)", func(o *IssueOptions) { o.Extensions = map[string]any{badByte: "v"} }},
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

// Classes that survive marshaling as valid JSON (Unicode noncharacters and numbers whose magnitude
// exceeds the safe range) are rejected by the post-marshal I-JSON gate, the same gate the verifier
// applies. Without it the issuer could emit a payload its own VerifyLocal rejects.
func TestIssue_RejectsNonIJSONPayload(t *testing.T) {
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
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			opts := base()
			tc.mutate(&opts)
			_, err := Issue(opts)
			ie := requireIssueError(t, err)
			if ie.Code != ErrCodeNonIJSONPayload {
				t.Fatalf("code = %q, want %q (msg: %s)", ie.Code, ErrCodeNonIJSONPayload, ie.Message)
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
	err := validateExtUTF8(map[string]any{"x": 42}) // Go int, not a JSON builtin
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
