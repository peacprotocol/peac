package peac

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// TestJCSExtendedParityCorpus runs the shared cross-language JCS
// parity corpus at specs/conformance/parity-corpus/jcs-extended/vectors.json
// against the Go implementation in jcs.go. The TypeScript side runs
// the same corpus at packages/crypto/tests/jcs.parity-extended.test.ts.
// Every vector must canonicalize byte-identically on both sides.
func TestJCSExtendedParityCorpus(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	repoRoot := filepath.Join(filepath.Dir(thisFile), "..", "..")
	corpusPath := filepath.Join(repoRoot, "specs", "conformance", "parity-corpus", "jcs-extended", "vectors.json")

	data, err := os.ReadFile(corpusPath)
	if err != nil {
		t.Fatalf("cannot read corpus at %s: %v", corpusPath, err)
	}

	var corpus struct {
		Description string `json:"description"`
		Generator   string `json:"generator"`
		Vectors     []struct {
			ID          string          `json:"id"`
			Description string          `json:"description"`
			Input       json.RawMessage `json:"input"`
			Canonical   string          `json:"canonical"`
		} `json:"vectors"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatalf("cannot parse corpus JSON: %v", err)
	}

	if len(corpus.Vectors) != 6 {
		t.Fatalf("corpus vector count = %d, want 6", len(corpus.Vectors))
	}

	expectedIDs := map[string]bool{
		"unicode-nfc-nfd":             false,
		"nested-depth-5":              false,
		"numeric-zero-and-neg-zero":   false,
		"integer-vs-float-same-value": false,
		"escape-sequences":            false,
		"utf16-surrogate-pair":        false,
	}

	for _, vector := range corpus.Vectors {
		v := vector // capture
		t.Run(v.ID, func(t *testing.T) {
			if _, present := expectedIDs[v.ID]; !present {
				t.Errorf("unexpected vector id in corpus: %q", v.ID)
				return
			}
			expectedIDs[v.ID] = true

			got, err := Canonicalize(v.Input)
			if err != nil {
				t.Fatalf("Canonicalize returned error: %v", err)
			}
			if string(got) != v.Canonical {
				t.Errorf(
					"vector %q canonical mismatch\n  want: %q\n  got:  %q",
					v.ID, v.Canonical, string(got),
				)
			}
		})
	}

	for id, seen := range expectedIDs {
		if !seen {
			t.Errorf("expected vector %q was not present in the corpus", id)
		}
	}
}
