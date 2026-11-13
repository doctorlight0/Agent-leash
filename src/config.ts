/**
 * Agent Leash — NEAR Configuration
 *
 * Roadmap: replace wagmi/viem EVM config with NEAR connection logic.
 * For now, keep minimal exports so imports don't break.
 */

// NEAR connection is handled via near-api-js in near-wallet.ts
// No wagmi config needed — wallet connection uses near.account() / near.wallet()

// Export placeholder so existing imports don't error
export const config = {};