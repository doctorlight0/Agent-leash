# Agent Leash — Final Audit Report (Phase 1)

**Project:** Agent Leash (NEAR Testnet)
**Contract:** `AgentLeash` (Rust, near-sdk 5.30.0)
**Network:** Arc Testnet (5042002)
**Status:** Contract complete; frontend partially adapted; audit pending

---

## 1. Contract Public API Surface

### Mutable Methods (state-changing, require wallet signature)

| Method | Visibility | Auth | Description |
|--------|-----------|------|-------------|
| `create_leash` | `pub`, payable | owner | Creates a leash with immutable balance cap, limits, payees |
| `add_payee` | `pub` | owner | Adds an allowlisted payee to a leash |
| `remove_payee` | `pub` | owner | Disables a payee (soft-remove; clears overrides) |
| `set_payee_limits` | `pub` | owner | Per-payee per-payment / daily cap overrides |
| `set_auto_approve_limit` | `pub` | owner | Auto-approve ceiling for non-allowlisted payees |
| `update_permissions` | `pub` | owner | Limits, cooldown, expiry, approval_required, max_pending |
| `set_agent` | `pub` | owner | Reassigns agent; cancels stale agent-owned schedules |
| `check_in` | `pub`, payable | anyone | Resets vigil inactivity timer; activates vigil |
| `set_check_in_interval` | `pub` | owner | Sets inactivity interval (0 = disabled) |
| `pause_leash` / `resume_leash` | `pub` | owner | Freeze / unfreeze agent payments |
| `revoke` | `pub` | owner | Revoke + async refund of available_balance to owner |
| `revoke_agent` | `pub` | owner | Flag-only revocation; funds remain withdrawable |
| `withdraw_available` | `pub` | owner | Withdraw available balance (async FT transfer + callback) |
| `check_auto_revoke` | `pub` | anyone | Auto-revoke overdue vigil leash; settle pending payments |
| `request_payment` | `pub` | agent | Request immediate or approval-queued payment |
| `approve_payment` | `pub` | owner | Approve a pending-approval payment; starts settlement |
| `reject_payment` | `pub` | owner | Reject a pending-approval payment; releases reservation |
| `expire_payment` | `pub` | anyone | Expire an approval-expired pending payment |
| `create_schedule` | `pub` | owner or agent | Create recurring / one-shot scheduled payment |
| `execute_schedule` | `pub` | anyone | Execute a due schedule; creates payment + settlement |
| `cancel_schedule` | `pub` | owner or creator | Cancel a schedule permanently |
| `expire_schedule` | `pub` | anyone | Mark expired schedule as terminal |
| `create_payroll_group` | `pub`, payable | owner | Create monthly payroll group |
| `add_payroll_worker` | `pub`, payable | owner | Add worker to active payroll group |
| `remove_payroll_worker` | `pub`, payable | owner | Remove worker from active group |
| `update_payroll_worker_salary` | `pub`, payable | owner | Update worker salary |
| `set_payroll_group_active` | `pub`, payable | owner | Activate / deactivate payroll group |
| `fund_payroll_reserve` | `pub`, payable | N/A | Placeholder; funding goes via ft_on_transfer |
| `execute_payroll` | `pub` | anyone | Execute payroll for a due group |
| `retry_payroll_payments` | `pub` | owner | Retry failed payroll payments |
| `enable_vigil` | `pub`, payable | owner | Enable inactivity protection + beneficiaries |
| `set_vigil_check_in_interval` | `pub`, payable | owner | Update vigil check-in interval |
| `set_vigil_grace_period` | `pub`, payable | owner | Update vigil grace period |
| `set_vigil_beneficiaries` | `pub`, payable | owner | Replace all vigil beneficiaries (shares must sum to 100) |
| `vigil_check_in` | `pub` | anyone | Reset vigil timer (within grace period) |
| `check_vigil_overdue` | `pub` | anyone | Trigger vigil settlement if overdue |
| `claim_vigil_entitlement` | `pub` | beneficiary | Claim vigil beneficiary payout |
| `mark_payroll_obligations_satisfied` | `pub` | owner | Mark vigil payroll obligations satisfied |
| `disable_vigil` | `pub`, payable | owner | Disable vigil (only before settlement triggered) |
| `ft_on_transfer` | NEP-141 receiver | token contract | Funding entry point (NEP-141 ft_transfer_call) |

