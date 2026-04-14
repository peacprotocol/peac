// Panic recovery middleware for PEAC handlers.
//
// When Config.RecoverPanics is true (the default from DefaultConfig()), any
// panic raised in the downstream handler is caught, logged via the
// configured Logger, counted via Metrics, and converted into an RFC 9457
// problem-details response. This keeps a single misbehaving handler from
// taking down the process.
//
// Test environments can opt out of recovery via Config.PanicRethrowInTest
// so test runners see the original stack trace instead of a 500.

package middleware

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"runtime/debug"
)

// recoverError wraps a recovered panic value for logging and reporting. The
// original value (which may be an error, a string, or anything else) is
// preserved on the Value field.
type recoverError struct {
	Value any
	Stack string
}

func (e *recoverError) Error() string {
	if err, ok := e.Value.(error); ok {
		return err.Error()
	}
	return fmt.Sprintf("%v", e.Value)
}

// wrapWithRecover wraps the given handler with panic-recovery behavior
// controlled by the supplied Config. If cfg.RecoverPanics is false the
// original handler is returned unchanged.
func wrapWithRecover(next http.Handler, cfg Config) http.Handler {
	if !cfg.RecoverPanics {
		return next
	}
	logger := resolveLogger(cfg.Logger)
	metrics := resolveMetrics(cfg.Metrics)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				if cfg.PanicRethrowInTest {
					// Let test runners see the original panic / stack.
					panic(rec)
				}
				stack := string(debug.Stack())
				err := &recoverError{Value: rec, Stack: stack}

				logger.Error(
					"peac middleware recovered from panic",
					"peac.error.code", "PEAC_MIDDLEWARE_PANIC",
					"peac.panic.message", err.Error(),
					"peac.panic.stack", stack,
					"http.method", r.Method,
					"http.target", r.URL.Path,
				)
				metrics.IncCounter("peac.middleware.panics", "path", r.URL.Path)

				writePanicResponse(w, err)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// writePanicResponse emits an RFC 9457 problem-details response for a
// recovered panic. The panic message is included in the `detail` field;
// the stack is not emitted over the wire (only logged via Logger) to avoid
// leaking internal details.
func writePanicResponse(w http.ResponseWriter, err *recoverError) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(http.StatusInternalServerError)
	resp := map[string]any{
		"type":     "https://www.peacprotocol.org/errors/peac_middleware_panic",
		"title":    "PEAC_MIDDLEWARE_PANIC",
		"status":   http.StatusInternalServerError,
		"detail":   err.Error(),
		"instance": "peac:middleware:panic-recovered",
	}
	_ = json.NewEncoder(w).Encode(resp) // best-effort write, ignore encoder err
}

// isRecoverError reports whether the supplied error is a recoverError.
// Exposed for tests.
func isRecoverError(err error) bool {
	var r *recoverError
	return errors.As(err, &r)
}
