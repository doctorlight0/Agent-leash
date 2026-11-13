use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::AccountId;

use crate::types::{PaymentStatus, PayrollPaymentStatus, RevocationStatus, WithdrawalStatus};

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Leash {
    pub leash_id: u64,
    pub owner_id: AccountId,
    pub agent_id: AccountId,
    pub token_contract: AccountId,
    /// Immutable per-leash ceiling on the total tokens the leash may hold at
    /// any moment (`available + reserved`). Set once at creation and never
    /// changed. This is the core custody control: it caps what is exposed at
    /// one time regardless of how many times the owner tops up.
    pub balance_cap: u128,
    pub available_balance: u128,
    pub reserved_balance: u128,
    pub per_payment_limit: u128,
    pub rolling_limit: u128,
    pub rolling_window_ns: u64,
    pub cooldown_ns: u64,
    pub expires_at_ns: Option<u64>,
    pub approval_required: bool,
    /// Owner-configured ceiling for immediate payments to payees that are not
    /// on the allowlist. Zero disables auto-approval, in which case every
    /// payment must be to an allowlisted payee (or queued for owner approval
    /// when approval is required). Auto-approval never bypasses balance,
    /// expiry, pause, revocation, the leash per-payment limit, the rolling
    /// cap, or the payee's own limits.
    pub auto_approve_limit: u128,
    pub paused: bool,
    pub revoked: bool,
    pub max_pending_payments: u32,
    pub pending_payment_count: u32,
    pub next_payment_id: u64,
    pub next_schedule_id: u64,
    pub last_payment_at_ns: u64,
    /// Inactivity protection: interval (ns) after which the leash is auto-revoked
    /// if no payment or check-in occurs. Set to 0 to disable.
    pub check_in_interval_ns: u64,
    /// Timestamp of the last payment or check-in, used with check_in_interval_ns
    /// to detect inactivity. Reset on every successful payment or schedule execution.
    pub last_check_in_ns: u64,
    /// When true, the leash is under inactivity protection and will be auto-revoked
    /// if check_in_interval_ns elapses without a payment/check-in.
    pub vigil_active: bool,
    /// Monthly spending cap for payroll. Zero means no monthly cap.
    pub monthly_cap: u128,
    /// Start of the current monthly period (nanoseconds). Used to detect month
    /// boundary crossings and reset monthly_spent.
    pub period_start_ns: u64,
    /// USDC amount spent in the current monthly period. Reset when period_start_ns
    /// advances to a new month.
    pub monthly_spent: u128,
    pub next_withdrawal_id: u64,
    /// Monotonic counter for owner revocations. Revocation IDs are unique per
    /// leash and never reused, which is what lets the private callback reject
    /// duplicate/stale replays safely.
    pub next_revocation_id: u64,
    /// Payroll configuration
    pub payroll_groups: Vec<PayrollGroup>,
    pub next_payroll_group_id: u64,
    /// Vigil inactivity protection configuration
    pub vigil_config: VigilConfig,
}

impl Leash {
    pub fn is_expired(&self, now_ns: u64) -> bool {
        self.expires_at_ns.is_some_and(|exp| now_ns >= exp)
    }

    pub fn is_overdue(&self, now_ns: u64) -> bool {
        if !self.vigil_active || self.check_in_interval_ns == 0 {
            return false;
        }
        let last = self.last_check_in_ns;
        now_ns > last.saturating_add(self.check_in_interval_ns)
    }

    pub fn is_in_grace_period(&self, now_ns: u64, grace_period_ns: u64) -> bool {
        if !self.vigil_active || self.check_in_interval_ns == 0 {
            return false;
        }
        let deadline = self
            .last_check_in_ns
            .saturating_add(self.check_in_interval_ns);
        let grace_deadline = deadline.saturating_add(grace_period_ns);
        now_ns > deadline && now_ns <= grace_deadline
    }

    pub fn grace_period_expired(&self, now_ns: u64, grace_period_ns: u64) -> bool {
        if !self.vigil_active || self.check_in_interval_ns == 0 {
            return false;
        }
        let deadline = self
            .last_check_in_ns
            .saturating_add(self.check_in_interval_ns);
        let grace_deadline = deadline.saturating_add(grace_period_ns);
        now_ns > grace_deadline
    }

