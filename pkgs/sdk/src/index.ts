/**
 * @peac/sdk - PEAC client SDK with discover/verify functions
 * All-in-one client for PEAC operations
 */

export { PeacClient } from './client.js';
export type {
  ClientConfig,
  DiscoverOptions,
  VerifyLocalOptions,
  VerifyRemoteOptions,
  DiscoveryResult,
  VerificationResult,
  ClientError,
} from './types.js';

// Convenience functions for single-use operations
export async function discover(
  origin: string,
  options?: import('./types.js').DiscoverOptions,
): Promise<import('./types.js').DiscoveryResult> {
  const { PeacClient } = await import('./client.js');
  const client = new PeacClient();
  return client.discover(origin, options);
}

export async function verifyLocal(
  receipt: string,
  keys: Record<string, any>,
  options?: import('./types.js').VerifyLocalOptions,
): Promise<import('./types.js').VerificationResult> {
  const { PeacClient } = await import('./client.js');
  const client = new PeacClient({ defaultKeys: keys });
  return client.verifyLocal(receipt, options);
}

export async function verifyRemote(
  receipt: string,
  endpoint?: string,
  options?: import('./types.js').VerifyRemoteOptions,
): Promise<import('./types.js').VerificationResult> {
  const { PeacClient } = await import('./client.js');
  const client = new PeacClient();
  return client.verifyRemote(receipt, endpoint, options);
}

export async function verify(
  receipt: string,
  keysOrOptions?: Record<string, any> | import('./types.js').VerifyLocalOptions,
  options?: import('./types.js').VerifyRemoteOptions,
): Promise<import('./types.js').VerificationResult> {
  const { PeacClient } = await import('./client.js');
  const client = new PeacClient();

  if (typeof keysOrOptions === 'object' && !('keys' in keysOrOptions)) {
    // First param is keys object
    return client.verify(receipt, { keys: keysOrOptions, ...options });
  } else {
    // First param is options object
    return client.verify(receipt, keysOrOptions as any);
  }
}
