export function matchesResource(requested: string, entitlement: string): boolean {
  const normalizedRequested = normalizeResourceId(requested);
  const normalizedEntitlement = normalizeResourceId(entitlement);

  if (normalizedRequested === normalizedEntitlement) {
    return true;
  }

  if (normalizedEntitlement.endsWith('/*')) {
    const prefix = normalizedEntitlement.slice(0, -2);
    return normalizedRequested.startsWith(prefix);
  }

  if (normalizedEntitlement.includes('*')) {
    const pattern = normalizedEntitlement
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(normalizedRequested);
  }

  return false;
}

export function normalizeResourceId(resource: string): string {
  if (resource.startsWith('http://') || resource.startsWith('https://')) {
    return `url:${resource}`;
  }

  if (resource.match(/^(97[89])?\d{9}[\dX]$/)) {
    return `urn:isbn:${resource.replace(/-/g, '')}`;
  }

  if (resource.includes('/') && !resource.includes(':')) {
    return `sku:${resource}`;
  }

  if (resource.includes(':')) {
    return resource;
  }

  return `urn:peac:resource:generic:${resource}`;
}
