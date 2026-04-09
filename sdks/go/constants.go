package peac

// InteractionRecordTyp is the JWS typ header for Interaction Record format.
const InteractionRecordTyp = "interaction-record+jwt"

// PeacVersion is the PEAC protocol version for Interaction Record format.
const PeacVersion = "0.2"

// Kind values for Interaction Records.
const (
	KindEvidence  = "evidence"
	KindChallenge = "challenge"
)

// Pillar values (closed 10-pillar taxonomy).
var ValidPillars = map[string]bool{
	"access":      true,
	"attribution": true,
	"commerce":    true,
	"compliance":  true,
	"consent":     true,
	"identity":    true,
	"privacy":     true,
	"provenance":  true,
	"purpose":     true,
	"safety":      true,
}

// ValidKinds contains the valid structural kind values.
var ValidKinds = map[string]bool{
	KindEvidence:  true,
	KindChallenge: true,
}
