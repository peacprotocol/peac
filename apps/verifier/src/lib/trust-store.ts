/**
 * Trust Store
 *
 * Manages trusted issuers and their public keys in localStorage.
 * Pure client-side -- no server calls.
 */

const STORAGE_KEY = 'peac-trust-store';

export interface TrustedIssuer {
  issuer: string;
  jwks_uri?: string;
  keys: TrustedKey[];
}

export interface TrustedKey {
  kid: string;
  kty: string;
  crv: string;
  x: string;
}

export interface TrustStore {
  issuers: TrustedIssuer[];
}

function loadStore(): TrustStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { issuers: [] };
    return JSON.parse(raw) as TrustStore;
  } catch {
    return { issuers: [] };
  }
}

function saveStore(store: TrustStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getIssuers(): TrustedIssuer[] {
  return loadStore().issuers;
}

export function addIssuer(issuer: TrustedIssuer): void {
  const store = loadStore();
  const existing = store.issuers.findIndex((i) => i.issuer === issuer.issuer);
  if (existing >= 0) {
    store.issuers[existing] = issuer;
  } else {
    store.issuers.push(issuer);
  }
  saveStore(store);
}

export function removeIssuer(issuerUrl: string): void {
  const store = loadStore();
  store.issuers = store.issuers.filter((i) => i.issuer !== issuerUrl);
  saveStore(store);
}

export function findKeyForKid(kid: string): TrustedKey | undefined {
  const store = loadStore();
  for (const issuer of store.issuers) {
    const key = issuer.keys.find((k) => k.kid === kid);
    if (key) return key;
  }
  return undefined;
}

export function clearStore(): void {
  localStorage.removeItem(STORAGE_KEY);
}
