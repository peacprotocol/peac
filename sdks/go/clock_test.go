package peac

import (
	"testing"
	"time"
)

func TestRealClock_Now(t *testing.T) {
	clock := RealClock{}

	before := time.Now()
	got := clock.Now()
	after := time.Now()

	if got.Before(before) || got.After(after) {
		t.Errorf("RealClock.Now() = %v, want between %v and %v", got, before, after)
	}
}

func TestFixedClock_Now(t *testing.T) {
	fixed := time.Date(2025, 1, 15, 12, 0, 0, 0, time.UTC)
	clock := FixedClock{Time: fixed}

	got := clock.Now()
	if !got.Equal(fixed) {
		t.Errorf("FixedClock.Now() = %v, want %v", got, fixed)
	}

	// Should return same time on subsequent calls
	got2 := clock.Now()
	if !got2.Equal(fixed) {
		t.Errorf("FixedClock.Now() second call = %v, want %v", got2, fixed)
	}
}

func TestAdvancingClock_Now(t *testing.T) {
	start := time.Date(2025, 1, 15, 12, 0, 0, 0, time.UTC)
	delta := time.Second
	clock := NewAdvancingClock(start, delta)

	// First call returns start time
	got1 := clock.Now()
	if !got1.Equal(start) {
		t.Errorf("First call = %v, want %v", got1, start)
	}

	// Second call returns start + delta
	got2 := clock.Now()
	expected2 := start.Add(delta)
	if !got2.Equal(expected2) {
		t.Errorf("Second call = %v, want %v", got2, expected2)
	}

	// Third call returns start + 2*delta
	got3 := clock.Now()
	expected3 := start.Add(2 * delta)
	if !got3.Equal(expected3) {
		t.Errorf("Third call = %v, want %v", got3, expected3)
	}
}

func TestAdvancingClock_Concurrent(t *testing.T) {
	start := time.Date(2025, 1, 15, 12, 0, 0, 0, time.UTC)
	clock := NewAdvancingClock(start, time.Millisecond)

	// Call from multiple goroutines
	done := make(chan time.Time, 100)
	for i := 0; i < 100; i++ {
		go func() {
			done <- clock.Now()
		}()
	}

	// Collect all results
	times := make([]time.Time, 100)
	for i := 0; i < 100; i++ {
		times[i] = <-done
	}

	// All times should be unique (no races)
	seen := make(map[int64]bool)
	for _, ts := range times {
		nano := ts.UnixNano()
		if seen[nano] {
			t.Errorf("Duplicate timestamp: %v", ts)
		}
		seen[nano] = true
	}
}

func TestDefaultClock(t *testing.T) {
	clock := DefaultClock()
	if _, ok := clock.(RealClock); !ok {
		t.Errorf("DefaultClock() type = %T, want RealClock", clock)
	}
}

func TestClock_Interface(t *testing.T) {
	// Verify all clock types implement the interface
	var _ Clock = RealClock{}
	var _ Clock = FixedClock{}
	var _ Clock = &AdvancingClock{}
}
