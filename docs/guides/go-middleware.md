# Go SDK Middleware Guide

This guide covers integrating PEAC receipt verification with popular Go HTTP frameworks.

**Version:** 0.9.26+

## Overview

The PEAC Go SDK provides middleware for verifying receipts on incoming HTTP requests. The middleware:

- Extracts the `PEAC-Receipt` header from requests
- Verifies the JWS signature using Ed25519
- Validates claims (issuer, audience, timestamps)
- Injects verified claims into request context

## Installation

```bash
go get github.com/peacprotocol/peac-go
```

## net/http (Standard Library)

The middleware works directly with the standard `http.Handler` interface:

```go
package main

import (
    "net/http"
    "time"

    peac "github.com/peacprotocol/peac-go"
    "github.com/peacprotocol/peac-go/middleware"
)

func main() {
    cfg := middleware.Config{
        Issuer:   "https://publisher.example",
        Audience: "https://agent.example",
        MaxAge:   time.Hour,
        JWKSURL:  "https://publisher.example/.well-known/jwks.json",
    }

    mux := http.NewServeMux()
    mux.HandleFunc("/api/content", contentHandler)

    // Wrap with PEAC middleware
    handler := middleware.Middleware(cfg)(mux)

    http.ListenAndServe(":8080", handler)
}

func contentHandler(w http.ResponseWriter, r *http.Request) {
    // Access verified claims from context
    claims := middleware.GetClaims(r)
    if claims == nil {
        http.Error(w, "No receipt", http.StatusUnauthorized)
        return
    }

    // Use claims for authorization
    w.Write([]byte("Access granted for receipt: " + claims.ReceiptID))
}
```

## chi Router

