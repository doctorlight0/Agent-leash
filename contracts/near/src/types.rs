use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::AccountId;

pub const MAX_REASON_BYTES: usize = 280;
pub const MAX_PENDING_DEFAULT: u32 = 20;
pub const MAX_SCHEDULES_DEFAULT: u32 = 20;
pub const MAX_INITIAL_PAYEES: usize = 10;
pub const MAX_LEASHES_PER_OWNER: usize = 100;
pub const MAX_PAYEES_PER_LEASH: usize = 50;
pub const MAX_SCHEDULES_PER_LEASH: usize = 50;
pub const MAX_PAYMENT_HISTORY_SCAN: usize = 500;
/// Maximum whole-token custody exposure per leash. The base-unit ceiling is
/// derived from administrator-configured decimals for each allowlisted token.
pub const MAX_BALANCE_CAP_WHOLE_TOKENS: u128 = 1_000_000;
/// NEAR fungible tokens conventionally use at most 24 decimals. Bounding the
/// configured value also makes the base-unit ceiling calculation explicit and
/// overflow-free.
pub const MAX_TOKEN_DECIMALS: u8 = 24;
pub const DAY_NS: u64 = 24 * 60 * 60 * 1_000_000_000;
pub const MIN_SCHEDULE_INTERVAL_NS: u64 = 60 * 60 * 1_000_000_000;
/// Minimum check-in interval for inactivity protection: 1 day in nanoseconds.
pub const MIN_CHECK_IN_INTERVAL_NS: u64 = 24 * 60 * 60 * 1_000_000_000;
/// Maximum check-in interval: 90 days
pub const MAX_CHECK_IN_INTERVAL_NS: u64 = 90 * 24 * 60 * 60 * 1_000_000_000;
/// Default grace period for vigil: 7 days
pub const DEFAULT_GRACE_PERIOD_NS: u64 = 7 * 24 * 60 * 60 * 1_000_000_000;
/// Maximum grace period: 30 days
pub const MAX_GRACE_PERIOD_NS: u64 = 30 * 24 * 60 * 60 * 1_000_000_000;
/// Maximum workers per payroll group
pub const MAX_WORKERS_PER_GROUP: usize = 100;
/// Maximum payroll groups per owner
pub const MAX_PAYROLL_GROUPS_PER_OWNER: usize = 10;

