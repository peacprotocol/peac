import { Request, Response, NextFunction } from "express";
import { logger } from "../../logging";

export interface SecurityHeadersConfig {
  csp: {
    enabled: boolean;
    reportOnly: boolean;
    directives: Record<string, string[]>;
    reportUri?: string;
  };
  hsts: {
    enabled: boolean;
    maxAge: number;
    includeSubDomains: boolean;
    preload: boolean;
  };
  referrerPolicy: string;
  contentTypeOptions: boolean;
  frameOptions: string;
  xssProtection: boolean;
}

export class SecurityHeadersMiddleware {
  private config: SecurityHeadersConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): SecurityHeadersConfig {
    return {
      csp: {
        enabled: process.env.PEAC_CSP_ENABLED !== "false",
        reportOnly: process.env.PEAC_CSP_REPORT_ONLY === "true",
        directives: {
          "default-src": ["'none'"],
          "script-src": ["'none'"],
          "style-src": ["'none'"],
          "img-src": ["'none'"],
          "font-src": ["'none'"],
          "connect-src": ["'self'"],
          "media-src": ["'none'"],
          "object-src": ["'none'"],
          "frame-src": ["'none'"],
          "frame-ancestors": ["'none'"],
          "form-action": ["'none'"],
          "base-uri": ["'none'"],
          "manifest-src": ["'none'"],
        },
        reportUri: process.env.PEAC_CSP_REPORT_URI,
      },
      hsts: {
        enabled: process.env.PEAC_HSTS_ENABLED !== "false",
        maxAge: parseInt(process.env.PEAC_HSTS_MAX_AGE || "31536000"), // 1 year
        includeSubDomains: process.env.PEAC_HSTS_INCLUDE_SUBDOMAINS !== "false",
        preload: process.env.PEAC_HSTS_PRELOAD === "true",
      },
      referrerPolicy: process.env.PEAC_REFERRER_POLICY || "no-referrer",
      contentTypeOptions: process.env.PEAC_NOSNIFF_ENABLED !== "false",
      frameOptions: process.env.PEAC_FRAME_OPTIONS || "DENY",
      xssProtection: process.env.PEAC_XSS_PROTECTION_ENABLED !== "false",
    };
  }

  private buildCSPHeader(): string {
    const directives = this.config.csp.directives;
    const parts: string[] = [];

    for (const [directive, values] of Object.entries(directives)) {
      if (values.length > 0) {
        parts.push(`${directive} ${values.join(" ")}`);
      }
    }

    if (this.config.csp.reportUri) {
      parts.push(`report-uri ${this.config.csp.reportUri}`);
    }

    return parts.join("; ");
  }

  private buildHSTSHeader(): string {
    const parts = [`max-age=${this.config.hsts.maxAge}`];

    if (this.config.hsts.includeSubDomains) {
      parts.push("includeSubDomains");
    }

    if (this.config.hsts.preload) {
      parts.push("preload");
    }

    return parts.join("; ");
  }

  private isTLSRequest(req: Request): boolean {
    // Check various indicators of TLS/HTTPS
    return (
      req.secure ||
      req.protocol === "https" ||
      req.get("X-Forwarded-Proto") === "https" ||
      req.get("X-Forwarded-SSL") === "on" ||
      req.get("CloudFront-Forwarded-Proto") === "https"
    );
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const headers: Record<string, string> = {};

      // Content Security Policy
      if (this.config.csp.enabled) {
        const cspHeader = this.buildCSPHeader();
        const headerName = this.config.csp.reportOnly
          ? "Content-Security-Policy-Report-Only"
          : "Content-Security-Policy";
        headers[headerName] = cspHeader;
      }

      // HSTS (only over HTTPS)
      if (this.config.hsts.enabled && this.isTLSRequest(req)) {
        headers["Strict-Transport-Security"] = this.buildHSTSHeader();
      }

      // X-Content-Type-Options
      if (this.config.contentTypeOptions) {
        headers["X-Content-Type-Options"] = "nosniff";
      }

      // Referrer-Policy
      headers["Referrer-Policy"] = this.config.referrerPolicy;

      // X-Frame-Options
      headers["X-Frame-Options"] = this.config.frameOptions;

      // X-XSS-Protection removed - deprecated and potentially harmful on legacy browsers

      // Permissions-Policy (explicit deny list for better compatibility)
      headers["Permissions-Policy"] = [
        "geolocation=()", "microphone=()", "camera=()", "payment=()", "fullscreen=()",
        "usb=()", "accelerometer=()", "gyroscope=()", "magnetometer=()", "midi=()",
        "screen-wake-lock=()", "clipboard-read=()", "clipboard-write=()",
        "document-domain=()", "encrypted-media=()", "display-capture=()",
        "sync-xhr=()", "xr-spatial-tracking=()", "interest-cohort=()"
      ].join(", ");

      // Apply all headers
      res.set(headers);

      // Log security header application in debug mode
      if (process.env.NODE_ENV === "development") {
        logger.debug(
          {
            appliedHeaders: Object.keys(headers),
            cspEnabled: this.config.csp.enabled,
            cspReportOnly: this.config.csp.reportOnly,
            tlsDetected: this.isTLSRequest(req),
          },
          "Applied security headers"
        );
      }

      next();
    };
  }

  getConfig(): SecurityHeadersConfig {
    return { ...this.config };
  }

  // For testing and debugging
  getAppliedHeaders(req: Request): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this.config.csp.enabled) {
      const cspHeader = this.buildCSPHeader();
      const headerName = this.config.csp.reportOnly
        ? "Content-Security-Policy-Report-Only"
        : "Content-Security-Policy";
      headers[headerName] = cspHeader;
    }

    if (this.config.hsts.enabled && this.isTLSRequest(req)) {
      headers["Strict-Transport-Security"] = this.buildHSTSHeader();
    }

    if (this.config.contentTypeOptions) {
      headers["X-Content-Type-Options"] = "nosniff";
    }

    headers["Referrer-Policy"] = this.config.referrerPolicy;
    headers["X-Frame-Options"] = this.config.frameOptions;

    if (this.config.xssProtection) {
      headers["X-XSS-Protection"] = "1; mode=block";
    }

    return headers;
  }
}

// Singleton instance
export const securityHeaders = new SecurityHeadersMiddleware();