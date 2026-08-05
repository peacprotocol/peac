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

// RFC 8032 section 7.1, TEST 1 (empty message).
const RFC8032_VECTOR1_PUBLIC_KEY =
  'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const RFC8032_VECTOR1_SIGNATURE =
  'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';

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
      hexToBytes(RFC8032_VECTOR1_PUBLIC_KEY) as BufferSource,
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    return await subtle.verify(
      { name: 'Ed25519' },
      key,
      hexToBytes(RFC8032_VECTOR1_SIGNATURE) as BufferSource,
      new Uint8Array(0) as BufferSource
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
