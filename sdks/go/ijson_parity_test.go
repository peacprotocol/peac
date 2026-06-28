package peac

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// I-JSON (RFC 7493) raw-input parity tests against the shared corpus at
// specs/conformance/parity-corpus/ijson-raw-input/vectors.json. The TypeScript
// implementation in packages/crypto/tests/ijson.parity.test.ts runs the same
// vectors and must reach identical accept/reject decisions with identical public
// E_IJSON_* codes. assertIJSON returns the public E_IJSON_* code directly.

type ijsonParityVector struct {
	ID          string `json:"id"`
	Description string `json:"description"`
	InputB64    string `json:"input_b64"`
	Expected    struct {
		Accepted bool   `json:"accepted"`
		Code     string `json:"code"`
	} `json:"expected"`
}

type ijsonParityCorpus struct {
	Family  string              `json:"family"`
	Version string              `json:"version"`
	Vectors []ijsonParityVector `json:"vectors"`
}

func loadIJSONParityCorpus(t *testing.T) ijsonParityCorpus {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	repoRoot := filepath.Join(filepath.Dir(thisFile), "..", "..")
	corpusPath := filepath.Join(repoRoot, "specs", "conformance", "parity-corpus", "ijson-raw-input", "vectors.json")

	data, err := os.ReadFile(corpusPath)
	if err != nil {
		t.Fatalf("cannot read corpus at %s: %v", corpusPath, err)
	}
	var corpus ijsonParityCorpus
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatalf("unmarshal corpus: %v", err)
	}
	if corpus.Family != "ijson-raw-input" {
		t.Fatalf("family = %q, want ijson-raw-input", corpus.Family)
	}
	return corpus
}

func TestIJSONParityCorpus(t *testing.T) {
	corpus := loadIJSONParityCorpus(t)
	if len(corpus.Vectors) == 0 {
		t.Fatal("corpus has no vectors")
	}

	seen := make(map[string]struct{})
	rejectCodes := make(map[string]struct{})

	for _, v := range corpus.Vectors {
		if _, dup := seen[v.ID]; dup {
			t.Fatalf("duplicate vector id %q", v.ID)
		}
		seen[v.ID] = struct{}{}

		raw, err := base64.RawURLEncoding.DecodeString(v.InputB64)
		if err != nil {
			t.Fatalf("%s: cannot base64url-decode input: %v", v.ID, err)
		}

		err = assertIJSON(raw)
		if v.Expected.Accepted {
			if err != nil {
				t.Errorf("%s (%s): expected accepted, got error %v", v.ID, v.Description, err)
			}
			continue
		}
		// expected rejection
		if err == nil {
			t.Errorf("%s (%s): expected rejection with %s, got accepted", v.ID, v.Description, v.Expected.Code)
			continue
		}
		ie, ok := err.(*ijsonError)
		if !ok {
			t.Errorf("%s: expected *ijsonError, got %T", v.ID, err)
			continue
		}
		if ie.Code != v.Expected.Code {
			t.Errorf("%s (%s): code = %q, want %q", v.ID, v.Description, ie.Code, v.Expected.Code)
		}
		rejectCodes[ie.Code] = struct{}{}
	}

	for _, want := range []string{
		"E_IJSON_DUPLICATE_MEMBER_NAME",
		"E_IJSON_NUMBER_OUT_OF_RANGE",
		"E_IJSON_INVALID_STRING",
	} {
		if _, ok := rejectCodes[want]; !ok {
			t.Errorf("corpus did not exercise reject code %s", want)
		}
	}
}

// buildCompactJWS assembles a compact JWS from raw header + payload bytes and a
// throwaway signature segment. Used to prove the I-JSON gate runs BEFORE header
// parsing and signature verification (the signature/public key are intentionally
// invalid; the gate must reject first).
func buildCompactJWS(headerRaw, payloadRaw []byte) string {
	enc := base64.RawURLEncoding
	return enc.EncodeToString(headerRaw) + "." +
		enc.EncodeToString(payloadRaw) + "." +
		enc.EncodeToString([]byte("not-a-real-signature"))
}

// TestVerifyLocalIJSONPrecedence proves the raw-input I-JSON gate runs before
// header parsing, typ enforcement, and signature verification in VerifyLocal.
func TestVerifyLocalIJSONPrecedence(t *testing.T) {
	validHeader := []byte(`{"alg":"EdDSA","typ":"interaction-record+jwt","kid":"k"}`)
	pub := make([]byte, 32) // invalid (all-zero) public key on purpose

	// Raw UTF-8 bytes for U+FDD0 (a Unicode noncharacter), built programmatically
	// so the test source never contains a literal noncharacter.
	concat := func(parts ...[]byte) []byte {
		var b []byte
		for _, p := range parts {
			b = append(b, p...)
		}
		return b
	}
	nonchar := []byte{0xEF, 0xB7, 0x90} // U+FDD0
	noncharHeader := concat([]byte(`{"`), nonchar, []byte(`":1,"alg":"EdDSA","typ":"interaction-record+jwt","kid":"k"}`))
	noncharPayload := concat([]byte(`{"s":"`), nonchar, []byte(`"}`))

	cases := []struct {
		name     string
		header   []byte
		payload  []byte
		wantCode string
	}{
		{
			name:     "duplicate protected-header member name",
			header:   []byte(`{"alg":"EdDSA","alg":"none","typ":"interaction-record+jwt","kid":"k"}`),
			payload:  []byte(`{"peac_version":"0.2"}`),
			wantCode: "E_IJSON_DUPLICATE_MEMBER_NAME",
		},
		{
			name:     "duplicate payload member name",
			header:   validHeader,
			payload:  []byte(`{"a":1,"a":2}`),
			wantCode: "E_IJSON_DUPLICATE_MEMBER_NAME",
		},
		{
			name:     "noncharacter in protected header member name",
			header:   noncharHeader,
			payload:  []byte(`{"peac_version":"0.2"}`),
			wantCode: "E_IJSON_INVALID_STRING",
		},
		{
			name:     "noncharacter in payload string",
			header:   validHeader,
			payload:  noncharPayload,
			wantCode: "E_IJSON_INVALID_STRING",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			jws := buildCompactJWS(tc.header, tc.payload)
			res := VerifyLocal(jws, VerifyLocalOptions{PublicKey: pub})
			if res.ErrorCode != tc.wantCode {
				t.Errorf("ErrorCode = %q, want %q (gate must run before signature verification)", res.ErrorCode, tc.wantCode)
			}
		})
	}
}
