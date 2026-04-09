package peac

import (
	"testing"
)

func TestCanonicalizeSimpleObject(t *testing.T) {
	input := `{"b": 1, "a": 2}`
	expected := `{"a":2,"b":1}`
	got, err := Canonicalize([]byte(input))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != expected {
		t.Errorf("got %s, want %s", got, expected)
	}
}

func TestCanonicalizeNestedObject(t *testing.T) {
	input := `{"z": {"b": 1, "a": 2}, "a": 3}`
	expected := `{"a":3,"z":{"a":2,"b":1}}`
	got, err := Canonicalize([]byte(input))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != expected {
		t.Errorf("got %s, want %s", got, expected)
	}
}

func TestCanonicalizeArray(t *testing.T) {
	input := `[3, 1, "b", "a", true, null]`
	expected := `[3,1,"b","a",true,null]`
	got, err := Canonicalize([]byte(input))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != expected {
		t.Errorf("got %s, want %s", got, expected)
	}
}

func TestCanonicalizeNumbers(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{`1`, `1`},
		{`1.0`, `1`},
		{`0`, `0`},
		{`-0`, `0`},
		{`100`, `100`},
		{`0.5`, `0.5`},
		{`-1`, `-1`},
	}
	for _, tc := range tests {
		got, err := Canonicalize([]byte(tc.input))
		if err != nil {
			t.Errorf("input %s: %v", tc.input, err)
			continue
		}
		if string(got) != tc.expected {
			t.Errorf("input %s: got %s, want %s", tc.input, got, tc.expected)
		}
	}
}

func TestCanonicalizeEmptyStructures(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{`{}`, `{}`},
		{`[]`, `[]`},
		{`{"a":{}}`, `{"a":{}}`},
		{`{"a":[]}`, `{"a":[]}`},
	}
	for _, tc := range tests {
		got, err := Canonicalize([]byte(tc.input))
		if err != nil {
			t.Errorf("input %s: %v", tc.input, err)
			continue
		}
		if string(got) != tc.expected {
			t.Errorf("input %s: got %s, want %s", tc.input, got, tc.expected)
		}
	}
}

func TestCanonicalizeStringEscaping(t *testing.T) {
	input := `{"key": "hello\nworld\ttab"}`
	expected := `{"key":"hello\nworld\ttab"}`
	got, err := Canonicalize([]byte(input))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != expected {
		t.Errorf("got %s, want %s", got, expected)
	}
}

func TestJCSHash(t *testing.T) {
	input := `{"b": 1, "a": 2}`
	hash, err := JCSHash([]byte(input))
	if err != nil {
		t.Fatal(err)
	}
	if len(hash) != 71 { // "sha256:" + 64 hex chars
		t.Errorf("hash length = %d, want 71", len(hash))
	}
	if hash[:7] != "sha256:" {
		t.Errorf("hash prefix = %s, want sha256:", hash[:7])
	}
}

func TestCanonicalizeBooleansAndNull(t *testing.T) {
	input := `{"c": null, "b": false, "a": true}`
	expected := `{"a":true,"b":false,"c":null}`
	got, err := Canonicalize([]byte(input))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != expected {
		t.Errorf("got %s, want %s", got, expected)
	}
}
