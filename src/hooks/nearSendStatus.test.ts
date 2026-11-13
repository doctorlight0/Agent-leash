import { describe, expect, it } from 'vitest';

function txStatus(result: any): { ok: boolean; message: string } {
  if (!result) return { ok: false, message: 'No wallet result returned' };
  const failure = result?.status?.Failure || result?.transaction_outcome?.outcome?.status?.Failure;
  if (failure) return { ok: false, message: typeof failure === 'string' ? failure : JSON.stringify(failure) };
  return { ok: true, message: result?.transaction?.hash || result?.transaction_outcome?.id || 'submitted' };
}

describe('txStatus', () => {
  it('handles success', () => {
    expect(txStatus({ transaction: { hash: 'abc' } }).ok).toBe(true);
  });
  it('handles failure/cancel-like payloads', () => {
    expect(txStatus({ status: { Failure: 'ActionError' } }).ok).toBe(false);
    expect(txStatus(null).ok).toBe(false);
  });
});
