# Agent Leash

> Built with Arc Studio

Project memory for future agents and humans.

## What This App Does

Public app where anyone gives an AI agent a strictly limited USDC budget on NEAR Testnet. One contract holds many leashes; all rules (allowlist, per-payment limit, rolling 24h daily cap, cooldown, expiry, required reason, revoke, balance cap) are enforced onchain. Dashboard, approvals, revoke, demo agent, payroll, and vigil/inactivity protection.

## Deployed

- Contract: native NEAR Rust (`near-sdk`), `contracts/near/` — NOT Arc/EVM compatible
- Testnet contract ID: `agent-leash.testnet` (set `VITE_NEAR_CONTRACT_ID` in `.env`)
- NEAR Testnet RPC: `https://rpc.testnet.near.org`
- Token: NEP-141 USDC (6 decimals), configured via `VITE_NEAR_SUPPORTED_TOKENS`
- WASM artifact: `contracts/near/target-wasm/.../agent_leash_near.wasm`

## Contract (NEAR-native Rust)

- `create_leash(agent_id, token_contract, per_payment_limit, rolling_limit, rolling_window_ns, cooldown_ns, expires_at_ns, approval_required, max_pending_payments, initial_payees, balance_cap)`: per-leash immutable balance cap, funding via `ft_on_transfer` (NEP-141), up to 10 initial payees
- `add_payee`, `remove_payee`, `set_payee_limits`: per-payee allowlist and overrides
- `set_auto_approve_limit`: auto-approve ceiling for non-allowlisted payees
- `update_permissions`: update limits, cooldown, expiry, approval requirement
- `set_agent`: reassign agent (cancels stale agent-owned schedules)
- `revoke`: revoke leash (balance stays withdrawable via `withdraw_available`)
- `pause_leash` / `resume_leash`: freeze/unfreeze agent payments
- `request_payment`: agent requests payment (respects allowlist, auto-approve, limits, cooldown)
- `approve_payment` / `reject_payment`: owner approves/rejects pending payments
- `expire_payment`: expire pending approval
- `withdraw_available`: owner withdraws available balance
- `create_payroll_group`, `add_payroll_worker`, `execute_payroll`, `retry_payroll_payments`, `fund_payroll_reserve`: payroll management
- `enable_vigil`, `disable_vigil`, `vigil_check_in`, `claim_vigil_entitlement`, `add_vigil_beneficiary`, `remove_vigil_beneficiary`, `set_vigil_beneficiaries`, `set_vigil_check_in_interval`, `set_vigil_grace_period`: vigil/inactivity protection
- `create_schedule`, `cancel_schedule`, `execute_schedule`: recurring schedules (permissionless keeper execution)
- `set_check_in_interval`: vigil check-in interval
- Rolling window = exact per-payment entries; owner approval skips allowlist/limits/cooldown but not balance/revocation/expiry

## Frontend

- Routes (path-based, `src/lib/router.ts`): `/` home + create, `/leash/:id` owner dashboard, `/l/:id` public read-only
- Reads: `src/hooks/useNear.tsx` (`view` via near-api-js provider queries), `src/hooks/useNearSend.ts` (`call` via functionCall)
- Writes: `src/hooks/useNearSend.ts` (honest wallet/busy states)
- Dashboard tabs: Overview, Leashes, Leash Detail, Payroll, Workers, Funding, Approvals, Vigil, Beneficiaries, Activity, Settings
- Funding uses NEP-141 `ft_on_transfer` via `callToken`; withdrawal via `withdraw_available`
- Theme: near-black with a single safety-yellow accent; red is only for danger

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, framer-motion
- Web3: near-api-js, wallet selector
- Contracts: Solidity 0.8.28 + Foundry (superseded v1); native NEAR Rust + near-sdk 5.30.0 (current v2)
- Chain: NEAR Testnet. Token: USDC (NEP-141, 6 decimals)

## To Run

```bash
bun install
bun run dev
```

Set `VITE_NEAR_CONTRACT_ID` and `VITE_NEAR_NODE_URL` before connecting a wallet.
