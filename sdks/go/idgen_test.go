package peac

import (
	"regexp"
	"testing"
	"time"
)

var uuidv7Regex = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func TestUUIDv7Generator_NewReceiptID(t *testing.T) {
	gen := NewUUIDv7Generator(nil)

	id, err := gen.NewReceiptID()
	if err != nil {
		t.Fatalf("NewReceiptID() error = %v", err)
	}

	if !uuidv7Regex.MatchString(id) {
		t.Errorf("NewReceiptID() = %q, does not match UUID v7 format", id)
	}
}

func TestUUIDv7Generator_Unique(t *testing.T) {
	gen := NewUUIDv7Generator(nil)

	ids := make(map[string]bool)
	for i := 0; i < 1000; i++ {
		id, err := gen.NewReceiptID()
		if err != nil {
			t.Fatalf("NewReceiptID() error = %v", err)
		}
		if ids[id] {
			t.Errorf("Duplicate ID generated: %s", id)
		}
		ids[id] = true
	}
}

func TestUUIDv7Generator_WithFixedClock(t *testing.T) {
	fixed := time.Date(2025, 1, 15, 12, 0, 0, 0, time.UTC)
	clock := FixedClock{Time: fixed}
	gen := NewUUIDv7Generator(clock)

	id1, err := gen.NewReceiptID()
	if err != nil {
		t.Fatalf("NewReceiptID() error = %v", err)
	}
	id2, err := gen.NewReceiptID()
	if err != nil {
		t.Fatalf("NewReceiptID() error = %v", err)
	}

	// Both should be valid UUID v7 format
	if !uuidv7Regex.MatchString(id1) {
		t.Errorf("id1 = %q, does not match UUID v7 format", id1)
	}
	if !uuidv7Regex.MatchString(id2) {
		t.Errorf("id2 = %q, does not match UUID v7 format", id2)
	}

	// IDs should be different (random suffix)
	if id1 == id2 {
		t.Error("IDs should be different even with same timestamp")
	}
}

func TestFixedIDGenerator_NewReceiptID(t *testing.T) {
	gen := NewFixedIDGenerator("id-001", "id-002", "id-003")

	got, err := gen.NewReceiptID()
	if err != nil {
		t.Fatalf("NewReceiptID() error = %v", err)
	}
	if got != "id-001" {
		t.Errorf("First call = %q, want %q", got, "id-001")
	}

	got, err = gen.NewReceiptID()
	if err != nil {
		t.Fatalf("NewReceiptID() error = %v", err)
	}
	if got != "id-002" {
		t.Errorf("Second call = %q, want %q", got, "id-002")
	}

	got, err = gen.NewReceiptID()
	if err != nil {
		t.Fatalf("NewReceiptID() error = %v", err)
	}
	if got != "id-003" {
		t.Errorf("Third call = %q, want %q", got, "id-003")
	}

	// Should cycle back
	got, err = gen.NewReceiptID()
	if err != nil {
		t.Fatalf("NewReceiptID() error = %v", err)
	}
	if got != "id-001" {
		t.Errorf("Fourth call = %q, want %q (cycle)", got, "id-001")
	}
}

func TestFixedIDGenerator_Default(t *testing.T) {
	gen := NewFixedIDGenerator() // No IDs provided

	got, err := gen.NewReceiptID()
	if err != nil {
		t.Fatalf("NewReceiptID() error = %v", err)
	}
	if got != "test-receipt-id-001" {
		t.Errorf("Default ID = %q, want %q", got, "test-receipt-id-001")
	}
}

func TestFixedIDGenerator_Concurrent(t *testing.T) {
	gen := NewFixedIDGenerator("a", "b", "c", "d", "e")

	type result struct {
		id  string
		err error
	}
	done := make(chan result, 100)
	for i := 0; i < 100; i++ {
		go func() {
			id, err := gen.NewReceiptID()
			done <- result{id, err}
		}()
	}

	// Collect all results
	counts := make(map[string]int)
	for i := 0; i < 100; i++ {
		r := <-done
		if r.err != nil {
			t.Errorf("NewReceiptID() error = %v", r.err)
			continue
		}
		counts[r.id]++
	}

	// Should have gotten IDs from the list (no panics)
	total := 0
	for id, count := range counts {
		if id != "a" && id != "b" && id != "c" && id != "d" && id != "e" {
			t.Errorf("Unexpected ID: %q", id)
		}
		total += count
	}
	if total != 100 {
		t.Errorf("Total IDs = %d, want 100", total)
	}
}

func TestDefaultIDGenerator(t *testing.T) {
	gen := DefaultIDGenerator()
	if _, ok := gen.(*UUIDv7Generator); !ok {
		t.Errorf("DefaultIDGenerator() type = %T, want *UUIDv7Generator", gen)
	}

	// Should generate valid UUIDs
	id, err := gen.NewReceiptID()
	if err != nil {
		t.Fatalf("NewReceiptID() error = %v", err)
	}
	if !uuidv7Regex.MatchString(id) {
		t.Errorf("Default generator ID = %q, does not match UUID v7 format", id)
	}
}

func TestReceiptIDGenerator_Interface(t *testing.T) {
	// Verify all generator types implement the interface
	var _ ReceiptIDGenerator = &UUIDv7Generator{}
	var _ ReceiptIDGenerator = &FixedIDGenerator{}
}

func TestUUIDv7_Format(t *testing.T) {
	// Test specific timestamp encoding
	ts := time.Date(2025, 1, 15, 12, 30, 45, 0, time.UTC)
	id, err := uuidv7(ts)
	if err != nil {
		t.Fatalf("uuidv7() error = %v", err)
	}

	// Must match UUID v7 format
	if !uuidv7Regex.MatchString(id) {
		t.Errorf("uuidv7() = %q, does not match format", id)
	}

	// Version must be 7 (character at position 14)
	if id[14] != '7' {
		t.Errorf("Version = %c, want 7", id[14])
	}

	// Variant must be RFC 4122 (character at position 19 must be 8, 9, a, or b)
	variant := id[19]
	if variant != '8' && variant != '9' && variant != 'a' && variant != 'b' {
		t.Errorf("Variant = %c, want 8/9/a/b", variant)
	}
}
