# PEAC Go Middleware

HTTP middleware for PEAC receipt verification in Go applications.

## Installation

```bash
go get github.com/peacprotocol/peac-go/middleware
```

## Quick Start

```go
package main

import (
    "fmt"
    "net/http"

    "github.com/peacprotocol/peac-go/middleware"
)

func main() {
    // Create middleware
    peacMiddleware := middleware.RequireReceipt(
        "https://publisher.example",
        "https://agent.example",
    )

    // Create handler
    handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        claims := middleware.GetClaims(r)
        fmt.Fprintf(w, "Receipt ID: %s\n", claims.ReceiptID)
    })

    // Apply middleware
    http.Handle("/api/", peacMiddleware(handler))
    http.ListenAndServe(":8080", nil)
}
```

## Configuration

```go
mw := middleware.Middleware(middleware.Config{
    // Required: Expected issuer
    Issuer: "https://publisher.example",

    // Required: Expected audience
    Audience: "https://agent.example",

    // Optional: Maximum receipt age (default: 1 hour)
    MaxAge: time.Hour,

    // Optional: Clock skew tolerance (default: 30 seconds)
    ClockSkew: 30 * time.Second,

    // Optional: Header name (default: "PEAC-Receipt")
    HeaderName: "PEAC-Receipt",

    // Optional: Allow requests without receipts (default: false)
    Optional: false,

    // Optional: Custom error handler
    ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
        http.Error(w, "Access denied", http.StatusForbidden)
    },
})
```

## Accessing Claims

After successful verification, claims are available in the request context:

```go
func handler(w http.ResponseWriter, r *http.Request) {
    // Get verified claims
    claims := middleware.GetClaims(r)
    if claims == nil {
        http.Error(w, "No claims", http.StatusUnauthorized)
        return
    }

    // Access claim fields
    fmt.Printf("Receipt ID: %s\n", claims.ReceiptID)
    fmt.Printf("Issuer: %s\n", claims.Issuer)
    fmt.Printf("Purpose: %v\n", claims.PurposeDeclared)

    // Get full result with performance metrics
    result := middleware.GetResult(r)
    if result != nil {
        fmt.Printf("Verified in %.2fms\n", result.Perf.VerifyMs)
    }
}
```

## Helper Functions

### RequireReceipt

Requires a valid PEAC receipt. Returns 401 if missing or invalid.

```go
mw := middleware.RequireReceipt(issuer, audience)
```

### OptionalReceipt

Optionally verifies receipts. Allows requests without receipts through.

```go
mw := middleware.OptionalReceipt(issuer, audience)
```

## Error Responses

By default, errors are returned as RFC 9457 Problem Details:

```json
{
  "type": "https://peacprotocol.org/errors/e_invalid_signature",
  "title": "E_INVALID_SIGNATURE",
  "status": 400,
  "detail": "signature verification failed",
  "peac_error": {
    "key_id": "test-key"
  }
}
```

## Integration with JWKS Cache

For production, use a shared JWKS cache:

```go
import "github.com/peacprotocol/peac-go/jwks"

cache := jwks.NewCache(jwks.CacheOptions{
    TTL: 5 * time.Minute,
})

mw := middleware.Middleware(middleware.Config{
    Issuer:    "https://publisher.example",
    Audience:  "https://agent.example",
    JWKSCache: cache,
})
```

## Framework Integration

### net/http

```go
http.Handle("/api/", peacMiddleware(handler))
```

### gorilla/mux

```go
r := mux.NewRouter()
r.Use(peacMiddleware)
r.HandleFunc("/api/resource", handler)
```

### chi

```go
r := chi.NewRouter()
r.Use(peacMiddleware)
r.Get("/api/resource", handler)
```

### gin (adapter)

```go
func GinMiddleware(cfg middleware.Config) gin.HandlerFunc {
    mw := middleware.Middleware(cfg)
    return func(c *gin.Context) {
        mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            c.Request = r
            c.Next()
        })).ServeHTTP(c.Writer, c.Request)
    }
}
```

## License

MIT License - see [LICENSE](../../../LICENSE)
