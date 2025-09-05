/* istanbul ignore file */
import type { Request, Response } from 'express';
import { WIRE_VERSION } from '@peacprotocol/schema';

export function handleWellKnown(_req: Request, res: Response): void {
  // v0.9.12: Version header handled by middleware (peac-version)
  res.set('content-type', 'application/json');
  res.status(200).json({
    peac_version: WIRE_VERSION,
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
      notes: `Property rights are accepted as signed claims and counted (preview), not enforced in ${WIRE_VERSION}.`,
    },
  });
}