### Storage Management (NEP-145)

| Method | Description |
|--------|-------------|
| `storage_deposit` | Register account + deposit storage |
| `storage_withdraw` | Withdraw available storage balance |
| `storage_unregister` | Unregister account; refund storage |
| `storage_balance_bounds` | Return min/max storage balance |
| `storage_balance_of` | Return account storage balance |

### View Methods (read-only, no gas)

| Method | Returns |
|--------|---------|
| `get_owner` | AccountId |
| `supported_tokens` | Vec<AccountId> |
| `get_supported_token_config` | Option<SupportedTokenConfigView> |
| `get_required_storage_deposit` | U128 |
| `get_leash` | Option<LeashView> |
| `get_payment` | Option<PaymentView> |
| `get_withdrawal` | Option<WithdrawalView> |
| `get_schedule` | Option<ScheduleView> |
| `list_leash_payments` | Vec<PaymentView> (paginated) |
| `list_leash_schedules` | Vec<ScheduleView> (paginated) |
| `list_leash_withdrawals` | Vec<WithdrawalView> (paginated) |
| `get_revocation` | Option<RevocationView> |
| `list_leash_revocations` | Vec<RevocationView> (paginated) |
| `list_owner_leashes` | Vec<u64> |
| `is_recipient_allowed` | bool |
| `rolling_spend` | U128 |
| `get_payroll_group` | Option<PayrollGroupView> |
| `list_payroll_groups` | Vec<PayrollGroupView> |
| `get_payroll_payment` | Option<PayrollPaymentView> |
| `list_payroll_payments` | Vec<PayrollPaymentView> (paginated, filterable by group) |
| `get_vigil_config` | Option<VigilConfigView> |
| `is_vigil_overdue` | bool |
| `is_vigil_in_grace_period` | bool |

### Private Callbacks

| Method | Description |
|--------|-------------|
| `on_payment_settled` | FT transfer callback for regular payments |
| `on_withdrawal_settled` | FT transfer callback for withdrawals |
| `on_revocation_settled` | FT transfer callback for revocations |
| `on_payroll_settled` | FT transfer callback for payroll payments |
| `on_vigil_claim_settled` | FT transfer callback for vigil claims |
| `on_storage_refund` | NEP-145 storage refund callback |

---

## 2. Frontend Contract-Call Surface

### `useNear.tsx` — `connectWallet` methodNames (wallet access list)

```ts
methodNames: [
  'create_leash', 'fund_leash', 'withdraw', 'request_payment',
  'approve_payment', 'revoke_leash', 'pause_leash', 'resume_leash',
  'create_payroll_group', 'add_payroll_worker', 'execute_payroll',
  'retry_payroll_payments', 'enable_vigil', 'disable_vigil',
  'vigil_check_in', 'claim_vigil_entitlement',
  'add_vigil_beneficiary', 'remove_vigil_beneficiary',
]
```

### `useNearSend.ts` — `call` / `fund` helpers

- `call(label, method, args, gasTgas?, deposit?)` — generic contract call via `nearApi.functionCall`
- `fund(label, token, leashId, amount)` — calls `fund_leash` method with `{ leash_id }` args and attached deposit

### `near-transactions.ts` — `callContract` / `fundLeash`

- `callContract(selector, methodName, args, gasTgas, depositYocto)` — `signAndSendTransaction` to contract
- `fundLeash(selector, tokenContract, leashId, amount)` — `ft_transfer_call` on token contract with `msg: JSON.stringify({ Fund: { leash_id: leashId } })`

### `useNearLeash.ts` — view queries

| Hook | Contract View Method |
|------|---------------------|
| `useNearTokenMetadata` | `ft_metadata` (on token contract) |
| `useNearSupportedTokens` | `supported_tokens` |
| `useNearSupportedTokenConfig` | `get_supported_token_config` |
| `useNearStorageBalance` | `storage_balance_of` |
| `useLeashView` | `get_leash` |
| `usePayments` | `list_leash_payments` |
| `useSchedules` | `list_leash_schedules` |
| `useWithdrawals` | `list_leash_withdrawals` |
| `useOwnerLeashes` | `list_owner_leashes` |

### `useLeash.ts` (LEGACY — EVM/viem, NOT NEAR)

