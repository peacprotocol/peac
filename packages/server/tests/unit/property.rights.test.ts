import { validatePropertyClaims } from '../../src/property/rights';

describe('Property Rights (Preview) validator', () => {
  it('accepts erc20 + erc721 claims and sanitizes checksum', () => {
    const claims = validatePropertyClaims({
      assets: [
        { standard: 'erc20', contract: '0x0000000000000000000000000000000000000001', chainId: 1 },
        { standard: 'erc721', contract: '0x0000000000000000000000000000000000000002', chainId: 1, tokenId: '42' },
      ],
      rights: ['display'],
      terms_uri: 'https://example.com/terms',
      claims_uri: 'https://example.com/claims',
    });
    expect(claims.assets?.length).toBe(2);
    // ethers.getAddress checksums; we just ensure it returned some hex string
    expect(claims.assets?.[0].contract).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('throws property_invalid on bad address', () => {
    expect(() =>
      validatePropertyClaims({
        assets: [{ standard: 'erc20', contract: 'not-an-address', chainId: 1 }],
      })
    ).toThrow('property_invalid');
  });

  it('throws property_invalid on non-uint tokenId', () => {
    expect(() =>
      validatePropertyClaims({
        assets: [
          { standard: 'erc721', contract: '0x0000000000000000000000000000000000000002', chainId: 1, tokenId: 'NaN' },
        ],
      })
    ).toThrow('property_invalid');
  });
});
