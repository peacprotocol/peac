// Observability hooks for the PEAC middleware.
//
// The Logger and Metrics interfaces allow a host application to plug in its
// own structured logger (e.g. zap, slog, logrus) and its own metrics sink
// (e.g. OpenTelemetry, Prometheus, Datadog) without the middleware depending
// on any specific observability library.
//
// Both interfaces ship no-op default implementations so the middleware is
// usable without any configuration. Key naming follows the OpenTelemetry
// semantic-convention pattern using a "peac." prefix (for example
// "peac.receipt.ref", "peac.error.code", "peac.verify.duration_ms").

package middleware

// Logger is the structured-logging interface consumed by the middleware.
// Keys and values alternate; callers are responsible for pairing them. A
// nil Logger is treated as NoopLogger. Implementations must be safe for
// concurrent use.
type Logger interface {
	Info(msg string, keysAndValues ...any)
	Warn(msg string, keysAndValues ...any)
	Error(msg string, keysAndValues ...any)
}

// Metrics is the metrics-sink interface consumed by the middleware. A nil
// Metrics is treated as NoopMetrics. Implementations must be safe for
// concurrent use.
type Metrics interface {
	// IncCounter increments a named counter by 1. Tag pairs alternate
	// (key1, value1, key2, value2, ...).
	IncCounter(name string, tags ...string)

	// ObserveHistogram records a numeric observation for a named
	// histogram, e.g. a request-duration measurement in milliseconds. Tag
	// pairs alternate.
	ObserveHistogram(name string, value float64, tags ...string)
}

// NoopLogger discards every log call. Used as the default when Config.Logger
// is nil.
type NoopLogger struct{}

// Info implements Logger.
func (NoopLogger) Info(_ string, _ ...any) {}

// Warn implements Logger.
func (NoopLogger) Warn(_ string, _ ...any) {}

// Error implements Logger.
func (NoopLogger) Error(_ string, _ ...any) {}

// NoopMetrics discards every metric call. Used as the default when
// Config.Metrics is nil.
type NoopMetrics struct{}

// IncCounter implements Metrics.
func (NoopMetrics) IncCounter(_ string, _ ...string) {}

// ObserveHistogram implements Metrics.
func (NoopMetrics) ObserveHistogram(_ string, _ float64, _ ...string) {}

// resolveLogger returns the configured logger or a NoopLogger if nil.
func resolveLogger(l Logger) Logger {
	if l == nil {
		return NoopLogger{}
	}
	return l
}

// resolveMetrics returns the configured metrics sink or NoopMetrics if nil.
func resolveMetrics(m Metrics) Metrics {
	if m == nil {
		return NoopMetrics{}
	}
	return m
}
