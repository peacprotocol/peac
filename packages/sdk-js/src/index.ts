/**
 * @peac/sdk - PEAC client SDK with discover/verify functions
 * All-in-one client for PEAC operations
 */

export { PeacClient } from './client';
export type {
  ClientConfig,
  DiscoverOptions,
  VerifyLocalOptions,
  VerifyRemoteOptions,
  DiscoveryResult,
  VerificationResult,
  ClientError,
} from './types';

// Convenience functions for single-use operations
export async function discover(
  origin: string,
  options?: import('./types').DiscoverOptions
): Promise<import('./types').DiscoveryResult> {
  const { PeacClient } = await import('./client');
  const client = new PeacClient();
  return client.discover(origin, options);
}

export async function verifyLocal(
  receipt: string,
  keys: Record<string, any>,
  options?: import('./types').VerifyLocalOptions
): Promise<import('./types').VerificationResult> {
  const { PeacClient } = await import('./client');
  const client = new PeacClient({ defaultKeys: keys });
  return client.verifyLocal(receipt, options);
}

export async function verifyRemote(
  receipt: string,
  endpoint?: string,
  options?: import('./types').VerifyRemoteOptions
): Promise<import('./types').VerificationResult> {
  const { PeacClient } = await import('./client');
  const client = new PeacClient();
  return client.verifyRemote(receipt, endpoint, options);
}

export async function verify(
  receipt: string,
  keysOrOptions?: Record<string, any> | import('./types').VerifyLocalOptions,
  options?: import('./types').VerifyRemoteOptions
): Promise<import('./types').VerificationResult> {
  const { PeacClient } = await import('./client');
  const client = new PeacClient();

  if (typeof keysOrOptions === 'object' && !('keys' in keysOrOptions)) {
    // First param is keys object
    return client.verify(receipt, { keys: keysOrOptions, ...options });
  } else {
    // First param is options object
    return client.verify(receipt, keysOrOptions as any);
  }
}
