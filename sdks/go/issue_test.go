package peac

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/peacprotocol/peac/sdks/go/jws"
)

func testSigningKey(t *testing.T) *jws.SigningKey {
	t.Helper()
	key, err := jws.GenerateSigningKey("test-key-1")
	if err != nil {
		t.Fatal(err)
	}
	return key
}

func TestIssue_Valid(t *testing.T) {
	key := testSigningKey(t)
	result, err := Issue(IssueOptions{
		Iss:        "https://example.com",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/test",
		SigningKey: key,
		Kid:        "test-key-1",
		Clock:      FixedClock{Time: time.Unix(1700000000, 0)},
	})
	if err != nil {
		t.Fatalf("Issue() failed: %v", err)
	}
	if result.JWS == "" {
		t.Fatal("expected non-empty JWS")
	}
	if result.ReceiptID == "" {
		t.Fatal("expected non-empty ReceiptID")
	}
	if result.IssuedAt != 1700000000 {
		t.Errorf("IssuedAt = %d, want 1700000000", result.IssuedAt)
	}

	parts := strings.Split(result.JWS, ".")
	if len(parts) != 3 {
		t.Fatalf("JWS has %d parts, want 3", len(parts))
	}

	headerBytes, _ := jws.Decode(parts[0])
	var header jws.Header
	_ = json.Unmarshal(headerBytes, &header)
	if header.Type != InteractionRecordTyp {
		t.Errorf("header typ = %s, want %s", header.Type, InteractionRecordTyp)
	}
	if header.Algorithm != "EdDSA" {
		t.Errorf("header alg = %s, want EdDSA", header.Algorithm)
	}
	if header.KeyID != "test-key-1" {
		t.Errorf("header kid = %s, want test-key-1", header.KeyID)
	}

	payloadBytes, _ := jws.Decode(parts[1])
	var claims InteractionRecordClaims
	_ = json.Unmarshal(payloadBytes, &claims)
	if claims.Iss != "https://example.com" {
		t.Errorf("iss = %s, want https://example.com", claims.Iss)
	}
	if claims.Kind != KindEvidence {
		t.Errorf("kind = %s, want evidence", claims.Kind)
	}
	if claims.Type != "org.peacprotocol/test" {
		t.Errorf("type = %s, want org.peacprotocol/test", claims.Type)
	}
	if claims.PeacVersion != PeacVersion {
		t.Errorf("peac_version = %s, want %s", claims.PeacVersion, PeacVersion)
	}
	if claims.Rid == "" {
		t.Error("rid should not be empty")
	}
}

func TestIssue_DIDIssuer(t *testing.T) {
	key := testSigningKey(t)
	result, err := Issue(IssueOptions{
		Iss:        "did:key:z6Mk1234",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/test",
		SigningKey: key,
	})
	if err != nil {
		t.Fatalf("Issue() with did: iss failed: %v", err)
	}
	if result.JWS == "" {
		t.Fatal("expected non-empty JWS")
	}
}

func TestIssue_ChallengeKind(t *testing.T) {
	key := testSigningKey(t)
	result, err := Issue(IssueOptions{
		Iss:        "https://example.com",
		Kind:       KindChallenge,
		Type:       "org.peacprotocol/rate-limited",
		SigningKey: key,
	})
	if err != nil {
		t.Fatalf("Issue() with challenge kind failed: %v", err)
	}
	parts := strings.Split(result.JWS, ".")
	payloadBytes, _ := jws.Decode(parts[1])
	var claims InteractionRecordClaims
	_ = json.Unmarshal(payloadBytes, &claims)
	if claims.Kind != KindChallenge {
		t.Errorf("kind = %s, want challenge", claims.Kind)
	}
}

func TestIssue_RejectsHTTPIssuer(t *testing.T) {
	key := testSigningKey(t)
	_, err := Issue(IssueOptions{
		Iss:        "http://example.com",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/test",
		SigningKey: key,
	})
	if err == nil {
		t.Fatal("expected error for http:// issuer")
	}
	ie, ok := err.(*IssueError)
	if !ok {
		t.Fatalf("expected *IssueError, got %T", err)
	}
	if ie.Code != ErrCodeInvalidIss {
		t.Errorf("code = %s, want %s", ie.Code, ErrCodeInvalidIss)
	}
}

func TestIssue_RejectsMissingIss(t *testing.T) {
	key := testSigningKey(t)
	_, err := Issue(IssueOptions{Kind: KindEvidence, Type: "org.peacprotocol/test", SigningKey: key})
	if err == nil {
		t.Fatal("expected error for missing iss")
	}
}

func TestIssue_RejectsMissingKind(t *testing.T) {
	key := testSigningKey(t)
	_, err := Issue(IssueOptions{Iss: "https://example.com", Type: "org.peacprotocol/test", SigningKey: key})
	if err == nil {
		t.Fatal("expected error for missing kind")
	}
}

