/**
 * HTTP utility functions for consistent header handling
 * Version info lives in JWS typ claim only
 */

export function peacHeaders(extra: Record<string, string> = {}, sensitive = false) {
  const base: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    ...extra,
  };

  // Only include X-Request-ID if caller set it
  if (!extra['X-Request-ID']) delete (base as any)['X-Request-ID'];

  // Add no-store cache headers for sensitive responses
  if (sensitive) {
    base['Cache-Control'] = 'no-store, no-cache, must-revalidate, private';
    base['Pragma'] = 'no-cache';
    base['Expires'] = '0';
  }

  return base;
}