pub fn balance_cap_ceiling_for_decimals(decimals: u8) -> Option<u128> {
    if decimals > MAX_TOKEN_DECIMALS {
        return None;
    }
    10u128
        .checked_pow(u32::from(decimals))
        .and_then(|scale| MAX_BALANCE_CAP_WHOLE_TOKENS.checked_mul(scale))
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct SupportedTokenConfig {
    pub token_contract: AccountId,
    pub decimals: u8,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct SupportedTokenConfigView {
    pub token_contract: AccountId,
    pub decimals: u8,
    pub max_balance_cap: U128,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub struct SpendEntry {
    pub ts_ns: u64,
    pub amount: u128,
    pub payment_id: u64,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub enum PaymentStatus {
    Requested,
    PendingApproval,
    Settling,
    Settled,
    Rejected,
    Failed,
    Cancelled,
    Expired,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub enum WithdrawalStatus {
    Settling,
    Settled,
    Failed,
}

/// Lifecycle of an owner revocation. A revocation is created in `Settling`
/// while the refund transfer is in flight and becomes terminal only after the
/// private callback resolves. This lets duplicate/stale callbacks be rejected
/// without re-mutating balances.
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub enum RevocationStatus {
    Settling,
    Settled,
    Failed,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub enum FundingMessage {
    Fund { leash_id: u64 },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct LeashView {
    pub leash_id: u64,
    pub owner_id: AccountId,
    pub agent_id: AccountId,
    pub token_contract: AccountId,
    pub balance_cap: U128,
    pub available_balance: U128,
    pub reserved_balance: U128,
    pub per_payment_limit: U128,
    pub rolling_limit: U128,
    pub rolling_window_ns: u64,
    pub cooldown_ns: u64,
    pub expires_at_ns: Option<u64>,
    pub approval_required: bool,
    pub paused: bool,
    pub revoked: bool,
    pub max_pending_payments: u32,
    pub pending_payment_count: u32,
    pub next_payment_id: u64,
    pub next_schedule_id: u64,
    pub next_withdrawal_id: u64,
    pub next_revocation_id: u64,
    pub check_in_interval_ns: u64,
    pub last_check_in_ns: u64,
    pub vigil_active: bool,
    pub monthly_cap: U128,
    pub period_start_ns: u64,
    pub monthly_spent: U128,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct PaymentView {
    pub leash_id: u64,
    pub payment_id: u64,
    pub requester: AccountId,
    pub recipient: AccountId,
    pub token_contract: AccountId,
    pub amount: U128,
    pub reason: Option<String>,
    pub status: PaymentStatus,
    pub created_at_ns: u64,
    pub approval_expires_at_ns: Option<u64>,
    pub reserved: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct WithdrawalView {
    pub leash_id: u64,
    pub withdrawal_id: u64,
    pub requester: AccountId,
    pub recipient: AccountId,
    pub token_contract: AccountId,
    pub amount: U128,
    pub status: WithdrawalStatus,
    pub created_at_ns: u64,
    pub reserved: bool,
}

/// Public view of a revocation. `reserved` is true only while the refund is
/// in flight; funds in that state are protected from agent payments and from
/// new withdrawals.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct RevocationView {
    pub leash_id: u64,
    pub revocation_id: u64,
    pub requester: AccountId,
    pub recipient: AccountId,
    pub token_contract: AccountId,
    pub amount: U128,
    pub status: RevocationStatus,
    pub created_at_ns: u64,
    pub updated_at_ns: u64,
    pub reserved: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct ScheduleView {
    pub leash_id: u64,
    pub schedule_id: u64,
    pub creator: AccountId,
    pub recipient: AccountId,
    pub amount: U128,
    pub execute_after_ns: u64,
    pub interval_ns: u64,
    pub next_due_ns: u64,
    pub expires_at_ns: Option<u64>,
    pub reason: Option<String>,
    pub active: bool,
    pub executed: bool,
    pub max_runs: u32,
    pub runs: u32,
}

impl ScheduleView {
    /// Returns true when this schedule is configured for recurring execution.
    /// This mirrors `Schedule::is_recurring` without requiring the full
    /// internal `Schedule` type.
    pub fn is_recurring(&self) -> bool {
        self.interval_ns > 0 && (self.max_runs == 0 || self.runs < self.max_runs)
    }
}

/// Payroll payment status
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub enum PayrollPaymentStatus {
    Pending,
    Settling,
    Settled,
    Failed,
    Cancelled,
}

/// Payroll view for frontend
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct PayrollGroupView {
    pub group_id: u64,
    pub owner_id: AccountId,
    pub name: String,
    pub token_contract: AccountId,
    pub payday: u8,
    pub first_payment_date_ns: u64,
    pub workers: Vec<WorkerView>,
    pub active: bool,
    pub reserved_balance: U128,
    pub next_payment_period_ns: u64,
    pub created_at_ns: u64,
    pub total_monthly_salary: U128,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct WorkerView {
    pub account_id: AccountId,
    pub salary: U128,
    pub token_contract: AccountId,
    pub active: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct PayrollPaymentView {
    pub group_id: u64,
    pub payment_id: u64,
    pub worker_id: u64,
    pub worker_account: AccountId,
    pub token_contract: AccountId,
    pub amount: U128,
    pub period_start_ns: u64,
    pub period_end_ns: u64,
    pub status: PayrollPaymentStatus,
    pub created_at_ns: u64,
    pub settled_at_ns: Option<u64>,
    pub reserved: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct VigilConfigView {
    pub enabled: bool,
    pub check_in_interval_ns: u64,
    pub grace_period_ns: u64,
    pub last_check_in_ns: u64,
    pub deadline_ns: u64,
    pub grace_deadline_ns: u64,
    pub beneficiaries: Vec<VigilBeneficiaryView>,
    pub settlement_triggered: bool,
    pub settlement_completed: bool,
    pub payroll_obligations_satisfied: bool,
    pub protected_balance: U128,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct VigilBeneficiaryView {
    pub account_id: AccountId,
    pub share_percent: u32,
    pub entitlement: U128,
    pub claimed: bool,
    pub claimed_amount: U128,
}
