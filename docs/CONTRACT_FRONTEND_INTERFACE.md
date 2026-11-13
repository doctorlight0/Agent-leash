# Contract ↔ Frontend Interface Specification (Phase 2)

Canonical TypeScript types for all NEAR contract methods, views, and events. These match the actual Rust signatures in `contracts/near/src/`. Use this as the single source of truth for all frontend contract calls.

---

## 1. Common Types

```typescript
type AccountId = string;
type U128 = string; // string-encoded unsigned 128-bit integer
type TimestampNs = number; // nanoseconds
```

### PaymentStatus

```typescript
type PaymentStatus =
  | 'Requested'
  | 'PendingApproval'
  | 'Settling'
  | 'Settled'
  | 'Rejected'
  | 'Failed'
  | 'Cancelled'
  | 'Expired';
```

### WithdrawalStatus

```typescript
type WithdrawalStatus = 'Settling' | 'Settled' | 'Failed';
```

### RevocationStatus

```typescript
type RevocationStatus = 'Settling' | 'Settled' | 'Failed';
```

### PayrollPaymentStatus

```typescript
type PayrollPaymentStatus = 'Pending' | 'Settling' | 'Settled' | 'Failed' | 'Cancelled';
```

### FundingMessage (msg for ft_transfer_call)

```typescript
type FundingMessage = { Fund: { leash_id: number } };
```

---

## 2. Views (read-only, no gas)

### get_leash

**Rust:** `pub fn get_leash(&self, leash_id: u64) -> Option<LeashView>`

```typescript
interface LeashView {
  leash_id: number;
  owner_id: AccountId;
  agent_id: AccountId;
  token_contract: AccountId;
  balance_cap: U128;
  available_balance: U128;
  reserved_balance: U128;
  per_payment_limit: U128;
  rolling_limit: U128;
  rolling_window_ns: TimestampNs;
  cooldown_ns: TimestampNs;
  expires_at_ns: TimestampNs | null;
  approval_required: boolean;
  paused: boolean;
  revoked: boolean;
  max_pending_payments: number;
  pending_payment_count: number;
  next_payment_id: number;
  next_schedule_id: number;
  next_withdrawal_id: number;
  next_revocation_id: number;
  check_in_interval_ns: TimestampNs;
  last_check_in_ns: TimestampNs;
  vigil_active: boolean;
  monthly_cap: U128;
  period_start_ns: TimestampNs;
  monthly_spent: U128;
}

function getLeash(leashId: number): Promise<LeashView | null>;
```

### get_payment

**Rust:** `pub fn get_payment(&self, leash_id: u64, payment_id: u64) -> Option<PaymentView>`

```typescript
interface PaymentView {
  leash_id: number;
  payment_id: number;
  requester: AccountId;
  recipient: AccountId;
  token_contract: AccountId;
  amount: U128;
  reason: string | null;
  status: PaymentStatus;
  created_at_ns: TimestampNs;
  approval_expires_at_ns: TimestampNs | null;
  reserved: boolean;
}

function getPayment(leashId: number, paymentId: number): Promise<PaymentView | null>;
```

### list_leash_payments

**Rust:** `pub fn list_leash_payments(&self, leash_id: u64, from_index: Option<u64>, limit: Option<u64>) -> Vec<PaymentView>`

```typescript
function listLeashPayments(
  leashId: number,
  fromIndex?: number,
  limit?: number, // max 100
): Promise<PaymentView[]>;
```

### get_withdrawal

**Rust:** `pub fn get_withdrawal(&self, leash_id: u64, withdrawal_id: u64) -> Option<WithdrawalView>`

```typescript
interface WithdrawalView {
  leash_id: number;
  withdrawal_id: number;
  requester: AccountId;
  recipient: AccountId;
  token_contract: AccountId;
  amount: U128;
  status: WithdrawalStatus;
  created_at_ns: TimestampNs;
  reserved: boolean;
}

function getWithdrawal(leashId: number, withdrawalId: number): Promise<WithdrawalView | null>;
```

### list_leash_withdrawals

```typescript
function listLeashWithdrawals(
  leashId: number,
  fromIndex?: number,
  limit?: number, // max 100
): Promise<WithdrawalView[]>;
```

### get_schedule

