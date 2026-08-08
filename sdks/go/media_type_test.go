package peac

import (
	"strings"
	"testing"

	"github.com/peacprotocol/peac/sdks/go/jws"
)

func TestNormalizeWire02Typ(t *testing.T) {
	cases := map[string]string{
		InteractionRecordTyp:                      InteractionRecordTyp,
		InteractionRecordTypMediaType:             InteractionRecordTyp,
		"application/interaction-record+jwt; x=1": "application/interaction-record+jwt; x=1", // parameters not parsed
		"peac-receipt/0.1":                        "peac-receipt/0.1",
		"":                                        "",
	}
	for in, want := range cases {
		if got := normalizeWire02Typ(in); got != want {
			t.Fatalf("normalizeWire02Typ(%q) = %q, want %q", in, got, want)
		}
	}
}

// A verifier must accept the full media-type form and treat it as the compact form.
// Built by signing valid claims under the full typ, which issuers do not emit.
func TestVerifyLocal_AcceptsFullMediaType(t *testing.T) {
	key := testSigningKey(t)
	result, err := Issue(IssueOptions{Iss: "https://example.com", Kind: KindEvidence, Type: "org.peacprotocol/test", SigningKey: key})
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	payload, err := jws.Decode(strings.Split(result.JWS, ".")[1])
	if err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	full, err := key.SignWithType(payload, InteractionRecordTypMediaType)
	if err != nil {
		t.Fatalf("sign full media type: %v", err)
	}
	vr := VerifyLocal(full, VerifyLocalOptions{PublicKey: key.PublicKey()})
	if !vr.Valid {
		t.Fatalf("full media-type record should verify: %s %s", vr.ErrorCode, vr.ErrorMessage)
	}
}

// The compact form still verifies (regression).
func TestVerifyLocal_AcceptsCompactTyp(t *testing.T) {
	key := testSigningKey(t)
	result, err := Issue(IssueOptions{Iss: "https://example.com", Kind: KindEvidence, Type: "org.peacprotocol/test", SigningKey: key})
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	vr := VerifyLocal(result.JWS, VerifyLocalOptions{PublicKey: key.PublicKey()})
	if !vr.Valid {
		t.Fatalf("compact record should verify: %s %s", vr.ErrorCode, vr.ErrorMessage)
	}
}

// A parameterized media type is not accepted: parameters are not parsed, so it is an
// unrecognized typ and the record is rejected.
func TestVerifyLocal_RejectsParameterizedMediaType(t *testing.T) {
	key := testSigningKey(t)
	result, err := Issue(IssueOptions{Iss: "https://example.com", Kind: KindEvidence, Type: "org.peacprotocol/test", SigningKey: key})
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	payload, err := jws.Decode(strings.Split(result.JWS, ".")[1])
	if err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	param, err := key.SignWithType(payload, InteractionRecordTypMediaType+"; charset=utf-8")
	if err != nil {
		t.Fatalf("sign parameterized typ: %v", err)
	}
	vr := VerifyLocal(param, VerifyLocalOptions{PublicKey: key.PublicKey()})
	if vr.Valid {
		t.Fatal("parameterized media type should be rejected")
	}
}
