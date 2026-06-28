package peac

// I-JSON (RFC 7493) raw-bytes gate.
//
// Runs on the UTF-8 bytes of a JSON document BEFORE json.Unmarshal, because
// platform JSON parsers can collapse duplicate object member names, round or
// overflow numeric values, or substitute invalid string data before higher-level
// validation sees the original bytes. The gate also classifies string-level
// syntax failures consistently at the raw boundary. It rejects, per I-JSON
// (RFC 7493):
//
//   - duplicate object member names  -> json.Unmarshal keeps the last; Token()
//     emits both but neither rejects   => E_IJSON_DUPLICATE_MEMBER_NAME
//   - numbers non-finite OR whose absolute magnitude exceeds 2^53-1 (incl. large
//     finite floats) -> rounded/overflowed => E_IJSON_NUMBER_OUT_OF_RANGE
//   - invalid string content: lone surrogates or noncharacters (directly encoded
//     or in \u escapes), invalid escape sequences, or invalid UTF-8 bytes
//     inside a string. NOTE: Go's
//     json.Decoder.Token() SILENTLY replaces lone surrogates and invalid UTF-8
//     with U+FFFD (never errors), so it cannot be relied on for I-JSON string
//     validity. => E_IJSON_INVALID_STRING
//
// This is a strict single-pass byte-level JSON parser (a direct port of the
// TypeScript packages/crypto/src/ijson.ts scanner, for maximum cross-language
// parity). It distinguishes invalid UTF-8 INSIDE a string (an I-JSON pathology
// -> E_IJSON_INVALID_STRING) from bytes that are not valid JSON at all
// (-> E_INVALID_FORMAT, the same outcome json.Unmarshal would have produced).
// It does NOT build a value tree (the existing json.Unmarshal does that next).
//
// The gate is internal (unexported); no big.Int is used for the numeric range
// check; range decisions are made by bounded decimal-string comparison.

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

// maxSafeDigits is 2^53 - 1 (= JS Number.MAX_SAFE_INTEGER), as a digit string.
const maxSafeDigits = "9007199254740991"

// ijsonError is a typed error from the I-JSON gate. Code is a canonical PEAC
// error code: one of E_IJSON_DUPLICATE_MEMBER_NAME, E_IJSON_NUMBER_OUT_OF_RANGE,
// E_IJSON_INVALID_STRING (the three I-JSON pathologies), or E_INVALID_FORMAT
// (generic JSON syntax error, same as json.Unmarshal would produce).
type ijsonError struct {
	Code string
	Msg  string
}

func (e *ijsonError) Error() string { return e.Msg }

// assertIJSON enforces I-JSON (RFC 7493) on the raw UTF-8 bytes of a JSON
// document. It returns an *ijsonError if the bytes violate I-JSON, nil otherwise.
func assertIJSON(data []byte) error {
	s := &ijsonScanner{b: data}
	if err := s.parseValue(); err != nil {
		return err
	}
	s.skipWhitespace()
	if !s.atEnd() {
		return s.syntax("trailing data after JSON value")
	}
	return nil
}

type ijsonScanner struct {
	b []byte
	i int
}

func (s *ijsonScanner) atEnd() bool { return s.i >= len(s.b) }

func (s *ijsonScanner) syntax(msg string) *ijsonError {
	return &ijsonError{Code: "E_INVALID_FORMAT", Msg: "I-JSON: " + msg}
}

func (s *ijsonScanner) invalidString(msg string) *ijsonError {
	return &ijsonError{Code: "E_IJSON_INVALID_STRING", Msg: "I-JSON: " + msg}
}

func (s *ijsonScanner) skipWhitespace() {
	for s.i < len(s.b) {
		c := s.b[s.i]
		if c == 0x20 || c == 0x09 || c == 0x0a || c == 0x0d {
			s.i++
		} else {
			break
		}
	}
}

func (s *ijsonScanner) parseValue() error {
	s.skipWhitespace()
	if s.atEnd() {
		return s.syntax("unexpected end of input")
	}
	c := s.b[s.i]
	switch {
	case c == '{':
		return s.parseObject()
	case c == '[':
		return s.parseArray()
	case c == '"':
		_, err := s.parseString()
		return err
	case c == 't':
		return s.parseLiteral("true")
	case c == 'f':
		return s.parseLiteral("false")
	case c == 'n':
		return s.parseLiteral("null")
	case c == '-' || (c >= '0' && c <= '9'):
		return s.parseNumber()
	default:
		return s.syntax(fmt.Sprintf("unexpected byte 0x%x", c))
	}
}