This file uses `viem`/`publicClient.readContract` with `agentLeashAbi` and `LEASH_ADDRESS`. It targets the old Solidity contract, NOT the NEAR Rust contract. It is effectively dead code relative to the current NEAR deployment.

---

## 3. Contract ↔ Frontend Mismatches

### Mismatch 1: `fund_leash` does not exist on contract

**Frontend expects:** `fund_leash(leash_id)` with attached deposit  
**Contract reality:** No such method. Funding uses NEP-141: caller calls `ft_transfer_call` on the token contract with `msg: {"Fund":{"leash_id":...}}`, which triggers `ft_on_transfer` on the leash contract.

**Frontend files affected:**
- `useNear.tsx:98` — lists `fund_leash` in wallet `methodNames` (will fail if wallet enforces method allowlist)
- `useNearSend.ts:45` — calls `call('fund_leash', ...)`
- `near-transactions.ts:16` — `fundLeash` correctly implements `ft_transfer_call` on the token contract (this is the correct implementation)

**Fix:** Remove `fund_leash` from `useNear.tsx` methodNames and `useNearSend.ts` `fund` helper; use `fundLeash` from `near-transactions.ts` instead.

### Mismatch 2: `withdraw` does not exist on contract

**Frontend expects:** `withdraw(...)`  
**Contract reality:** Method is `withdraw_available(leash_id, amount, recipient?)` returning `Promise`.

**Frontend files affected:**
- `useNear.tsx:95` — lists `withdraw` in wallet `methodNames`

**Fix:** Replace `withdraw` with `withdraw_available` in methodNames.

### Mismatch 3: `revoke_leash` does not exist on contract

**Frontend expects:** `revoke_leash(leash_id)`  
**Contract reality:** Methods are `revoke(leash_id)` (returns `PromiseOrValue<String>`) and `revoke_agent(leash_id)`.

**Fix:** Replace `revoke_leash` with `revoke` in methodNames and any call sites.

### Mismatch 4: `add_vigil_beneficiary` / `remove_vigil_beneficiary` do not exist

**Frontend expects:** individual add/remove beneficiary methods  
**Contract reality:** `set_vigil_beneficiaries(beneficiaries: Vec<(AccountId, u32)>)` — replaces the entire beneficiary list atomically. Shares must sum to 100, max 100 beneficiaries.

**Frontend files affected:**
- `useNear.tsx:109-110` — lists both in wallet `methodNames`
- `VigilDashboard.tsx` — uses `alert()` placeholders for add/remove

**Fix:** Replace both with `set_vigil_beneficiaries`; implement full-beneficiary-list replacement in frontend UI.

---

## 4. Missing Frontend Features vs Contract Capabilities

| Contract Capability | Frontend Status |
|---------------------|-----------------|
| `pause_leash` / `resume_leash` | Referenced in methodNames; no dedicated UI component found |
| `set_payee_limits` | Not in methodNames; `Allowlist.tsx` has per-payee limits but needs contract integration |
| `set_auto_approve_limit` | Not in methodNames; no UI |
| `update_permissions` | Not in methodNames; no UI |
| `set_agent` | Not in methodNames; no UI |
| `check_in` | Not in methodNames; `VigilDashboard.tsx` may reference |
| `set_check_in_interval` | Not in methodNames; no UI |
| `revoke_agent` | Not in methodNames; no UI |
| `check_auto_revoke` | Not in methodNames; no UI |
| `expire_payment` | Not in methodNames; no UI |
| `create_schedule` / `execute_schedule` / `cancel_schedule` / `expire_schedule` | `Recurring.tsx` exists but integration unclear |
| `remove_payroll_worker` | Contract has it; `WorkersDashboard.tsx` references nonexistent deactivate/activate |
| `update_payroll_worker_salary` | Contract has it; no UI |
| `set_payroll_group_active` | Contract has it; `WorkersDashboard.tsx` references nonexistent methods |
| `fund_payroll_reserve` | Contract stub; no UI |
| `retry_payroll_payments` | Contract has it; `PayrollDashboard.tsx` uses empty `failedPayments` array |
| `set_vigil_check_in_interval` | Not in methodNames; no UI |
| `set_vigil_grace_period` | Not in methodNames; no UI |
| `claim_vigil_entitlement` | In methodNames; `VigilDashboard.tsx` uses alert placeholder |
| `mark_payroll_obligations_satisfied` | Not in methodNames; no UI |
| `disable_vigil` | In methodNames; `VigilDashboard.tsx` uses alert placeholder |
| `get_revocation` / `list_leash_revocations` | Views exist; no frontend usage |
| `rolling_spend` | View exists; no frontend usage |
| `is_recipient_allowed` | View exists; no frontend usage |
| `is_vigil_overdue` / `is_vigil_in_grace_period` | Views exist; `VigilDashboard.tsx` may not use |

