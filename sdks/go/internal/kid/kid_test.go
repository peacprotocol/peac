package kid

import (
	"errors"
	"strings"
	"testing"
)

func TestValidate_Accepts(t *testing.T) {
	cases := map[string]string{
		"ascii":                 "key-1",
		"256 ascii bytes":       strings.Repeat("a", 256),
		"64 astral = 256 bytes": strings.Repeat("\U0001F600", 64),
		"well-formed non-ASCII": "cl\u00e9-\u4e2d\u6587",
	}
	for name, k := range cases {
		t.Run(name, func(t *testing.T) {
			if err := Validate(k); err != nil {
				t.Fatalf("Validate(%q) = %v, want nil", name, err)
			}
		})
	}
}

func TestValidate_Rejects(t *testing.T) {
	cases := []struct {
		name string
		kid  string
		want error
	}{
		{"empty", "", ErrEmpty},
		{"lone 0xFF byte", "k\xff", ErrInvalidUTF8},
		{"lone surrogate bytes", "k\xed\xa0\x80", ErrInvalidUTF8},
		{"noncharacter U+FDD0", "k\ufdd0", ErrNoncharacter},
		{"noncharacter U+FFFF", "k\uffff", ErrNoncharacter},
		{"noncharacter U+1FFFE", "k\U0001FFFE", ErrNoncharacter},
		{"257 ascii bytes", strings.Repeat("a", 257), ErrTooLong},
		{"65 astral = 260 bytes", strings.Repeat("\U0001F600", 65), ErrTooLong},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := Validate(tc.kid)
			if !errors.Is(err, tc.want) {
				t.Fatalf("Validate(%s) = %v, want %v", tc.name, err, tc.want)
			}
		})
	}
}

// The byte bound is exact at 256: 256 accepted, 257 rejected, for ASCII and for
// supplementary-plane code points (four bytes each).
func TestValidate_ByteBoundaryIsExact(t *testing.T) {
	if err := Validate(strings.Repeat("a", 256)); err != nil {
		t.Fatalf("256 ASCII bytes should be accepted: %v", err)
	}
	if err := Validate(strings.Repeat("a", 257)); !errors.Is(err, ErrTooLong) {
		t.Fatalf("257 ASCII bytes = %v, want ErrTooLong", err)
	}
	if err := Validate(strings.Repeat("\U0001F600", 64)); err != nil {
		t.Fatalf("64 astral (256 bytes) should be accepted: %v", err)
	}
	if err := Validate(strings.Repeat("\U0001F600", 65)); !errors.Is(err, ErrTooLong) {
		t.Fatalf("65 astral (260 bytes) = %v, want ErrTooLong", err)
	}
}