    pub fn calculate_monthly_spent_reset(&mut self, now_ns: u64) {
        if self.period_start_ns == 0 {
            self.period_start_ns = now_ns;
            self.monthly_spent = 0;
            return;
        }
        // Check if we've crossed a month boundary (approximately 30 days)
        const MONTH_NS: u64 = 30 * 24 * 60 * 60 * 1_000_000_000;
        if now_ns >= self.period_start_ns.saturating_add(MONTH_NS) {
            // Advance to the next month boundary
            let elapsed = now_ns.saturating_sub(self.period_start_ns);
            let months_passed = elapsed / MONTH_NS;
            self.period_start_ns = self
                .period_start_ns
                .saturating_add(months_passed * MONTH_NS);
            self.monthly_spent = 0;
        }
    }
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
pub struct PayeeConfig {
    pub allowed: bool,
    pub added_at_ns: u64,
    /// Zero means "use the leash default". A nonzero override can only lower
    /// the leash-wide per-payment limit.
    pub per_payment_limit: u128,
    /// Zero disables the payee cap. When nonzero it is a fixed 24-hour
    /// sub-limit that starts at the payee's first payment in the period and is
    /// reset by a limit change or by a new period elapsing. It is subordinate
    /// to the leash-wide rolling cap.
    pub daily_cap: u128,
    /// Tokens spent by the agent in the current payee period. Only immediate
    /// agent payments count; approvals and schedules ignore it.
    pub spent: u128,
    /// Start of the current fixed 24-hour period. Zero means no period has
    /// started yet.
    pub period_start: u64,
}

impl PayeeConfig {
    /// Returns the effective per-payment limit for this payee, falling back to
    /// the leash default when no override is set.
    pub fn effective_per_payment_limit(&self, default: u128) -> u128 {
        if self.per_payment_limit != 0 {
            self.per_payment_limit.min(default)
        } else {
            default
        }
    }

