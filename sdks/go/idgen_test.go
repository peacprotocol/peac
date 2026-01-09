package peac

import (
	"regexp"
	"strings"
	"testing"
	"time"
)

var uuidv7Regex = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func TestUUIDv7Generator_NewID(t *testing.T) {
	gen := NewUUIDv7Generator(nil)

	id := gen.NewID()

	if !uuidv7Regex.MatchString(id) {
		t.Errorf("NewID() = %q, does not match UUID v7 format", id)
	}
}

func TestUUIDv7Generator_Unique(t *testing.T) {
	gen := NewUUIDv7Generator(nil)

	ids := make(map[string]bool)
	for i := 0; i < 1000; i++ {
		id := gen.NewID()
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

	id1 := gen.NewID()
	id2 := gen.NewID()

	// Both should be valid UUID v7
	if !uuidv7Regex.MatchString(id1) {
		t.Errorf("id1 = %q, does not match UUID v7 format", id1)
	}
	if !uuidv7Regex.MatchString(id2) {
		t.Errorf("id2 = %q, does not match UUID v7 format", id2)
	}

	// Same timestamp prefix (first 12 hex chars = 48-bit timestamp)
	// Since clock is fixed, timestamp portion should match
	prefix1 := strings.Replace(id1[:13], "-", "", -1)[:12]
	prefix2 := strings.Replace(id2[:13], "-", "", -1)[:12]
	if prefix1 != prefix2 {
		t.Errorf("Timestamp prefix mismatch: %s vs %s", prefix1, prefix2)
	}

	// But IDs should still be different (random suffix)
	if id1 == id2 {
		t.Error("IDs should be different even with same timestamp")
	}
}

func TestUUIDv7Generator_TimestampOrdering(t *testing.T) {
	start := time.Date(2025, 1, 15, 12, 0, 0, 0, time.UTC)
	clock := NewAdvancingClock(start, time.Millisecond)
	gen := NewUUIDv7Generator(clock)

	var ids []string
	for i := 0; i < 100; i++ {
		ids = append(ids, gen.NewID())
	}

	// UUID v7 should be lexicographically sortable by time
	for i := 1; i < len(ids); i++ {
		if ids[i] < ids[i-1] {
			t.Errorf("IDs not in order: ids[%d]=%s < ids[%d]=%s", i, ids[i], i-1, ids[i-1])
		}
	}
}

func TestFixedIDGenerator_NewID(t *testing.T) {
	gen := NewFixedIDGenerator("id-001", "id-002", "id-003")

	if got := gen.NewID(); got != "id-001" {
		t.Errorf("First call = %q, want %q", got, "id-001")
	}
	if got := gen.NewID(); got != "id-002" {
		t.Errorf("Second call = %q, want %q", got, "id-002")
	}
	if got := gen.NewID(); got != "id-003" {
		t.Errorf("Third call = %q, want %q", got, "id-003")
	}
	// Should cycle back
	if got := gen.NewID(); got != "id-001" {
		t.Errorf("Fourth call = %q, want %q (cycle)", got, "id-001")
	}
}

func TestFixedIDGenerator_Default(t *testing.T) {
	gen := NewFixedIDGenerator() // No IDs provided

	got := gen.NewID()
	if got != "test-receipt-id-001" {
		t.Errorf("Default ID = %q, want %q", got, "test-receipt-id-001")
	}
}

func TestFixedIDGenerator_Concurrent(t *testing.T) {
	gen := NewFixedIDGenerator("a", "b", "c", "d", "e")

	done := make(chan string, 100)
	for i := 0; i < 100; i++ {
		go func() {
			done <- gen.NewID()
		}()
	}

	// Collect all results
	counts := make(map[string]int)
	for i := 0; i < 100; i++ {
		counts[<-done]++
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

func TestSequentialIDGenerator_NewID(t *testing.T) {
	gen := NewSequentialIDGenerator("receipt-")

	if got := gen.NewID(); got != "receipt-001" {
		t.Errorf("First call = %q, want %q", got, "receipt-001")
	}
	if got := gen.NewID(); got != "receipt-002" {
		t.Errorf("Second call = %q, want %q", got, "receipt-002")
	}
	if got := gen.NewID(); got != "receipt-003" {
		t.Errorf("Third call = %q, want %q", got, "receipt-003")
	}
}

func TestSequentialIDGenerator_Concurrent(t *testing.T) {
	gen := NewSequentialIDGenerator("seq-")

	done := make(chan string, 100)
	for i := 0; i < 100; i++ {
		go func() {
			done <- gen.NewID()
		}()
	}

	// Collect all results
	ids := make(map[string]bool)
	for i := 0; i < 100; i++ {
		id := <-done
		if ids[id] {
			t.Errorf("Duplicate ID: %s", id)
		}
		ids[id] = true
	}

	if len(ids) != 100 {
		t.Errorf("Unique IDs = %d, want 100", len(ids))
	}
}

func TestDefaultIDGenerator(t *testing.T) {
	gen := DefaultIDGenerator()
	if _, ok := gen.(*UUIDv7Generator); !ok {
		t.Errorf("DefaultIDGenerator() type = %T, want *UUIDv7Generator", gen)
	}

	// Should generate valid UUIDs
	id := gen.NewID()
	if !uuidv7Regex.MatchString(id) {
		t.Errorf("Default generator ID = %q, does not match UUID v7 format", id)
	}
}

func TestIDGenerator_Interface(t *testing.T) {
	// Verify all generator types implement the interface
	var _ IDGenerator = &UUIDv7Generator{}
	var _ IDGenerator = &FixedIDGenerator{}
	var _ IDGenerator = &SequentialIDGenerator{}
}

func TestUUIDv7_Format(t *testing.T) {
	// Test specific timestamp encoding
	ts := time.Date(2025, 1, 15, 12, 30, 45, 0, time.UTC)
	id := uuidv7(ts)

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
