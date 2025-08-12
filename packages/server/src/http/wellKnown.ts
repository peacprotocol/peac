/* istanbul ignore file */
import type { Request, Response } from 'express';

function setVersionHeader(res: Response): void {
  if ('set' in res && typeof res.set === 'function') res.set('x-peac-version', '0.9.3');
  else if ('setHeader' in res && typeof res.setHeader === 'function') res.setHeader('x-peac-version', '0.9.3');
}

export function handleWellKnown(_req: Request, res: Response): void {
  res.set('content-type', 'application/json');
  setVersionHeader(res);
  res.status(200).json({
    peac_version: '0.9.3',
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
        'Property rights are accepted as signed claims and counted (preview), not enforced in 0.9.3.',
    },
  });
}
