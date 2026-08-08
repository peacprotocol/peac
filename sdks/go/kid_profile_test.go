package peac

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/peacprotocol/peac/sdks/go/internal/kid"
	"github.com/peacprotocol/peac/sdks/go/jws"
)

// craftWire02JWS builds a compact JWS with a caller-chosen protected header and a
// minimal valid-I-JSON payload and a placeholder signature. It exists to reach the
// verifier's kid classification with kids the issuer would refuse to emit; the
// signature is never checked because kid classification precedes signature
// verification.
func craftWire02JWS(t *testing.T, header map[string]any) string {
	t.Helper()
	hb, err := json.Marshal(header)
	if err != nil {
		t.Fatalf("marshal header: %v", err)
	}
	return jws.Encode(hb) + "." + jws.Encode([]byte(`{"a":"b"}`)) + "." + jws.Encode([]byte("sig"))
}

func TestIssue_KidContract(t *testing.T) {
	key := testSigningKey(t) // key ID "test-key-1"
	base := func() IssueOptions {
		return IssueOptions{
			Iss:        "https://example.com",
			Kind:       KindEvidence,
			Type:       "org.peacprotocol/test",
			SigningKey: key,
		}
	}

	t.Run("empty Kid uses the signing key ID and verifies", func(t *testing.T) {
		opts := base() // Kid unset
		result, err := Issue(opts)
		if err != nil {
			t.Fatalf("issue: %v", err)
		}
		vr := VerifyLocal(result.JWS, VerifyLocalOptions{PublicKey: key.PublicKey()})
		if !vr.Valid {
			t.Fatalf("verify: %s %s", vr.ErrorCode, vr.ErrorMessage)
		}
		if vr.Kid != "test-key-1" {
			t.Fatalf("kid = %q, want test-key-1", vr.Kid)
		}
	})

	t.Run("matching Kid is accepted", func(t *testing.T) {
		opts := base()
		opts.Kid = "test-key-1"
		if _, err := Issue(opts); err != nil {
			t.Fatalf("matching Kid should be accepted: %v", err)
		}
	})

	t.Run("conflicting Kid is rejected as KEY_ID_MISMATCH", func(t *testing.T) {
		opts := base()
		opts.Kid = "some-other-id"
		_, err := Issue(opts)
		ie := requireIssueError(t, err)
		if ie.Code != ErrCodeKeyIDMismatch {
			t.Fatalf("code = %q, want %q", ie.Code, ErrCodeKeyIDMismatch)
		}
	})
}

func TestIssue_AuthoritativeKeyIDMustSatisfyKidRule(t *testing.T) {
	base := func(k *jws.SigningKey) IssueOptions {
		return IssueOptions{
			Iss:        "https://example.com",
			Kind:       KindEvidence,
			Type:       "org.peacprotocol/test",
			SigningKey: k,
		}
	}

	t.Run("256-byte key ID is accepted and verifies", func(t *testing.T) {
		k, err := jws.GenerateSigningKey(strings.Repeat("a", 256))
		if err != nil {
			t.Fatalf("generate key: %v", err)
		}
		result, err := Issue(base(k))
		if err != nil {
			t.Fatalf("256-byte key ID should be accepted: %v", err)
		}
		vr := VerifyLocal(result.JWS, VerifyLocalOptions{PublicKey: k.PublicKey()})
		if !vr.Valid {
			t.Fatalf("verify: %s %s", vr.ErrorCode, vr.ErrorMessage)
		}
	})

	t.Run("257-byte key ID is rejected as INVALID_KEY_ID", func(t *testing.T) {
		k, err := jws.GenerateSigningKey(strings.Repeat("a", 257))
		if err != nil {
			t.Fatalf("generate key: %v", err)
		}
		_, err = Issue(base(k))
		ie := requireIssueError(t, err)
		if ie.Code != ErrCodeInvalidKeyID {
			t.Fatalf("code = %q, want %q", ie.Code, ErrCodeInvalidKeyID)
		}
	})

	t.Run("signing key with no key ID is rejected as MISSING_KEY_ID", func(t *testing.T) {
		_, err := Issue(base(&jws.SigningKey{})) // zero value: KeyID() == ""
		ie := requireIssueError(t, err)
		if ie.Code != ErrCodeMissingKid { // "MISSING_KEY_ID"
			t.Fatalf("code = %q, want %q", ie.Code, ErrCodeMissingKid)
		}
	})
}

func TestVerifyLocal_KidProfile(t *testing.T) {
	t.Run("missing kid is E_JWS_MISSING_KID", func(t *testing.T) {
		j := craftWire02JWS(t, map[string]any{"alg": "EdDSA", "typ": InteractionRecordTyp})
		vr := VerifyLocal(j, VerifyLocalOptions{PublicKey: make([]byte, 32)})
		if vr.ErrorCode != "E_JWS_MISSING_KID" {
			t.Fatalf("code = %q, want E_JWS_MISSING_KID (%s)", vr.ErrorCode, vr.ErrorMessage)
		}
	})

	t.Run("oversized well-formed kid is E_JWS_MISSING_KID", func(t *testing.T) {
		j := craftWire02JWS(t, map[string]any{"alg": "EdDSA", "typ": InteractionRecordTyp, "kid": strings.Repeat("a", 257)})
		vr := VerifyLocal(j, VerifyLocalOptions{PublicKey: make([]byte, 32)})
		if vr.ErrorCode != "E_JWS_MISSING_KID" {
			t.Fatalf("code = %q, want E_JWS_MISSING_KID (%s)", vr.ErrorCode, vr.ErrorMessage)
		}
	})

	t.Run("noncharacter kid is an I-JSON error, not a kid error", func(t *testing.T) {
		j := craftWire02JWS(t, map[string]any{"alg": "EdDSA", "typ": InteractionRecordTyp, "kid": "k\ufdd0"})
		vr := VerifyLocal(j, VerifyLocalOptions{PublicKey: make([]byte, 32)})
		if vr.ErrorCode != "E_IJSON_INVALID_STRING" {
			t.Fatalf("code = %q, want E_IJSON_INVALID_STRING (%s)", vr.ErrorCode, vr.ErrorMessage)
		}
	})
}

func TestSignWithType_Wire02KidGuard(t *testing.T) {
	k, err := jws.GenerateSigningKey(strings.Repeat("a", 257)) // oversized key ID
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	payload := []byte(`{"a":"b"}`)

	if _, err := k.SignWithType(payload, InteractionRecordTyp); err == nil {
		t.Fatal("SignWithType with a Wire 0.2 typ and an oversized kid should error")
	}
	// A legacy/raw typ is not gated: SignWithType stays a raw JWS primitive there.
	if _, err := k.SignWithType(payload, jws.LegacyReceiptTyp); err != nil {
		t.Fatalf("SignWithType with a legacy typ should not enforce the Wire 0.2 kid rule: %v", err)
	}
}

// The kid predicate's noncharacter table must agree with the raw I-JSON gate's, so
// a kid the issuer accepts is never one the verifier's I-JSON gate would reject for
// a different reason. Compare across the whole code-point range.
func TestKidNoncharacterMatchesIJSONGate(t *testing.T) {
	for r := rune(0); r <= 0x10FFFF; r++ {
		if kid.IsNoncharacter(r) != isUnicodeNoncharacter(r) {
			t.Fatalf("noncharacter disagreement at U+%04X: kid=%v ijson=%v", r, kid.IsNoncharacter(r), isUnicodeNoncharacter(r))
		}
	}
}
