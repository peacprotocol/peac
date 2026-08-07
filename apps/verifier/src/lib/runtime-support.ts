/**
 * Ed25519 WebCrypto capability probe.
 *
 * This is the ONLY place in the app that may call crypto.subtle.verify, and it operates on ONE
 * committed RFC 8032 vector. It never sees a user record, key or context, and it never produces a
 * record verdict. There is no fallback to another implementation: an unsupported runtime is an
 * application-capability state, reported as such.
 *
 * Memoized: the probe runs ONCE. Concurrent initialization shares the in-flight promise.
 */

// RFC 8032 section 7.1, TEST 2 (one-byte message 0x72). Deliberately NOT the empty-message
// TEST 1: at least one WebCrypto implementation rejects Ed25519 verification of zero-length
// messages while verifying every non-empty message correctly, and a PEAC signing input is never
// empty, so an empty-message probe would misreport a capable runtime as unsupported.
const RFC8032_VECTOR2_PUBLIC_KEY =
  '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c';
const RFC8032_VECTOR2_SIGNATURE =
  '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00';
const RFC8032_VECTOR2_MESSAGE = '72';

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

let inFlight: Promise<boolean> | undefined;

async function probe(): Promise<boolean> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return false;
  try {
    const key = await subtle.importKey(
      'raw',
      hexToBytes(RFC8032_VECTOR2_PUBLIC_KEY) as BufferSource,
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    return await subtle.verify(
      { name: 'Ed25519' },
      key,
      hexToBytes(RFC8032_VECTOR2_SIGNATURE) as BufferSource,
      hexToBytes(RFC8032_VECTOR2_MESSAGE) as BufferSource
    );
  } catch {
    // NotSupportedError, or any failure verifying the known-good vector, means this runtime cannot
    // verify Ed25519. A throw is a capability answer, never an exception the caller must handle.
    return false;
  }
}

export function ed25519WebCryptoSupported(): Promise<boolean> {
  if (inFlight === undefined) inFlight = probe();
  return inFlight;
}

/** Test-only: forget the memoized result so a stubbed runtime can be re-probed. */
export function resetRuntimeProbeForTests(): void {
  inFlight = undefined;
}