func (s *ijsonScanner) parseLiteral(lit string) error {
	for k := 0; k < len(lit); k++ {
		if s.i+k >= len(s.b) || s.b[s.i+k] != lit[k] {
			return s.syntax("invalid literal, expected " + lit)
		}
	}
	s.i += len(lit)
	return nil
}

func (s *ijsonScanner) parseObject() error {
	s.i++ // consume '{'
	names := make(map[string]struct{})
	s.skipWhitespace()
	if s.i < len(s.b) && s.b[s.i] == '}' {
		s.i++
		return nil
	}
	for {
		s.skipWhitespace()
		if s.i >= len(s.b) || s.b[s.i] != '"' {
			return s.syntax("expected string member name")
		}
		name, err := s.parseString()
		if err != nil {
			return err
		}
		if _, dup := names[name]; dup {
			return &ijsonError{
				Code: "E_IJSON_DUPLICATE_MEMBER_NAME",
				Msg:  "I-JSON: duplicate object member name",
			}
		}
		names[name] = struct{}{}
		s.skipWhitespace()
		if s.i >= len(s.b) || s.b[s.i] != ':' {
			return s.syntax("expected ':' after member name")
		}
		s.i++
		if err := s.parseValue(); err != nil {
			return err
		}
		s.skipWhitespace()
		if s.atEnd() {
			return s.syntax("expected ',' or '}' in object")
		}
		switch s.b[s.i] {
		case ',':
			s.i++
		case '}':
			s.i++
			return nil
		default:
			return s.syntax("expected ',' or '}' in object")
		}
	}
}

func (s *ijsonScanner) parseArray() error {
	s.i++ // consume '['
	s.skipWhitespace()
	if s.i < len(s.b) && s.b[s.i] == ']' {
		s.i++
		return nil
	}
	for {
		if err := s.parseValue(); err != nil {
			return err
		}
		s.skipWhitespace()
		if s.atEnd() {
			return s.syntax("expected ',' or ']' in array")
		}
		switch s.b[s.i] {
		case ',':
			s.i++
		case ']':
			s.i++
			return nil
		default:
			return s.syntax("expected ',' or ']' in array")
		}
	}
}

// parseString parses a JSON string from raw bytes: validates escapes + surrogate
// pairing + UTF-8 of raw runs, and returns the decoded value (used for
// duplicate-member-name comparison after escape processing per RFC 7493).
func (s *ijsonScanner) parseString() (string, error) {
	s.i++ // consume opening '"'
	var out strings.Builder
	runStart := s.i
	flushRun := func(end int) error {
		if end > runStart {
			run := s.b[runStart:end]
			if !utf8.Valid(run) {
				return s.invalidString("invalid UTF-8 byte in string")
			}
			// RFC 7493: reject Unicode noncharacters in directly-encoded UTF-8 too.
			for _, r := range string(run) {
				if isUnicodeNoncharacter(r) {
					return s.invalidString("noncharacter in string")
				}
			}
			out.Write(run)
		}
		return nil
	}
	for {
		if s.atEnd() {
			return "", s.invalidString("unterminated string")
		}
		c := s.b[s.i]
		if c == '"' {
			if err := flushRun(s.i); err != nil {
				return "", err
			}
			s.i++
			return out.String(), nil
		}
		if c == '\\' {
			if err := flushRun(s.i); err != nil {
				return "", err
			}
			s.i++ // consume '\'
			if s.atEnd() {
				return "", s.invalidString("unterminated escape sequence")
			}
			e := s.b[s.i]
			switch e {
			case '"':
				out.WriteByte('"')
				s.i++
			case '\\':
				out.WriteByte('\\')
				s.i++
			case '/':
				out.WriteByte('/')
				s.i++
			case 'b':
				out.WriteByte('\b')
				s.i++
			case 'f':
				out.WriteByte('\f')
				s.i++
			case 'n':
				out.WriteByte('\n')
				s.i++
			case 'r':
				out.WriteByte('\r')
				s.i++
			case 't':
				out.WriteByte('\t')
				s.i++
			case 'u':
				s.i++
				hi, err := s.readHex4()
				if err != nil {
					return "", err
				}
				if hi >= 0xd800 && hi <= 0xdbff {
					if s.i+1 >= len(s.b) || s.b[s.i] != '\\' || s.b[s.i+1] != 'u' {
						return "", s.invalidString("lone high surrogate in \\u escape")
					}
					s.i += 2 // consume "\u" of low surrogate
					lo, err := s.readHex4()
					if err != nil {
						return "", err
					}
					if lo < 0xdc00 || lo > 0xdfff {
						return "", s.invalidString("high surrogate not followed by a low surrogate")
					}
					r := 0x10000 + (rune(hi-0xd800) << 10) + rune(lo-0xdc00)
					if isUnicodeNoncharacter(r) {
						return "", s.invalidString("noncharacter in string")
					}
					out.WriteRune(r)
				} else if hi >= 0xdc00 && hi <= 0xdfff {
					return "", s.invalidString("lone low surrogate in \\u escape")
				} else {
					if isUnicodeNoncharacter(rune(hi)) {
						return "", s.invalidString("noncharacter in string")
					}
					out.WriteRune(rune(hi))
				}
			default:
				return "", s.invalidString("invalid escape sequence")
			}
			runStart = s.i
			continue
		}
		if c < 0x20 {
			return "", s.syntax("unescaped control character in string")
		}
		// Normal byte (printable ASCII, or part of a multibyte UTF-8 sequence
		// validated together by flushRun via utf8.Valid).
		s.i++
	}
}

