import { isAddress, getAddress } from 'ethers';

/**
 * Property Rights (Preview) schema
 */
export type ERC20Claim = {
  standard: 'erc20';
  contract: string; // checksum EVM address
  chainId: number;  // positive integer
};

export type ERC721Claim = {
  standard: 'erc721';
  contract: string; // checksum EVM address
  chainId: number;  // positive integer
  tokenId: string;  // uint string
};

export type ERC1155Claim = {
  standard: 'erc1155';
  contract: string; // checksum EVM address
  chainId: number;  // positive integer
  tokenId: string;  // uint string
};

export type PropertyClaims = {
  assets?: Array<ERC20Claim | ERC721Claim | ERC1155Claim>;
  rights?: string[];
  terms_uri?: string;
  claims_uri?: string;
};

function isUintString(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9]+$/.test(s);
}

function isPositiveInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

/**
 * Validate and sanitize property claims. Throws 'property_invalid' on any bad input.
 * - contract must be a valid EVM address (checksummed in returned object)
 * - chainId must be a positive integer
 * - tokenId (for erc721/erc1155) must be a uint string
 * Returns a sanitized copy (unknown fields dropped).
 */
export function validatePropertyClaims(input: unknown): PropertyClaims {
  try {
    if (input == null || typeof input !== 'object') throw new Error('property_invalid');
    const obj = input as Record<string, unknown>;
    const out: PropertyClaims = {};

    if (obj.assets !== undefined) {
      if (!Array.isArray(obj.assets)) throw new Error('property_invalid');
      out.assets = obj.assets.map((raw) => {
        if (!raw || typeof raw !== 'object') throw new Error('property_invalid');
        const a = raw as Record<string, unknown>;
        const standard = a.standard;
        if (standard !== 'erc20' && standard !== 'erc721' && standard !== 'erc1155') throw new Error('property_invalid');

        const contract = a.contract;
        const chainId = a.chainId;

        if (typeof contract !== 'string' || !isAddress(contract)) throw new Error('property_invalid');
        if (!isPositiveInt(chainId)) throw new Error('property_invalid');

        const checksum = getAddress(contract);

        if (standard === 'erc20') {
          return { standard, contract: checksum, chainId } as ERC20Claim;
        }

        const tokenId = a.tokenId;
        if (!isUintString(tokenId)) throw new Error('property_invalid');
        if (standard === 'erc721') {
          return { standard, contract: checksum, chainId, tokenId } as ERC721Claim;
        }
        // erc1155
        return { standard, contract: checksum, chainId, tokenId } as ERC1155Claim;
      });
    }

    if (obj.rights !== undefined) {
      if (!Array.isArray(obj.rights) || obj.rights.some((r) => typeof r !== 'string')) throw new Error('property_invalid');
      out.rights = obj.rights.slice() as string[];
    }

    if (obj.terms_uri !== undefined) {
      if (typeof obj.terms_uri !== 'string') throw new Error('property_invalid');
      out.terms_uri = obj.terms_uri;
    }

    if (obj.claims_uri !== undefined) {
      if (typeof obj.claims_uri !== 'string') throw new Error('property_invalid');
      out.claims_uri = obj.claims_uri;
    }

    return out;
  } catch {
    throw new Error('property_invalid');
  }
}
