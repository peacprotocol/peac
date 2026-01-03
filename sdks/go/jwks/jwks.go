// Package jwks provides JWKS fetching and key resolution for PEAC.
package jwks

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// JWKS represents a JSON Web Key Set.
type JWKS struct {
	Keys []JWK `json:"keys"`
}

// JWK represents a JSON Web Key.
type JWK struct {
	KeyType   string `json:"kty"`
	KeyID     string `json:"kid"`
	Algorithm string `json:"alg,omitempty"`
	Use       string `json:"use,omitempty"`
	Curve     string `json:"crv,omitempty"`

	// Ed25519/OKP keys
	X string `json:"x,omitempty"`

	// RSA keys (for future compatibility)
	N string `json:"n,omitempty"`
	E string `json:"e,omitempty"`

	// PEAC extension fields
	Status    string `json:"peac:status,omitempty"`
	ValidFrom string `json:"peac:valid_from,omitempty"`
}

// KeySet holds a set of public keys indexed by key ID.
type KeySet struct {
	keys      map[string]ed25519.PublicKey
	fetchedAt time.Time
	expiresAt time.Time
}

// NewKeySet creates a new empty KeySet.
func NewKeySet() *KeySet {
	return &KeySet{
		keys: make(map[string]ed25519.PublicKey),
	}
}

// Add adds a key to the set.
func (ks *KeySet) Add(kid string, key ed25519.PublicKey) {
	ks.keys[kid] = key
}

// Get retrieves a key by ID.
func (ks *KeySet) Get(kid string) (ed25519.PublicKey, bool) {
	key, ok := ks.keys[kid]
	return key, ok
}

// IsExpired returns true if the key set has expired.
func (ks *KeySet) IsExpired() bool {
	return time.Now().After(ks.expiresAt)
}

// FetchOptions configures JWKS fetching.
type FetchOptions struct {
	// HTTPClient is the HTTP client to use.
	HTTPClient *http.Client

	// Timeout for the fetch operation.
	Timeout time.Duration

	// MaxSize is the maximum response size in bytes.
	MaxSize int64
}

// DefaultFetchOptions returns default fetch options.
func DefaultFetchOptions() FetchOptions {
	return FetchOptions{
		HTTPClient: http.DefaultClient,
		Timeout:    10 * time.Second,
		MaxSize:    1 << 20, // 1MB
	}
}

// Fetch fetches a JWKS from a URL.
func Fetch(ctx context.Context, url string, opts FetchOptions) (*JWKS, error) {
	if opts.HTTPClient == nil {
		opts.HTTPClient = http.DefaultClient
	}
	if opts.Timeout == 0 {
		opts.Timeout = 10 * time.Second
	}
	if opts.MaxSize == 0 {
		opts.MaxSize = 1 << 20
	}

	ctx, cancel := context.WithTimeout(ctx, opts.Timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "peac-go/0.9.25")

	resp, err := opts.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch JWKS: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, opts.MaxSize))
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var jwks JWKS
	if err := json.Unmarshal(body, &jwks); err != nil {
		return nil, fmt.Errorf("failed to parse JWKS: %w", err)
	}

	return &jwks, nil
}

// ToKeySet converts a JWKS to a KeySet, extracting Ed25519 keys.
func (j *JWKS) ToKeySet() (*KeySet, error) {
	ks := NewKeySet()
	ks.fetchedAt = time.Now()
	ks.expiresAt = time.Now().Add(5 * time.Minute)

	for _, jwk := range j.Keys {
		if jwk.KeyType != "OKP" || jwk.Curve != "Ed25519" {
			continue
		}

		// Skip revoked keys
		if jwk.Status == "revoked" {
			continue
		}

		keyBytes, err := base64.RawURLEncoding.DecodeString(jwk.X)
		if err != nil {
			continue
		}

		if len(keyBytes) != ed25519.PublicKeySize {
			continue
		}

		ks.Add(jwk.KeyID, ed25519.PublicKey(keyBytes))
	}

	return ks, nil
}

// DiscoverJWKS discovers the JWKS URL from an issuer URL.
func DiscoverJWKS(issuer string) string {
	// Standard well-known path
	issuer = strings.TrimSuffix(issuer, "/")
	return issuer + "/.well-known/jwks.json"
}
