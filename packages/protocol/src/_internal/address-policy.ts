/**
 * Address policy for outbound key and pointer fetches.
 *
 * An address is allowed only when it is a global unicast address outside every
 * block in the IANA IPv4 and IPv6 Special-Purpose Address Registries (RFC 6890
 * and updates). IPv4-mapped IPv6 addresses (::ffff:0:0/96) and NAT64
 * well-known prefix addresses (64:ff9b::/96) are judged by the embedded IPv4
 * address. Anything that does not parse as an address is refused.
 *
 * Pure function: no I/O, runtime-neutral.
 */

export type AddressBlockReason = 'private_ip' | 'loopback' | 'link_local';

export type AddressVerdict = { allowed: true } | { allowed: false; reason: AddressBlockReason };

const IPV4_OCTET = /^(?:0|[1-9]\d{0,2})$/;
const IPV6_GROUP = /^[0-9a-fA-F]{1,4}$/;

/**
 * Parse a dotted-quad IPv4 address into a 32-bit unsigned integer.
 * Leading zeros and non-decimal forms are refused.
 */
function parseIPv4(text: string): number | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!IPV4_OCTET.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function parseGroups(text: string): number[] | null {
  if (text === '') return [];
  const groups: number[] = [];
  for (const group of text.split(':')) {
    if (!IPV6_GROUP.test(group)) return null;
    groups.push(parseInt(group, 16));
  }
  return groups;
}

/**
 * Parse an IPv6 address into eight 16-bit groups. Accepts one `::` and a
 * trailing dotted IPv4 part. Zone identifiers and brackets are refused.
 */
function parseIPv6(text: string): number[] | null {
  if (text.length === 0 || text.length > 45) return null;
  let body = text;
  const lastColon = body.lastIndexOf(':');
  if (lastColon === -1) return null;
  const last = body.slice(lastColon + 1);
  if (last.includes('.')) {
    const v4 = parseIPv4(last);
    if (v4 === null) return null;
    body = `${body.slice(0, lastColon + 1)}${Math.floor(v4 / 0x10000).toString(16)}:${(v4 % 0x10000).toString(16)}`;
  }
  const halves = body.split('::');
  if (halves.length > 2) return null;
  const head = parseGroups(halves[0]);
  if (head === null) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const tail = parseGroups(halves[1]);
  if (tail === null) return null;
  const fill = 8 - head.length - tail.length;
  if (fill < 1) return null;
  return [...head, ...new Array<number>(fill).fill(0), ...tail];
}

type IPv4Block = readonly [network: string, prefix: number, reason: AddressBlockReason];

// IANA IPv4 Special-Purpose Address Registry, plus multicast and the reserved block.
const IPV4_BLOCKS: readonly IPv4Block[] = [
  ['0.0.0.0', 8, 'private_ip'],
  ['10.0.0.0', 8, 'private_ip'],
  ['100.64.0.0', 10, 'private_ip'],
  ['127.0.0.0', 8, 'loopback'],
  ['169.254.0.0', 16, 'link_local'],
  ['172.16.0.0', 12, 'private_ip'],
  ['192.0.0.0', 24, 'private_ip'],
  ['192.0.2.0', 24, 'private_ip'],
  ['192.31.196.0', 24, 'private_ip'],
  ['192.52.193.0', 24, 'private_ip'],
  ['192.88.99.0', 24, 'private_ip'],
  ['192.168.0.0', 16, 'private_ip'],
  ['192.175.48.0', 24, 'private_ip'],
  ['198.18.0.0', 15, 'private_ip'],
  ['198.51.100.0', 24, 'private_ip'],
  ['203.0.113.0', 24, 'private_ip'],
  ['224.0.0.0', 4, 'private_ip'],
  ['240.0.0.0', 4, 'private_ip'],
];

const IPV4_BLOCK_TABLE = IPV4_BLOCKS.map(([network, prefix, reason]) => {
  const base = parseIPv4(network) as number;
  const size = 2 ** (32 - prefix);
  return { start: base, end: base + size - 1, reason };
});

function classifyIPv4(value: number): AddressVerdict {
  for (const block of IPV4_BLOCK_TABLE) {
    if (value >= block.start && value <= block.end) {
      return { allowed: false, reason: block.reason };
    }
  }
  return { allowed: true };
}

function matchesPrefix(
  groups: readonly number[],
  network: readonly number[],
  bits: number
): boolean {
  for (let i = 0; i < 8; i++) {
    const bitsHere = Math.min(16, Math.max(0, bits - 16 * i));
    if (bitsHere === 0) return true;
    const mask = (0xffff << (16 - bitsHere)) & 0xffff;
    if ((groups[i] & mask) !== (network[i] & mask)) return false;
  }
  return true;
}

function v6(text: string): number[] {
  return parseIPv6(text) as number[];
}

const GLOBAL_UNICAST_V6 = v6('2000::');

// Special-purpose blocks inside 2000::/3 (IANA IPv6 Special-Purpose Address Registry).
const IPV6_BLOCKS_IN_GLOBAL: ReadonlyArray<readonly [number[], number]> = [
  [v6('2001::'), 23],
  [v6('2001:db8::'), 32],
  [v6('2002::'), 16],
  [v6('2620:4f:8000::'), 48],
  [v6('3fff::'), 20],
];

const IPV6_LOOPBACK = v6('::1');
const IPV6_LINK_LOCAL = v6('fe80::');
const IPV4_MAPPED = v6('::ffff:0:0');
const NAT64_WELL_KNOWN = v6('64:ff9b::');

function classifyIPv6(groups: readonly number[]): AddressVerdict {
  if (matchesPrefix(groups, IPV4_MAPPED, 96) || matchesPrefix(groups, NAT64_WELL_KNOWN, 96)) {
    return classifyIPv4(groups[6] * 0x10000 + groups[7]);
  }
  if (!matchesPrefix(groups, GLOBAL_UNICAST_V6, 3)) {
    if (matchesPrefix(groups, IPV6_LOOPBACK, 128)) return { allowed: false, reason: 'loopback' };
    if (matchesPrefix(groups, IPV6_LINK_LOCAL, 10)) return { allowed: false, reason: 'link_local' };
    return { allowed: false, reason: 'private_ip' };
  }
  for (const [network, bits] of IPV6_BLOCKS_IN_GLOBAL) {
    if (matchesPrefix(groups, network, bits)) return { allowed: false, reason: 'private_ip' };
  }
  return { allowed: true };
}

/**
 * Classify an IP address string against the address policy.
 */
export function classifyAddress(ip: string): AddressVerdict {
  const v4 = parseIPv4(ip);
  if (v4 !== null) return classifyIPv4(v4);
  const groups = parseIPv6(ip);
  if (groups !== null) return classifyIPv6(groups);
  return { allowed: false, reason: 'private_ip' };
}
