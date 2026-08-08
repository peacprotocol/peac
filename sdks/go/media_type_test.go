package peac

import (
	"strings"
	"testing"

	"github.com/peacprotocol/peac/sdks/go/jws"
)

func TestNormalizeWire02Typ(t *testing.T) {
	cases := map[string]string{
		// Both accepted spellings normalize to the canonical compact form, case-insensitively.
		InteractionRecordTyp:                 InteractionRecordTyp,
		"Interaction-Record+JWT":             InteractionRecordTyp,
		InteractionRecordTypMediaType:        InteractionRecordTyp,
		"Application/Interaction-Record+JWT": InteractionRecordTyp,
		// Not accepted: parameters not parsed, whitespace not normalized, other typ unchanged.
		"application/interaction-record+jwt; x=1": "application/interaction-record+jwt; x=1",
		" interaction-record+jwt ":                " interaction-record+jwt ",
		"peac-receipt/0.1":                        "peac-receipt/0.1",
		"":                                        "",
	}
	for in, want := range cases {
		if got := normalizeWire02Typ(in); got != want {
			t.Fatalf("normalizeWire02Typ(%q) = %q, want %q", in, got, want)
		}
	}
}

// The comparison is ASCII case folding, not Unicode case folding: the Kelvin sign
// (U+212A) folds to 'k' under Unicode but must not match ASCII 'k' here. A non-ASCII
// typ is therefore never accepted.
func TestNormalizeWire02Typ_IsASCIIFoldNotUnicode(t *testing.T) {
	const kelvin = "\u212a"
	if asciiEqualFold(kelvin, "k") {
		t.Fatal("asciiEqualFold must not fold the Kelvin sign to ASCII k")
	}
	if !strings.EqualFold(kelvin, "k") {
		t.Fatal("precondition: strings.EqualFold folds Kelvin to k (Unicode folding)")
	}
	nonASCII := "\u212anteraction-record+jwt" // Kelvin sign in place of leading 'i'-ish
	if got := normalizeWire02Typ(nonASCII); got != nonASCII {
		t.Fatalf("a non-ASCII typ must be returned unchanged, got %q", got)
	}
}

// A verifier must accept the full media-type form and treat it as the compact form.
// A mixed-case full form exercises the case-insensitive ASCII comparison end to end.
// Built by signing valid claims under that typ, which issuers do not emit.
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
	full, err := key.SignWithType(payload, "Application/Interaction-Record+JWT")
	if err != nil {
		t.Fatalf("sign full media type: %v", err)
	}
	vr := VerifyLocal(full, VerifyLocalOptions{PublicKey: key.PublicKey()})
	if !vr.Valid {
		t.Fatalf("mixed-case full media-type record should verify: %s %s", vr.ErrorCode, vr.ErrorMessage)
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
