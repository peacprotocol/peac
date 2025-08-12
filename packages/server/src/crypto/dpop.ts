import { jwtVerify, JWK, importJWK } from 'jose';

export interface DPoPOptions { htm: string; htu: string; nonce?: string; }
export async function verifyDPoP(dpopHeader: string, jwk: JWK, opts: DPoPOptions): Promise<void> {
  const [_h] = dpopHeader.split('.', 1);
  const header = JSON.parse(Buffer.from(dpopHeader.split('.')[0], 'base64url').toString());
  if (header.typ !== 'dpop+jwt') throw new Error('invalid_typ');
  const key = await importJWK(jwk);
  const { payload } = await jwtVerify(dpopHeader, key);
  if (payload.htm !== opts.htm) throw new Error('htm_mismatch');
  if (payload.htu !== opts.htu) throw new Error('htu_mismatch');
  if (opts.nonce && payload.nonce !== opts.nonce) throw new Error('nonce_mismatch');
}
