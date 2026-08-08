// Package kid validates the PEAC Wire 0.2 JWS key identifier (kid) against the
// profile shared by issuance and verification, so both sides apply one rule.
package kid

import (
	"errors"
	"unicode/utf8"
)

// MaxUTF8Bytes is the maximum kid length, measured in UTF-8 bytes of the string.
// RFC 7515 leaves the kid structure unspecified; the bound and well-formedness are
// PEAC Wire 0.2 application constraints. The unit is UTF-8 bytes because that is
// what bounds the serialized protected header and is the only unit independent
// implementations agree on (a bound stated in characters counts UTF-16 code units
// in JavaScript, bytes in Go, and code points in JSON Schema).
const MaxUTF8Bytes = 256

// Classified reasons a kid fails the Wire 0.2 profile, so each caller maps to its
// own error surface. At the verifier the raw I-JSON gate runs on the header bytes
// first, so ErrInvalidUTF8 and ErrNoncharacter are unreachable there and only
// ErrEmpty and ErrTooLong can fire; at issuance there is no such gate, so this
// predicate is the sole check and all four are reachable. TypeScript enforces the
// same accept/reject decision, catching the UTF-8 and noncharacter classes through
// its header I-JSON gate rather than a kid rule, so the decision matches across
// languages even though the issuance error surface differs.
var (
	ErrEmpty        = errors.New("kid is empty")
	ErrInvalidUTF8  = errors.New("kid is not valid UTF-8")
	ErrNoncharacter = errors.New("kid contains a Unicode noncharacter")
	ErrTooLong      = errors.New("kid exceeds the maximum UTF-8 byte length")
)

// Validate reports whether kid satisfies the Wire 0.2 profile: non-empty,
// well-formed UTF-8, free of Unicode noncharacters, and at most MaxUTF8Bytes UTF-8
// bytes. It returns one of the classified sentinel errors, or nil. Well-formedness
// is checked before length so the classification is deterministic.
func Validate(kid string) error {
	if kid == "" {
		return ErrEmpty
	}
	if !utf8.ValidString(kid) {
		return ErrInvalidUTF8
	}
	for _, r := range kid {
		if IsNoncharacter(r) {
			return ErrNoncharacter
		}
	}
	if len(kid) > MaxUTF8Bytes {
		return ErrTooLong
	}
	return nil
}

// IsNoncharacter reports whether r is one of the 66 Unicode noncharacters
// (U+FDD0..U+FDEF and the last two code points of every plane, U+xFFFE and
// U+xFFFF). RFC 7493 forbids these in JSON strings and member names. It mirrors
// the noncharacter predicate in the raw I-JSON gate; a parity test pins the two.
func IsNoncharacter(r rune) bool {
	return (r >= 0xFDD0 && r <= 0xFDEF) ||
		(r >= 0xFFFE && r <= 0x10FFFF && (r&0xFFFF == 0xFFFE || r&0xFFFF == 0xFFFF))
}
