package evidence

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestDefaultLimits(t *testing.T) {
	limits := DefaultLimits()

	if limits.MaxDepth != 32 {
		t.Errorf("MaxDepth = %d, want 32", limits.MaxDepth)
	}
	if limits.MaxArrayLength != 10000 {
		t.Errorf("MaxArrayLength = %d, want 10000", limits.MaxArrayLength)
	}
	if limits.MaxObjectKeys != 1000 {
		t.Errorf("MaxObjectKeys = %d, want 1000", limits.MaxObjectKeys)
	}
	if limits.MaxStringLength != 65536 {
		t.Errorf("MaxStringLength = %d, want 65536", limits.MaxStringLength)
	}
	if limits.MaxTotalNodes != 100000 {
		t.Errorf("MaxTotalNodes = %d, want 100000", limits.MaxTotalNodes)
	}
}

func TestValidate_EmptyData(t *testing.T) {
	err := Validate([]byte{}, DefaultLimits())
	if err != nil {
		t.Errorf("Validate() with empty data should return nil, got %v", err)
	}
}

func TestValidate_ValidJSON(t *testing.T) {
	tests := []struct {
		name string
		json string
	}{
		{"null", "null"},
		{"boolean true", "true"},
		{"boolean false", "false"},
		{"integer", "42"},
		{"negative integer", "-123"},
		{"float", "3.14159"},
		{"string", `"hello world"`},
		{"empty string", `""`},
		{"empty array", "[]"},
		{"empty object", "{}"},
		{"simple array", "[1, 2, 3]"},
		{"simple object", `{"key": "value"}`},
		{"nested object", `{"a": {"b": {"c": 1}}}`},
		{"mixed array", `[1, "two", true, null, {"key": "value"}]`},
		{"complex structure", `{"users": [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := Validate([]byte(tt.json), DefaultLimits())
			if err != nil {
				t.Errorf("Validate(%s) error = %v", tt.json, err)
			}
		})
	}
}

func TestValidate_InvalidJSON(t *testing.T) {
	tests := []struct {
		name string
		json string
	}{
		{"malformed object", `{"key": }`},
		{"malformed array", `[1, 2, `},
		{"trailing comma", `{"a": 1,}`},
		{"single quote string", `{'key': 'value'}`},
		{"unquoted key", `{key: "value"}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := Validate([]byte(tt.json), DefaultLimits())
			if err == nil {
				t.Error("Validate() should error on invalid JSON")
			}
			ve, ok := err.(*ValidationError)
			if !ok {
				t.Errorf("error should be *ValidationError, got %T", err)
				return
			}
			if ve.Code != ErrCodeInvalidJSON {
				t.Errorf("error code = %s, want %s", ve.Code, ErrCodeInvalidJSON)
			}
		})
	}
}

func TestValidate_DepthExceeded(t *testing.T) {
	limits := Limits{
		MaxDepth:        3,
		MaxArrayLength:  10000,
		MaxObjectKeys:   1000,
		MaxStringLength: 65536,
		MaxTotalNodes:   100000,
	}

	// Depth 3 should pass: {"a": {"b": {"c": 1}}}
	err := Validate([]byte(`{"a": {"b": {"c": 1}}}`), limits)
	if err != nil {
		t.Errorf("depth 3 should pass, got error: %v", err)
	}

	// Depth 4 should fail: {"a": {"b": {"c": {"d": 1}}}}
	err = Validate([]byte(`{"a": {"b": {"c": {"d": 1}}}}`), limits)
	if err == nil {
		t.Error("depth 4 should fail")
	}
	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error should be *ValidationError, got %T", err)
	}
	if ve.Code != ErrCodeDepthExceeded {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeDepthExceeded)
	}
}

func TestValidate_ArrayDepthExceeded(t *testing.T) {
	limits := Limits{
		MaxDepth:        2,
		MaxArrayLength:  10000,
		MaxObjectKeys:   1000,
		MaxStringLength: 65536,
		MaxTotalNodes:   100000,
	}

	// Depth 2 should pass: [[1]]
	err := Validate([]byte(`[[1]]`), limits)
	if err != nil {
		t.Errorf("depth 2 should pass, got error: %v", err)
	}

	// Depth 3 should fail: [[[1]]]
	err = Validate([]byte(`[[[1]]]`), limits)
	if err == nil {
		t.Error("depth 3 should fail")
	}
	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error should be *ValidationError, got %T", err)
	}
	if ve.Code != ErrCodeDepthExceeded {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeDepthExceeded)
	}
}

