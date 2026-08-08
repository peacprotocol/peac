package peac

import (
	"fmt"
	"sort"
	"unicode/utf8"
)

// Issuance/verification I-JSON symmetry (payload).
//
// The verifier applies the raw-bytes I-JSON gate (assertIJSON, RFC 7493) to the decoded payload
// before parsing. The issuer must not emit a payload that gate would reject. Two problems can arise
// when a caller-supplied Go value is marshaled:
//
//   - Invalid UTF-8 in a Go string is silently replaced with U+FFFD by encoding/json. U+FFFD is a
//     valid character, so a post-marshal scan cannot recover the original invalidity. This class
//     MUST be detected before json.Marshal runs, on the Go values themselves. That is the sole job
//     of the pre-marshal walk below.
//   - Unicode noncharacters and out-of-range numbers survive marshaling as valid UTF-8 / literal
//     digits, so they are caught after marshaling by assertIJSON over the exact signed bytes. The
//     pre-marshal walk deliberately does not re-implement that logic.
//
// The walk covers every caller-controlled string reachable in the marshaled payload: the typed
// top-level fields (including the generated or caller-supplied rid), the pillar list, the optional
// actor and policy blocks, and every string value and string member name inside the extension map.

// maxClaimGraphNodes bounds the extension-map traversal so the walk terminates on any input,
// independent of whether evidence.ValidateValue (which enforces its own node and depth bounds) ran
// first. It matches the evidence validator's default node ceiling.
const maxClaimGraphNodes = 100000

// validateClaimUTF8 rejects any caller-controlled claim string that is not valid UTF-8, before the
// claims are marshaled and signed. It operates on the built claims struct so a caller-supplied
// receipt-ID generator or actor/policy/extension value cannot introduce bytes it does not see.
func validateClaimUTF8(claims *InteractionRecordClaims) error {
	typed := []struct {
		field string
		value string
	}{
		{"iss", claims.Iss},
		{"sub", claims.Sub},
		{"rid", claims.Rid},
		{"kind", claims.Kind},
		{"type", claims.Type},
		{"peac_version", claims.PeacVersion},
	}
	for _, t := range typed {
		if err := checkClaimStringUTF8(t.value, t.field); err != nil {
			return err
		}
	}
	for i, p := range claims.Pillars {
		if err := checkClaimStringUTF8(p, fmt.Sprintf("pillars[%d]", i)); err != nil {
			return err
		}
	}
	if claims.Actor != nil {
		if err := checkClaimStringUTF8(claims.Actor.ID, "actor.id"); err != nil {
			return err
		}
		if err := checkClaimStringUTF8(claims.Actor.Role, "actor.role"); err != nil {
			return err
		}
		for i, pt := range claims.Actor.ProofTypes {
			if err := checkClaimStringUTF8(pt, fmt.Sprintf("actor.proof_types[%d]", i)); err != nil {
				return err
			}
		}
	}
	if claims.Peac != nil {
		if err := checkClaimStringUTF8(claims.Peac.Digest, "policy.digest"); err != nil {
			return err
		}
		if err := checkClaimStringUTF8(claims.Peac.URI, "policy.uri"); err != nil {
			return err
		}
		if err := checkClaimStringUTF8(claims.Peac.Version, "policy.version"); err != nil {
			return err
		}
	}
	if claims.Ext != nil {
		if err := validateExtUTF8(claims.Ext); err != nil {
			return err
		}
	}
	return nil
}

// checkClaimStringUTF8 returns an *IssueError if s is not valid UTF-8.
func checkClaimStringUTF8(s, field string) error {
	if !utf8.ValidString(s) {
		return &IssueError{
			Code:    ErrCodeInvalidUTF8,
			Message: "claim string is not valid UTF-8",
			Field:   field,
		}
	}
	return nil
}

// validateExtUTF8 walks the extension graph and rejects any string value or member name that is not
// valid UTF-8. The traversal is iterative and self-bounded: it carries its own node ceiling and
// fails closed on any value type outside the JSON builtins, so it terminates and cannot panic even
// if it is ever reached without evidence.ValidateValue having constrained the graph first.
func validateExtUTF8(ext map[string]any) error {
	type frame struct {
		value any
		path  string
	}
	stack := []frame{{value: ext, path: "ext"}}
	nodes := 0
	for len(stack) > 0 {
		item := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		nodes++
		if nodes > maxClaimGraphNodes {
			return &IssueError{
				Code:    ErrCodeInvalidType,
				Message: fmt.Sprintf("extension graph exceeds %d nodes", maxClaimGraphNodes),
				Field:   "Extensions",
			}
		}

		switch v := item.value.(type) {
		case nil, bool, float64:
			// Scalars that cannot carry invalid UTF-8.
		case string:
			if err := checkClaimStringUTF8(v, item.path); err != nil {
				return err
			}
		case []any:
			for i := len(v) - 1; i >= 0; i-- {
				stack = append(stack, frame{value: v[i], path: fmt.Sprintf("%s[%d]", item.path, i)})
			}
		case map[string]any:
			keys := make([]string, 0, len(v))
			for k := range v {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for i := len(keys) - 1; i >= 0; i-- {
				k := keys[i]
				if err := checkClaimStringUTF8(k, item.path+" (member name)"); err != nil {
					return err
				}
				stack = append(stack, frame{value: v[k], path: item.path + "." + k})
			}
		default:
			return &IssueError{
				Code:    ErrCodeInvalidType,
				Message: fmt.Sprintf("unexpected extension value type %T", v),
				Field:   item.path,
			}
		}
	}
	return nil
}
