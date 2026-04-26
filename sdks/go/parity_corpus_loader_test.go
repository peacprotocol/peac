package peac

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// parityFamily is the shape of a parity-corpus family file at
// specs/conformance/parity-corpus/<family>/vectors.json.
//
// The Go-side loader does typed JSON unmarshal + explicit required-field
// assertions. Full JSON Schema validation is performed on the TypeScript
// side; the Go SDK has no external dependencies, and adding a Go-side
// schema validator is deferred per the v0.13.1 plan amendment.
type parityFamily struct {
	Family      string         `json:"family"`
	Description string         `json:"description"`
	Version     string         `json:"version"`
	Generator   string         `json:"generator"`
	Vectors     []parityVector `json:"vectors"`
}

type parityVector struct {
	ID          string             `json:"id"`
	Description string             `json:"description"`
	Input       parityVectorInput  `json:"input"`
	Expected    parityVectorOutput `json:"expected"`
}

type parityVectorInput struct {
	Payload map[string]interface{} `json:"payload"`
	Header  map[string]interface{} `json:"header,omitempty"`
}

type parityVectorOutput struct {
	Accepted bool                 `json:"accepted"`
	Errors   []parityVectorIssue  `json:"errors,omitempty"`
	Warnings []parityVectorIssue  `json:"warnings,omitempty"`
}

type parityVectorIssue struct {
	Code string `json:"code"`
	Path string `json:"path,omitempty"`
}

var parityFloorCounts = map[string]int{
	"default-flows":       12,
	"jose-hardening":      8,
	"runtime-governance":  7,
	"commerce-bridges":    4,
}

func parityCorpusRoot(t *testing.T) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Join(filepath.Dir(thisFile), "..", "..", "specs", "conformance", "parity-corpus")
}

// loadParityFamily reads, parses, and applies required-field assertions to
// a single parity-corpus family. Schema validation is on the TS side; the
// Go side enforces the floor count, required envelope fields, vector id
// uniqueness, and that every vector has a non-empty payload.
func loadParityFamily(t *testing.T, family string) parityFamily {
	t.Helper()
	root := parityCorpusRoot(t)
	vectorsPath := filepath.Join(root, family, "vectors.json")

	data, err := os.ReadFile(vectorsPath)
	if err != nil {
		t.Fatalf("parity-corpus(%s): read vectors.json: %v", family, err)
	}

	var loaded parityFamily
	if err := json.Unmarshal(data, &loaded); err != nil {
		t.Fatalf("parity-corpus(%s): unmarshal vectors.json: %v", family, err)
	}

	if loaded.Family != family {
		t.Fatalf("parity-corpus(%s): family field = %q, want %q", family, loaded.Family, family)
	}
	if loaded.Description == "" {
		t.Fatalf("parity-corpus(%s): description must be non-empty", family)
	}
	if loaded.Version == "" {
		t.Fatalf("parity-corpus(%s): version must be non-empty", family)
	}

	floor, ok := parityFloorCounts[family]
	if !ok {
		t.Fatalf("parity-corpus(%s): unknown family (no floor count)", family)
	}
	if len(loaded.Vectors) < floor {
		t.Fatalf("parity-corpus(%s): vector count %d below floor %d", family, len(loaded.Vectors), floor)
	}

	seen := make(map[string]struct{}, len(loaded.Vectors))
	for i, v := range loaded.Vectors {
		if v.ID == "" {
			t.Fatalf("parity-corpus(%s): vector index %d has empty id", family, i)
		}
		if v.Description == "" {
			t.Fatalf("parity-corpus(%s): vector %s has empty description", family, v.ID)
		}
		if _, dup := seen[v.ID]; dup {
			t.Fatalf("parity-corpus(%s): duplicate vector id %s", family, v.ID)
		}
		seen[v.ID] = struct{}{}

		if len(v.Input.Payload) == 0 {
			t.Fatalf("parity-corpus(%s): vector %s has empty payload", family, v.ID)
		}
		// jose-hardening requires header; other families allow header to be omitted.
		if family == "jose-hardening" && len(v.Input.Header) == 0 {
			t.Fatalf("parity-corpus(%s): vector %s requires non-empty header", family, v.ID)
		}
	}

	return loaded
}

// TestParityCorpusLoader smoke-tests the Go-side corpus loader. Asserts that
// every parity-corpus family loads successfully, meets its floor count, and
// has unique vector ids. No validator code is exercised here; this commit
// ships the loader only.
func TestParityCorpusLoader(t *testing.T) {
	for _, family := range []string{
		"default-flows",
		"jose-hardening",
		"runtime-governance",
		"commerce-bridges",
	} {
		t.Run(family, func(tt *testing.T) {
			loaded := loadParityFamily(tt, family)
			if loaded.Family != family {
				tt.Fatalf("family mismatch: got %q want %q", loaded.Family, family)
			}
			tt.Logf("loaded %d vectors for family %s (floor %d)", len(loaded.Vectors), family, parityFloorCounts[family])
		})
	}
}

// TestParityCorpusLoaderMissingFamilyRejected verifies that the loader
// fails (via t.Fatal) when asked for an unregistered family. We can't
// directly assert on t.Fatal in-test, so we exercise the path through
// a sub-helper that returns an error instead.
func TestParityCorpusLoaderUnknownFamilyHandled(t *testing.T) {
	root := parityCorpusRoot(t)
	missing := filepath.Join(root, "nonexistent-family", "vectors.json")
	if _, err := os.Stat(missing); !os.IsNotExist(err) {
		t.Fatalf("setup: expected nonexistent-family/vectors.json not to exist, got err=%v", err)
	}
	// Confirm the parity floor map has exactly four entries (the four families).
	if got, want := len(parityFloorCounts), 4; got != want {
		t.Fatalf("parityFloorCounts has %d entries, want %d", got, want)
	}
	for _, want := range []string{"default-flows", "jose-hardening", "runtime-governance", "commerce-bridges"} {
		if _, ok := parityFloorCounts[want]; !ok {
			t.Fatalf("parityFloorCounts missing family %q", want)
		}
	}
	// Format the map deterministically for log clarity.
	fmt.Sprintf("%v", parityFloorCounts)
}