func TestValidate_ArrayTooLarge(t *testing.T) {
	limits := Limits{
		MaxDepth:        32,
		MaxArrayLength:  5,
		MaxObjectKeys:   1000,
		MaxStringLength: 65536,
		MaxTotalNodes:   100000,
	}

	// 5 elements should pass
	err := Validate([]byte(`[1, 2, 3, 4, 5]`), limits)
	if err != nil {
		t.Errorf("5 elements should pass, got error: %v", err)
	}

	// 6 elements should fail
	err = Validate([]byte(`[1, 2, 3, 4, 5, 6]`), limits)
	if err == nil {
		t.Error("6 elements should fail")
	}
	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error should be *ValidationError, got %T", err)
	}
	if ve.Code != ErrCodeArrayTooLarge {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeArrayTooLarge)
	}
}

func TestValidate_ObjectTooLarge(t *testing.T) {
	limits := Limits{
		MaxDepth:        32,
		MaxArrayLength:  10000,
		MaxObjectKeys:   3,
		MaxStringLength: 65536,
		MaxTotalNodes:   100000,
	}

	// 3 keys should pass
	err := Validate([]byte(`{"a": 1, "b": 2, "c": 3}`), limits)
	if err != nil {
		t.Errorf("3 keys should pass, got error: %v", err)
	}

	// 4 keys should fail
	err = Validate([]byte(`{"a": 1, "b": 2, "c": 3, "d": 4}`), limits)
	if err == nil {
		t.Error("4 keys should fail")
	}
	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error should be *ValidationError, got %T", err)
	}
	if ve.Code != ErrCodeObjectTooLarge {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeObjectTooLarge)
	}
}

func TestValidate_StringTooLong(t *testing.T) {
	limits := Limits{
		MaxDepth:        32,
		MaxArrayLength:  10000,
		MaxObjectKeys:   1000,
		MaxStringLength: 10,
		MaxTotalNodes:   100000,
	}

	// 10 char string should pass
	err := Validate([]byte(`"1234567890"`), limits)
	if err != nil {
		t.Errorf("10 char string should pass, got error: %v", err)
	}

	// 11 char string should fail
	err = Validate([]byte(`"12345678901"`), limits)
	if err == nil {
		t.Error("11 char string should fail")
	}
	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error should be *ValidationError, got %T", err)
	}
	if ve.Code != ErrCodeStringTooLong {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeStringTooLong)
	}
}

func TestValidate_KeyTooLong(t *testing.T) {
	limits := Limits{
		MaxDepth:        32,
		MaxArrayLength:  10000,
		MaxObjectKeys:   1000,
		MaxStringLength: 5,
		MaxTotalNodes:   100000,
	}

	// 5 char key should pass
	err := Validate([]byte(`{"abcde": 1}`), limits)
	if err != nil {
		t.Errorf("5 char key should pass, got error: %v", err)
	}

	// 6 char key should fail
	err = Validate([]byte(`{"abcdef": 1}`), limits)
	if err == nil {
		t.Error("6 char key should fail")
	}
	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error should be *ValidationError, got %T", err)
	}
	if ve.Code != ErrCodeStringTooLong {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeStringTooLong)
	}
}

func TestValidate_TotalNodesExceeded(t *testing.T) {
	limits := Limits{
		MaxDepth:        32,
		MaxArrayLength:  10000,
		MaxObjectKeys:   1000,
		MaxStringLength: 65536,
		MaxTotalNodes:   5,
	}

	// 5 nodes should pass: [1, 2, 3, 4] = 5 nodes (array + 4 numbers)
	err := Validate([]byte(`[1, 2, 3, 4]`), limits)
	if err != nil {
		t.Errorf("5 nodes should pass, got error: %v", err)
	}

	// 6 nodes should fail
	err = Validate([]byte(`[1, 2, 3, 4, 5]`), limits)
	if err == nil {
		t.Error("6 nodes should fail")
	}
	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error should be *ValidationError, got %T", err)
	}
	if ve.Code != ErrCodeTotalNodesTooLarge {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeTotalNodesTooLarge)
	}
}

