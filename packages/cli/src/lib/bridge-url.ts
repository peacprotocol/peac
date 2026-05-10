/**
 * Validate-and-normalize a bridge base URL. The bridge URL flows in from
 * either a config file (`~/.peac/bridge.json`) or `process.env.PEAC_BRIDGE_URL`.
 * Both are local-trust sources, but a value that originated as a filesystem
 * path could otherwise reach an HTTP fetch sink without an explicit
 * protocol-shape check.
 *
 * `parseBridgeBaseUrl()` parses the input via the WHATWG `URL` constructor
 * (which throws on malformed input) and restricts the protocol to `http:` or
 * `https:`. Returning the parsed URL gives downstream callers a clean base
 * for `joinBridgePath()` joins.
 */
export function parseBridgeBaseUrl(raw: unknown): URL {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new TypeError('bridge URL must be a non-empty string');
  }
  const parsed = new URL(raw);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new RangeError(`bridge URL must use http: or https:; got ${parsed.protocol}`);
  }
  return parsed;
}

/**
 * Join an endpoint path onto a parsed bridge base URL while preserving any
 * configured base pathname prefix. A bridge mounted behind a reverse proxy
 * at `https://example.com/bridge` MUST resolve `/health` to
 * `https://example.com/bridge/health`, not `https://example.com/health`.
 *
 * The endpoint path is treated as a relative segment list: leading slashes
 * are stripped, doubled slashes inside the joined pathname are collapsed,
 * and any query/fragment from the base is dropped (callers add their own).
 */
export function joinBridgePath(base: URL, endpointPath: string): URL {
  const endpoint = endpointPath.replace(/^\/+/, '');
  const next = new URL(base.toString());
  const basePath = next.pathname.endsWith('/') ? next.pathname : `${next.pathname}/`;

  next.pathname = `${basePath}${endpoint}`.replace(/\/{2,}/g, '/');
  next.search = '';
  next.hash = '';

  return next;
}