**Rust:** `pub fn get_schedule(&self, leash_id: u64, schedule_id: u64) -> Option<ScheduleView>`

```typescript
interface ScheduleView {
  leash_id: number;
  schedule_id: number;
  creator: AccountId;
  recipient: AccountId;
  amount: U128;
  execute_after_ns: TimestampNs;
  interval_ns: TimestampNs;
  next_due_ns: TimestampNs;
  expires_at_ns: TimestampNs | null;
  reason: string | null;
  active: boolean;
  executed: boolean;
  max_runs: number;
  runs: number;
}

function getSchedule(leashId: number, scheduleId: number): Promise<ScheduleView | null>;
```

### list_leash_schedules

```typescript
function listLeashSchedules(
  leashId: number,
  fromIndex?: number,
  limit?: number, // max 100
): Promise<ScheduleView[]>;
```

### get_revocation

**Rust:** `pub fn get_revocation(&self, leash_id: u64, revocation_id: u64) -> Option<RevocationView>`

```typescript
interface RevocationView {
  leash_id: number;
  revocation_id: number;
  requester: AccountId;
  recipient: AccountId;
  token_contract: AccountId;
  amount: U128;
  status: RevocationStatus;
  created_at_ns: TimestampNs;
  updated_at_ns: TimestampNs;
  reserved: boolean;
}

function getRevocation(leashId: number, revocationId: number): Promise<RevocationView | null>;
```

### list_leash_revocations

```typescript
function listLeashRevocations(
  leashId: number,
  fromIndex?: number,
  limit?: number, // max 100
): Promise<RevocationView[]>;
```

### list_owner_leashes

**Rust:** `pub fn list_owner_leashes(&self, owner_id: AccountId) -> Vec<u64>`

```typescript
function listOwnerLeashes(ownerId: AccountId): Promise<number[]>;
```

### is_recipient_allowed

**Rust:** `pub fn is_recipient_allowed(&self, leash_id: u64, recipient: AccountId) -> bool`

```typescript
function isRecipientAllowed(leashId: number, recipient: AccountId): Promise<boolean>;
```

### rolling_spend

**Rust:** `pub fn rolling_spend(&self, leash_id: u64) -> U128`

```typescript
function rollingSpend(leashId: number): Promise<U128>;
```

---

## 3. Payroll Views

### get_payroll_group

**Rust:** `pub fn get_payroll_group(&self, leash_id: u64, group_id: u64) -> Option<PayrollGroupView>`

```typescript
interface WorkerView {
  account_id: AccountId;
  salary: U128;
  token_contract: AccountId;
  active: boolean;
}

interface PayrollGroupView {
  group_id: number;
  owner_id: AccountId;
  name: string;
  token_contract: AccountId;
  payday: number; // 1-31
  first_payment_date_ns: TimestampNs;
  workers: WorkerView[];
  active: boolean;
  reserved_balance: U128;
  next_payment_period_ns: TimestampNs;
  created_at_ns: TimestampNs;
  total_monthly_salary: U128;
}

function getPayrollGroup(leashId: number, groupId: number): Promise<PayrollGroupView | null>;
```

### list_payroll_groups

**Rust:** `pub fn list_payroll_groups(&self, leash_id: u64) -> Vec<PayrollGroupView>`

```typescript
function listPayrollGroups(leashId: number): Promise<PayrollGroupView[]>;
```

### get_payroll_payment

**Rust:** `pub fn get_payroll_payment(&self, leash_id: u64, payment_id: u64) -> Option<PayrollPaymentView>`

```typescript
interface PayrollPaymentView {
  group_id: number;
  payment_id: number;
  worker_id: number;
  worker_account: AccountId;
  token_contract: AccountId;
  amount: U128;
  period_start_ns: TimestampNs;
  period_end_ns: TimestampNs;
  status: PayrollPaymentStatus;
  created_at_ns: TimestampNs;
  settled_at_ns: TimestampNs | null;
  reserved: boolean;
}

function getPayrollPayment(leashId: number, paymentId: number): Promise<PayrollPaymentView | null>;
```

### list_payroll_payments

**Rust:** `pub fn list_payroll_payments(&self, leash_id: u64, group_id: Option<u64>, from_index: Option<u64>, limit: Option<u64>) -> Vec<PayrollPaymentView>`

