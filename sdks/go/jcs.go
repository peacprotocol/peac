package peac

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

// Canonicalize produces an RFC 8785 (JCS) canonical serialization of JSON input.
//
// Parses with json.Decoder + UseNumber() to preserve numeric precision.
// Sort object keys by Unicode code point order. Numbers serialized per
// RFC 8785 Section 3.2.2.3. Strings serialized per RFC 8785 Section 3.2.2.2.
//
// Byte-for-byte equivalent with TypeScript canonicalize() from @peac/crypto.
func Canonicalize(input []byte) ([]byte, error) {
	dec := json.NewDecoder(bytes.NewReader(input))
	dec.UseNumber()

	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, fmt.Errorf("jcs: failed to decode JSON: %w", err)
	}

	// Reject trailing non-whitespace after the first JSON value.
	// json.Decoder reads only the first value; trailing data must be rejected
	// for protocol-grade canonicalization.
	remaining := input[dec.InputOffset():]
	for _, b := range remaining {
		if b != ' ' && b != '\t' && b != '\n' && b != '\r' {
			return nil, fmt.Errorf("jcs: trailing non-whitespace data after JSON value")
		}
	}

	var buf bytes.Buffer
	if err := canonicalizeValue(&buf, v); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// JCSHash computes the JCS canonical form then returns "sha256:<hex>".
func JCSHash(input []byte) (string, error) {
	canonical, err := Canonicalize(input)
	if err != nil {
		return "", err
	}
	h := sha256.Sum256(canonical)
	return "sha256:" + hex.EncodeToString(h[:]), nil
}

func canonicalizeValue(buf *bytes.Buffer, v any) error {
	switch val := v.(type) {
	case nil:
		buf.WriteString("null")
	case bool:
		if val {
			buf.WriteString("true")
		} else {
			buf.WriteString("false")
		}
	case json.Number:
		return canonicalizeNumber(buf, val)
	case string:
		return canonicalizeString(buf, val)
	case []any:
		buf.WriteByte('[')
		for i, item := range val {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := canonicalizeValue(buf, item); err != nil {
				return err
			}
		}
		buf.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(val))
		for k := range val {
			keys = append(keys, k)
		}
		// Sort by Unicode code point order (Go string comparison is byte-level
		// which matches code point order for valid UTF-8)
		sort.Strings(keys)

		buf.WriteByte('{')
		first := true
		for _, k := range keys {
			if first {
				first = false
			} else {
				buf.WriteByte(',')
			}
			if err := canonicalizeString(buf, k); err != nil {
				return err
			}
			buf.WriteByte(':')
			if err := canonicalizeValue(buf, val[k]); err != nil {
				return err
			}
		}
		buf.WriteByte('}')
	default:
		return fmt.Errorf("jcs: unsupported type %T", v)
	}
	return nil
}

// canonicalizeNumber per RFC 8785 Section 3.2.2.3:
// Use the shortest representation that uniquely identifies the IEEE 754 value.
func canonicalizeNumber(buf *bytes.Buffer, n json.Number) error {
	s := n.String()

	// Try integer first (no decimal point, no exponent)
	if i, err := n.Int64(); err == nil {
		// Check roundtrip: the string form must match
		if strconv.FormatInt(i, 10) == s {
			buf.WriteString(s)
			return nil
		}
	}

	f, err := n.Float64()
	if err != nil {
		return fmt.Errorf("jcs: invalid number %q: %w", s, err)
	}

	// Handle special cases
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return fmt.Errorf("jcs: NaN and Infinity are not valid JSON")
	}

	// -0 must serialize as 0
	if f == 0 {
		buf.WriteByte('0')
		return nil
	}

	// Use ECMAScript Number serialization (matches RFC 8785)
	buf.WriteString(formatECMANumber(f))
	return nil
}

// formatECMANumber formats a float64 per ECMAScript Number::toString()
// which matches RFC 8785 Section 3.2.2.3 requirements.
//
// ECMAScript uses exponential notation when the exponent is < -6 or >= 21.
// For all other cases, it uses plain decimal notation.
// Go's strconv.FormatFloat with 'e' format gives us the mantissa and exponent;
// we then apply the ECMAScript formatting rules.
func formatECMANumber(f float64) string {
	// Get the shortest exponential representation
	s := strconv.FormatFloat(f, 'e', -1, 64)

	// Parse mantissa and exponent
	eIdx := strings.IndexByte(s, 'e')
	if eIdx < 0 {
		return s
	}
	mantissa := s[:eIdx]
	exp, _ := strconv.Atoi(s[eIdx+1:])

	// Remove decimal point from mantissa, track position
	negative := false
	if mantissa[0] == '-' {
		negative = true
		mantissa = mantissa[1:]
	}
	dotIdx := strings.IndexByte(mantissa, '.')
	if dotIdx >= 0 {
		mantissa = mantissa[:dotIdx] + mantissa[dotIdx+1:]
	} else {
		dotIdx = len(mantissa)
	}
	// Number of digits after the leading digit
	fracDigits := len(mantissa) - 1

	// The actual exponent for the integer mantissa
	// mantissa = "12345", exp = 3 means 1.2345e+3
	// The effective decimal position is exp + 1 from the left

	// ECMAScript: if exponent n satisfies -6 < n <= 0 (small decimals) or 0 < n < 21 (plain integers/decimals)
	// use plain form; otherwise use exponential
	n := exp + 1 // number of digits before decimal point in plain form

	prefix := ""
	if negative {
		prefix = "-"
	}

	if n >= 1 && n <= 21 && n >= len(mantissa) {
		// Integer-like: pad with zeros
		return prefix + mantissa + strings.Repeat("0", n-len(mantissa))
	}
	if n >= 1 && n <= 21 && n < len(mantissa) {
		// Decimal: insert dot
		return prefix + mantissa[:n] + "." + mantissa[n:]
	}
	if n <= 0 && n > -6 {
		// Small decimal: 0.000...digits
		return prefix + "0." + strings.Repeat("0", -n) + mantissa
	}

	// Exponential notation
	result := prefix + string(mantissa[0])
	if fracDigits > 0 {
		result += "." + mantissa[1:]
	}
	result += "e+"
	if exp < 0 {
		result = prefix + string(mantissa[0])
		if fracDigits > 0 {
			result += "." + mantissa[1:]
		}
		result += "e-" + strconv.Itoa(-exp)
	} else {
		result += strconv.Itoa(exp)
	}
	return result
}

// canonicalizeString per RFC 8785 Section 3.2.2.2:
// Minimal escaping -- only required characters are escaped.
func canonicalizeString(buf *bytes.Buffer, s string) error {
	buf.WriteByte('"')
	for _, r := range s {
		switch {
		case r == '"':
			buf.WriteString(`\"`)
		case r == '\\':
			buf.WriteString(`\\`)
		case r == '\b':
			buf.WriteString(`\b`)
		case r == '\f':
			buf.WriteString(`\f`)
		case r == '\n':
			buf.WriteString(`\n`)
		case r == '\r':
			buf.WriteString(`\r`)
		case r == '\t':
			buf.WriteString(`\t`)
		case r < 0x20:
			// Control characters: \u00XX
			fmt.Fprintf(buf, `\u%04x`, r)
		default:
			buf.WriteRune(r)
		}
	}
	buf.WriteByte('"')
	return nil
}