[chi](https://github.com/go-chi/chi) is fully compatible with `http.Handler`, so the middleware works directly:

```go
package main

import (
    "net/http"
    "time"

    "github.com/go-chi/chi/v5"
    chiMiddleware "github.com/go-chi/chi/v5/middleware"
    peac "github.com/peacprotocol/peac-go"
    "github.com/peacprotocol/peac-go/middleware"
)

func main() {
    r := chi.NewRouter()

    // Standard chi middleware
    r.Use(chiMiddleware.Logger)
    r.Use(chiMiddleware.Recoverer)

    // PEAC receipt verification
    r.Use(middleware.Middleware(middleware.Config{
        Issuer:   "https://publisher.example",
        Audience: "https://agent.example",
        MaxAge:   time.Hour,
        JWKSURL:  "https://publisher.example/.well-known/jwks.json",
    }))

    // Routes
    r.Get("/api/content", contentHandler)
    r.Get("/api/search", searchHandler)

    http.ListenAndServe(":8080", r)
}

func contentHandler(w http.ResponseWriter, r *http.Request) {
    claims := middleware.GetClaims(r)
    if claims == nil {
        http.Error(w, "Receipt required", http.StatusUnauthorized)
        return
    }

    // Check purpose (v0.9.24+)
    if claims.PurposeEnforced != "" {
        w.Header().Set("X-Purpose-Enforced", claims.PurposeEnforced)
    }

    w.Write([]byte("Content accessed with receipt: " + claims.ReceiptID))
}

func searchHandler(w http.ResponseWriter, r *http.Request) {
    claims := middleware.GetClaims(r)
    if claims == nil {
        http.Error(w, "Receipt required", http.StatusUnauthorized)
        return
    }

    w.Write([]byte("Search executed with receipt: " + claims.ReceiptID))
}
```

### Route Groups with Different Configs

Use chi's route groups for different verification policies:

```go
func main() {
    r := chi.NewRouter()

    // Public routes (no receipt required)
    r.Group(func(r chi.Router) {
        r.Get("/health", healthHandler)
        r.Get("/", homeHandler)
    })

    // Protected routes (receipt required)
    r.Group(func(r chi.Router) {
        r.Use(middleware.Middleware(middleware.Config{
            Issuer:   "https://publisher.example",
            Audience: "https://agent.example",
            MaxAge:   time.Hour,
        }))
        r.Get("/api/content", contentHandler)
        r.Get("/api/search", searchHandler)
    })

    // Premium routes (stricter validation)
    r.Group(func(r chi.Router) {
        r.Use(middleware.Middleware(middleware.Config{
            Issuer:    "https://publisher.example",
            Audience:  "https://premium.agent.example",
            MaxAge:    15 * time.Minute, // Shorter validity
            ClockSkew: 10 * time.Second,
        }))
        r.Get("/api/premium", premiumHandler)
    })

    http.ListenAndServe(":8080", r)
}
```

## gin Framework

[gin](https://github.com/gin-gonic/gin) uses its own handler type, so we need an adapter:

```go
package main

import (
    "net/http"
    "time"

    "github.com/gin-gonic/gin"
    peac "github.com/peacprotocol/peac-go"
    "github.com/peacprotocol/peac-go/middleware"
)

// GinMiddleware adapts PEAC middleware for gin
func GinMiddleware(cfg middleware.Config) gin.HandlerFunc {
    peacMiddleware := middleware.Middleware(cfg)

    return func(c *gin.Context) {
        // Create a wrapped handler that calls gin's Next()
        handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // Copy claims to gin context
            if claims := middleware.GetClaims(r); claims != nil {
                c.Set("peac_claims", claims)
            }
            if result := middleware.GetResult(r); result != nil {
                c.Set("peac_result", result)
            }
            c.Next()
        })

        // Apply PEAC middleware
        peacMiddleware(handler).ServeHTTP(c.Writer, c.Request)
    }
}

// GetPEACClaims retrieves verified claims from gin context
func GetPEACClaims(c *gin.Context) *peac.PEACReceiptClaims {
    if claims, exists := c.Get("peac_claims"); exists {
        return claims.(*peac.PEACReceiptClaims)
    }
    return nil
}

func main() {
    r := gin.Default()

    // Apply PEAC middleware
    r.Use(GinMiddleware(middleware.Config{
        Issuer:   "https://publisher.example",
        Audience: "https://agent.example",
        MaxAge:   time.Hour,
        JWKSURL:  "https://publisher.example/.well-known/jwks.json",
    }))

    r.GET("/api/content", func(c *gin.Context) {
        claims := GetPEACClaims(c)
        if claims == nil {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Receipt required"})
            return
        }

        c.JSON(http.StatusOK, gin.H{
            "message":    "Access granted",
            "receipt_id": claims.ReceiptID,
            "purpose":    claims.PurposeEnforced,
        })
    })

    r.Run(":8080")
}
```

### gin Route Groups

```go
func main() {
    r := gin.Default()

    // Public routes
    public := r.Group("/")
    {
        public.GET("/health", healthHandler)
    }

    // Protected routes
    api := r.Group("/api")
    api.Use(GinMiddleware(middleware.Config{
        Issuer:   "https://publisher.example",
        Audience: "https://agent.example",
        MaxAge:   time.Hour,
    }))
    {
        api.GET("/content", contentHandler)
        api.GET("/search", searchHandler)
    }

    r.Run(":8080")
}
```

## Configuration Reference

| Field              | Type            | Required | Default       | Description                     |
| ------------------ | --------------- | -------- | ------------- | ------------------------------- |
| `Issuer`           | `string`        | Yes      | -             | Expected issuer (iss claim)     |
| `Audience`         | `string`        | Yes      | -             | Expected audience (aud claim)   |
| `MaxAge`           | `time.Duration` | No       | 1 hour        | Maximum receipt age             |
| `JWKSURL`          | `string`        | No       | -             | JWKS endpoint for key discovery |
| `ClockSkew`        | `time.Duration` | No       | 30s           | Tolerance for clock differences |
| `ClaimsContextKey` | `string`        | No       | `peac_claims` | Context key for claims          |
| `ResultContextKey` | `string`        | No       | `peac_result` | Context key for full result     |
| `ErrorHandler`     | `func(...)`     | No       | -             | Custom error handler            |

## Error Handling

### Default Error Behavior

By default, the middleware returns RFC 9457 Problem Details responses:

```json
{
  "type": "https://peacprotocol.org/errors/receipt_expired",
  "title": "Receipt Expired",
  "status": 401,
  "detail": "Receipt issued at 2026-01-01T00:00:00Z has exceeded max age"
}
```

### Custom Error Handler

```go
cfg := middleware.Config{
    Issuer:   "https://publisher.example",
    Audience: "https://agent.example",
    ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
        // Log the error
        log.Printf("PEAC verification failed: %v", err)

        // Custom response
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusUnauthorized)
        json.NewEncoder(w).Encode(map[string]string{
            "error": "Authentication failed",
            "code":  "RECEIPT_INVALID",
        })
    },
}
```

## Error Codes

| Code                    | HTTP Status | Description              |
| ----------------------- | ----------- | ------------------------ |
| `receipt_missing`       | 401         | No PEAC-Receipt header   |
| `receipt_malformed`     | 400         | Invalid JWS format       |
| `receipt_expired`       | 401         | Receipt past max age     |
| `receipt_not_yet_valid` | 401         | issued_at in future      |
| `signature_invalid`     | 401         | Ed25519 signature failed |
| `issuer_mismatch`       | 403         | Wrong issuer             |
| `audience_mismatch`     | 403         | Wrong audience           |
| `jwks_fetch_failed`     | 503         | Cannot fetch keys        |

## Best Practices

### 1. Use Appropriate MaxAge

```go
// High-frequency APIs: shorter validity
cfg := middleware.Config{
    MaxAge: 15 * time.Minute,
}

// Batch processing: longer validity
cfg := middleware.Config{
    MaxAge: 24 * time.Hour,
}
```

### 2. Configure Clock Skew for Distributed Systems

```go
cfg := middleware.Config{
    ClockSkew: time.Minute, // More tolerance for distributed systems
}
```

### 3. Cache JWKS Responses

The middleware automatically caches JWKS responses. Configure the cache TTL:

```go
import "github.com/peacprotocol/peac-go/jwks"

// Custom cache configuration
cache := jwks.NewCache(jwks.CacheConfig{
    TTL:        5 * time.Minute,
    MaxEntries: 100,
})
```

### 4. Log Verification Failures

```go
cfg := middleware.Config{
    ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
        log.Printf("[PEAC] Verification failed for %s %s: %v",
            r.Method, r.URL.Path, err)

        // Default error response
        middleware.DefaultErrorHandler(w, r, err)
    },
}
```

## See Also

- [Go SDK Reference](../../sdks/go/README.md) - Core verification API
- [PEAC-Receipt Header](../specs/PROTOCOL-BEHAVIOR.md) - Wire protocol details
- [Purpose Headers](../specs/PROTOCOL-BEHAVIOR.md#7-http-header-semantics) - Purpose enforcement (v0.9.24+)
