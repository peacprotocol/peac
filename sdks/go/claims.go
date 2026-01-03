package peac

import (
	"encoding/json"
)

// PEACReceiptClaims represents the claims in a PEAC receipt.
type PEACReceiptClaims struct {
	// Standard JWT claims
	Issuer    string   `json:"iss"`
	Subject   string   `json:"sub,omitempty"`
	Audience  []string `json:"aud,omitempty"`
	IssuedAt  int64    `json:"iat"`
	ExpiresAt int64    `json:"exp,omitempty"`
	NotBefore int64    `json:"nbf,omitempty"`
	JWTID     string   `json:"jti"`

	// PEAC-specific claims
	ReceiptID    string `json:"receipt_id"`
	ResourceHash string `json:"resource_hash,omitempty"`
	ResourceURI  string `json:"resource_uri,omitempty"`

	// Purpose claims (v0.9.24+)
	PurposeDeclared []string `json:"purpose_declared,omitempty"`
	PurposeEnforced string   `json:"purpose_enforced,omitempty"`
	PurposeReason   string   `json:"purpose_reason,omitempty"`

	// Control claims
	Decision    string             `json:"decision,omitempty"`
	Constraints *PolicyConstraints `json:"constraints,omitempty"`

	// Evidence
	Payment      *PaymentEvidence `json:"payment,omitempty"`
	Attestations []Attestation    `json:"attestations,omitempty"`
}

// PolicyConstraints represents rate limiting or budget constraints.
type PolicyConstraints struct {
	RateLimit *RateLimitConstraint `json:"rate_limit,omitempty"`
	Budget    *BudgetConstraint    `json:"budget,omitempty"`
}

// RateLimitConstraint represents rate limiting parameters.
type RateLimitConstraint struct {
	WindowSeconds  int `json:"window_s"`
	MaxRequests    int `json:"max"`
	RetryAfterSecs int `json:"retry_after_s,omitempty"`
}

// BudgetConstraint represents budget parameters.
type BudgetConstraint struct {
	MaxTokens   int `json:"max_tokens,omitempty"`
	MaxRequests int `json:"max_requests,omitempty"`
}

// PaymentEvidence represents payment information in a receipt.
type PaymentEvidence struct {
	Rail        string          `json:"rail"`
	Amount      int64           `json:"amount"`
	Currency    string          `json:"currency"`
	Reference   string          `json:"reference,omitempty"`
	Facilitator string          `json:"facilitator,omitempty"`
	Evidence    json.RawMessage `json:"evidence,omitempty"`
}

// Attestation represents a generic attestation in the receipt.
type Attestation struct {
	Type      string          `json:"type"`
	Issuer    string          `json:"issuer"`
	IssuedAt  string          `json:"issued_at"`
	ExpiresAt string          `json:"expires_at,omitempty"`
	Ref       string          `json:"ref,omitempty"`
	Evidence  json.RawMessage `json:"evidence,omitempty"`
}

// AgentIdentityEvidence represents agent identity evidence (v0.9.25+).
type AgentIdentityEvidence struct {
	AgentID         string      `json:"agent_id"`
	ControlType     string      `json:"control_type"`
	Capabilities    []string    `json:"capabilities,omitempty"`
	DelegationChain []string    `json:"delegation_chain,omitempty"`
	Proof           *AgentProof `json:"proof,omitempty"`
	KeyDirectoryURL string      `json:"key_directory_url,omitempty"`
	Operator        string      `json:"operator,omitempty"`
	UserID          string      `json:"user_id,omitempty"`
}

// AgentProof represents proof of agent identity control.
type AgentProof struct {
	Method        string          `json:"method"`
	KeyID         string          `json:"key_id"`
	Algorithm     string          `json:"alg,omitempty"`
	Signature     string          `json:"signature,omitempty"`
	DPoPProof     string          `json:"dpop_proof,omitempty"`
	CertThumbprint string         `json:"cert_thumbprint,omitempty"`
	Binding       *BindingDetails `json:"binding,omitempty"`
}

// BindingDetails represents the HTTP request binding details.
type BindingDetails struct {
	Method          string   `json:"method"`
	Target          string   `json:"target"`
	HeadersIncluded []string `json:"headers_included,omitempty"`
	BodyHash        string   `json:"body_hash,omitempty"`
	SignedAt        string   `json:"signed_at"`
}

// SubjectProfileSnapshot represents a snapshot of a subject profile.
type SubjectProfileSnapshot struct {
	Type     string            `json:"type"`
	ID       string            `json:"id,omitempty"`
	Labels   []string          `json:"labels,omitempty"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// VerifyResult contains the result of receipt verification.
type VerifyResult struct {
	// Claims contains the verified receipt claims.
	Claims *PEACReceiptClaims

	// SubjectSnapshot contains the subject profile snapshot if present.
	SubjectSnapshot *SubjectProfileSnapshot

	// KeyID is the key ID used for verification.
	KeyID string

	// Algorithm is the algorithm used for signing.
	Algorithm string

	// Perf contains performance metrics.
	Perf *VerifyPerf
}

// VerifyPerf contains timing information for verification.
type VerifyPerf struct {
	VerifyMs    float64 `json:"verify_ms"`
	JWKSFetchMs float64 `json:"jwks_fetch_ms,omitempty"`
}
