import 'express-serve-static-core';
declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: Buffer;
    protocolVersion?: string;
    trace_id?: string;
    uda?: {
      key_thumbprint?: string;
    };
    dpop?: {
      jwk?: any;
      verified?: boolean;
    };
  }
}