func TestValidate_PathReporting(t *testing.T) {
	limits := Limits{
		MaxDepth:        32,
		MaxArrayLength:  10000,
		MaxObjectKeys:   1000,
		MaxStringLength: 5,
		MaxTotalNodes:   100000,
	}

	// Test path in nested object
	err := Validate([]byte(`{"outer": {"inner": "toolong"}}`), limits)
	if err == nil {
		t.Fatal("should fail on long string")
	}
	ve := err.(*ValidationError)
	if ve.Path != "outer.inner" {
		t.Errorf("path = %s, want outer.inner", ve.Path)
	}

	// Test path in array
	err = Validate([]byte(`{"items": [1, 2, "toolong"]}`), limits)
	if err == nil {
		t.Fatal("should fail on long string in array")
	}
	ve = err.(*ValidationError)
	if ve.Path != "items[2]" {
		t.Errorf("path = %s, want items[2]", ve.Path)
	}
}

func TestValidateValue_PreParsed(t *testing.T) {
	// Test with pre-parsed values
	value := map[string]any{
		"name": "test",
		"count": float64(42),
		"nested": map[string]any{
			"flag": true,
		},
	}

	err := ValidateValue(value, DefaultLimits())
	if err != nil {
		t.Errorf("ValidateValue() error = %v", err)
	}
}

func TestValidateJSON_Convenience(t *testing.T) {
	err := ValidateJSON([]byte(`{"test": "data"}`))
	if err != nil {
		t.Errorf("ValidateJSON() error = %v", err)
	}
}

func TestValidationError_Error(t *testing.T) {
	// Error with path
	e1 := &ValidationError{
		Code:    ErrCodeStringTooLong,
		Message: "string too long",
		Path:    "user.name",
	}
	expected1 := "E_EVIDENCE_STRING_TOO_LONG: string too long at user.name"
	if e1.Error() != expected1 {
		t.Errorf("Error() = %s, want %s", e1.Error(), expected1)
	}

	// Error without path
	e2 := &ValidationError{
		Code:    ErrCodeInvalidJSON,
		Message: "invalid JSON",
	}
	expected2 := "E_EVIDENCE_INVALID_JSON: invalid JSON"
	if e2.Error() != expected2 {
		t.Errorf("Error() = %s, want %s", e2.Error(), expected2)
	}
}

func TestValidate_LargeValidStructure(t *testing.T) {
	// Build a structure that's large but within limits
	arr := make([]any, 100)
	for i := range arr {
		arr[i] = map[string]any{
			"index": float64(i),
			"name":  "item",
		}
	}
	data := map[string]any{"items": arr}

	bytes, _ := json.Marshal(data)
	err := Validate(bytes, DefaultLimits())
	if err != nil {
		t.Errorf("large valid structure should pass: %v", err)
	}
}

func TestValidate_DeeplyNestedAtLimit(t *testing.T) {
	// Build structure exactly at depth limit (32)
	limits := DefaultLimits()

	// Build nested structure programmatically
	// buildNested(n) creates n levels of nesting: {"nested": {"nested": ... "leaf"}}
	var buildNested func(depth int) any
	buildNested = func(depth int) any {
		if depth == 0 {
			return "leaf"
		}
		return map[string]any{"nested": buildNested(depth - 1)}
	}

	// MaxDepth=32 means depth values 0-32 are allowed (inclusive)
	// buildNested(32) creates: root(0) -> nested(1) -> ... -> nested(31) -> leaf(32)
	// This should pass since depth 32 <= MaxDepth 32
	value := buildNested(32)
	err := ValidateValue(value, limits)
	if err != nil {
		t.Errorf("depth 32 should pass (at limit): %v", err)
	}

	// buildNested(33) creates depth 33 which exceeds MaxDepth=32
	value = buildNested(33)
	err = ValidateValue(value, limits)
	if err == nil {
		t.Error("depth 33 should fail (exceeds limit)")
	}
}

