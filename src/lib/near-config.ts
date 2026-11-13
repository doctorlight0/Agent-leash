export type NearEnv = {
  networkId: string;
  nodeUrl: string;
  walletUrl?: string;
  helperUrl?: string;
  explorerUrl: string;
  indexerUrl: string;
  contractId: string;
  supportedTokenContracts: string[];
};

const testnet: NearEnv = {
  networkId: 'testnet',
  nodeUrl: import.meta.env.VITE_NEAR_NODE_URL || 'https://rpc.testnet.near.org',
  walletUrl: 'https://testnet.mynearwallet.com',
  helperUrl: 'https://helper.testnet.near.org',
  explorerUrl: 'https://testnet.nearblocks.io',
  indexerUrl: 'https://test.api.fastnear.com/v0',
  contractId: import.meta.env.VITE_NEAR_CONTRACT_ID || '',
  supportedTokenContracts: (import.meta.env.VITE_NEAR_SUPPORTED_TOKENS || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean),
};

const mainnet: NearEnv = {
  networkId: 'mainnet',
  nodeUrl: import.meta.env.VITE_NEAR_NODE_URL || 'https://rpc.mainnet.near.org',
  walletUrl: 'https://app.mynearwallet.com',
  helperUrl: 'https://helper.mainnet.near.org',
  explorerUrl: 'https://nearblocks.io',
  indexerUrl: 'https://api.fastnear.com/v0',
  contractId: import.meta.env.VITE_NEAR_CONTRACT_ID_MAINNET || '',
  supportedTokenContracts: (import.meta.env.VITE_NEAR_SUPPORTED_TOKENS_MAINNET || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean),
};

export const NEAR_ENV = (import.meta.env.VITE_NEAR_NETWORK || 'testnet') === 'mainnet' ? mainnet : testnet;
export const IS_MAINNET_NEAR = NEAR_ENV.networkId === 'mainnet';
