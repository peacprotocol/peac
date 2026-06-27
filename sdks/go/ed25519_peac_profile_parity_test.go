package peac

import (
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"

	"github.com/peacprotocol/peac/sdks/go/jws"
)

// ed25519ParityVector mirrors the hex-vector shape of the corpus at
// specs/conformance/parity-corpus/ed25519-peac-profile/vectors.json. The
// asserted field is PeacExpected.Accepted; the Empirical block is diagnostic
// provenance and is not decoded here.
type ed25519ParityVector struct {
	ID           string `json:"id"`
	Source       string `json:"source"`
	Description  string `json:"description"`
	MessageHex   string `json:"message_hex"`
	PublicKeyHex string `json:"public_key_hex"`
	SignatureHex string `json:"signature_hex"`
	PeacExpected struct {
		Accepted bool `json:"accepted"`
	} `json:"peac_expected"`
}

type ed25519ParityCorpus struct {
	Family      string                `json:"family"`
	Description string                `json:"description"`
	Version     string                `json:"version"`
	Vectors     []ed25519ParityVector `json:"vectors"`
}

func loadEd25519ParityCorpus(t *testing.T) ed25519ParityCorpus {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	repoRoot := filepath.Join(filepath.Dir(thisFile), "..", "..")
	corpusPath := filepath.Join(repoRoot, "specs", "conformance", "parity-corpus", "ed25519-peac-profile", "vectors.json")

	data, err := os.ReadFile(corpusPath)
	if err != nil {
		t.Fatalf("cannot read corpus at %s: %v", corpusPath, err)
	}
	var corpus ed25519ParityCorpus
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatalf("unmarshal corpus: %v", err)
	}
	if corpus.Family != "ed25519-peac-profile" {
		t.Fatalf("family = %q, want ed25519-peac-profile", corpus.Family)
	}
	return corpus
}

// verifyEd25519Vector applies the PEAC Ed25519 verification profile to a
// corpus vector and returns whether it is accepted. A non-32-byte public key
// cannot be an ed25519.PublicKey; VerifyEd25519 still rejects it on length.
func verifyEd25519Vector(t *testing.T, v ed25519ParityVector) bool {
	t.Helper()
	pub, err := hex.DecodeString(v.PublicKeyHex)
	if err != nil {
		t.Fatalf("%s: bad public_key_hex: %v", v.ID, err)
	}
	msg, err := hex.DecodeString(v.MessageHex)
	if err != nil {
		t.Fatalf("%s: bad message_hex: %v", v.ID, err)
	}
	sig, err := hex.DecodeString(v.SignatureHex)
	if err != nil {
		t.Fatalf("%s: bad signature_hex: %v", v.ID, err)
	}
	return jws.VerifyEd25519(ed25519.PublicKey(pub), msg, sig) == nil
}

// TestEd25519PeacProfileCorpus runs the shared cross-language Ed25519
// verification-profile corpus against the Go implementation in
// jws/ed25519.go. The TypeScript side runs the same corpus at
// packages/crypto/tests/ed25519.peac-profile-parity.test.ts. Both
// implementations must reach identical accept/reject decisions.
func TestEd25519PeacProfileCorpus(t *testing.T) {
	corpus := loadEd25519ParityCorpus(t)

	// 12 speccheck edge vectors + 1 RFC 8032 positive + 1 PEAC-sign positive.
	if got, want := len(corpus.Vectors), 14; got != want {
		t.Fatalf("corpus has %d vectors, want %d", got, want)
	}

	seen := make(map[string]struct{}, len(corpus.Vectors))
	for _, v := range corpus.Vectors {
		if _, dup := seen[v.ID]; dup {
			t.Fatalf("duplicate vector id %s", v.ID)
		}
		seen[v.ID] = struct{}{}

		got := verifyEd25519Vector(t, v)
		if got != v.PeacExpected.Accepted {
			t.Errorf("%s (%s): got accepted=%v, want %v", v.ID, v.Description, got, v.PeacExpected.Accepted)
		}
	}
}

