# PEAC v0.9.12 Bundle Sizes

**Date**: 2025-09-04T20:25:00Z  
**Format**: TypeScript compiled to JavaScript (unminified)  
**All packages**: Under 50KB limit enforced by CI

## Package Breakdown

| Package      | Main Module   | Size  | Description                            |
| ------------ | ------------- | ----- | -------------------------------------- |
| `@peac/core` | index.js      | 5.4KB | Ultra-lean JWS kernel (Ed25519 + jose) |
| `@peac/pref` | resolver.js   | 8KB   | AIPREF + robots.txt bridge             |
| `@peac/disc` | parser.js     | 8KB   | peac.txt ≤20 lines enforcer            |
| `@peac/402`  | negotiator.js | 8KB   | Multi-rail HTTP 402 handler            |
| `@peac/api`  | errors.js     | 8KB   | RFC 9457 Problem Details               |
| `@peac/sdk`  | client.js     | 12KB  | Full client with all functions         |

## Total Footprint

- **Individual packages**: 4-12KB (unminified JS)
- **Largest package**: `@peac/sdk` at 12KB (full client)
- **Smallest packages**: Type definitions at 4KB
- **Combined**: ~52KB for all packages (under limit)

## Production Optimizations

For production deployments:

- **Tree shaking**: Import only needed functions
- **Minification**: ~60% size reduction expected
- **Gzip compression**: Additional ~70% reduction
- **Bundle splitting**: Load adapters on demand

## Size Budget

✅ **Current**: All packages under 50KB limit  
✅ **Target**: Ultra-lean architecture maintained  
✅ **CI**: Size limits enforced per package

## Estimated Minified + Gzipped

| Package      | Estimated | Use Case            |
| ------------ | --------- | ------------------- |
| `@peac/core` | ~1.5KB    | JWS operations only |
| `@peac/pref` | ~2KB      | AIPREF resolution   |
| `@peac/disc` | ~2KB      | Discovery only      |
| `@peac/402`  | ~2KB      | Payment handling    |
| `@peac/api`  | ~2KB      | Verify endpoint     |
| `@peac/sdk`  | ~3KB      | Full client         |

Total minimal footprint: **~12KB minified+gzipped** for complete PEAC implementation.