func TestIssue_RejectsInvalidKind(t *testing.T) {
	key := testSigningKey(t)
	_, err := Issue(IssueOptions{Iss: "https://example.com", Kind: "unknown", Type: "org.peacprotocol/test", SigningKey: key})
	if err == nil {
		t.Fatal("expected error for invalid kind")
	}
	if ie := err.(*IssueError); ie.Code != ErrCodeInvalidKind {
		t.Errorf("code = %s, want %s", ie.Code, ErrCodeInvalidKind)
	}
}

func TestIssue_RejectsMissingType(t *testing.T) {
	key := testSigningKey(t)
	_, err := Issue(IssueOptions{Iss: "https://example.com", Kind: KindEvidence, SigningKey: key})
	if err == nil {
		t.Fatal("expected error for missing type")
	}
}

func TestIssue_RejectsMissingKey(t *testing.T) {
	_, err := Issue(IssueOptions{Iss: "https://example.com", Kind: KindEvidence, Type: "org.peacprotocol/test"})
	if err == nil {
		t.Fatal("expected error for missing signing key")
	}
}

func TestIssue_WithExtensions(t *testing.T) {
	key := testSigningKey(t)
	result, err := Issue(IssueOptions{
		Iss:        "https://example.com",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/commerce",
		SigningKey: key,
		Extensions: map[string]any{
			"org.peacprotocol/commerce": map[string]any{
				"amount_minor": "1000",
				"currency":     "USD",
			},
		},
	})
	if err != nil {
		t.Fatalf("Issue() with extensions failed: %v", err)
	}
	parts := strings.Split(result.JWS, ".")
	payloadBytes, _ := jws.Decode(parts[1])
	var claims InteractionRecordClaims
	_ = json.Unmarshal(payloadBytes, &claims)
	if claims.Ext == nil {
		t.Fatal("expected extensions in claims")
	}
	if _, ok := claims.Ext["org.peacprotocol/commerce"]; !ok {
		t.Fatal("expected commerce extension")
	}
}

func TestIssue_WithPolicyBlock(t *testing.T) {
	key := testSigningKey(t)
	result, err := Issue(IssueOptions{
		Iss:        "https://example.com",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/test",
		SigningKey: key,
		Policy:     &PolicyBlock{Digest: "sha256:abc123"},
	})
	if err != nil {
		t.Fatalf("Issue() with policy failed: %v", err)
	}
	parts := strings.Split(result.JWS, ".")
	payloadBytes, _ := jws.Decode(parts[1])
	var claims InteractionRecordClaims
	_ = json.Unmarshal(payloadBytes, &claims)
	if claims.Peac == nil {
		t.Fatal("expected policy block")
	}
	if claims.Peac.Digest != "sha256:abc123" {
		t.Errorf("policy digest = %s, want sha256:abc123", claims.Peac.Digest)
	}
}

func TestIssue_WithPillars(t *testing.T) {
	key := testSigningKey(t)
	_, err := Issue(IssueOptions{
		Iss:        "https://example.com",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/test",
		SigningKey: key,
		Pillars:    []string{"commerce", "access"},
	})
	if err != nil {
		t.Fatalf("Issue() with pillars failed: %v", err)
	}
}

func TestIssue_RejectsInvalidPillar(t *testing.T) {
	key := testSigningKey(t)
	_, err := Issue(IssueOptions{
		Iss:        "https://example.com",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/test",
		SigningKey: key,
		Pillars:    []string{"invalid-pillar"},
	})
	if err == nil {
		t.Fatal("expected error for invalid pillar")
	}
}

func TestIssue_RidIsUUIDv7(t *testing.T) {
	key := testSigningKey(t)
	result, err := Issue(IssueOptions{
		Iss:        "https://example.com",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/test",
		SigningKey: key,
	})
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(result.JWS, ".")
	payloadBytes, _ := jws.Decode(parts[1])
	var claims InteractionRecordClaims
	_ = json.Unmarshal(payloadBytes, &claims)
	if len(claims.Rid) != 36 {
		t.Errorf("rid length = %d, want 36", len(claims.Rid))
	}
	if claims.Rid[14] != '7' {
		t.Errorf("rid version char = %c, want 7", claims.Rid[14])
	}
}

func TestIssueJWS_Convenience(t *testing.T) {
	key := testSigningKey(t)
	jwsStr, err := IssueJWS(IssueOptions{
		Iss:        "https://example.com",
		Kind:       KindEvidence,
		Type:       "org.peacprotocol/test",
		SigningKey: key,
	})
	if err != nil {
		t.Fatal(err)
	}
	if jwsStr == "" {
		t.Fatal("expected non-empty JWS")
	}
}
