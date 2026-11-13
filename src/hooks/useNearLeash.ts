import { useQuery } from '@tanstack/react-query';
import { viewAccountFunction, viewFunction } from '../lib/near-client';
import { NEAR_ENV } from '../lib/near-config';

type LeashView = Record<string, unknown>;
export type FtMetadata = {
  spec: string;
  name: string;
  symbol: string;
  decimals: number;
};
export type SupportedTokenConfig = {
  token_contract: string;
  decimals: number;
  max_balance_cap: string;
};

function assertFtMetadata(value: FtMetadata): FtMetadata {
  if (
    !value ||
    value.spec !== 'ft-1.0' ||
    typeof value.name !== 'string' ||
    !value.name ||
    typeof value.symbol !== 'string' ||
    !value.symbol ||
    !Number.isInteger(value.decimals) ||
    value.decimals < 0 ||
    value.decimals > 255
  ) {
    throw new Error('Token returned invalid NEP-141 metadata');
  }
  return value;
}

export function useNearTokenMetadata(tokenContract?: string) {
  return useQuery({
    queryKey: ['near-ft-metadata', tokenContract],
    enabled: !!tokenContract,
    staleTime: 300_000,
    queryFn: async () => {
      if (!tokenContract) throw new Error('Token contract is required');
      const metadata = await viewAccountFunction<FtMetadata>(tokenContract, 'ft_metadata');
      return assertFtMetadata(metadata);
    },
  });
}

export function useNearSupportedTokens() {
  return useQuery({
    queryKey: ['near-supported-tokens', NEAR_ENV.contractId],
    enabled: !!NEAR_ENV.contractId,
    staleTime: 30_000,
    queryFn: () => viewFunction<string[]>('supported_tokens'),
  });
}

export function useNearSupportedTokenConfig(tokenContract?: string) {
  return useQuery({
    queryKey: ['near-supported-token-config', NEAR_ENV.contractId, tokenContract],
    enabled: !!NEAR_ENV.contractId && !!tokenContract,
    staleTime: 30_000,
    queryFn: () => viewFunction<SupportedTokenConfig | null>(
      'get_supported_token_config',
      { token_contract: tokenContract },
    ),
  });
}

export function useNearStorageBalance(accountId?: string | null) {
  return useQuery({
    queryKey: ['near-storage-balance', accountId],
    enabled: !!accountId,
    refetchInterval: 8000,
    queryFn: () => viewFunction<{ total: string; available: string } | null>(
      'storage_balance_of',
      { account_id: accountId },
    ),
  });
}

export function useLeashView(leashId?: number) {
  return useQuery({ queryKey: ['near-leash', leashId], enabled: !!leashId, queryFn: () => viewFunction<LeashView | null>('get_leash', { leash_id: leashId }), refetchInterval: 8000 });
}
export function usePayments(leashId?: number) {
  return useQuery({ queryKey: ['near-payments', leashId], enabled: !!leashId, queryFn: () => viewFunction<LeashView[]>('list_leash_payments', { leash_id: leashId, from_index: 0, limit: 100 }), refetchInterval: 8000 });
}
export function useSchedules(leashId?: number) {
  return useQuery({ queryKey: ['near-schedules', leashId], enabled: !!leashId, queryFn: () => viewFunction<LeashView[]>('list_leash_schedules', { leash_id: leashId, from_index: 0, limit: 100 }), refetchInterval: 8000 });
}
export function useWithdrawals(leashId?: number) {
  return useQuery({ queryKey: ['near-withdrawals', leashId], enabled: !!leashId, queryFn: () => viewFunction<LeashView[]>('list_leash_withdrawals', { leash_id: leashId, from_index: 0, limit: 100 }), refetchInterval: 8000 });
}
export function useOwnerLeashes(ownerId?: string | null) {
  return useQuery({ queryKey: ['near-owner-leashes', ownerId], enabled: !!ownerId, queryFn: () => viewFunction<number[]>('list_owner_leashes', { owner_id: ownerId }), refetchInterval: 12000 });
}
