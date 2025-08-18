import { Request, Response, NextFunction } from "express";

export function securityHeaders() {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "Content-Security-Policy": "default-src 'self'",
      "X-Permitted-Cross-Domain-Policies": "none",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
      "Expires": "0",
    });
    next();
  };
}