    /// Returns true when the fixed payee daily cap is enabled.
    pub fn daily_cap_active(&self) -> bool {
        self.daily_cap != 0
    }
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub struct PaymentRecord {
    pub leash_id: u64,
    pub payment_id: u64,
    pub requester: AccountId,
    pub recipient: AccountId,
    pub token_contract: AccountId,
    pub amount: u128,
    pub reason: Option<String>,
    pub status: PaymentStatus,
    pub created_at_ns: u64,
    pub updated_at_ns: u64,
    pub approval_expires_at_ns: Option<u64>,
    pub reserved: bool,
    /// Payee daily period charged for this payment, if enabled. A failed
    /// transfer releases the charge only if that period is still current.
    pub payee_daily_period_start: Option<u64>,
}

impl PaymentRecord {
    pub fn is_terminal(&self) -> bool {
        matches!(
            self.status,
            PaymentStatus::Settled
                | PaymentStatus::Rejected
                | PaymentStatus::Failed
                | PaymentStatus::Cancelled
                | PaymentStatus::Expired
        )
    }
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub struct WithdrawalRecord {
    pub leash_id: u64,
    pub withdrawal_id: u64,
    pub requester: AccountId,
    pub recipient: AccountId,
    pub token_contract: AccountId,
    pub amount: u128,
    pub status: WithdrawalStatus,
    pub created_at_ns: u64,
    pub updated_at_ns: u64,
    pub reserved: bool,
}

impl WithdrawalRecord {
    pub fn is_terminal(&self) -> bool {
        matches!(
            self.status,
            WithdrawalStatus::Settled | WithdrawalStatus::Failed
        )
    }
}

/// A single owner revocation. Mirrors `WithdrawalRecord` because both are
/// callback-finalized owner cash-outs, but revocation additionally flips
/// `leash.revoked = true` so the agent is stopped immediately, before the
/// refund transfer resolves.
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub struct RevocationRecord {
    pub leash_id: u64,
    pub revocation_id: u64,
    pub requester: AccountId,
    pub recipient: AccountId,
    pub token_contract: AccountId,
    pub amount: u128,
    pub status: RevocationStatus,
    pub created_at_ns: u64,
    pub updated_at_ns: u64,
    pub reserved: bool,
}

impl RevocationRecord {
    pub fn is_terminal(&self) -> bool {
        matches!(
            self.status,
            RevocationStatus::Settled | RevocationStatus::Failed
        )
    }
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub struct Schedule {
    pub execute_after_ns: u64,
    pub leash_id: u64,
    pub schedule_id: u64,
    pub creator: AccountId,
    pub recipient: AccountId,
    pub amount: u128,
    /// Interval between runs, in nanoseconds. Zero means one-shot.
    pub interval_ns: u64,
    /// Timestamp of the next allowed execution. Initially the requested
    /// `execute_after_ns`; advanced by `interval_ns` after each run.
    pub next_due_ns: u64,
    /// Expiry of the schedule as a whole. None means it never expires.
    pub expires_at_ns: Option<u64>,
    pub reason: Option<String>,
    /// True while the schedule is still pending execution. False once it has
    /// been cancelled or has reached its run limit.
    pub active: bool,
    /// True once the schedule has completed its final run (either by reaching
    /// `max_runs` or by cancellation). For one-shot schedules this is set on
    /// the single execution.
    pub executed: bool,
    /// Maximum number of runs. Zero means unlimited.
    pub max_runs: u32,
    /// Number of occurrences submitted for settlement. A failed transfer still
    /// consumes an occurrence so its asynchronous retry cannot pay it twice.
    pub runs: u32,
    pub created_at_ns: u64,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
pub struct StorageAccount {
    /// Total registered storage deposit, including a refund currently in flight.
    pub total: u128,
    /// Storage usage attributed to this account, measured from NEAR storage deltas.
    pub used_bytes: u64,
    /// Monotonic storage refund ID.
    pub next_refund_id: u64,
    /// At most one refund may be pending per account; this prevents duplicate
    /// or concurrent callbacks from releasing the same NEAR twice.
    pub pending_refund_id: u64,
    pub pending_refund_amount: u128,
    pub unregistering: bool,
}

impl Schedule {
    /// Returns true when the schedule is recurring (interval > 0 and not yet
    /// at its run limit).
    pub fn is_recurring(&self) -> bool {
        self.interval_ns > 0 && (self.max_runs == 0 || self.runs < self.max_runs)
    }

    /// Returns true when the schedule is due for execution now.
    pub fn is_due(&self, now_ns: u64) -> bool {
        self.active && !self.executed && now_ns >= self.next_due_ns
    }

    /// Returns true when the schedule has expired as a whole.
    pub fn is_expired(&self, now_ns: u64) -> bool {
        self.expires_at_ns.is_some_and(|exp| now_ns >= exp)
    }
}

/// Payroll worker configuration
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Worker {
    pub worker_id: u64,
    pub account_id: AccountId,
    pub salary: u128,
    pub token_contract: AccountId,
    pub active: bool,
}

/// Payroll group configuration
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
pub struct PayrollGroup {
    pub group_id: u64,
    pub owner_id: AccountId,
    pub name: String,
    pub token_contract: AccountId,
    /// Day of month for payday (1-28, 31 = end of month)
    pub payday: u8,
    /// First payment date in nanoseconds
    pub first_payment_date_ns: u64,
    pub workers: Vec<Worker>,
    pub active: bool,
    /// Balance reserved for upcoming payroll
    pub reserved_balance: u128,
    /// Next payment period start in nanoseconds
    pub next_payment_period_ns: u64,
    pub created_at_ns: u64,
    pub next_worker_id: u64,
    pub next_payment_id: u64,
}

/// Payroll payment record
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub struct PayrollPaymentRecord {
    pub group_id: u64,
    pub payment_id: u64,
    pub worker_id: u64,
    pub worker_account: AccountId,
    pub token_contract: AccountId,
    pub amount: u128,
    pub period_start_ns: u64,
    pub period_end_ns: u64,
    pub status: PayrollPaymentStatus,
    pub created_at_ns: u64,
    pub settled_at_ns: Option<u64>,
    pub reserved: bool,
}

impl PayrollPaymentRecord {
    pub fn is_terminal(&self) -> bool {
        matches!(
            self.status,
            PayrollPaymentStatus::Settled
                | PayrollPaymentStatus::Failed
                | PayrollPaymentStatus::Cancelled
        )
    }
}

/// Vigil beneficiary configuration
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
pub struct VigilBeneficiary {
    pub account_id: AccountId,
    pub share_percent: u32,
}

/// Vigil inactivity protection configuration
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
pub struct VigilConfig {
    pub enabled: bool,
    pub check_in_interval_ns: u64,
    pub grace_period_ns: u64,
    pub last_check_in_ns: u64,
    pub beneficiaries: Vec<VigilBeneficiary>,
    pub total_shares: u32,
    pub settlement_triggered: bool,
    pub settlement_completed: bool,
    pub payroll_obligations_satisfied: bool,
    /// Snapshot of balance at settlement trigger for distribution
    pub distributable_snapshot: u128,
    /// Per-beneficiary entitlements computed at trigger
    pub entitlements: Vec<u128>,
    /// Claimed status per beneficiary
    pub claimed: Vec<bool>,
    pub claimed_amount: Vec<u128>,
    /// Pending transfer tracking
    pub pending_transfer_ids: Vec<u64>,
    pub next_transfer_id: u64,
}