```typescript
function listPayrollPayments(
  leashId: number,
  groupId?: number,
  fromIndex?: number,
  limit?: number, // max 100
): Promise<PayrollPaymentView[]>;
```

---

## 4. Vigil Views

### get_vigil_config

**Rust:** `pub fn get_vigil_config(&self, leash_id: u64) -> Option<VigilConfigView>`

```typescript
interface VigilBeneficiaryView {
  account_id: AccountId;
  share_percent: number;
  entitlement: U128;
  claimed: boolean;
  claimed_amount: U128;
}

interface VigilConfigView {
  enabled: boolean;
  check_in_interval_ns: TimestampNs;
  grace_period_ns: TimestampNs;
  last_check_in_ns: TimestampNs;
  deadline_ns: TimestampNs;
  grace_deadline_ns: TimestampNs;
  beneficiaries: VigilBeneficiaryView[];
  settlement_triggered: boolean;
  settlement_completed: boolean;
  payroll_obligations_satisfied: boolean;
  protected_balance: U128;
}

function getVigilConfig(leashId: number): Promise<VigilConfigView | null>;
```

### is_vigil_overdue

**Rust:** `pub fn is_vigil_overdue(&self, leash_id: u64) -> bool`

```typescript
function isVigilOverdue(leashId: number): Promise<boolean>;
```

### is_vigil_in_grace_period

**Rust:** `pub fn is_vigil_in_grace_period(&self, leash_id: u64) -> bool`

```typescript
function isVigilInGracePeriod(leashId: number): Promise<boolean>;
```

---

## 5. Token / Config Views

### supported_tokens

**Rust:** `pub fn supported_tokens(&self) -> Vec<AccountId>`

```typescript
function supportedTokens(): Promise<AccountId[]>;
```

### get_supported_token_config

**Rust:** `pub fn get_supported_token_config(&self, token_contract: AccountId) -> Option<SupportedTokenConfigView>`

```typescript
interface SupportedTokenConfigView {
  token_contract: AccountId;
  decimals: number;
  max_balance_cap: U128;
}

function getSupportedTokenConfig(tokenContract: AccountId): Promise<SupportedTokenConfigView | null>;
```

### get_required_storage_deposit

**Rust:** `pub fn get_required_storage_deposit(&self) -> U128`

```typescript
function getRequiredStorageDeposit(): Promise<U128>;
```

### storage_balance_of (NEP-145)

**Rust:** `fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance>`

```typescript
interface StorageBalance {
  total: U128;
  available: U128;
}

function storageBalanceOf(accountId: AccountId): Promise<StorageBalance | null>;
```

---

## 6. Mutable Methods (require wallet signature)

All methods below are called via `nearApi.functionCall({ contractId, methodName, args, gas, attachedDeposit })`.

### create_leash

**Rust:** `#[payable] pub fn create_leash(...) -> u64`

```typescript
interface CreateLeashArgs {
  agent_id: AccountId;
  token_contract: AccountId;
  per_payment_limit: U128;
  rolling_limit: U128;
  rolling_window_ns?: TimestampNs;
  cooldown_ns: TimestampNs;
  expires_at_ns?: TimestampNs;
  approval_required: boolean;
  max_pending_payments?: number;
  initial_payees?: AccountId[];
  balance_cap: U128;
}
// Returns: number (leash_id)
// Requires: attached deposit for storage
```

### add_payee

**Rust:** `pub fn add_payee(&mut self, leash_id: u64, payee: AccountId)`

```typescript
interface AddPayeeArgs { leash_id: number; payee: AccountId; }
```

### remove_payee

**Rust:** `pub fn remove_payee(&mut self, leash_id: u64, payee: AccountId)`

```typescript
interface RemovePayeeArgs { leash_id: number; payee: AccountId; }
```

### set_payee_limits

**Rust:** `pub fn set_payee_limits(&mut self, leash_id: u64, payee: AccountId, per_payment_limit: U128, daily_cap: U128)`

```typescript
interface SetPayeeLimitsArgs {
  leash_id: number;
  payee: AccountId;
  per_payment_limit: U128;
  daily_cap: U128;
}
// Rules: per_payment_limit must be 0 (use leash default) or <= leash.per_payment_limit
//        if both nonzero, per_payment_limit <= daily_cap
```

