package peac

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"sync"
	"time"
)

// ReceiptIDGenerator generates unique receipt IDs.
// Use UUIDv7Generator for production and FixedIDGenerator for testing.
type ReceiptIDGenerator interface {
	// NewReceiptID generates a new unique receipt ID.
	// Returns an error if ID generation fails (e.g., crypto/rand failure).
	NewReceiptID() (string, error)
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

// NewReceiptID generates a new UUID v7.
// Returns an error if random number generation fails.
func (g *UUIDv7Generator) NewReceiptID() (string, error) {
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

// NewReceiptID returns the next ID from the list.
// This never fails since IDs are pre-defined.
func (g *FixedIDGenerator) NewReceiptID() (string, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	id := g.ids[g.index]
	g.index = (g.index + 1) % len(g.ids)
	return id, nil
}

// defaultIDGenerator is the package-level default generator.
var defaultIDGenerator ReceiptIDGenerator = NewUUIDv7Generator(nil)

// DefaultIDGenerator returns the default ID generator (UUIDv7Generator).
func DefaultIDGenerator() ReceiptIDGenerator {
	return defaultIDGenerator
}

// uuidv7 generates a UUID v7 string for the given timestamp.
// Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
// where x is timestamp/random and y is variant (8, 9, a, or b).
func uuidv7(t time.Time) (string, error) {
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
	if _, err := rand.Read(uuid[6:]); err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}

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
	), nil
}
