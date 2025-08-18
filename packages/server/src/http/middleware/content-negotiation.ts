import { Request, Response, NextFunction } from 'express';
import { metrics } from '../../metrics';

export interface MediaType {
  type: string;
  subtype: string;
  vendor?: string;
  version?: string;
  parameters: Record<string, string>;
  quality: number;
}

export class ContentNegotiator {
  private strict: boolean;

  constructor(strict = true) {
    this.strict = strict;
  }

  parseMediaType(mediaType: string): MediaType | null {
    // Handle wildcards first
    if (mediaType.trim() === '*/*') {
      return {
        type: '*',
        subtype: '*',
        parameters: {},
        quality: 1.0,
      };
    }

    const pattern =
      /^(application|text|image|video|audio|\*)\/(?:vnd\.([^.+]+)\.)?([^;+*]+|\*)(?:\+([^;]+))?(?:;(.*))?$/i;
    const match = mediaType.trim().match(pattern);

    if (!match) {
      return null;
    }

    const [, type, vendor, subtype, , params] = match;
    const parameters: Record<string, string> = {};
    let quality = 1.0;

    if (params) {
      const pairs = params.split(';').map((p) => p.trim());
      for (const pair of pairs) {
        const [key, value] = pair.split('=').map((s) => s.trim());
        if (key === 'q') {
          quality = parseFloat(value) || 1.0;
        } else {
          parameters[key.toLowerCase()] = value?.replace(/^"|"$/g, '') || '';
        }
      }
    }

    return {
      type: type.toLowerCase(),
      subtype: subtype.toLowerCase(),
      vendor: vendor?.toLowerCase(),
      version: parameters.version,
      parameters,
      quality,
    };
  }

  negotiate(req: Request, supported: string[]): string | null {
    const acceptHeader = req.get('Accept') || '*/*';
    const acceptTypes = acceptHeader
      .split(',')
      .map((s) => this.parseMediaType(s))
      .filter((mt): mt is MediaType => mt !== null)
      .sort((a, b) => b.quality - a.quality);

    const supportedTypes = supported
      .map((s) => this.parseMediaType(s))
      .filter((mt): mt is MediaType => mt !== null);

    for (const acceptable of acceptTypes) {
      for (const supportedType of supportedTypes) {
        if (this.matches(acceptable, supportedType)) {
          return this.formatMediaType(supportedType);
        }
      }
    }

    // In loose mode, accept application/json as fallback
    if (!this.strict && acceptTypes.some((mt) => mt.subtype === 'json')) {
      const jsonType = supportedTypes.find((st) => st.subtype === 'json');
      if (jsonType) {
        return this.formatMediaType(jsonType);
      }
    }

    return null;
  }

  matches(acceptable: MediaType, supported: MediaType): boolean {
    // Wildcard matching
    if (acceptable.type === '*' || acceptable.subtype === '*') {
      return true;
    }

    // Type must match
    if (acceptable.type !== supported.type) {
      return false;
    }

    // Vendor matching (if specified)
    if (acceptable.vendor && acceptable.vendor !== supported.vendor) {
      return false;
    }

    // Subtype matching
    if (acceptable.subtype !== supported.subtype) {
      return false;
    }

    // Version matching (if strict mode)
    if (this.strict && acceptable.version && acceptable.version !== supported.version) {
      return false;
    }

    return true;
  }

  formatMediaType(mt: MediaType): string {
    let result = `${mt.type}/`;
    if (mt.vendor) {
      result += `vnd.${mt.vendor}.`;
    }
    result += mt.subtype;

    // Add +json suffix if not present for vendor types
    if (mt.vendor && !mt.subtype.includes('+')) {
      result += '+json';
    }

    if (mt.version) {
      result += `;version=${mt.version}`;
    }

    return result;
  }

  middleware(supported: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      const timer = metrics.contentNegotiationDuration.startTimer();

      const acceptable = this.negotiate(req, supported);
      if (!acceptable) {
        timer({ outcome: 'rejected' });
        metrics.contentNegotiationRejections.inc({
          path: req.path,
        });

        return res.status(406).json({
          type: 'about:blank',
          title: 'Not Acceptable',
          status: 406,
          detail: `None of the requested media types are supported`,
          supported,
        });
      }

      // Check Content-Type for POST/PUT/PATCH
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const contentType = req.get('Content-Type');
        if (!contentType) {
          timer({ outcome: 'missing_content_type' });
          return res.status(415).json({
            type: 'about:blank',
            title: 'Unsupported Media Type',
            status: 415,
            detail: 'Content-Type header is required',
            supported,
          });
        }

        const parsed = this.parseMediaType(contentType);
        if (!parsed) {
          timer({ outcome: 'invalid_content_type' });
          return res.status(415).json({
            type: 'about:blank',
            title: 'Unsupported Media Type',
            status: 415,
            detail: 'Invalid Content-Type header',
            supported,
          });
        }

        const isSupported = supported.some((s) => {
          const supportedType = this.parseMediaType(s);
          return supportedType && this.matches(parsed, supportedType);
        });

        if (!isSupported) {
          timer({ outcome: 'unsupported_content_type' });
          return res.status(415).json({
            type: 'about:blank',
            title: 'Unsupported Media Type',
            status: 415,
            detail: `Content-Type '${contentType}' is not supported`,
            supported,
          });
        }
      }

      timer({ outcome: 'accepted' });
      res.locals.negotiatedType = acceptable;
      return next();
    };
  }
}

export const contentNegotiation = new ContentNegotiator(true);
