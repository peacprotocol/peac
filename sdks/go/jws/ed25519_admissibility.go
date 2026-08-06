package jws

// Bounded Ed25519 point-encoding admissibility precheck.
//
// Applies an enumerated set of encoding and low-order rejections to the public key A and to the
// signature component R before delegating to the standard library, so that the verification
// decision is identical across runtimes. RFC 8032 permits the cofactored verification equation;
// Web Cryptography Level 2 specifies the cofactorless equation with prior rejection of invalid and
// small-order points. The two accept different sets at these edges.
//
// Scope: not complete point decoding, curve validation, prime-subgroup membership testing or
// general mixed-order rejection. Curve validity and the signature equation remain with the standard
// library.
//
// Implemented independently of the TypeScript verifier: the two share vectors and expected
// outcomes, never code. Unexported; no new public API and no new dependency.

const (
	ed25519PointBytes = 32
	ed25519SignBit    = 0x80
	ed25519LowSeven   = 0x7f
)

// ed25519FieldPrimeLE is p = 2^255 - 19, little-endian.
var ed25519FieldPrimeLE = [ed25519PointBytes]byte{
	0xed, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
	0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f,
}

// x is zero exactly when y^2 = 1, that is y = 1 or y = p-1. A set sign bit is then a decoding
// failure under RFC 8032 section 5.1.3, because zero has no negative encoding.
var (
	ed25519EncodedYOne = [ed25519PointBytes]byte{
		0x01,
	}
	ed25519EncodedYPMinusOne = [ed25519PointBytes]byte{
		0xec, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
		0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f,
	}
)

// ed25519TorsionPointEncodings holds the eight canonical encodings of Ed25519 points of small
// order: the identity, the point of order two, both points of order four and all four points of
// order eight. Together these are exactly the 8-torsion subgroup, so this table is COMPLETE for
// canonically encoded small-order points.
var ed25519TorsionPointEncodings = map[[ed25519PointBytes]byte]struct{}{
	// order 1 (identity)
	{0x01}: {},
	// order 2
	{0xec, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
		0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f}: {},
	// order 4
	{}: {},
	// order 4
	{0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80}: {},
	// order 8
	{0x26, 0xe8, 0x95, 0x8f, 0xc2, 0xb2, 0x27, 0xb0, 0x45, 0xc3, 0xf4, 0x89, 0xf2, 0xef, 0x98, 0xf0,
		0xd5, 0xdf, 0xac, 0x05, 0xd3, 0xc6, 0x33, 0x39, 0xb1, 0x38, 0x02, 0x88, 0x6d, 0x53, 0xfc, 0x05}: {},
	// order 8
	{0x26, 0xe8, 0x95, 0x8f, 0xc2, 0xb2, 0x27, 0xb0, 0x45, 0xc3, 0xf4, 0x89, 0xf2, 0xef, 0x98, 0xf0,
		0xd5, 0xdf, 0xac, 0x05, 0xd3, 0xc6, 0x33, 0x39, 0xb1, 0x38, 0x02, 0x88, 0x6d, 0x53, 0xfc, 0x85}: {},
	// order 8
	{0xc7, 0x17, 0x6a, 0x70, 0x3d, 0x4d, 0xd8, 0x4f, 0xba, 0x3c, 0x0b, 0x76, 0x0d, 0x10, 0x67, 0x0f,
		0x2a, 0x20, 0x53, 0xfa, 0x2c, 0x39, 0xcc, 0xc6, 0x4e, 0xc7, 0xfd, 0x77, 0x92, 0xac, 0x03, 0x7a}: {},
	// order 8
	{0xc7, 0x17, 0x6a, 0x70, 0x3d, 0x4d, 0xd8, 0x4f, 0xba, 0x3c, 0x0b, 0x76, 0x0d, 0x10, 0x67, 0x0f,
		0x2a, 0x20, 0x53, 0xfa, 0x2c, 0x39, 0xcc, 0xc6, 0x4e, 0xc7, 0xfd, 0x77, 0x92, 0xac, 0x03, 0xfa}: {},
}

