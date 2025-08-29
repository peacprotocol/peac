import crypto from 'crypto';

export interface Ed25519JWK {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string;
}

export function thumbprintEd25519(jwk: Ed25519JWK): string {
  const canonical = JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
  });

  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest();
  return hash.toString('base64url');
}

export function isValidEd25519JWK(obj: unknown): obj is Ed25519JWK {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'kty' in obj &&
    'crv' in obj &&
    'x' in obj &&
    obj.kty === 'OKP' &&
    obj.crv === 'Ed25519' &&
    typeof obj.x === 'string' &&
    obj.x.length > 0
  );
}
