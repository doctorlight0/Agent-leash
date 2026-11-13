import { NEAR_ENV } from './near-config';

export async function viewAccountFunction<T>(
  accountId: string,
  methodName: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!accountId) throw new Error('NEAR account ID is required for a view call');
  const res = await fetch(NEAR_ENV.nodeUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'agent-leash', method: 'query',
      params: { request_type: 'call_function', account_id: accountId, method_name: methodName, args_base64: btoa(JSON.stringify(args)), finality: 'optimistic' },
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  const bytes = new Uint8Array(json.result.result);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export async function viewFunction<T>(
  methodName: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!NEAR_ENV.contractId) {
    throw new Error('NEAR contract ID not configured (VITE_NEAR_CONTRACT_ID)');
  }
  return viewAccountFunction<T>(NEAR_ENV.contractId, methodName, args);
}