// peacProfileMixedOrderRejections holds two canonical encodings of points of exact order 4L,
// rejected by PEAC profile policy since 0.16.3.
//
// These are valid curve points carrying a low-order component; they are not torsion points. They
// are not rejected solely by the invalid and small-order admissibility rule of Web Cryptography
// Level 2, and RFC 8032 does not require rejecting every mixed-order point. Observed primitive
// outcomes are recorded as versioned empirical evidence in the conformance corpus.
//
// Not a general mixed-order test: a finite table cannot reject every point carrying both a
// prime-order and a low-order component.
var peacProfileMixedOrderRejections = map[[ed25519PointBytes]byte]struct{}{
	{0xc7, 0x17, 0x6a, 0x70, 0x3d, 0x4d, 0xd8, 0x4f, 0xba, 0x3c, 0x0b, 0x76, 0x0d, 0x10, 0x67, 0x0f,
		0x2a, 0x20, 0x53, 0xfa, 0x2c, 0x39, 0xcc, 0xc6, 0x4e, 0xc7, 0xfd, 0x77, 0x92, 0xac, 0x03, 0x05}: {},
	{0xc7, 0x17, 0x6a, 0x70, 0x3d, 0x4d, 0xd8, 0x4f, 0xba, 0x3c, 0x0b, 0x76, 0x0d, 0x10, 0x67, 0x0f,
		0x2a, 0x20, 0x53, 0xfa, 0x2c, 0x39, 0xcc, 0xc6, 0x4e, 0xc7, 0xfd, 0x77, 0x92, 0xac, 0x03, 0x85}: {},
}

// ed25519PointRejectionReason states why a point encoding is inadmissible, or "" when PEAC
// expresses no opinion and the standard library decides.
type ed25519PointRejectionReason string

const (
	ed25519RejectEncodedYOutOfRange ed25519PointRejectionReason = "encoded_y_out_of_range"
	ed25519RejectInvalidXZeroSign   ed25519PointRejectionReason = "invalid_x_zero_sign"
	ed25519RejectTorsionPoint       ed25519PointRejectionReason = "torsion_point"
	ed25519RejectPeacMixedOrder     ed25519PointRejectionReason = "peac_mixed_order_profile"
	ed25519NoRejection              ed25519PointRejectionReason = ""
)

// encodedYGreaterThanOrEqualToPrime reports whether encoded y, with the sign bit masked away, is at
// least the field prime.
func encodedYGreaterThanOrEqualToPrime(point [ed25519PointBytes]byte) bool {
	for i := ed25519PointBytes - 1; i >= 0; i-- {
		y := point[i]
		if i == ed25519PointBytes-1 {
			y &= ed25519LowSeven
		}
		if y != ed25519FieldPrimeLE[i] {
			return y > ed25519FieldPrimeLE[i]
		}
	}
	// Equal to p exactly, which is out of range: y must be strictly less than p.
	return true
}

// encodedYEquals compares encoded y against a target, ignoring the sign bit.
func encodedYEquals(point, target [ed25519PointBytes]byte) bool {
	for i := 0; i < ed25519PointBytes-1; i++ {
		if point[i] != target[i] {
			return false
		}
	}
	return point[ed25519PointBytes-1]&ed25519LowSeven == target[ed25519PointBytes-1]
}

// ed25519RejectionReason classifies a 32-byte point encoding under the bounded PEAC profile. The
// caller validates length beforehand: this decides point admissibility, not container shape.
func ed25519RejectionReason(point [ed25519PointBytes]byte) ed25519PointRejectionReason {
	if encodedYGreaterThanOrEqualToPrime(point) {
		return ed25519RejectEncodedYOutOfRange
	}
	if point[ed25519PointBytes-1]&ed25519SignBit != 0 {
		if encodedYEquals(point, ed25519EncodedYOne) || encodedYEquals(point, ed25519EncodedYPMinusOne) {
			return ed25519RejectInvalidXZeroSign
		}
	}
	if _, found := ed25519TorsionPointEncodings[point]; found {
		return ed25519RejectTorsionPoint
	}
	if _, found := peacProfileMixedOrderRejections[point]; found {
		return ed25519RejectPeacMixedOrder
	}
	return ed25519NoRejection
}

// ed25519PointFrom copies a validated 32-byte slice into an array for table lookup.
func ed25519PointFrom(b []byte) [ed25519PointBytes]byte {
	var point [ed25519PointBytes]byte
	copy(point[:], b)
	return point
}
