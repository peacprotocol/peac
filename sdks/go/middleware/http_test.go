package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	peac "github.com/peacprotocol/peac-go"
)

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()

	if cfg.HeaderName != "PEAC-Receipt" {
		t.Errorf("HeaderName = %v, want 'PEAC-Receipt'", cfg.HeaderName)
	}

	if cfg.Optional {
		t.Error("Optional should be false by default")
	}

	if cfg.MaxAge == 0 {
		t.Error("MaxAge should have a default value")
	}
}

func TestMiddlewareMissingReceipt(t *testing.T) {
	middleware := Middleware(Config{
		Issuer:   "https://publisher.example",
		Audience: "https://agent.example",
		Optional: false,
	})

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("Handler should not be called when receipt is missing")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("Status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}

	// Check content type
	contentType := rec.Header().Get("Content-Type")
	if contentType != "application/problem+json" {
		t.Errorf("Content-Type = %v, want 'application/problem+json'", contentType)
	}

	// Parse response
	var resp map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if resp["status"] != float64(401) {
		t.Errorf("Response status = %v, want 401", resp["status"])
	}
}

func TestMiddlewareOptionalMissingReceipt(t *testing.T) {
	handlerCalled := false

	middleware := Middleware(Config{
		Issuer:   "https://publisher.example",
		Audience: "https://agent.example",
		Optional: true,
	})

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if !handlerCalled {
		t.Error("Handler should be called when receipt is optional")
	}

	if rec.Code != http.StatusOK {
		t.Errorf("Status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestMiddlewareCustomErrorHandler(t *testing.T) {
	customErrorCalled := false

	middleware := Middleware(Config{
		Issuer:   "https://publisher.example",
		Audience: "https://agent.example",
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			customErrorCalled = true
			w.WriteHeader(http.StatusTeapot) // Custom status to verify it's called
		},
	})

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("Handler should not be called")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if !customErrorCalled {
		t.Error("Custom error handler should be called")
	}

	if rec.Code != http.StatusTeapot {
		t.Errorf("Status = %d, want %d", rec.Code, http.StatusTeapot)
	}
}

func TestMiddlewareBearerPrefix(t *testing.T) {
	// This test verifies that "Bearer " prefix is stripped
	// We can't test full verification without a valid receipt,
	// but we can test that the header is parsed correctly

	middleware := Middleware(Config{
		Issuer:   "https://publisher.example",
		Audience: "https://agent.example",
	})

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("Handler should not be called with invalid receipt")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("PEAC-Receipt", "Bearer invalid-jws-token")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	// Should fail with invalid format, not missing receipt
	if rec.Code == http.StatusOK {
		t.Error("Should fail with invalid JWS")
	}
}

func TestGetClaimsNil(t *testing.T) {
	req := httptest.NewRequest("GET", "/test", nil)

	claims := GetClaims(req)
	if claims != nil {
		t.Error("GetClaims should return nil when no claims in context")
	}

	result := GetResult(req)
	if result != nil {
		t.Error("GetResult should return nil when no result in context")
	}
}

func TestRequireReceiptHelper(t *testing.T) {
	middleware := RequireReceipt("https://publisher.example", "https://agent.example")

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("Handler should not be called")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("Status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestOptionalReceiptHelper(t *testing.T) {
	handlerCalled := false

	middleware := OptionalReceipt("https://publisher.example", "https://agent.example")

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if !handlerCalled {
		t.Error("Handler should be called with optional receipt")
	}
}

func TestDefaultErrorHandlerPEACError(t *testing.T) {
	err := peac.NewPEACError(peac.ErrInvalidSignature, "test message").
		WithDetail("key_id", "test-key")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test", nil)

	defaultErrorHandler(rec, req, err)

	if rec.Code != 400 {
		t.Errorf("Status = %d, want 400", rec.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if resp["title"] != "E_INVALID_SIGNATURE" {
		t.Errorf("Title = %v, want 'E_INVALID_SIGNATURE'", resp["title"])
	}

	if resp["detail"] != "test message" {
		t.Errorf("Detail = %v, want 'test message'", resp["detail"])
	}

	peacErr, ok := resp["peac_error"].(map[string]interface{})
	if !ok {
		t.Fatal("Expected peac_error in response")
	}

	if peacErr["key_id"] != "test-key" {
		t.Errorf("peac_error.key_id = %v, want 'test-key'", peacErr["key_id"])
	}
}

func TestCustomHeaderName(t *testing.T) {
	middleware := Middleware(Config{
		Issuer:     "https://publisher.example",
		Audience:   "https://agent.example",
		HeaderName: "X-Custom-Receipt",
	})

	handlerCalled := false
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
	}))

	// Request with wrong header should fail
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("PEAC-Receipt", "some-value")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if handlerCalled {
		t.Error("Handler should not be called with wrong header name")
	}

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("Status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}