### set_auto_approve_limit

**Rust:** `pub fn set_auto_approve_limit(&mut self, leash_id: u64, amount: U128)`

```typescript
interface SetAutoApproveLimitArgs { leash_id: number; amount: U128; }
// Rules: amount must be <= leash.per_payment_limit; 0 disables
```

### update_permissions

**Rust:** `pub fn update_permissions(&mut self, leash_id: u64, per_payment_limit: U128, rolling_limit: U128, cooldown_ns: u64, expires_at_ns: Option<u64>, approval_required: boolean, max_pending_payments: u32)`

```typescript
interface UpdatePermissionsArgs {
  leash_id: number;
  per_payment_limit: U128;
  rolling_limit: U128;
  cooldown_ns: TimestampNs;
  expires_at_ns: TimestampNs | null;
  approval_required: boolean;
  max_pending_payments: number;
}
```

### set_agent

**Rust:** `pub fn set_agent(&mut self, leash_id: u64, agent_id: AccountId)`

```typescript
interface SetAgentArgs { leash_id: number; agent_id: AccountId; }
// Rules: pending_payment_count must be 0; cancels stale agent schedules
```

### check_in

**Rust:** `#[payable] pub fn check_in(&mut self, leash_id: u64) -> bool`

```typescript
interface CheckInArgs { leash_id: number; }
// Returns: boolean
// Can be called by anyone; resets vigil timer and activates vigil
```

### set_check_in_interval

**Rust:** `pub fn set_check_in_interval(&mut self, leash_id: u64, check_in_interval_ns: u64)`

```typescript
interface SetCheckInIntervalArgs {
  leash_id: number;
  check_in_interval_ns: TimestampNs; // 0 = disabled; else >= 1 day, <= 90 days
}
```

### pause_leash / resume_leash

**Rust:** `pub fn pause_leash(&mut self, leash_id: u64)` / `pub fn resume_leash(&mut self, leash_id: u64)`

```typescript
interface PauseLeashArgs { leash_id: number; }
interface ResumeLeashArgs { leash_id: number; }
// Owner only; resume requires !revoked
```

### revoke

**Rust:** `pub fn revoke(&mut self, leash_id: u64) -> PromiseOrValue<String>`

```typescript
interface RevokeArgs { leash_id: number; }
// Returns: PromiseOrValue<string> ("revoked" if balance is 0, otherwise promise)
// Owner only; sets revoked=true immediately, then async refund of available_balance
```

### revoke_agent

**Rust:** `pub fn revoke_agent(&mut self, leash_id: u64)`

```typescript
interface RevokeAgentArgs { leash_id: number; }
// Owner only; flag-only revocation, funds remain withdrawable via withdraw_available
```

### withdraw_available

**Rust:** `pub fn withdraw_available(&mut self, leash_id: u64, amount: U128, recipient: Option<AccountId>) -> Promise`

```typescript
interface WithdrawAvailableArgs {
  leash_id: number;
  amount: U128;
  recipient?: AccountId; // defaults to owner
}
// Owner only; amount must be <= available_balance
```

### check_auto_revoke

**Rust:** `pub fn check_auto_revoke(&mut self, leash_id: u64) -> PromiseOrValue<String>`

```typescript
interface CheckAutoRevokeArgs { leash_id: number; }
// Callable by anyone; no-op if vigil not active or not overdue
// Sets revoked=true and starts settlement on reserved payments
```

### request_payment

**Rust:** `pub fn request_payment(&mut self, leash_id: u64, recipient: AccountId, amount: U128, reason: Option<String>, approval_expires_at_ns: Option<u64>) -> u64`

```typescript
interface RequestPaymentArgs {
  leash_id: number;
  recipient: AccountId;
  amount: U128;
  reason?: string; // max 280 bytes
  approval_expires_at_ns?: TimestampNs; // defaults to now + 24h
}
// Returns: number (payment_id)
// Agent only
```

### approve_payment

**Rust:** `pub fn approve_payment(&mut self, leash_id: u64, payment_id: u64) -> Promise`

```typescript
interface ApprovePaymentArgs { leash_id: number; payment_id: number; }
// Owner only; payment must be PendingApproval, not terminal, reserved
```

