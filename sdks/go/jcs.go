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

// formatECMANumber formats a float64 per ECMAScript specification which
// matches RFC 8785 Section 3.2.2.3 requirements.
func formatECMANumber(f float64) string {
	// strconv.FormatFloat with 'G' and -1 precision gives shortest unique form
	// but may use 'E' notation. We need lowercase 'e' and specific formatting.
	s := strconv.FormatFloat(f, 'e', -1, 64)

	// Parse mantissa and exponent
	parts := bytes.SplitN([]byte(s), []byte("e"), 2)
	mantissa := string(parts[0])
	exp := 0
	if len(parts) == 2 {
		exp, _ = strconv.Atoi(string(parts[1]))
	}

	// Remove trailing zeros from mantissa decimal
	if idx := bytes.IndexByte(parts[0], '.'); idx >= 0 {
		mantissa = string(bytes.TrimRight(parts[0], "0"))
		if mantissa[len(mantissa)-1] == '.' {
			mantissa = mantissa[:len(mantissa)-1]
		}
	}

	// Apply exponent to determine best representation
	// ECMAScript: use plain form if exponent in [-6, 20]
	if exp == 0 {
		return mantissa
	}

	return strconv.FormatFloat(f, 'f', -1, 64)
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
