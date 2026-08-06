// Command measure-ed25519 records the crypto/ed25519 decision for each conformance corpus vector.
//
// Measures the standard library primitive only, independently of the PEAC profile. Outcomes are
// exactly accept, reject or unsupported. Malformed committed input aborts the run rather than
// being recorded as a rejection.
//
// Usage:
//
//	go run ./tools/measure-ed25519 --vectors <path> [--observed-on YYYY-MM-DD]
package main

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"runtime"
)

type vector struct {
	ID           string `json:"id"`
	MessageHex   string `json:"message_hex"`
	PublicKeyHex string `json:"public_key_hex"`
	SignatureHex string `json:"signature_hex"`
}

type corpus struct {
	Vectors []vector `json:"vectors"`
}

type environment struct {
	Implementation string `json:"implementation"`
	Version        string `json:"version"`
	Runtime        string `json:"runtime"`
	RuntimeVersion string `json:"runtime_version"`
	Platform       string `json:"platform"`
	Harness        string `json:"harness"`
	CorpusSHA256   string `json:"corpus_sha256"`
	LockfileSHA256 string `json:"lockfile_sha256"`
	OSRelease      string `json:"os_release"`
	HarnessSHA256  string `json:"harness_sha256"`
}

type observation struct {
	VectorID      string `json:"vector_id"`
	EnvironmentID string `json:"environment_id"`
	Outcome       string `json:"outcome"`
}

type document struct {
	ObservedOn   string                 `json:"observed_on"`
	SourceRev    string                 `json:"measurement_source_revision,omitempty"`
	Environments map[string]environment `json:"environments"`
	Observations []observation          `json:"observations"`
}

const (
	acceptControl = "peac-sign-positive"
	rejectControl = "speccheck-4"
)

var (
	dateRE     = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	revisionRE = regexp.MustCompile(`^[0-9a-f]{40}$`)
)

func main() {
	vectorsPath := flag.String("vectors", "", "path to the corpus vectors.json")
	observedOn := flag.String("observed-on", "", "YYYY-MM-DD")
	sourcePath := flag.String("source", "tools/measure-ed25519/main.go", "path to this source, hashed into the environment record")
	lockfilePath := flag.String("lockfile", "../../pnpm-lock.yaml", "path to the workspace lockfile, hashed into the environment record")
	sourceRevision := flag.String("source-revision", "", "full commit SHA whose sources were measured")
	flag.Parse()

	if *vectorsPath == "" {
		fail("--vectors is required")
	}
	if !dateRE.MatchString(*observedOn) {
		fail("--observed-on must be YYYY-MM-DD")
	}

	raw, err := os.ReadFile(*vectorsPath)
	if err != nil {
		fail(fmt.Sprintf("read vectors: %v", err))
	}
	var c corpus
	if err := json.Unmarshal(raw, &c); err != nil {
		fail(fmt.Sprintf("parse vectors: %v", err))
	}
	if len(c.Vectors) == 0 {
		fail("corpus contains no vectors")
	}

	source, err := os.ReadFile(*sourcePath)
	if err != nil {
		fail(fmt.Sprintf("read harness source: %v", err))
	}

	lockfile, err := os.ReadFile(*lockfilePath)
	if err != nil {
		fail(fmt.Sprintf("read lockfile: %v", err))
	}
	if *sourceRevision != "" && !revisionRE.MatchString(*sourceRevision) {
		fail("--source-revision must be a full commit SHA")
	}

	envID := fmt.Sprintf("go-%s-%s", runtime.Version(), runtime.GOARCH)
	env := environment{
		Implementation: "go:crypto/ed25519",
		Version:        runtime.Version(),
		Runtime:        "go",
		RuntimeVersion: runtime.Version(),
		Platform:       fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH),
		Harness:        "sdks/go/tools/measure-ed25519/main.go",
		CorpusSHA256:   fmt.Sprintf("%x", sha256.Sum256(raw)),
		LockfileSHA256: fmt.Sprintf("%x", sha256.Sum256(lockfile)),
		OSRelease:      osRelease(),
		HarnessSHA256:  fmt.Sprintf("%x", sha256.Sum256(source)),
	}

	observations := make([]observation, 0, len(c.Vectors))
	for _, v := range c.Vectors {
		observations = append(observations, observation{
			VectorID:      v.ID,
			EnvironmentID: envID,
			Outcome:       measure(v),
		})
	}

	// Controls: a run that accepts nothing, or rejects nothing, has measured nothing meaningful.
	assertOutcome(observations, acceptControl, "accept")
	assertOutcome(observations, rejectControl, "reject")

	out, err := json.MarshalIndent(document{
		ObservedOn:   *observedOn,
		SourceRev:    *sourceRevision,
		Environments: map[string]environment{envID: env},
		Observations: observations,
	}, "", "  ")
	if err != nil {
		fail(fmt.Sprintf("encode observations: %v", err))
	}
	fmt.Println(string(out))
}

// measure returns accept or reject. Malformed committed input is a harness fault, not a rejection.
func measure(v vector) string {
	pub, err := hex.DecodeString(v.PublicKeyHex)
	if err != nil {
		fail(fmt.Sprintf("%s: public key is not valid hex: %v", v.ID, err))
	}
	msg, err := hex.DecodeString(v.MessageHex)
	if err != nil {
		fail(fmt.Sprintf("%s: message is not valid hex: %v", v.ID, err))
	}
	sig, err := hex.DecodeString(v.SignatureHex)
	if err != nil {
		fail(fmt.Sprintf("%s: signature is not valid hex: %v", v.ID, err))
	}
	if len(pub) != ed25519.PublicKeySize {
		fail(fmt.Sprintf("%s: public key is %d bytes, expected %d", v.ID, len(pub), ed25519.PublicKeySize))
	}
	if len(sig) != ed25519.SignatureSize {
		fail(fmt.Sprintf("%s: signature is %d bytes, expected %d", v.ID, len(sig), ed25519.SignatureSize))
	}
	if ed25519.Verify(ed25519.PublicKey(pub), msg, sig) {
		return "accept"
	}
	return "reject"
}

func assertOutcome(observations []observation, vectorID, expected string) {
	found := false
	for _, o := range observations {
		if o.VectorID != vectorID {
			continue
		}
		found = true
		if o.Outcome != expected {
			fail(fmt.Sprintf("control %s: expected %s, measured %s", vectorID, expected, o.Outcome))
		}
	}
	if !found {
		fail(fmt.Sprintf("control %s is absent from the corpus", vectorID))
	}
}

// osRelease reports the kernel release. Falls back to GOOS when it cannot be determined, so the
// field is never silently wrong.
func osRelease() string {
	if out, err := os.ReadFile("/proc/sys/kernel/osrelease"); err == nil {
		return string(bytes.TrimSpace(out))
	}
	if out, err := exec.Command("uname", "-r").Output(); err == nil {
		return string(bytes.TrimSpace(out))
	}
	return runtime.GOOS
}

func fail(message string) {
	fmt.Fprintf(os.Stderr, "measure-ed25519: %s\n", message)
	os.Exit(1)
}