---

## 5. Authorization Gaps

### Gap 1: `check_auto_revoke` is callable by anyone but mutates state

- Sets `leash.revoked = true`, clears pending counts, starts settlement on all reserved payments
- No authorization check beyond `vigil_active` + overdue check
- **Risk:** A caller could trigger auto-revoke on any vigil-enabled leash that is overdue. This is by design ("Can be called by anyone") but the settlement callback chain (`start_settlement` → `on_payment_settled`) runs under the caller's context, which could lead to unexpected gas costs or failed settlements that are hard to attribute.

### Gap 2: `expire_payment` is callable by anyone

- No authorization check; only checks payment status and expiry
- **Risk:** Anyone can expire any pending-approval payment once its approval window expires. This is by design but should be documented.

### Gap 3: `execute_schedule` is callable by anyone

- No authorization check beyond schedule being due and active
- **Risk:** Permissionless execution is by design but should be documented as a keeper-friendly pattern.

### Gap 4: `check_vigil_overdue` is callable by anyone

- Triggers vigil settlement (revokes leash, calculates entitlements, starts payroll satisfaction)
- **Risk:** Permissionless trigger is by design but the settlement state machine is complex and could be triggered at an inconvenient time.

### Gap 5: `fund_payroll_reserve` is a stub

- Returns `U128(0)` without doing anything
- **Risk:** Callers may expect actual payroll funding; the real funding path is `ft_on_transfer`.

---

## 6. Data Flow & Storage Concerns

### Concern 1: Vigil entitlements stored in separate maps, not in `VigilConfig`

- `vigil_entitlements`, `vigil_claims`, `vigil_claimed_amount` are stored in separate `LookupMap`s (lines 78-80 of `lib.rs`)
- `VigilConfig` struct has `entitlements: Vec<u128>`, `claimed: Vec<bool>`, `claimed_amount: Vec<u128]` fields
- `trigger_vigil_settlement_internal` writes to BOTH the struct fields AND the separate maps (lines 316-318 of `vigil.rs`)
- **Risk:** Divergence between struct fields and separate maps could cause inconsistent reads. `get_vigil_config` reads entitlements from the separate maps (lines 382-384 of `views.rs`), not from `leash.vigil_config.entitlements`.

### Concern 2: `check_auto_revoke` does not call `trigger_vigil_settlement_internal`

- `check_auto_revoke` (emergency.rs:137) sets `revoked = true` and starts settlement on reserved payments directly
- It does NOT set `vigil_config.settlement_triggered = true`, does NOT calculate payroll obligations, does NOT compute beneficiary entitlements
- **Risk:** Auto-revoke bypasses the full vigil settlement pipeline. Beneficiaries may not receive their entitlements through the proper claim flow.

### Concern 3: `satisfy_payroll_obligations` restarts settlement but does not wait for completion

- `trigger_vigil_settlement_internal` calls `satisfy_payroll_obligations` which restarts settlement on pending payroll payments
- Then returns `"settlement_triggered"` immediately without waiting for payroll callbacks
- **Risk:** `payroll_obligations_satisfied` is set to `true` only if `payroll_obligations == 0` at trigger time (line 286). If there are outstanding payroll payments, the flag remains `false` and beneficiaries cannot claim until the owner calls `mark_payroll_obligations_satisfied` — which requires verifying no pending payments exist. This creates a dependency on an external actor.

### Concern 4: Storage deposit for `create_leash` uses attached deposit but no explicit minimum enforcement

- `create_leash` calls `credit_attached_storage_deposit(&owner_id, deposit)` where `deposit = env::attached_deposit()`
- If caller attaches 0 yocto, `credit_attached_storage_deposit` asserts `deposit > 0` (line 26 of storage.rs)
- **Risk:** Callers must attach sufficient NEAR for storage; no explicit guidance in frontend on how much.