func TestValidate_UnicodeStrings(t *testing.T) {
	limits := Limits{
		MaxDepth:        32,
		MaxArrayLength:  10000,
		MaxObjectKeys:   1000,
		MaxStringLength: 10, // bytes, not characters
		MaxTotalNodes:   100000,
	}

	// Unicode string within byte limit
	err := Validate([]byte(`"hello"`), limits) // 5 bytes
	if err != nil {
		t.Errorf("short unicode should pass: %v", err)
	}

	// Unicode string exceeding byte limit (each emoji is 4 bytes)
	err = Validate([]byte(`"🎉🎉🎉"`), limits) // 12 bytes (3 * 4)
	if err == nil {
		t.Error("long unicode string should fail")
	}
}

func TestValidate_EmptyContainers(t *testing.T) {
	tests := []string{
		`[]`,
		`{}`,
		`{"a": []}`,
		`{"a": {}}`,
		`[[], [], []]`,
		`[{}, {}, {}]`,
	}

	for _, tt := range tests {
		t.Run(tt, func(t *testing.T) {
			err := Validate([]byte(tt), DefaultLimits())
			if err != nil {
				t.Errorf("Validate(%s) error = %v", tt, err)
			}
		})
	}
}

func TestValidate_NullValues(t *testing.T) {
	tests := []string{
		`null`,
		`{"key": null}`,
		`[null, null]`,
		`{"a": {"b": null}}`,
	}

	for _, tt := range tests {
		t.Run(tt, func(t *testing.T) {
			err := Validate([]byte(tt), DefaultLimits())
			if err != nil {
				t.Errorf("Validate(%s) error = %v", tt, err)
			}
		})
	}
}

func TestValidate_NumberTypes(t *testing.T) {
	tests := []string{
		`0`,
		`-0`,
		`1`,
		`-1`,
		`1.5`,
		`-1.5`,
		`1e10`,
		`1E10`,
		`1e-10`,
		`1.5e10`,
	}

	for _, tt := range tests {
		t.Run(tt, func(t *testing.T) {
			err := Validate([]byte(tt), DefaultLimits())
			if err != nil {
				t.Errorf("Validate(%s) error = %v", tt, err)
			}
		})
	}
}

func TestValidate_SpecialStrings(t *testing.T) {
	tests := []string{
		`""`,                      // empty string
		`" "`,                     // single space
		`"\t\n\r"`,                // whitespace escapes
		`"\u0000"`,                // null char
		`"\\\"\\/"`,               // escaped chars
		`"日本語"`,                   // unicode
		`"emoji 🎉"`,              // emoji
	}

	for _, tt := range tests {
		t.Run(tt, func(t *testing.T) {
			err := Validate([]byte(tt), DefaultLimits())
			if err != nil {
				t.Errorf("Validate(%s) error = %v", tt, err)
			}
		})
	}
}

// Benchmark tests

func BenchmarkValidate_SmallObject(b *testing.B) {
	data := []byte(`{"name": "test", "count": 42, "active": true}`)
	limits := DefaultLimits()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = Validate(data, limits)
	}
}

func BenchmarkValidate_MediumArray(b *testing.B) {
	// Build a 100-element array
	var sb strings.Builder
	sb.WriteString("[")
	for i := 0; i < 100; i++ {
		if i > 0 {
			sb.WriteString(",")
		}
		sb.WriteString(`{"id":`)
		sb.WriteString(strings.Repeat("1", 5))
		sb.WriteString(`,"name":"item"}`)
	}
	sb.WriteString("]")
	data := []byte(sb.String())
	limits := DefaultLimits()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = Validate(data, limits)
	}
}

func BenchmarkValidate_DeepNesting(b *testing.B) {
	// Build 20 levels deep
	var sb strings.Builder
	for i := 0; i < 20; i++ {
		sb.WriteString(`{"level":`)
	}
	sb.WriteString(`"leaf"`)
	for i := 0; i < 20; i++ {
		sb.WriteString(`}`)
	}
	data := []byte(sb.String())
	limits := DefaultLimits()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = Validate(data, limits)
	}
}