func (s *ijsonScanner) readHex4() (int, error) {
	if s.i+4 > len(s.b) {
		return 0, s.invalidString("truncated \\u escape")
	}
	v := 0
	for k := 0; k < 4; k++ {
		ch := s.b[s.i+k]
		var d int
		switch {
		case ch >= '0' && ch <= '9':
			d = int(ch - '0')
		case ch >= 'A' && ch <= 'F':
			d = int(ch-'A') + 10
		case ch >= 'a' && ch <= 'f':
			d = int(ch-'a') + 10
		default:
			return 0, s.invalidString("invalid hex digit in \\u escape")
		}
		v = v*16 + d
	}
	s.i += 4
	return v, nil
}

func (s *ijsonScanner) asciiSlice(start, end int) string {
	return string(s.b[start:end])
}

// parseNumber parses a JSON number literal (ASCII) and enforces the I-JSON range predicate.
func (s *ijsonScanner) parseNumber() error {
	if s.b[s.i] == '-' {
		s.i++
	}
	// integer part
	intStart := s.i
	if s.i < len(s.b) && s.b[s.i] == '0' {
		s.i++
	} else if s.i < len(s.b) && s.b[s.i] >= '1' && s.b[s.i] <= '9' {
		for s.i < len(s.b) && s.b[s.i] >= '0' && s.b[s.i] <= '9' {
			s.i++
		}
	} else {
		return s.syntax("invalid number: missing integer digits")
	}
	intDigits := s.asciiSlice(intStart, s.i)
	// fraction part
	fracDigits := ""
	if s.i < len(s.b) && s.b[s.i] == '.' {
		s.i++
		fracStart := s.i
		if s.i >= len(s.b) || s.b[s.i] < '0' || s.b[s.i] > '9' {
			return s.syntax("invalid number: missing fraction digits")
		}
		for s.i < len(s.b) && s.b[s.i] >= '0' && s.b[s.i] <= '9' {
			s.i++
		}
		fracDigits = s.asciiSlice(fracStart, s.i)
	}
	// exponent part (kept as digits + sign; never parsed into an int that could
	// overflow, and never used to allocate)
	expDigits := ""
	expNegative := false
	if s.i < len(s.b) && (s.b[s.i] == 'e' || s.b[s.i] == 'E') {
		s.i++
		if s.i < len(s.b) && s.b[s.i] == '+' {
			s.i++
		} else if s.i < len(s.b) && s.b[s.i] == '-' {
			expNegative = true
			s.i++
		}
		expStart := s.i
		if s.i >= len(s.b) || s.b[s.i] < '0' || s.b[s.i] > '9' {
			return s.syntax("invalid number: missing exponent digits")
		}
		for s.i < len(s.b) && s.b[s.i] >= '0' && s.b[s.i] <= '9' {
			s.i++
		}
		expDigits = s.asciiSlice(expStart, s.i)
	}

	if numberMagnitudeExceedsSafe(intDigits, fracDigits, expDigits, expNegative) {
		return &ijsonError{
			Code: "E_IJSON_NUMBER_OUT_OF_RANGE",
			Msg:  "I-JSON: number is non-finite or exceeds the safe numeric range; encode large values as strings",
		}
	}
	return nil
}

