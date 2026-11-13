import { describe, expect, it } from 'vitest';
import { fmtToken, parseToken, shortId } from './near-format';

describe('near-format', () => {
  it('formats/parses token amounts', () => {
    expect(fmtToken('1500000', 6)).toBe('1.5');
    expect(fmtToken('0', 6)).toBe('0');
    expect(parseToken('1.5', 6)).toBe('1500000');
    expect(parseToken('0.000001', 6)).toBe('1');
  });
  it('respects token decimals and rejects precision loss', () => {
    expect(parseToken('1.25', 2)).toBe('125');
    expect(fmtToken('125', 2)).toBe('1.25');
    expect(parseToken('0.000000000000000000000001', 24)).toBe('1');
    expect(fmtToken('1', 24)).toBe('0.000000000000000000000001');
    expect(parseToken('1', 0)).toBe('1');
    expect(() => parseToken('1.001', 2)).toThrow(/fractional digits/);
    expect(() => parseToken('1.0', 0)).toThrow(/fractional digits/);
  });
  it('rejects malformed, negative, unsafe and overflowing amounts', () => {
    expect(() => parseToken('-1', 6)).toThrow();
    expect(() => parseToken('1.2.3', 6)).toThrow();
    expect(() => fmtToken(Number.MAX_SAFE_INTEGER + 1, 6)).toThrow(/safe integers/);
    expect(() => parseToken('340282366920938463463374607431768211456', 0)).toThrow(/u128/);
  });
  it('shortens ids', () => {
    expect(shortId('alice.testnet', 5, 4)).toBe('alice…tnet');
  });
});
