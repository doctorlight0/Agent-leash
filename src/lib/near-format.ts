const MAX_U128 = (1n << 128n) - 1n;

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new RangeError(`Token decimals must be an integer in 0..255; got ${decimals}`);
  }
}

export function fmtToken(raw: string | number | bigint, decimals = 6): string {
  assertDecimals(decimals);
  if (typeof raw === 'number' && !Number.isSafeInteger(raw)) {
    throw new RangeError('Numeric token amounts must be safe integers');
  }
  const n = BigInt(raw.toString());
  if (n < 0n || n > MAX_U128) throw new RangeError('Token amount is outside u128');
  const base = 10n ** BigInt(decimals);
  const whole = n / base;
  const frac = (n % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}
export function parseToken(input: string, decimals = 6): string {
  assertDecimals(decimals);
  const s = input.trim();
  if (!s) return '0';
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) {
    throw new TypeError('Enter a non-negative decimal token amount');
  }
  const [whole = '0', fraction = ''] = s.split('.');
  if (fraction.length > decimals) {
    throw new RangeError(`Amount has more than ${decimals} fractional digits`);
  }
  const base = 10n ** BigInt(decimals);
  const amount = BigInt(whole || '0') * base +
    BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0');
  if (amount > MAX_U128) throw new RangeError('Token amount exceeds u128');
  return amount.toString();
}
export function nsToDate(ns?: string | number | null): string {
  if (!ns) return '—';
  return new Date(Number(BigInt(ns.toString()) / 1000000n)).toLocaleString();
}
export function shortId(id: string, head = 8, tail = 6) {
  return id.length <= head + tail + 1 ? id : `${id.slice(0, head)}…${id.slice(-tail)}`;
}
