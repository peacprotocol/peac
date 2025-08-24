import * as crypto from 'crypto';

import { Request, Response, NextFunction } from 'express';

export function versionNegotiation(supportedVersions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestedVersion = req.headers['x-peac-protocol'];

    if (!requestedVersion) {
      req.protocolVersion = supportedVersions[0];
      return next();
    }

    const versionString = Array.isArray(requestedVersion) ? requestedVersion[0] : requestedVersion;

    if (!supportedVersions.includes(versionString)) {
      return res
        .status(406)
        .set('Content-Type', 'application/problem+json')
        .json({
          type: 'https://docs.peacprotocol.org/problems/peac_protocol_version_mismatch',
          title: 'Protocol version not supported',
          status: 406,
          detail: `Version ${versionString} is not supported`,
          trace_id: req.trace_id || crypto.randomBytes(16).toString('hex'),
          'x-peac-advice': `Supported versions: ${supportedVersions.join(', ')}`,
          supported_versions: supportedVersions,
        });
    }

    req.protocolVersion = versionString;
    next();
  };
}
