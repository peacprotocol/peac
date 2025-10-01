/**
 * /ready endpoint - Readiness check with dependency validation
 */

import { Context } from 'hono';
import { peacHeaders } from '../util/http.js';

async function checkCoreLoaded() {
  try {
    const { enforce } = await import('@peac/core');
    return typeof enforce === 'function';
  } catch {
    return false;
  }
}

async function checkSignerCache() {
  try {
    // Try to import crypto functions
    await import('jose'); // module resolution sanity check
    return true;
  } catch {
    return false;
  }
}

async function checkApiVerifier() {
  try {
    await import('@peac/app-api');
    return true;
  } catch {
    return false;
  }
}

async function checkUniversalParserLoaded() {
  try {
    const { discoverPolicy } = await import('@peac/core');
    return typeof discoverPolicy === 'function';
  } catch {
    return false;
  }
}

export async function readinessRoute(c: Context) {
  const startTime = performance.now();

  try {
    // Check critical dependencies
    const checks = {
      core_loaded: await checkCoreLoaded(),
      signer_cache: await checkSignerCache(),
      api_verifier_loaded: await checkApiVerifier(),
      universal_parser_loaded: await checkUniversalParserLoaded(),
      memory_available: process.memoryUsage().heapUsed < 500 * 1024 * 1024, // < 500MB
      uptime_sufficient: process.uptime() > 1, // At least 1 second uptime
    };

    const ready = Object.values(checks).every((v) => v === true);
    const elapsed = performance.now() - startTime;

    const responseBody = JSON.stringify({
      ok: ready,
      checks,
      response_time_ms: elapsed,
      timestamp: new Date().toISOString(),
    });

    return c.newResponse(
      responseBody,
      ready ? 200 : 503,
      peacHeaders({
        'Content-Type': 'application/peac+json',
        'X-Request-ID': c.get('requestId'),
      })
    );
  } catch (error) {
    const elapsed = performance.now() - startTime;

    const errorBody = JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      response_time_ms: elapsed,
      timestamp: new Date().toISOString(),
    });

    return c.newResponse(
      errorBody,
      503,
      peacHeaders({
        'Content-Type': 'application/peac+json',
        'X-Request-ID': c.get('requestId'),
      })
    );
  }
}