// numberMagnitudeExceedsSafe reports whether a number must be REJECTED because
// its absolute decimal magnitude is greater than 2^53-1. Exact for every JSON
// number form (integer, fraction, exponent): the comparison is performed on the
// decimal digit string against the bound, so binary64 rounding can never accept a
// value whose exact magnitude exceeds the bound (e.g. 9007199254740991.1). No
// big.Int is used. The exponent is consumed as digits + sign and clamped, so an
// arbitrarily large exponent cannot overflow or allocate.
//
// value = M * 10^decimalExp, where M is the significand digits (leading zeros
// stripped) and decimalExp = exp - len(fracDigits). intDigitCount is the number
// of integer digits of the magnitude.
func numberMagnitudeExceedsSafe(intDigits, fracDigits, expDigits string, expNegative bool) bool {
	sig := stripLeadingZeros(intDigits + fracDigits)
	if sig == "0" {
		return false // value is exactly 0
	}
	L := len(sig)

	decimalExp := clampedExp(expDigits, expNegative) - len(fracDigits)
	intDigitCount := L + decimalExp // integer digits of the magnitude

	bound := maxSafeDigits // 16 digits
	if intDigitCount > len(bound) {
		return true // >= 10^16 > bound
	}
	if intDigitCount < len(bound) {
		return false // < 10^15 < bound
	}

	// intDigitCount == 16: compare the 16-digit integer part exactly.
	if decimalExp >= 0 {
		intPart := sig + strings.Repeat("0", decimalExp)
		return intPart > bound
	}
	// decimalExp < 0: integer part is the first 16 digits; remainder is fractional.
	intPart := sig[:len(bound)]
	if intPart > bound {
		return true
	}
	if intPart < bound {
		return false
	}
	// integer part == bound: any nonzero fractional digit pushes magnitude over.
	for _, ch := range sig[len(bound):] {
		if ch != '0' {
			return true
		}
	}
	return false
}

// clampedExp parses an exponent digit string + sign into an int, clamped so a
// very large exponent cannot overflow. The clamp magnitude (1e9) far exceeds any
// possible significand length for size-bounded inputs, so a clamped exponent
// always drives intDigitCount past the decision boundary in the correct direction.
func clampedExp(expDigits string, expNegative bool) int {
	if len(expDigits) == 0 {
		return 0
	}
	// Strip leading zeros BEFORE the length-based clamp so a zero-padded exponent
	// (e.g. 1e0000000003 == 1e3) is not mistaken for a huge exponent.
	normalized := stripLeadingZeros(expDigits)
	if normalized == "0" {
		return 0
	}
	mag := 1_000_000_000
	if len(normalized) <= 9 {
		mag = 0
		for i := 0; i < len(normalized); i++ {
			mag = mag*10 + int(normalized[i]-'0')
		}
	}
	if expNegative {
		return -mag
	}
	return mag
}

func stripLeadingZeros(digits string) string {
	j := 0
	for j < len(digits)-1 && digits[j] == '0' {
		j++
	}
	return digits[j:]
}

// isUnicodeNoncharacter reports whether a code point is a Unicode noncharacter.
// RFC 7493: a JSON string (and member name) MUST NOT contain noncharacters, in
// directly-encoded or escaped form. The 66 noncharacters are U+FDD0..U+FDEF and
// the last two code points of every plane (U+xFFFE, U+xFFFF).
func isUnicodeNoncharacter(r rune) bool {
	return (r >= 0xFDD0 && r <= 0xFDEF) ||
		(r >= 0xFFFE && r <= 0x10FFFF && ((r&0xFFFF) == 0xFFFE || (r&0xFFFF) == 0xFFFF))
}
