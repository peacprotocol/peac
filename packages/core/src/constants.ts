/**
 * @peac/core v0.9.12.1 - Protocol constants and wire format definitions
 */

export const PEAC_WIRE_VERSION = '0.9.12.1';

export const CANONICAL_HEADERS = { 
  receipt: 'PEAC-Receipt', 
  version: 'peac-version' 
};

export const LEGACY_HEADERS = { 
  receipt: 'x-peac-receipt', 
  version: 'x-peac-protocol' 
};