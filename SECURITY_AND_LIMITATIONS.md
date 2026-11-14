# SECURITY_AND_LIMITATIONS.md — Agent Leash

## Security Assumptions
- **near-sdk 5.30.0**: The contract compiles and tests correctly with this NEAR SDK version
- **NEP-141 usdc.testnet**: The USDC token contract follows the NEP-141 standard; its `ft_on_transfer` behavior is assumed based on code review
- **Wasmtime VM v2.14.1**: The NEAR Testnet runtime environment; the deserialization issue is specific to this runtime version
- **Owner authority**: The leash owner has full control: create, modify, pause, revoke
- **Agent limitations**: The agent can only request payments within configured limits; cannot exceed the balance_cap
- **Clock reliability**: `block_timestamp()` and `block_timestamp()` are used for cooldowns, grace periods, and schedule due times

## Contract Authorization and Accounting Protections
- **Owner-only operations**: `create_leash`, `add_payee`, `remove_payee`, `set_payee_limits`, `set_auto_approve_limit`, `update_permissions`, `set_agent`, `revoke`, `pause_leash`, `resume_leash`, `disable_vigil`, `set_vigil_beneficiaries`, `set_vigil_check_in_interval`, `set_vigil_grace_period`, `set_check_in_interval`
- **Balance cap enforcement**: `balance_cap_ceiling_for_decimals()` ensures the configured ceiling is valid for the token's decimals; `balance_cap` cannot exceed this ceiling
- **Reservation invariants**: `available_balance + reserved_balance` is tracked carefully; payments reserve from available, settlements consume reservations
- **Balance cap is absolute**: Even the owner cannot top up beyond the balance_cap; attempting to fund beyond the cap is rejected by `ft_on_transfer`
- **Per-payment limit clamp**: `auto_approve_limit` is clamped to `per_payment_limit` so auto-approval never exceeds the global limit
- **Rolling window**: `window_entries` tracks per-payment entries; `effective_window_ns` determines the window size (default 1 day = `DAY_NS`; or `rolling_window_ns` if configured)
- **Cooldown enforcement**: After each payment, `cooldown_ns` must elapse before another payment can be requested; `last_payment_at_ns` tracks the last payment time
- **Expiry enforcement**: `expires_at_ns` checks on `create_leash`, `request_payment`, and other operations
- **Revocation safety**: 
  - `revoke()` moves available balance to reserved and initiates refund transfer
  - Agent is immediately stopped (no new payments possible)
  - Pending payment reservations are untouched
  - `on_revocation_settled()` callback consumes/refunds the reservation
  - `withdraw_available()` after revoke owner can withdraw remaining available balance
- **Pause/resume**: `pause_leash()` stops agent payments but balance remains withdrawable; `resume_leash()` restores payment ability

## Token and Storage Assumptions
- **NEP-141 USDC (6 decimals)**: Token contract `usdc.testnet`; decimals configured as 6 during initialization
- **Balance cap ceiling**: `1,000,000 × 10^decimals` base units — preserves whole-token exposure across 0-, 6-, 18-, and 24-decimal tokens
- **Storage**: NEP-145 management with `storage_deposit`, `storage_withdraw`, `storage_unregister`
- **Minimum storage balance**: Derived from `storage_account_min_bytes` (measured during initialization)
- **Storage refunds**: `on_storage_refund()` callback with explicit 15 Tgas budget; replay protection via `pending_refund_id`
- **Dust handling**: Small remainders after allocation are absorbed into the first beneficiary's entitlement

## Remaining Risks
- **Testnet initialization deserialization**: `CompileError(PrepareError(Deserialization))` prevents full Testnet lifecycle verification — runtime compatibility issue with `Option<U128>` init arguments
- **USDC contract behavior**: Assumed based on code review; not independently verified on Testnet
- **Runtime version mismatch**: NEAR Testnet 2.14.1 / Wasmtime may have different deserialization expectations than near-sdk 5.30.0 produces
- **Disk space constraints**: Limited ability to rebuild and verify the WASM from scratch
- **Callback gas budget**: 15 Tgas explicit budget for storage refund callbacks; actual gas consumption unmeasured on Testnet

## Features That Are Disabled or Incomplete
- **Full Testnet Vigil settlement**: The `claim_vigil_entitlement()` and `on_vigil_claim_settled()` callbacks cannot be fully tested on Testnet due to the initialization deserialization error
- **Payroll callback settlement**: `on_payroll_settled()` callbacks cannot be fully tested on Testnet
- **Real-time cooldown tracking**: In a live setting, cooldown timing depends on actual block timestamps
- **Grace period expiration events**: Without full Testnet cycle, grace period expiration and automatic beneficiary settlement cannot be verified

## Testnet Limitations
- `near call agent-leash-v2.testnet new ...` fails with `CompileError(PrepareError(Deserialization))`
- Contract code deploys successfully, but initialization cannot be completed
- Read-only verification works (owner, supported_tokens, code hash)
- Full lifecycle (funding → leash creation → payments → vigil → revocation) cannot be completed on Testnet currently
- The deserialization issue is a runtime compatibility problem, not a code defect

## Features That Have Not Been Independently Verified
- Testnet USDC `ft_on_transfer` failure modes
- Testnet Vigil beneficiary settlement execution
- Testnet payroll callback resolution
- Testnet storage refund callback gas consumption
- Testnet grace period expiration and automatic revocation
- Testnet beneficiary claim and entitlement transfer

## Security Model Summary
- **Ownership**: Leash owner has final authority; agent can only act within limits
- **Custody**: `available + reserved = total exposure`; funding cannot exceed balance_cap
- **Enforcement**: All limits checked onchain; no frontend-only enforcement
- **Recovery**: `withdraw_available()` after revoke; `on_revocation_settled()` callback; `withdraw_storage()` for NEP-145
- **Automatic protection**: Vigil triggers after inactivity period; beneficiary settlement after payroll