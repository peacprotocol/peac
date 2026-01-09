// Package evidence provides validation for PEAC receipt evidence payloads.
// It enforces DoS protection limits to prevent resource exhaustion attacks.
package evidence

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
)

// Limits defines the DoS protection limits for evidence validation.
// These are implementation safety limits, not protocol constraints.
//
// Zero or negative values are treated as "use default" when WithDefaults() is called.
type Limits struct {
	// MaxBytes is the maximum size of raw JSON input in bytes (default: 1048576 = 1MB).
	// This is checked before parsing to prevent memory exhaustion from huge payloads.
	MaxBytes int

	// MaxDepth is the maximum nesting depth (default: 32).
	// Depth is counted from 0 at the root. A value at depth D means there are D
	// levels of containers (objects/arrays) above it. With MaxDepth=32, depths
	// 0 through 32 are allowed; depth 33 would be rejected.
	MaxDepth int

	// MaxArrayLength is the maximum number of elements in an array (default: 10000).
	MaxArrayLength int

	// MaxObjectKeys is the maximum number of keys in an object (default: 1000).
	MaxObjectKeys int

	// MaxStringLength is the maximum length of a string in bytes (default: 65536).
	MaxStringLength int

	// MaxTotalNodes is the maximum total number of nodes (default: 100000).
	MaxTotalNodes int
}

// DefaultLimits returns the default DoS protection limits.
// These values balance security with reasonable use cases.
func DefaultLimits() Limits {
	return Limits{
		MaxBytes:        1048576, // 1MB
		MaxDepth:        32,
		MaxArrayLength:  10000,
		MaxObjectKeys:   1000,
		MaxStringLength: 65536,  // 64KB
		MaxTotalNodes:   100000, // 100k
	}
}

// WithDefaults returns a copy of l with zero/negative values replaced by defaults.
// This allows partial limit customization while ensuring all limits have safe values.
func (l Limits) WithDefaults() Limits {
	defaults := DefaultLimits()
	if l.MaxBytes <= 0 {
		l.MaxBytes = defaults.MaxBytes
	}
	if l.MaxDepth <= 0 {
		l.MaxDepth = defaults.MaxDepth
	}
	if l.MaxArrayLength <= 0 {
		l.MaxArrayLength = defaults.MaxArrayLength
	}
	if l.MaxObjectKeys <= 0 {
		l.MaxObjectKeys = defaults.MaxObjectKeys
	}
	if l.MaxStringLength <= 0 {
		l.MaxStringLength = defaults.MaxStringLength
	}
	if l.MaxTotalNodes <= 0 {
		l.MaxTotalNodes = defaults.MaxTotalNodes
	}
	return l
}

// ValidationError represents an evidence validation error.
type ValidationError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Path    string `json:"path,omitempty"`
}

