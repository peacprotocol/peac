package peac

import (
	"sync"
	"time"
)

// Clock provides time for receipt issuance and verification.
// Use RealClock for production and FixedClock for testing.
type Clock interface {
	// Now returns the current time.
	Now() time.Time
}

// RealClock returns the actual system time.
// This is the default clock used in production.
type RealClock struct{}

// Now returns the current system time.
func (RealClock) Now() time.Time {
	return time.Now()
}

// FixedClock returns a fixed time for testing.
// Use this to make receipt issuance deterministic in tests.
type FixedClock struct {
	// Time is the fixed time to return.
	Time time.Time
}

// Now returns the fixed time.
func (c FixedClock) Now() time.Time {
	return c.Time
}

// AdvancingClock returns a fixed time that advances by a delta on each call.
// Use this for tests that need sequential, predictable timestamps.
type AdvancingClock struct {
	mu      sync.Mutex
	current time.Time
	delta   time.Duration
}

// NewAdvancingClock creates a clock starting at start, advancing by delta each call.
func NewAdvancingClock(start time.Time, delta time.Duration) *AdvancingClock {
	return &AdvancingClock{
		current: start,
		delta:   delta,
	}
}

// Now returns the current time and advances by delta.
func (c *AdvancingClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	t := c.current
	c.current = c.current.Add(c.delta)
	return t
}

// DefaultClock returns the default clock (RealClock).
func DefaultClock() Clock {
	return RealClock{}
}