### reject_payment

**Rust:** `pub fn reject_payment(&mut self, leash_id: u64, payment_id: u64)`

```typescript
interface RejectPaymentArgs { leash_id: number; payment_id: number; }
// Owner only; payment must be PendingApproval, not terminal
```

### expire_payment

**Rust:** `pub fn expire_payment(&mut self, leash_id: u64, payment_id: u64)`

```typescript
interface ExpirePaymentArgs { leash_id: number; payment_id: number; }
// Callable by anyone; payment must be PendingApproval and past approval_expiry
```

### create_schedule

**Rust:** `pub fn create_schedule(&mut self, leash_id: u64, recipient: AccountId, amount: U128, execute_after_ns: u64, expires_at_ns: Option<u64>, reason: Option<String>, interval_ns: u64, max_runs: u32) -> u64`

```typescript
interface CreateScheduleArgs {
  leash_id: number;
  recipient: AccountId;
  amount: U128;
  execute_after_ns: TimestampNs;
  expires_at_ns?: TimestampNs;
  reason?: string; // max 280 bytes
  interval_ns: TimestampNs; // 0 = one-shot; else >= 1 hour
  max_runs: number; // 0 = unlimited for recurring; 0 or 1 for one-shot
}
// Returns: number (schedule_id)
// Owner or agent (agent schedules disabled when approval_required=true)
// One-shot: max_runs must be 0 or 1
// Recurring: interval >= 1 hour
```

### execute_schedule

**Rust:** `pub fn execute_schedule(&mut self, leash_id: u64, schedule_id: u64) -> PromiseOrValue<u64>`

```typescript
interface ExecuteScheduleArgs { leash_id: number; schedule_id: number; }
// Returns: PromiseOrValue<number> (payment_id)
// Callable by anyone; schedule must be active, not executed, due, not expired
```

### cancel_schedule

**Rust:** `pub fn cancel_schedule(&mut self, leash_id: u64, schedule_id: u64)`

```typescript
interface CancelScheduleArgs { leash_id: number; schedule_id: number; }
// Owner or schedule creator; schedule must be active and not executed
```

### expire_schedule

**Rust:** `pub fn expire_schedule(&mut self, leash_id: u64, schedule_id: u64) -> bool`

```typescript
interface ExpireScheduleArgs { leash_id: number; schedule_id: number; }
// Returns: boolean
// Callable by anyone; no-op if not active, already executed, or not expired
```

### create_payroll_group

**Rust:** `#[payable] pub fn create_payroll_group(&mut self, leash_id: u64, name: String, token_contract: AccountId, payday: u8, first_payment_date_ns: u64) -> u64`

```typescript
interface CreatePayrollGroupArgs {
  leash_id: number;
  name: string; // 1-64 chars
  token_contract: AccountId;
  payday: number; // 1-31
  first_payment_date_ns: TimestampNs; // must be in future
}
// Returns: number (group_id)
// Owner only; attached deposit for storage
```

### add_payroll_worker

**Rust:** `#[payable] pub fn add_payroll_worker(&mut self, leash_id: u64, group_id: u64, worker_account: AccountId, salary: U128) -> u64`

```typescript
interface AddPayrollWorkerArgs {
  leash_id: number;
  group_id: number;
  worker_account: AccountId;
  salary: U128; // must be > 0
}
// Returns: number (worker_id)
// Owner only; group must be active; worker not already in group
```

### remove_payroll_worker

**Rust:** `#[payable] pub fn remove_payroll_worker(&mut self, leash_id: u64, group_id: u64, worker_id: u64)`

```typescript
interface RemovePayrollWorkerArgs {
  leash_id: number;
  group_id: number;
  worker_id: number;
}
// Owner only; group must be active
```

### update_payroll_worker_salary

**Rust:** `#[payable] pub fn update_payroll_worker_salary(&mut self, leash_id: u64, group_id: u64, worker_id: u64, salary: U128)`

```typescript
interface UpdatePayrollWorkerSalaryArgs {
  leash_id: number;
  group_id: number;
  worker_id: number;
  salary: U128; // must be > 0
}
// Owner only; group must be active
```

### set_payroll_group_active

**Rust:** `#[payable] pub fn set_payroll_group_active(&mut self, leash_id: u64, group_id: u64, active: bool)`

