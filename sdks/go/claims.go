package peac

// InteractionRecordClaims represents claims in a signed interaction record
// (typ: interaction-record+jwt, Wire 0.2).
type InteractionRecordClaims struct {
	Iss         string         `json:"iss"`
	Sub         string         `json:"sub,omitempty"`
	Iat         int64          `json:"iat"`
	Exp         int64          `json:"exp,omitempty"`
	Rid         string         `json:"rid"`
	Kind        string         `json:"kind"`
	Type        string         `json:"type"`
	PeacVersion string         `json:"peac_version"`
	Pillars     []string       `json:"pillars,omitempty"`
	Actor       *ActorBinding  `json:"actor,omitempty"`
	Ext         map[string]any `json:"ext,omitempty"`
	Peac        *PolicyBlock   `json:"peac,omitempty"`
}

// ActorBinding represents the top-level actor field.
type ActorBinding struct {
	ID         string   `json:"id"`
	Role       string   `json:"role,omitempty"`
	ProofTypes []string `json:"proof_types,omitempty"`
}

// PolicyBlock represents the peac policy binding block.
type PolicyBlock struct {
	Digest  string `json:"digest"`
	URI     string `json:"uri,omitempty"`
	Version string `json:"version,omitempty"`
}