// vectorByID is a small lookup helper for the named-guard tests.
func vectorByID(t *testing.T, corpus ed25519ParityCorpus, id string) ed25519ParityVector {
	t.Helper()
	for _, v := range corpus.Vectors {
		if v.ID == id {
			return v
		}
	}
	t.Fatalf("vector %s not found in corpus", id)
	return ed25519ParityVector{}
}

// TestEd25519PeacProfileSmallOrderRejected pins the load-bearing small-order
// denylist: speccheck 0, 1, 11 carry small-order public keys that the Go
// stdlib accepts at the raw-verify layer; the denylist rejects them.
func TestEd25519PeacProfileSmallOrderRejected(t *testing.T) {
	corpus := loadEd25519ParityCorpus(t)
	for _, id := range []string{"speccheck-0", "speccheck-1", "speccheck-11"} {
		v := vectorByID(t, corpus, id)
		if v.PeacExpected.Accepted {
			t.Fatalf("%s: corpus expects accept, want reject", id)
		}
		if verifyEd25519Vector(t, v) {
			t.Errorf("%s: accepted, want rejected (denylist)", id)
		}
	}
}

// TestEd25519PeacProfileCofactoredOnlyRejected pins the cofactorless choice:
// speccheck 4, 5 verify under a cofactored equation but fail cofactorless.
// Go stdlib is cofactorless and rejects them, matching Web Crypto on the TS
// side; a noble { zip215: false } wrapper would accept them and diverge.
func TestEd25519PeacProfileCofactoredOnlyRejected(t *testing.T) {
	corpus := loadEd25519ParityCorpus(t)
	for _, id := range []string{"speccheck-4", "speccheck-5"} {
		v := vectorByID(t, corpus, id)
		if v.PeacExpected.Accepted {
			t.Fatalf("%s: corpus expects accept, want reject", id)
		}
		if verifyEd25519Vector(t, v) {
			t.Errorf("%s: accepted, want rejected (cofactorless)", id)
		}
	}
}

// TestEd25519PeacProfilePositives pins the canonical positives: the profile
// does not over-reject valid signatures.
func TestEd25519PeacProfilePositives(t *testing.T) {
	corpus := loadEd25519ParityCorpus(t)
	for _, id := range []string{"rfc8032-vector-1", "peac-sign-positive"} {
		v := vectorByID(t, corpus, id)
		if !v.PeacExpected.Accepted {
			t.Fatalf("%s: corpus expects reject, want accept", id)
		}
		if !verifyEd25519Vector(t, v) {
			t.Errorf("%s: rejected, want accepted", id)
		}
	}
}

// TestEd25519PeacProfileRoundTrip proves a freshly generated canonical
// signature verifies and a one-byte tamper is rejected, end to end through
// the profile. A canonical ed25519.Sign signature is exactly what the PEAC
// signer emits at the byte layer; the profile must not over-reject it.
func TestEd25519PeacProfileRoundTrip(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	msg := []byte("round-trip control message")
	sig := ed25519.Sign(priv, msg)
	if jws.VerifyEd25519(pub, msg, sig) != nil {
		t.Fatal("fresh signature did not verify")
	}
	tampered := make([]byte, len(sig))
	copy(tampered, sig)
	tampered[10] ^= 0x01
	if jws.VerifyEd25519(pub, msg, tampered) == nil {
		t.Fatal("tampered signature verified, want rejected")
	}
}

// TestEd25519PeacProfileDenylistCount pins the Go small-order denylist size at
// 11. The TypeScript side asserts byte-for-byte equality with this list; this
// independent count guards against an accidental Go-only edit.
func TestEd25519PeacProfileDenylistCount(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	src := filepath.Join(filepath.Dir(thisFile), "jws", "ed25519.go")
	data, err := os.ReadFile(src)
	if err != nil {
		t.Fatalf("read %s: %v", src, err)
	}
	idx := strings.Index(string(data), "ed25519SmallOrderPublicKeys")
	if idx < 0 {
		t.Fatal("denylist marker not found in jws/ed25519.go")
	}
	window := string(data)[idx:]
	if len(window) > 2000 {
		window = window[:2000]
	}
	count := len(regexp.MustCompile(`[0-9a-f]{64}`).FindAllString(window, -1))
	if count != 11 {
		t.Fatalf("Go small-order denylist has %d entries, want 11", count)
	}
}
