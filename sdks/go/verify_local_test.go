package peac

import (
	"testing"
	"time"

	"github.com/peacprotocol/peac/sdks/go/jws"
)

func TestVerifyLocal_Valid(t *testing.T) {
	key, _ := jws.GenerateSigningKey("test-key-1")
	issued, err := Issue(IssueOptions{
		Iss:        "https://example.com",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/test",
		SigningKey: key,
		Clock:      FixedClock{Time: time.Now()},
	})
	if err != nil {
		t.Fatal(err)
	}

	result := VerifyLocal(issued.JWS, VerifyLocalOptions{
		PublicKey: key.PublicKey(),
	})

	if !result.Valid {
		t.Fatalf("expected valid, got error: %s: %s", result.ErrorCode, result.ErrorMessage)
	}
	if result.Claims.Iss != "https://example.com" {
		t.Errorf("iss = %s, want https://example.com", result.Claims.Iss)
	}
	if result.Kid != "test-key-1" {
		t.Errorf("kid = %s, want test-key-1", result.Kid)
	}
	if result.WireVersion != PeacVersion {
		t.Errorf("wire_version = %s, want %s", result.WireVersion, PeacVersion)
	}
	if result.ReceiptRef == "" || result.ReceiptRef[:7] != "sha256:" {
		t.Errorf("receipt_ref = %s, want sha256:...", result.ReceiptRef)
	}
	if result.PolicyBinding != PolicyBindingUnavailable {
		t.Errorf("policy_binding = %s, want unavailable", result.PolicyBinding)
	}
}

func TestVerifyLocal_InvalidSignature(t *testing.T) {
	key1, _ := jws.GenerateSigningKey("key-1")
	key2, _ := jws.GenerateSigningKey("key-2")
	issued, _ := Issue(IssueOptions{
		Iss:        "https://example.com",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/test",
		SigningKey: key1,
	})

	result := VerifyLocal(issued.JWS, VerifyLocalOptions{
		PublicKey: key2.PublicKey(), // wrong key
	})
	if result.Valid {
		t.Fatal("expected invalid for wrong key")
	}
	if result.ErrorCode != "E_INVALID_SIGNATURE" {
		t.Errorf("code = %s, want E_INVALID_SIGNATURE", result.ErrorCode)
	}
}

func TestVerifyLocal_Expired(t *testing.T) {
	key, _ := jws.GenerateSigningKey("key-1")
	issued, _ := Issue(IssueOptions{
		Iss:        "https://example.com",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/test",
		SigningKey: key,
		Exp:        time.Now().Add(-1 * time.Hour).Unix(), // expired 1 hour ago
		Clock:      FixedClock{Time: time.Now().Add(-2 * time.Hour)},
	})

	result := VerifyLocal(issued.JWS, VerifyLocalOptions{
		PublicKey: key.PublicKey(),
	})
	if result.Valid {
		t.Fatal("expected invalid for expired receipt")
	}
	if result.ErrorCode != "E_EXPIRED" {
		t.Errorf("code = %s, want E_EXPIRED", result.ErrorCode)
	}
}

func TestVerifyLocal_IssuerMismatch(t *testing.T) {
	key, _ := jws.GenerateSigningKey("key-1")
	issued, _ := Issue(IssueOptions{
		Iss:        "https://example.com",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/test",
		SigningKey: key,
	})

	result := VerifyLocal(issued.JWS, VerifyLocalOptions{
		PublicKey: key.PublicKey(),
		Issuer:    "https://other.example.com",
	})
	if result.Valid {
		t.Fatal("expected invalid for issuer mismatch")
	}
	if result.ErrorCode != "E_INVALID_ISSUER" {
		t.Errorf("code = %s, want E_INVALID_ISSUER", result.ErrorCode)
	}
}

