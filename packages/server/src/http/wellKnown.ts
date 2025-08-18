/* istanbul ignore file */
import type { Request, Response } from 'express';

export function handleWellKnown(_req: Request, res: Response): void {
  // Version header is handled centrally by middleware (x-peac-protocol-version: 0.9.5)
  res.set('content-type', 'application/json');
  res.status(200).json({
    peac_version: '0.9.5',
    capabilities: {
      verify: true,
      pay: true,
      property_rights_preview: true,
      redistribution_preview: true,
    },
    rights: {
      standards: ['erc20', 'erc721', 'erc1155'],
      claim_schema: 'urn:peac:claims:0.1',
      registry: null,
      notes:
        'Property rights are accepted as signed claims and counted (preview), not enforced in 0.9.5.',
    },
  });
}
