package jwks

import (
	"context"
	"sync"
	"time"
)

// Cache is a thread-safe JWKS cache.
type Cache struct {
	mu      sync.RWMutex
	entries map[string]*cacheEntry
	opts    CacheOptions
}

type cacheEntry struct {
	keySet    *KeySet
	expiresAt time.Time
	fetchedAt time.Time
}

// CacheOptions configures the JWKS cache.
type CacheOptions struct {
	// TTL is the time-to-live for cached entries.
	TTL time.Duration

	// StaleWhileRevalidate allows using stale entries while fetching fresh ones.
	StaleWhileRevalidate bool

	// FetchOptions configures how JWKS are fetched.
	FetchOptions FetchOptions
}

// DefaultCacheOptions returns default cache options.
func DefaultCacheOptions() CacheOptions {
	return CacheOptions{
		TTL:                  5 * time.Minute,
		StaleWhileRevalidate: true,
		FetchOptions:         DefaultFetchOptions(),
	}
}

// NewCache creates a new JWKS cache.
func NewCache(opts CacheOptions) *Cache {
	if opts.TTL == 0 {
		opts.TTL = 5 * time.Minute
	}
	return &Cache{
		entries: make(map[string]*cacheEntry),
		opts:    opts,
	}
}

// Get retrieves a KeySet for the given URL, fetching if necessary.
func (c *Cache) Get(ctx context.Context, url string) (*KeySet, error) {
	c.mu.RLock()
	entry, exists := c.entries[url]
	c.mu.RUnlock()

	if exists && time.Now().Before(entry.expiresAt) {
		return entry.keySet, nil
	}

	// Need to fetch fresh data
	return c.refresh(ctx, url, entry)
}

func (c *Cache) refresh(ctx context.Context, url string, staleEntry *cacheEntry) (*KeySet, error) {
	jwks, err := Fetch(ctx, url, c.opts.FetchOptions)
	if err != nil {
		// If we have stale data and StaleWhileRevalidate is enabled, return stale
		if staleEntry != nil && c.opts.StaleWhileRevalidate {
			return staleEntry.keySet, nil
		}
		return nil, err
	}

	keySet, err := jwks.ToKeySet()
	if err != nil {
		if staleEntry != nil && c.opts.StaleWhileRevalidate {
			return staleEntry.keySet, nil
		}
		return nil, err
	}

	c.mu.Lock()
	c.entries[url] = &cacheEntry{
		keySet:    keySet,
		expiresAt: time.Now().Add(c.opts.TTL),
		fetchedAt: time.Now(),
	}
	c.mu.Unlock()

	return keySet, nil
}

// Set manually sets a KeySet in the cache.
func (c *Cache) Set(url string, keySet *KeySet) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.entries[url] = &cacheEntry{
		keySet:    keySet,
		expiresAt: time.Now().Add(c.opts.TTL),
		fetchedAt: time.Now(),
	}
}

// Invalidate removes an entry from the cache.
func (c *Cache) Invalidate(url string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.entries, url)
}

// Clear removes all entries from the cache.
func (c *Cache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = make(map[string]*cacheEntry)
}

// Prune removes expired entries from the cache.
func (c *Cache) Prune() {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	for url, entry := range c.entries {
		if now.After(entry.expiresAt) {
			delete(c.entries, url)
		}
	}
}
