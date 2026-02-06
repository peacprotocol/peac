/**
 * Claims Formatting
 *
 * Formats receipt claims for human-readable display.
 */

export function formatTimestamp(epoch: number): string {
  try {
    return new Date(epoch * 1000).toISOString();
  } catch {
    return String(epoch);
  }
}

export function formatExpiry(exp: number, now?: number): string {
  const currentTime = now ?? Math.floor(Date.now() / 1000);
  const remaining = exp - currentTime;

  if (remaining <= 0) return 'Expired';
  if (remaining < 60) return `${remaining}s remaining`;
  if (remaining < 3600) return `${Math.floor(remaining / 60)}m remaining`;
  if (remaining < 86400) return `${Math.floor(remaining / 3600)}h remaining`;
  return `${Math.floor(remaining / 86400)}d remaining`;
}

export interface FormattedClaim {
  label: string;
  value: string;
  type: 'standard' | 'timestamp' | 'url' | 'list' | 'json';
}

export function formatClaims(payload: Record<string, unknown>): FormattedClaim[] {
  const claims: FormattedClaim[] = [];

  if (payload.iss) {
    claims.push({ label: 'Issuer', value: String(payload.iss), type: 'url' });
  }
  if (payload.aud) {
    claims.push({
      label: 'Audience',
      value: String(payload.aud),
      type: 'url',
    });
  }
  if (payload.sub) {
    claims.push({
      label: 'Subject',
      value: String(payload.sub),
      type: 'standard',
    });
  }
  if (typeof payload.iat === 'number') {
    claims.push({
      label: 'Issued At',
      value: formatTimestamp(payload.iat),
      type: 'timestamp',
    });
  }
  if (typeof payload.exp === 'number') {
    claims.push({
      label: 'Expires',
      value: `${formatTimestamp(payload.exp)} (${formatExpiry(payload.exp)})`,
      type: 'timestamp',
    });
  }
  if (payload.rid) {
    claims.push({
      label: 'Receipt ID',
      value: String(payload.rid),
      type: 'standard',
    });
  }
  if (Array.isArray(payload.purpose_declared)) {
    claims.push({
      label: 'Purpose',
      value: payload.purpose_declared.join(', '),
      type: 'list',
    });
  }

  // Remaining fields as JSON
  const shown = new Set(['iss', 'aud', 'sub', 'iat', 'exp', 'rid', 'purpose_declared']);
  for (const [key, value] of Object.entries(payload)) {
    if (!shown.has(key)) {
      claims.push({
        label: key,
        value: JSON.stringify(value, null, 2),
        type: 'json',
      });
    }
  }

  return claims;
}
