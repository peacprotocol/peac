import { NextFunction, Request, Response } from 'express';
import * as crypto from 'crypto';

export class PEACError extends Error {
  public readonly type: string;
  public readonly status: number;
  public readonly detail?: string;
  public readonly trace_id: string;

  constructor(type: string, message: string, status: number = 500, detail?: string) {
    super(message);
    this.name = 'PEACError';
    this.type = type;
    this.status = status;
    this.detail = detail || message;
    this.trace_id = crypto.randomBytes(16).toString('hex');
  }

  static handler(err: Error | PEACError, req: Request, res: Response, _next: NextFunction): void {
    if (err instanceof PEACError) {
      res
        .status(err.status)
        .set('Content-Type', 'application/problem+json')
        .json({
          type: `https://docs.peacprotocol.org/problems/${err.type}`,
          title: err.message,
          status: err.status,
          detail: err.detail,
          instance: req.originalUrl,
          trace_id: err.trace_id,
        });
    } else {
      const trace_id = crypto.randomBytes(16).toString('hex');
      res.status(500).set('Content-Type', 'application/problem+json').json({
        type: 'https://docs.peacprotocol.org/problems/internal_server_error',
        title: 'Internal Server Error',
        status: 500,
        trace_id,
      });
    }
  }
}