```typescript
interface SetPayrollGroupActiveArgs {
  leash_id: number;
  group_id: number;
  active: boolean;
}
// Owner only
```

### execute_payroll

**Rust:** `pub fn execute_payroll(&mut self, leash_id: u64, group_id: u64) -> PromiseOrValue<Vec<u64>>`

```typescript
interface ExecutePayrollArgs { leash_id: number; group_id: number; }
// Returns: PromiseOrValue<number[]> (payment_ids)
// Callable by anyone; group must be active, payroll due, not already executed for period
```

### retry_payroll_payments

**Rust:** `pub fn retry_payroll_payments(&mut self, leash_id: u64, group_id: u64, payment_ids: Vec<u64>)`

```typescript
interface RetryPayrollPaymentsArgs {
  leash_id: number;
  group_id: number;
  payment_ids: number[];
}
// Owner only; each payment must be Failed, reserved, and belong to group
```

### enable_vigil

**Rust:** `#[payable] pub fn enable_vigil(&mut self, leash_id: u64, check_in_interval_ns: u64, grace_period_ns: Option<u64>)`

```typescript
interface EnableVigilArgs {
  leash_id: number;
  check_in_interval_ns: TimestampNs; // 1 day to 90 days
  grace_period_ns?: TimestampNs; // default 7 days; max 30 days
}
// Owner only; attached deposit for storage
```

### set_vigil_check_in_interval

**Rust:** `#[payable] pub fn set_vigil_check_in_interval(&mut self, leash_id: u64, check_in_interval_ns: u64)`

```typescript
interface SetVigilCheckInIntervalArgs {
  leash_id: number;
  check_in_interval_ns: TimestampNs;
}
// Owner only; vigil must be active; settlement not triggered
```

### set_vigil_grace_period

**Rust:** `#[payable] pub fn set_vigil_grace_period(&mut self, leash_id: u64, grace_period_ns: u64)`

```typescript
interface SetVigilGracePeriodArgs {
  leash_id: number;
  grace_period_ns: TimestampNs; // > 0, max 30 days
}
// Owner only; vigil must be active; settlement not triggered
```

### set_vigil_beneficiaries

**Rust:** `#[payable] pub fn set_vigil_beneficiaries(&mut self, leash_id: u64, beneficiaries: Vec<(AccountId, u32)>)

```typescript
interface SetVigilBeneficiariesArgs {
  leash_id: number;
  beneficiaries: Array<[AccountId, number]>; // [account_id, share_percent]
  // share_percent: 1-100, no duplicates, total must equal 100
  // max 100 beneficiaries
}
// Owner only; vigil must be active; settlement not triggered
// Replaces entire beneficiary list atomically
```

### vigil_check_in

**Rust:** `pub fn vigil_check_in(&mut self, leash_id: u64)`

```typescript
interface VigilCheckInArgs { leash_id: number; }
// Callable by anyone; vigil must be active; not revoked; not expired; settlement not triggered
// Must be within grace period (now <= grace_deadline)
```

### check_vigil_overdue

**Rust:** `pub fn check_vigil_overdue(&mut self, leash_id: u64) -> PromiseOrValue<String>`

```typescript
interface CheckVigilOverdueArgs { leash_id: number; }
// Returns: PromiseOrValue<string> ("vigil_not_active", "already_triggered", "not_overdue", "in_grace_period", "settlement_triggered")
// Callable by anyone; triggers full vigil settlement pipeline if overdue
```

### claim_vigil_entitlement

**Rust:** `pub fn claim_vigil_entitlement(&mut self, leash_id: u64) -> PromiseOrValue<String>`

```typescript
interface ClaimVigilEntitlementArgs { leash_id: number; }
// Returns: PromiseOrValue<string>
// Beneficiary only; settlement triggered, payroll obligations satisfied, not already claimed
```

### mark_payroll_obligations_satisfied

**Rust:** `pub fn mark_payroll_obligations_satisfied(&mut self, leash_id: u64)`

```typescript
interface MarkPayrollObligationsSatisfiedArgs { leash_id: number; }
// Owner only; settlement triggered; not already satisfied; no pending payroll payments
```

### disable_vigil

**Rust:** `#[payable] pub fn disable_vigil(&mut self, leash_id: u64)`

