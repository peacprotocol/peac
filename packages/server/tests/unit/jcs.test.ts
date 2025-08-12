import { canonicalize } from '../../src/crypto/jcs';

describe('JCS canonicalize', () => {
  it('orders object keys lexicographically', () => {
    const obj = { b: 2, a: 1 };
    expect(canonicalize(obj)).toBe('{"a":1,"b":2}');
  });
  it('handles arrays and primitives', () => {
    expect(canonicalize([2, 1])).toBe('[2,1]');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize("x")).toBe('"x"');
  });
});