### Concern 5: `getrandom` `js` feature is in dev-dependencies only

- `Cargo.toml` line 19: `getrandom = { version = "0.2", features = ["js"] }` is under `[dev-dependencies]`
- For wasm32 target compilation, `getrandom` needs to be a regular dependency with `js` feature
- **Risk:** `cargo build --target wasm32-unknown-unknown` may fail; `cargo test --target wasm32-unknown-unknown` is blocked.

---

## 7. Security Strengths

1. **Balance cap enforcement:** `balance_cap` is immutable; `ft_on_transfer` rejects top-ups exceeding `balance_cap - (available + reserved)` (funding.rs:44-54)
2. **Reservation pattern:** Payments, withdrawals, and revocations move funds from `available_balance` to `reserved_balance` before async transfer; callbacks either consume or release the reservation
3. **Callback idempotency:** All settlement callbacks check `is_terminal()` and `reserved` flag to reject duplicate/stale replays
4. **Revocation is terminal:** `leash.revoked = true` is set before the refund transfer resolves; agent can never spend again regardless of callback outcome
5. **Owner authorization:** All state-changing owner methods use `assert_owner`; agent methods use `assert_agent`
6. **Cooldown and rolling limits:** Enforced on every payment request and schedule execution
7. **Max 20 pending payments per leash:** Prevents reservation exhaustion
8. **Reason max 280 bytes:** Prevents storage abuse
9. **NEP-145 storage accounting:** Per-account storage deposits tracked; unregister blocked while leash state exists

---

## 8. Recommended Fixes (Priority Order)

### Critical (prevents correct frontend operation)

1. **Fix wallet methodNames** in `useNear.tsx`: Replace `fund_leash` → (remove, use `ft_transfer_call` on token), `withdraw` → `withdraw_available`, `revoke_leash` → `revoke`, `add_vigil_beneficiary` / `remove_vigil_beneficiary` → `set_vigil_beneficiaries`
2. **Fix `useNearSend.ts` `fund` helper:** Remove `fund_leash` call; delegate to `fundLeash` from `near-transactions.ts`
3. **Implement `set_vigil_beneficiaries` UI** in `VigilDashboard.tsx` (replace alert placeholders)
4. **Implement worker deactivate/activate** in `WorkersDashboard.tsx` using `set_payroll_group_active` (contract method exists)

### High (missing contract functionality exposed to frontend)

5. **Add `pause`/`resume` UI** in `OwnerControls.tsx`
6. **Add payee limits UI** in `Allowlist.tsx` using `set_payee_limits`
7. **Add auto-approve limit UI** in `OwnerControls.tsx` using `set_auto_approve_limit`
8. **Add schedule CRUD UI** in `Recurring.tsx` using `create_schedule`/`cancel_schedule`/`expire_schedule`
9. **Add payroll retry UI** in `PayrollDashboard.tsx` using `retry_payroll_payments` with real failed payment IDs

### Medium (contract hardening)

10. **Fix `getrandom` dependency:** Move to `[dependencies]` with `js` feature for wasm32 builds
11. **Unify vigil entitlement storage:** Remove duplicate separate maps or ensure struct fields are the source of truth
12. **Make `check_auto_revoke` use `trigger_vigil_settlement_internal`** so beneficiaries receive entitlements through the proper claim flow
13. **Implement `fund_payroll_reserve`** or remove it (currently a no-op stub)
14. **Add `#[payable]` to `revoke`** if owner needs to attach storage deposit for the revocation record

---

## 9. Test Coverage

- Contract: 205 Foundry tests (from AGENTS.md) — these appear to reference the old Solidity v2 contract, not the NEAR Rust contract
- NEAR Rust contract: `near-sdk` unit-testing feature available but `cargo test --target wasm32-unknown-unknown` blocked by `getrandom`
- Frontend: `npm test` — 2 files, 6 tests, all pass (nearSendStatus + near-format)
- No integration tests between frontend and NEAR contract

---

## 10. Phase 2 Deliverable

Create `docs/CONTRACT_FRONTEND_INTERFACE.md` with canonical TypeScript types matching actual Rust signatures, and update all frontend call sites to match.

---

**Next step:** Proceed to Phase 2 — write `docs/CONTRACT_FRONTEND_INTERFACE.md`.
