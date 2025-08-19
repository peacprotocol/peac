import { Request, Response, NextFunction } from 'express';
import { problemDetails } from '../problems';

/**
 * Global content negotiation and header middleware
 * Handles Accept header validation, sets Vary headers, and ensures proper caching/304 hygiene
 */
export function globalContentNegotiation(req: Request, res: Response, next: NextFunction): void {
  // Always set Vary header for proper caching (RFC 9110)
  res.set('Vary', 'Accept, Accept-Encoding');

  // Ensure 304 hygiene - remove entity headers on conditional responses
  const originalJson = res.json;
  res.json = function (obj: any) {
    if (res.statusCode === 304) {
      // RFC 9110: Remove entity headers on 304 responses
      res.removeHeader('Content-Type');
      res.removeHeader('Content-Length');
      res.removeHeader('Content-Encoding');
      res.removeHeader('Last-Modified');
      res.removeHeader('ETag');
      return originalJson.call(this, undefined);
    }
    return originalJson.call(this, obj);
  };

  // Skip content negotiation for certain paths
  const skipPaths = ['/metrics', '/livez', '/readyz', '/healthz'];
  if (skipPaths.some((path) => req.path.startsWith(path))) {
    return next();
  }

  // Check Accept header
  const acceptHeader = req.get('Accept');

  if (acceptHeader) {
    // List of acceptable content types for API endpoints
    const acceptableTypes = [
      'application/json',
      'application/problem+json',
      'application/vnd.peac.capabilities+json',
      'application/*',
      '*/*',
    ];

    // Parse Accept header (simple implementation)
    const acceptedTypes = acceptHeader
      .split(',')
      .map((type) => type.trim().split(';')[0]) // Remove quality parameters
      .map((type) => type.toLowerCase());

    // Check if any accepted type matches our supported types
    const isAcceptable = acceptedTypes.some((accepted) =>
      acceptableTypes.some((supported) => {
        if (accepted === supported) return true;
        if (accepted === '*/*') return true;
        if (accepted === 'application/*' && supported.startsWith('application/')) return true;
        // Support vendor media types with version
        if (
          accepted.startsWith('application/vnd.peac.capabilities+json') &&
          supported === 'application/vnd.peac.capabilities+json'
        )
          return true;
        return false;
      }),
    );

    if (!isAcceptable) {
      return problemDetails.send(res, 'not_acceptable', {
        detail: `Cannot produce response in requested content type. Supported: ${acceptableTypes.join(', ')}`,
      });
    }
  }

  next();
}
