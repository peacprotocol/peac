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
}