```typescript
interface DisableVigilArgs { leash_id: number; }
// Owner only; settlement not triggered
```

---

## 7. NEP-141 Funding (ft_transfer_call)

**Entry point:** Caller calls `ft_transfer_call` on the USDC token contract, not on the leash contract.

```typescript
interface FundLeashArgs {
  receiver_id: string; // NEAR leash contract account ID
  amount: U128; // USDC amount (6 decimals)
  msg: string; // JSON: {"Fund":{"leash_id":123}}
}
// Gas: ~80 TGAS
// Deposit: 1 yoctoNEAR
```

**Contract callback:** `ft_on_transfer(sender_id, amount, msg)` on leash contract
- Validates: sender is leash owner, token matches leash.token_contract, leash not revoked, amount fits within balance_cap headroom
- Returns `U128(0)` on success (consumes all tokens), `U128(amount)` on rejection (tokens refunded)

---

## 8. NEP-145 Storage Management

### storage_deposit

```typescript
interface StorageDepositArgs {
  account_id?: AccountId; // defaults to predecessor
  registration_only?: boolean;
}
// Payable; attached deposit is storage credit
// Returns: StorageBalance { total, available }
```

### storage_withdraw

```typescript
interface StorageWithdrawArgs {
  amount?: U128; // defaults to all available
}
// Requires 1 yoctoNEAR attached
// Returns: StorageBalance
```

### storage_unregister

```typescript
interface StorageUnregisterArgs {
  force?: boolean;
}
// Requires 1 yoctoNEAR attached
// Returns: boolean (true if unregistered)
// Blocked while leash state exists for this account
```

---

## 9. Events (from contract logs)

```typescript
interface AgentLeashEvent {
  event: string;
  data: Record<string, unknown>;
}

// Key events:
// LeashCreated, Funded, PaymentRequested, PaymentApproved, PaymentRejected,
// PaymentSettled, PaymentFailed, WithdrawalRequested, WithdrawalSettled,
// WithdrawalFailed, LeashPaused, LeashResumed, AgentRevoked, PayeeAdded,
// PayeeRemoved, PayeeLimitsSet, AutoApproveLimitSet, LimitsUpdated, AgentSet,
// PermissionsUpdated, RevocationRequested, RevocationSettled, RevocationFailed,
// ScheduleCreated, ScheduleExecutionRequested, ScheduleCancelled, ScheduleExpired,
// PayrollGroupCreated, PayrollWorkerAdded, PayrollWorkerRemoved,
// PayrollWorkerSalaryUpdated, PayrollGroupStatusChanged, PayrollExecuted,
// PayrollPaymentSettled, PayrollPaymentFailed, VigilEnabled, VigilDisabled,
// VigilIntervalUpdated, VigilGracePeriodUpdated, VigilBeneficiariesSet,
// VigilCheckIn, VigilSettlementTriggered, VigilPayrollObligationsSatisfied,
// VigilClaimSettled, VigilClaimFailed, VigilSettlementCompleted
```

---

## 10. Contract Errors (from `ContractError::code()`)

```typescript
type ContractErrorCode =
  | 'unsupported_token'
  | 'unknown_token_decimals'
  | 'invalid_config'
  | 'invalid_amount'
  | 'invalid_reason'
  | 'too_many_leashes'
  | 'too_many_payees'
  | 'too_many_pending'
  | 'too_many_schedules'
  | 'balance_cap_exceeded'
  | 'over_per_payment_limit'
  | 'over_rolling_limit'
  | 'over_payee_per_payment_limit'
  | 'over_payee_daily_cap'
  | 'cooldown_active'
  | 'insufficient_balance'
  | 'insufficient_available_balance'
  | 'approval_required'
  | 'already_terminal'
  | 'stale_callback'
  | 'duplicate_callback'
  | 'funding_unauthorized'
  | 'funding_revoked'
  | 'funding_cap_exceeded'
  | 'funding_token_mismatch'
  | 'leash_not_found'
  | 'payment_not_found'
  | 'recipient_not_allowed'
  | 'paused'
  | 'revoked'
  | 'expired'
  | 'not_agent'
  | 'not_owner'
  | 'payment_not_pending_approval'
  | 'approval_expired'
  | 'schedule_not_found'
  | 'schedule_not_active'
  | 'schedule_not_due'
  | 'schedule_expired'
  | 'schedule_already_executed'
  | 'revocation_not_found'
  | 'revocation_already_terminal'
  | 'revocation_not_owner'
  | 'withdrawal_not_found'
  | 'withdrawal_not_owner'
  | 'storage_deposit_required'
  | 'storage_deposit_too_small'
  | 'storage_refund_unavailable'
  | 'unauthorized';
```