func (e *ValidationError) Error() string {
	if e.Path != "" {
		return fmt.Sprintf("%s: %s at %s", e.Code, e.Message, e.Path)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Error codes for evidence validation.
const (
	ErrCodePayloadTooLarge    = "E_EVIDENCE_PAYLOAD_TOO_LARGE"
	ErrCodeDepthExceeded      = "E_EVIDENCE_DEPTH_EXCEEDED"
	ErrCodeArrayTooLarge      = "E_EVIDENCE_ARRAY_TOO_LARGE"
	ErrCodeObjectTooLarge     = "E_EVIDENCE_OBJECT_TOO_LARGE"
	ErrCodeStringTooLong      = "E_EVIDENCE_STRING_TOO_LONG"
	ErrCodeTotalNodesTooLarge = "E_EVIDENCE_TOTAL_NODES_EXCEEDED"
	ErrCodeInvalidJSON        = "E_EVIDENCE_INVALID_JSON"
	ErrCodeNonFiniteNumber    = "E_EVIDENCE_NON_FINITE_NUMBER"
)

// Validate validates evidence JSON against DoS protection limits.
// It uses stack-based traversal to prevent stack overflow.
func Validate(data []byte, limits Limits) error {
	if len(data) == 0 {
		return nil // Empty evidence is valid
	}

	// Pre-parse byte limit check
	if len(data) > limits.MaxBytes {
		return &ValidationError{
			Code:    ErrCodePayloadTooLarge,
			Message: fmt.Sprintf("payload size (%d bytes) exceeds limit (%d bytes)", len(data), limits.MaxBytes),
		}
	}

	var value any
	if err := json.Unmarshal(data, &value); err != nil {
		return &ValidationError{
			Code:    ErrCodeInvalidJSON,
			Message: fmt.Sprintf("invalid JSON: %v", err),
		}
	}

	return ValidateValue(value, limits)
}

// ValidateValue validates an already-parsed evidence value against DoS limits.
// Use this when you already have the parsed JSON.
//
// Note: For deterministic error paths across runs, object keys are processed
// in sorted order. This ensures consistent error reporting for conformance testing.
func ValidateValue(value any, limits Limits) error {
	// Stack-based traversal to prevent recursion stack overflow
	type stackItem struct {
		value any
		depth int
		path  string
	}

	stack := []stackItem{{value: value, depth: 0, path: ""}}
	totalNodes := 0

	for len(stack) > 0 {
		// Pop from stack
		item := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		totalNodes++
		if totalNodes > limits.MaxTotalNodes {
			return &ValidationError{
				Code:    ErrCodeTotalNodesTooLarge,
				Message: fmt.Sprintf("total nodes (%d) exceeds limit (%d)", totalNodes, limits.MaxTotalNodes),
			}
		}

		if item.depth > limits.MaxDepth {
			return &ValidationError{
				Code:    ErrCodeDepthExceeded,
				Message: fmt.Sprintf("depth (%d) exceeds limit (%d)", item.depth, limits.MaxDepth),
				Path:    item.path,
			}
		}

		switch v := item.value.(type) {
		case nil:
			// null is valid

		case bool:
			// booleans are valid

		case float64:
			// Go's encoding/json unmarshals numbers as float64
			// Check for non-finite values (NaN, +Inf, -Inf)
			// Note: json.Unmarshal already rejects these, but we check defensively
			if math.IsNaN(v) {
				return &ValidationError{
					Code:    ErrCodeNonFiniteNumber,
					Message: "NaN is not allowed in evidence",
					Path:    item.path,
				}
			}
			if math.IsInf(v, 0) {
				return &ValidationError{
					Code:    ErrCodeNonFiniteNumber,
					Message: "Infinity is not allowed in evidence",
					Path:    item.path,
				}
			}

		case string:
			if len(v) > limits.MaxStringLength {
				return &ValidationError{
					Code:    ErrCodeStringTooLong,
					Message: fmt.Sprintf("string length (%d) exceeds limit (%d)", len(v), limits.MaxStringLength),
					Path:    item.path,
				}
			}

		case []any:
			if len(v) > limits.MaxArrayLength {
				return &ValidationError{
					Code:    ErrCodeArrayTooLarge,
					Message: fmt.Sprintf("array length (%d) exceeds limit (%d)", len(v), limits.MaxArrayLength),
					Path:    item.path,
				}
			}
			// Push array elements to stack (in reverse for correct order)
			for i := len(v) - 1; i >= 0; i-- {
				elemPath := fmt.Sprintf("%s[%d]", item.path, i)
				stack = append(stack, stackItem{
					value: v[i],
					depth: item.depth + 1,
					path:  elemPath,
				})
			}

		case map[string]any:
			if len(v) > limits.MaxObjectKeys {
				return &ValidationError{
					Code:    ErrCodeObjectTooLarge,
					Message: fmt.Sprintf("object keys (%d) exceeds limit (%d)", len(v), limits.MaxObjectKeys),
					Path:    item.path,
				}
			}

			// Sort keys for deterministic traversal order
			keys := make([]string, 0, len(v))
			for key := range v {
				keys = append(keys, key)
			}
			sort.Strings(keys)

			// Push object values to stack (in reverse sorted order for correct processing)
			for i := len(keys) - 1; i >= 0; i-- {
				key := keys[i]
				val := v[key]

				// Check key length
				if len(key) > limits.MaxStringLength {
					return &ValidationError{
						Code:    ErrCodeStringTooLong,
						Message: fmt.Sprintf("key length (%d) exceeds limit (%d)", len(key), limits.MaxStringLength),
						Path:    item.path,
					}
				}
				keyPath := item.path + "." + key
				if item.path == "" {
					keyPath = key
				}
				stack = append(stack, stackItem{
					value: val,
					depth: item.depth + 1,
					path:  keyPath,
				})
			}

		default:
			// json.Unmarshal should only produce the above types
			return &ValidationError{
				Code:    ErrCodeInvalidJSON,
				Message: fmt.Sprintf("unexpected type: %T", v),
				Path:    item.path,
			}
		}
	}

	return nil
}

// ValidateJSON is a convenience function that parses and validates JSON evidence.
func ValidateJSON(data []byte) error {
	return Validate(data, DefaultLimits())
}
