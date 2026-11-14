# JUDGE_GUIDE.md — Agent Leash

## Problem Statement
AI agents on NEAR need controlled spending permissions. Without proper budgeting tools, an agent could spend beyond intended limits, causing financial risk for owners. Agent Leash solves this by allowing owners to create "leashes" — immutable spending permits with enforced caps, limits, and automatic revocation.

## How Agent Leash Works
Agent Leash is a NEAR smart contract that acts as a budget controller. An owner creates a leash for an agent, setting:
- **balance_cap**: Maximum total tokens the leash can hold at any moment
- **per_payment_limit**: Maximum amount per individual payment
- **rolling_limit**: Maximum total spent in a rolling window
- **cooldown_ns**: Minimum time between payments
- **approval_required**: Whether every payment needs owner approval

The agent can request payments within these limits. The owner can approve or reject pending payments. Schedules can be set up for recurring payments. Payroll can manage monthly worker payments. Vigil protection triggers beneficiary settlements when check-ins stop.

## Key Innovations
1. **Immutable balance cap**: Once set, the total tokens a leash can hold cannot be exceeded, regardless of top-ups
2. **Rolling window enforcement**: Real-time tracking of spending in a sliding time window
3. **Vigil integration**: Inactivity protection with configurable check-in intervals and grace periods, automatically settling beneficiaries when check-ins stop
4. **Payroll integration**: Monthly worker payment groups with salary configuration and settlement
5. **Nested permission controls**: per-payment limits can be overridden per-payee, with daily caps subordinate to rolling limits

## NEAR Implementation Details
- **Contract**: Native NEAR Rust (near-sdk 5.30.0), contract ID `agent-leash-v2.testnet`
- **Token**: NEP-141 USDC (6 decimals), contract `usdc.testnet`
- **Storage**: NEP-145 storage management with deposit measurement and refunds
- **Custody model**: `available_balance + reserved_balance = total exposure`. Funding increases available; payments reserve from available.
- **Callbacks**: All cross-contract calls (ft_on_transfer, settlements, refunds) use promise callbacks with explicit gas budgets (15 Tgas)
- **Serialization**: Borsh format; `Option<U128>` init argument deserialization has Testnet compatibility issue

## Payroll and Vigil Integration
- **Payroll**: `create_payroll_group()`, `add_payroll_worker()`, `execute_payroll()`, `retry_payroll_payments()`, `mark_payroll_obligations_satisfied()`
- **Vigil**: `enable_vigil()`, `vigil_check_in()`, `check_vigil_overdue()`, `set_vigil_beneficiaries()`, `claim_vigil_entitlement()`, `disable_vigil()`
- **Ordering policy**: Payroll obligations are settled BEFORE beneficiary protected funds are transferred — this is a deliberate security policy

## Differences from Conventional Budgeting Apps
- Onchain enforcement: caps and limits are contract-enforced, not just frontend guidance
- Automatic revocation: Vigil triggers automatic revocation after inactivity period
- Beneficiary settlement: Remaining funds after payroll go to configured beneficiaries
- Immutable caps: Once set, balance_cap cannot be exceeded (even by owner top-ups)
- Permissionless schedule execution: Any keeper can execute due schedules

## How to evaluate
- Run `cargo test --test agent_leash` — 69/69 should pass
- Check `cargo clippy --all-targets -- -D warnings` — 0 errors
- Verify `bun run build` — production build succeeds
- Inspect WASM artifact at `contracts/near/target-wasm-repro/wasm32-unknown-unknown/release/agent_leash_near.wasm`
- Review `EVIDENCE_INDEX.md` for full test and build evidence

## Claim Status
- **Local test suite**: VERIFIED (69/69 passing)
- **Testnet deployment**: IMPLEMENTED BUT UNVERIFIED (initialization deserialization error)
- **Frontend**: VERIFIED (typecheck, lint, tests, build all pass)