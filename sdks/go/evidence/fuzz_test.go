package evidence

import (
	"encoding/json"
	"testing"
)

// FuzzValidate tests that Validate never panics on arbitrary input.
// Run with: go test -fuzz=FuzzValidate -fuzztime=30s
func FuzzValidate(f *testing.F) {
	// Add seed corpus
	seeds := []string{
		`null`,
		`true`,
		`false`,
		`42`,
		`3.14`,
		`"hello"`,
		`""`,
		`[]`,
		`{}`,
		`[1,2,3]`,
		`{"key":"value"}`,
		`{"nested":{"deep":"value"}}`,
		`[{"a":1},{"b":2}]`,
		// Edge cases
		`[[[[[1]]]]]`,
		`{"a":{"b":{"c":{"d":1}}}}`,
		// Invalid JSON (should not panic)
		`{`,
		`[`,
		`{"key":}`,
		`[1,2,`,
		`not json`,
		``,
		// Large numbers
		`1e308`,
		`-1e308`,
		// Unicode
		`"日本語"`,
		`"🎉"`,
		// Escaped characters
		`"\n\t\r"`,
		`"\u0000"`,
	}

	for _, seed := range seeds {
		f.Add([]byte(seed))
	}

	f.Fuzz(func(t *testing.T, data []byte) {
		// Should never panic
		_ = Validate(data, DefaultLimits())
	})
}

// FuzzValidateWithTightLimits tests with restrictive limits.
func FuzzValidateWithTightLimits(f *testing.F) {
	seeds := []string{
		`null`,
		`[1,2,3,4,5,6,7,8,9,10]`,
		`{"a":1,"b":2,"c":3,"d":4,"e":5}`,
		`"short"`,
		`"this is a longer string that might exceed limits"`,
		`[[[[[1]]]]]`,
	}

	for _, seed := range seeds {
		f.Add([]byte(seed))
	}

	tightLimits := Limits{
		MaxDepth:        5,
		MaxArrayLength:  10,
		MaxObjectKeys:   5,
		MaxStringLength: 20,
		MaxTotalNodes:   50,
	}

	f.Fuzz(func(t *testing.T, data []byte) {
		// Should never panic, may return errors
		_ = Validate(data, tightLimits)
	})
}

// FuzzValidateValue tests pre-parsed value validation.
func FuzzValidateValue(f *testing.F) {
	seeds := []string{
		`null`,
		`true`,
		`42`,
		`"hello"`,
		`[]`,
		`{}`,
		`[1,2,3]`,
		`{"key":"value"}`,
	}

	for _, seed := range seeds {
		f.Add([]byte(seed))
	}

	f.Fuzz(func(t *testing.T, data []byte) {
		// First try to parse as JSON
		var value any
		if err := json.Unmarshal(data, &value); err != nil {
			// Invalid JSON, skip
			return
		}

		// Should never panic on valid JSON
		_ = ValidateValue(value, DefaultLimits())
	})
}
