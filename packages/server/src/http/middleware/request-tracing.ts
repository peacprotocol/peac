import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { logger } from "../../logging";

// Extend Express Request type to include tracing properties
declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
    traceParent?: string;
    traceState?: string;
    spanId?: string;
  }
}

export interface RequestTracingConfig {
  enabled: boolean;
  headerName: string;
  traceParentHeader: string;
  generateSpanId: boolean;
}

export class RequestTracingMiddleware {
  private config: RequestTracingConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): RequestTracingConfig {
    return {
      enabled: process.env.PEAC_REQUEST_TRACING_ENABLED !== "false",
      headerName: "X-Request-Id",
      traceParentHeader: "traceparent",
      generateSpanId: process.env.PEAC_GENERATE_SPAN_ID === "true",
    };
  }

  private parseTraceParent(traceParent: string): {
    version: string;
    traceId: string;
    parentId: string;
    flags: string;
  } | null {
    // W3C Trace Context format: version-traceId-parentId-flags
    // Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
    const parts = traceParent.split("-");
    
    if (parts.length !== 4) {
      return null;
    }

    const [version, traceId, parentId, flags] = parts;

    // Basic validation
    if (
      version.length !== 2 ||
      traceId.length !== 32 ||
      parentId.length !== 16 ||
      flags.length !== 2
    ) {
      return null;
    }

    return { version, traceId, parentId, flags };
  }

  private generateSpanId(): string {
    // Generate 8-byte span ID as hex string
    return randomUUID().replace(/-/g, "").substring(0, 16);
  }

  private createChildTraceParent(parentTrace: {
    version: string;
    traceId: string;
    parentId: string;
    flags: string;
  }, newSpanId: string): string {
    return `${parentTrace.version}-${parentTrace.traceId}-${newSpanId}-${parentTrace.flags}`;
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!this.config.enabled) {
        return next();
      }

      // Always generate a unique request ID
      const requestId = randomUUID();
      req.requestId = requestId;

      // Set X-Request-Id header in response
      res.set(this.config.headerName, requestId);

      // Handle traceparent and tracestate if present
      const incomingTraceParent = req.get(this.config.traceParentHeader);
      const incomingTraceState = req.get("tracestate");
      
      if (incomingTraceParent) {
        const parsedTrace = this.parseTraceParent(incomingTraceParent);
        
        if (parsedTrace) {
          req.traceParent = incomingTraceParent;
          req.traceState = incomingTraceState;
          
          // Generate new span ID if configured
          if (this.config.generateSpanId) {
            const spanId = this.generateSpanId();
            req.spanId = spanId;
            
            // Create child traceparent
            const childTraceParent = this.createChildTraceParent(parsedTrace, spanId);
            res.set(this.config.traceParentHeader, childTraceParent);
            
            // Echo tracestate if present
            if (incomingTraceState) {
              res.set("tracestate", incomingTraceState);
            }
            
            logger.info(
              {
                requestId,
                parentTrace: incomingTraceParent,
                childTrace: childTraceParent,
                traceState: incomingTraceState,
                spanId,
                method: req.method,
                path: req.path,
              },
              "Request tracing - generated child span"
            );
          } else {
            // Just echo the traceparent and tracestate
            res.set(this.config.traceParentHeader, incomingTraceParent);
            if (incomingTraceState) {
              res.set("tracestate", incomingTraceState);
            }
            
            logger.info(
              {
                requestId,
                traceParent: incomingTraceParent,
                traceState: incomingTraceState,
                method: req.method,
                path: req.path,
              },
              "Request tracing - echoed traceparent and tracestate"
            );
          }
        } else {
          logger.warn(
            {
              requestId,
              invalidTraceParent: incomingTraceParent,
              method: req.method,
              path: req.path,
            },
            "Invalid traceparent header format"
          );
        }
      } else {
        // No traceparent, just log the request with ID
        logger.info(
          {
            requestId,
            method: req.method,
            path: req.path,
            userAgent: req.get("User-Agent"),
            ip: req.ip,
          },
          "Request tracing - new request"
        );
      }

      next();
    };
  }

  // Utility method to get current request context
  static getRequestContext(req: Request): {
    requestId?: string;
    traceParent?: string;
    spanId?: string;
  } {
    return {
      requestId: req.requestId,
      traceParent: req.traceParent,
      spanId: req.spanId,
    };
  }

  getConfig(): RequestTracingConfig {
    return { ...this.config };
  }
}

// Singleton instance
export const requestTracing = new RequestTracingMiddleware();