---

## 11. Constants

```typescript
const MAX_REASON_BYTES = 280;
const MAX_PENDING_DEFAULT = 20;
const MAX_INITIAL_PAYEES = 10;
const MAX_LEASHES_PER_OWNER = 100;
const MAX_PAYEES_PER_LEASH = 50;
const MAX_SCHEDULES_PER_LEASH = 50;
const MAX_BALANCE_CAP_WHOLE_TOKENS = 1_000_000;
const DAY_NS = 24 * 60 * 60 * 1_000_000_000; // 86,400,000,000,000,000
const MIN_CHECK_IN_INTERVAL_NS = DAY_NS; // 1 day
const MAX_CHECK_IN_INTERVAL_NS = 90 * DAY_NS; // 90 days
const DEFAULT_GRACE_PERIOD_NS = 7 * DAY_NS; // 7 days
const MAX_GRACE_PERIOD_NS = 30 * DAY_NS; // 30 days
const MIN_SCHEDULE_INTERVAL_NS = 60 * 60 * 1_000_000_000; // 1 hour
const MAX_WORKERS_PER_GROUP = 100;
const MAX_PAYROLL_GROUPS_PER_OWNER = 10;
```

---

## 12. Method → Frontend Mapping (what needs to be implemented)

| Contract Method | Frontend Component | Status |
|-----------------|-------------------|--------|
| `create_leash` | Create leash form | Implemented |
| `add_payee` / `remove_payee` | AllowlistView (LeashDetail) | Implemented |
| `set_payee_limits` | PayeeLimitsView (LeashDetail) | Implemented |
| `set_auto_approve_limit` | SettingsView (LeashDetail) | Implemented |
| `update_permissions` | SettingsView (LeashDetail) | Implemented |
| `set_agent` | Agent setup | Missing |
| `pause_leash` / `resume_leash` | LeashDetail | Implemented |
| `revoke` / `revoke_agent` | LeashDetail | Implemented |
| `withdraw_available` | Dashboard | Missing |
| `request_payment` | Agent dashboard | Missing |
| `approve_payment` / `reject_payment` | ApprovalsDashboard | Implemented |
| `expire_payment` | ApprovalsDashboard | Missing |
| `create_schedule` / `cancel_schedule` / `expire_schedule` | Recurring | Partially |
| `execute_schedule` | Keeper service | Documented in KEEPER_ARCHITECTURE.md |
| `create_payroll_group` | PayrollDashboard | Partially |
| `add_payroll_worker` / `remove_payroll_worker` | WorkersDashboard | Implemented |
| `update_payroll_worker_salary` | WorkersDashboard | Missing |
| `set_payroll_group_active` | WorkersDashboard | Implemented |
| `execute_payroll` | Keeper service | Missing |
| `retry_payroll_payments` | PayrollDashboard | Missing (empty array) |
| `enable_vigil` / `disable_vigil` | VigilDashboard | Implemented |
| `set_vigil_check_in_interval` / `set_vigil_grace_period` | VigilDashboard | Missing |
| `set_vigil_beneficiaries` | VigilDashboard | Missing (alert placeholder) |
| `vigil_check_in` | VigilDashboard | Partially |
| `check_vigil_overdue` | Keeper service | Missing |
| `claim_vigil_entitlement` | VigilDashboard | Missing (alert placeholder) |
| `mark_payroll_obligations_satisfied` | VigilDashboard | Missing |
| `ft_transfer_call` (funding) | Fund modal | Implemented via near-transactions.ts |
| `storage_deposit` / `storage_withdraw` / `storage_unregister` | Settings | Missing |

---

**Next step:** Proceed to Phase 3 — fix frontend call sites to match canonical types, remove alert() placeholders, and implement missing workflows.
