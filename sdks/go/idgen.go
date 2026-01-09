package peac

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"sync"
	"time"
)

// IDGenerator generates unique receipt IDs.
// Use UUIDv7Generator for production and FixedIDGenerator for testing.
type IDGenerator interface {
	// NewID generates a new unique ID.
	NewID() string
}

// UUIDv7Generator generates UUID v7 identifiers.
// UUID v7 is timestamp-ordered, making receipts sortable by issuance time.
type UUIDv7Generator struct {
	clock Clock
}

// NewUUIDv7Generator creates a generator using the given clock.
// If clock is nil, RealClock is used.
func NewUUIDv7Generator(clock Clock) *UUIDv7Generator {
	if clock == nil {
		clock = RealClock{}
	}
	return &UUIDv7Generator{clock: clock}
}

// NewID generates a new UUID v7.
func (g *UUIDv7Generator) NewID() string {
	return uuidv7(g.clock.Now())
}

// FixedIDGenerator returns IDs from a predefined list.
// Use this for deterministic testing.
type FixedIDGenerator struct {
	mu    sync.Mutex
	ids   []string
	index int
}

// NewFixedIDGenerator creates a generator that returns IDs in order.
// When exhausted, it cycles back to the beginning.
func NewFixedIDGenerator(ids ...string) *FixedIDGenerator {
	if len(ids) == 0 {
		ids = []string{"test-receipt-id-001"}
	}
	return &FixedIDGenerator{ids: ids}
}

// NewID returns the next ID from the list.
func (g *FixedIDGenerator) NewID() string {
	g.mu.Lock()
	defer g.mu.Unlock()
	id := g.ids[g.index]
	g.index = (g.index + 1) % len(g.ids)
	return id
}

// SequentialIDGenerator returns IDs with a prefix and incrementing counter.
// Use this when you need unique but predictable IDs.
type SequentialIDGenerator struct {
	mu      sync.Mutex
	prefix  string
	counter int
}

// NewSequentialIDGenerator creates a generator with the given prefix.
func NewSequentialIDGenerator(prefix string) *SequentialIDGenerator {
	return &SequentialIDGenerator{prefix: prefix, counter: 1}
}

// NewID returns the next sequential ID.
func (g *SequentialIDGenerator) NewID() string {
	g.mu.Lock()
	defer g.mu.Unlock()
	id := fmt.Sprintf("%s%03d", g.prefix, g.counter)
	g.counter++
	return id
}

// DefaultIDGenerator returns the default ID generator (UUIDv7Generator).
func DefaultIDGenerator() IDGenerator {
	return NewUUIDv7Generator(nil)
}

// uuidv7 generates a UUID v7 string for the given timestamp.
// Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
// where x is timestamp/random and y is variant (8, 9, a, or b).
func uuidv7(t time.Time) string {
	var uuid [16]byte

	// Timestamp: milliseconds since Unix epoch (48 bits)
	ms := uint64(t.UnixMilli())
	uuid[0] = byte(ms >> 40)
	uuid[1] = byte(ms >> 32)
	uuid[2] = byte(ms >> 24)
	uuid[3] = byte(ms >> 16)
	uuid[4] = byte(ms >> 8)
	uuid[5] = byte(ms)

	// Random bytes for the rest
	rand.Read(uuid[6:])

	// Set version to 7 (0111 in top 4 bits of byte 6)
	uuid[6] = (uuid[6] & 0x0f) | 0x70

	// Set variant to RFC 4122 (10xx in top 4 bits of byte 8)
	uuid[8] = (uuid[8] & 0x3f) | 0x80

	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		binary.BigEndian.Uint32(uuid[0:4]),
		binary.BigEndian.Uint16(uuid[4:6]),
		binary.BigEndian.Uint16(uuid[6:8]),
		binary.BigEndian.Uint16(uuid[8:10]),
		uuid[10:16],
	)
}
