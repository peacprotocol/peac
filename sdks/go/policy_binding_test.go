package peac

import (
	"errors"
	"strings"
	"testing"

	"github.com/peacprotocol/peac/sdks/go/jws"
)

// TestComputePolicyDigest_RawInputAdmission reproduces, at the exported entry
// point, the raw-input pathologies that encoding/json would otherwise mask
// (invalid UTF-8 and lone surrogates become U+FFFD; duplicate member names keep
// the last value) and pins which of them are rejected, with which code.
func TestComputePolicyDigest_RawInputAdmission(t *testing.T) {
	cases := []struct {
		name     string
		input    []byte
		wantCode string // "" = must be accepted
	}{
		{"valid policy", []byte(`{"rule":"allow","scope":["read"]}`), ""},
		{"literal U+FFFD is a valid scalar and is accepted", []byte("{\"s\":\"\xef\xbf\xbd\"}"), ""},
		{"NFC and NFD forms are both accepted (and differ, see below)", []byte("{\"s\":\"é\"}"), ""},
		{"invalid UTF-8 byte in a VALUE", []byte("{\"s\":\"\xff\"}"), "E_IJSON_INVALID_STRING"},
		{"invalid UTF-8 byte in a KEY", []byte("{\"\xff\":1}"), "E_IJSON_INVALID_STRING"},
		{"lone high surrogate escape in a value", []byte(`{"s":"\ud83d"}`), "E_IJSON_INVALID_STRING"},
		{"lone low surrogate escape in a key", []byte(`{"\udc00":1}`), "E_IJSON_INVALID_STRING"},
		{"duplicate member name", []byte(`{"a":1,"a":2}`), "E_IJSON_DUPLICATE_MEMBER_NAME"},
		{"duplicate member name via escaped equivalent", []byte(`{"a":1,"a":2}`), "E_IJSON_DUPLICATE_MEMBER_NAME"},
		{"number beyond 2^53-1 (would round in TypeScript, keep digits in Go)", []byte(`{"n":9007199254740993}`), "E_IJSON_NUMBER_OUT_OF_RANGE"},
		{"trailing non-whitespace after the value", []byte(`{"a":1} x`), "E_INVALID_FORMAT"},
		{"not JSON", []byte(`{`), "E_INVALID_FORMAT"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			digest, err := ComputePolicyDigest(c.input)
			if c.wantCode == "" {
				if err != nil {
					t.Fatalf("expected acceptance, got %v", err)
				}
				if !strings.HasPrefix(digest, "sha256:") || len(digest) != len("sha256:")+64 {
					t.Fatalf("malformed digest %q", digest)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected rejection with %s, got digest %s", c.wantCode, digest)
			}
			var ie *ijsonError
			if !errors.As(err, &ie) {
				t.Fatalf("expected *ijsonError, got %T: %v", err, err)
			}
			if ie.Code != c.wantCode {
				t.Fatalf("code = %s, want %s (%v)", ie.Code, c.wantCode, err)
			}
			if !strings.HasPrefix(err.Error(), "policy document rejected: ") {
				t.Fatalf("error must name the policy document: %v", err)
			}
		})
	}
}

// TestComputePolicyDigest_PreservesNormalizationForm: RFC 8785 Section 3.2.2.2
// forbids Unicode normalization, so NFC and NFD spellings of the same text are
// DIFFERENT documents with DIFFERENT digests.
func TestComputePolicyDigest_PreservesNormalizationForm(t *testing.T) {
	nfc, err := ComputePolicyDigest([]byte("{\"s\":\"é\"}"))
	if err != nil {
		t.Fatal(err)
	}
	nfd, err := ComputePolicyDigest([]byte("{\"s\":\"é\"}"))
	if err != nil {
		t.Fatal(err)
	}
	if nfc == nfd {
		t.Fatalf("NFC and NFD must not collapse to one digest: %s", nfc)
	}
}

// TestComputePolicyDigest_MaskingWouldHaveCollided demonstrates WHY the raw
// gate is required: two byte-distinct inputs that encoding/json decodes to the
// same value (one contains an invalid byte the decoder would replace with
// U+FFFD; the other spells U+FFFD literally) must not share a digest. The
// literal one is accepted; the malformed one is rejected rather than aliased.
func TestComputePolicyDigest_MaskingWouldHaveCollided(t *testing.T) {
	good, err := ComputePolicyDigest([]byte("{\"s\":\"\xef\xbf\xbd\"}"))
	if err != nil {
		t.Fatal(err)
	}
	// Bypass the gate to show the collision that the gate prevents.
	aliased, err := JCSHash([]byte("{\"s\":\"\xff\"}"))
	if err != nil {
		t.Fatalf("JCSHash alone accepts the malformed byte (decoder substitution): %v", err)
	}
	if aliased != good {
		t.Fatalf("expected the unguarded path to alias the two inputs (this test documents the masking); got %s vs %s", aliased, good)
	}
	if _, err := ComputePolicyDigest([]byte("{\"s\":\"\xff\"}")); err == nil {
		t.Fatal("guarded path must reject the malformed input")
	}
}

// TestVerifyLocal_MalformedPolicyBytesFailClosed: previously a policy document
// that could not be canonicalized was swallowed (Valid=true,
// PolicyBinding=unavailable). It must now fail closed with the admission code,
// keeping "unavailable" (no policy supplied) and "failed" (digests differ)
// distinct from "the supplied policy was rejected".
func TestVerifyLocal_MalformedPolicyBytesFailClosed(t *testing.T) {
	key, _ := jws.GenerateSigningKey("key-1")
	policy := []byte(`{"rule":"allow"}`)
	digest, _ := ComputePolicyDigest(policy)
	issued, err := Issue(IssueOptions{
		Iss:        "https://issuer.example.com",
		Kind:       "evidence",
		Type:       "org.peacprotocol/agent-action-invoked-observed",
		SigningKey: key,
		Policy:     &PolicyBlock{Digest: digest},
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		name  string
		bytes []byte
		code  string
	}{
		{"invalid UTF-8", []byte("{\"rule\":\"\xff\"}"), "E_IJSON_INVALID_STRING"},
		{"duplicate keys", []byte(`{"rule":"allow","rule":"deny"}`), "E_IJSON_DUPLICATE_MEMBER_NAME"},
		{"not JSON", []byte(`nope`), "E_INVALID_FORMAT"},
	} {
		t.Run(c.name, func(t *testing.T) {
			r := VerifyLocal(issued.JWS, VerifyLocalOptions{PublicKey: key.PublicKey(), PolicyBytes: c.bytes})
			if r.Valid {
				t.Fatal("expected fail-closed on a rejected policy document")
			}
			if r.ErrorCode != c.code {
				t.Fatalf("code = %s, want %s (%s)", r.ErrorCode, c.code, r.ErrorMessage)
			}
			if r.PolicyBinding != PolicyBindingUnavailable {
				t.Fatalf("policy_binding = %s, want unavailable (nothing was compared)", r.PolicyBinding)
			}
			if !strings.Contains(r.ErrorMessage, "policy document rejected") {
				t.Fatalf("message must name the policy document: %s", r.ErrorMessage)
			}
		})
	}
	// control: the well-formed policy still verifies
	r := VerifyLocal(issued.JWS, VerifyLocalOptions{PublicKey: key.PublicKey(), PolicyBytes: policy})
	if !r.Valid || r.PolicyBinding != PolicyBindingVerified {
		t.Fatalf("control failed: valid=%v binding=%s %s", r.Valid, r.PolicyBinding, r.ErrorMessage)
	}
}