func TestVerifyLocal_PolicyBindingVerified(t *testing.T) {
	key, _ := jws.GenerateSigningKey("key-1")
	policy := []byte(`{"rule": "allow"}`)
	policyDigest, _ := ComputePolicyDigest(policy)

	issued, _ := Issue(IssueOptions{
		Iss:        "https://example.com",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/test",
		SigningKey: key,
		Policy:     &PolicyBlock{Digest: policyDigest},
	})

	result := VerifyLocal(issued.JWS, VerifyLocalOptions{
		PublicKey:   key.PublicKey(),
		PolicyBytes: policy,
	})
	if !result.Valid {
		t.Fatalf("expected valid, got: %s: %s", result.ErrorCode, result.ErrorMessage)
	}
	if result.PolicyBinding != PolicyBindingVerified {
		t.Errorf("policy_binding = %s, want verified", result.PolicyBinding)
	}
}

func TestVerifyLocal_PolicyBindingFailed(t *testing.T) {
	key, _ := jws.GenerateSigningKey("key-1")
	issued, _ := Issue(IssueOptions{
		Iss:        "https://example.com",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/test",
		SigningKey: key,
		Policy:     &PolicyBlock{Digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000"},
	})

	result := VerifyLocal(issued.JWS, VerifyLocalOptions{
		PublicKey:   key.PublicKey(),
		PolicyBytes: []byte(`{"rule": "deny"}`),
	})
	if result.Valid {
		t.Fatal("expected invalid for policy mismatch")
	}
	if result.ErrorCode != "E_POLICY_BINDING_FAILED" {
		t.Errorf("code = %s, want E_POLICY_BINDING_FAILED", result.ErrorCode)
	}
}

func TestVerifyLocal_RejectsWire01(t *testing.T) {
	key, _ := jws.GenerateSigningKey("key-1")
	// Sign with Wire 0.1 typ
	payload := []byte(`{"iss":"https://example.com","iat":1700000000}`)
	jwsStr, _ := key.SignWithType(payload, "peac-receipt/0.1")

	result := VerifyLocal(jwsStr, VerifyLocalOptions{
		PublicKey: key.PublicKey(),
	})
	if result.Valid {
		t.Fatal("expected invalid for Wire 0.1 typ")
	}
	if result.ErrorCode != "E_UNSUPPORTED_WIRE_VERSION" {
		t.Errorf("code = %s, want E_UNSUPPORTED_WIRE_VERSION", result.ErrorCode)
	}
}

func TestVerifyLocal_JOSEHardening(t *testing.T) {
	// These tests verify JOSE hardening rejects unsafe headers.
	// Since we can't easily inject custom headers through Issue(),
	// we test the checkJOSEHardening function directly.
	tests := []struct {
		name    string
		header  string
		wantErr bool
	}{
		{"clean header", `{"alg":"EdDSA","kid":"k1","typ":"interaction-record+jwt"}`, false},
		{"reject jwk", `{"alg":"EdDSA","kid":"k1","typ":"interaction-record+jwt","jwk":{}}`, true},
		{"reject x5c", `{"alg":"EdDSA","kid":"k1","typ":"interaction-record+jwt","x5c":[]}`, true},
		{"reject crit", `{"alg":"EdDSA","kid":"k1","typ":"interaction-record+jwt","crit":["b64"]}`, true},
		{"reject b64:false", `{"alg":"EdDSA","kid":"k1","typ":"interaction-record+jwt","b64":false}`, true},
		{"reject zip", `{"alg":"EdDSA","kid":"k1","typ":"interaction-record+jwt","zip":"DEF"}`, true},
		{"allow b64:true", `{"alg":"EdDSA","kid":"k1","typ":"interaction-record+jwt","b64":true}`, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := checkJOSEHardening([]byte(tc.header))
			if (err != nil) != tc.wantErr {
				t.Errorf("checkJOSEHardening() err = %v, wantErr %v", err, tc.wantErr)
			}
		})
	}
}

func TestVerifyLocal_ReceiptRefMatchesSHA256(t *testing.T) {
	key, _ := jws.GenerateSigningKey("key-1")
	issued, _ := Issue(IssueOptions{
		Iss:        "https://example.com",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/test",
		SigningKey: key,
	})

	result := VerifyLocal(issued.JWS, VerifyLocalOptions{
		PublicKey: key.PublicKey(),
	})
	if !result.Valid {
		t.Fatal("expected valid")
	}
	if len(result.ReceiptRef) != 71 {
		t.Errorf("receipt_ref length = %d, want 71", len(result.ReceiptRef))
	}
}
