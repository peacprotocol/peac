package peac

import (
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

// defaultClock is the package-level default clock.
var defaultClock Clock = RealClock{}

// DefaultClock returns the default clock (RealClock).
func DefaultClock() Clock {
	return defaultClock
}
