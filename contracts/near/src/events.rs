use near_sdk::serde::Serialize;
use near_sdk::serde_json;
use near_sdk::{env, AccountId};

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde", tag = "event", content = "data")]
#[serde(rename_all = "snake_case")]
pub enum AgentLeashEvent<'a> {
    LeashCreated {
        leash_id: u64,
        owner_id: &'a AccountId,
        agent_id: &'a AccountId,
        token_contract: &'a AccountId,
    },
    Funded {
        leash_id: u64,
        token_contract: &'a AccountId,
        sender_id: &'a AccountId,
        amount: &'a str,
        new_balance: &'a str,
    },
    PaymentRequested {
        leash_id: u64,
        payment_id: u64,
        recipient: &'a AccountId,
        amount: &'a str,
        status: &'a str,
    },
    PaymentApproved {
        leash_id: u64,
        payment_id: u64,
        approver: &'a AccountId,
    },
    PaymentRejected {
        leash_id: u64,
        payment_id: u64,
        approver: &'a AccountId,
    },
    PaymentSettled {
        leash_id: u64,
        payment_id: u64,
        recipient: &'a AccountId,
        amount: &'a str,
    },
    PaymentFailed {
        leash_id: u64,
        payment_id: u64,
        reason: &'a str,
    },
    WithdrawalRequested {
        leash_id: u64,
        withdrawal_id: u64,
        recipient: &'a AccountId,
        amount: &'a str,
    },
    WithdrawalSettled {
        leash_id: u64,
        withdrawal_id: u64,
        recipient: &'a AccountId,
        amount: &'a str,
    },
    WithdrawalFailed {
        leash_id: u64,
        withdrawal_id: u64,
        reason: &'a str,
    },
    LeashPaused {
        leash_id: u64,
    },
    LeashResumed {
        leash_id: u64,
    },
    AgentRevoked {
        leash_id: u64,
    },
    PayeeAdded {
        leash_id: u64,
        payee: &'a AccountId,
    },
    PayeeRemoved {
        leash_id: u64,
        payee: &'a AccountId,
    },
    /// Emitted when the owner sets per-payee per-payment and daily overrides.
    /// Zero per-payment limit reverts to the leash default; zero daily cap
    /// disables the payee cap. The spend period is reset on every call.
    PayeeLimitsSet {
        leash_id: u64,
        payee: &'a AccountId,
        per_payment_limit: &'a str,
        daily_cap: &'a str,
    },
    /// Emitted when the owner changes the auto-approval ceiling for
    /// non-allowlisted payees. Zero disables auto-approval.
    AutoApproveLimitSet {
        leash_id: u64,
        amount: &'a str,
    },
    /// Emitted when the owner updates leash-wide limits and cooldown.
    LimitsUpdated {
        leash_id: u64,
        per_payment_limit: &'a str,
        rolling_limit: &'a str,
        cooldown_ns: &'a str,
    },
    /// Emitted when the owner reassigns the agent.
    AgentSet {
        leash_id: u64,
        agent_id: &'a AccountId,
    },
    /// Emitted when the owner changes the agent on a leash.
    PermissionsUpdated {
        leash_id: u64,
        approval_required: bool,
        max_pending_payments: u32,
    },
    /// Emitted when an owner revokes a leash and moves `available_balance`
    /// into a protected reservation while the refund transfer is in flight.
    /// `reserved` funds are not spendable by the agent and cannot be withdrawn
    /// until the private `on_revocation_settled` callback resolves.
    RevocationRequested {
        leash_id: u64,
        revocation_id: u64,
        recipient: &'a AccountId,
        amount: &'a str,
    },
    RevocationSettled {
        leash_id: u64,
        revocation_id: u64,
        recipient: &'a AccountId,
        amount: &'a str,
    },
    RevocationFailed {
        leash_id: u64,
        revocation_id: u64,
        reason: &'a str,
    },
    ScheduleCreated {
        leash_id: u64,
        schedule_id: u64,
        execute_after_ns: u64,
        interval_ns: u64,
        max_runs: u32,
    },
    ScheduleExecutionRequested {
        leash_id: u64,
        schedule_id: u64,
        payment_id: u64,
        run: u32,
    },
    ScheduleCancelled {
        leash_id: u64,
        schedule_id: u64,
    },
    ScheduleExpired {
        leash_id: u64,
        schedule_id: u64,
    },
    // Payroll events
    PayrollGroupCreated {
        leash_id: u64,
        group_id: u64,
        name: &'a str,
        token_contract: &'a AccountId,
        payday: u8,
        first_payment_date_ns: u64,
    },
    PayrollWorkerAdded {
        leash_id: u64,
        group_id: u64,
        worker_id: u64,
        worker_account: &'a AccountId,
        salary: &'a str,
    },
    PayrollWorkerRemoved {
        leash_id: u64,
        group_id: u64,
        worker_id: u64,
    },
    PayrollWorkerSalaryUpdated {
        leash_id: u64,
        group_id: u64,
        worker_id: u64,
        salary: &'a str,
    },
    PayrollGroupStatusChanged {
        leash_id: u64,
        group_id: u64,
        active: bool,
    },
    PayrollExecuted {
        leash_id: u64,
        group_id: u64,
        period_start_ns: u64,
        period_end_ns: u64,
        total_amount: &'a str,
        worker_count: u32,
    },
    PayrollPaymentSettled {
        leash_id: u64,
        group_id: u64,
        payment_id: u64,
        worker_account: &'a AccountId,
        amount: &'a str,
    },
    PayrollPaymentFailed {
        leash_id: u64,
        group_id: u64,
        payment_id: u64,
        worker_account: &'a AccountId,
        reason: &'a str,
    },
    // Vigil events
    VigilEnabled {
        leash_id: u64,
        check_in_interval_ns: u64,
        grace_period_ns: u64,
    },
    VigilDisabled {
        leash_id: u64,
    },
    VigilIntervalUpdated {
        leash_id: u64,
        check_in_interval_ns: u64,
    },
    VigilGracePeriodUpdated {
        leash_id: u64,
        grace_period_ns: u64,
    },
    VigilBeneficiariesSet {
        leash_id: u64,
        beneficiary_count: u32,
    },
    VigilCheckIn {
        leash_id: u64,
        timestamp_ns: u64,
    },
    VigilSettlementTriggered {
        leash_id: u64,
        protected_balance: &'a str,
        payroll_obligations: &'a str,
        distributable_snapshot: &'a str,
        beneficiary_count: u32,
    },
    VigilPayrollObligationsSatisfied {
        leash_id: u64,
    },
    VigilClaimSettled {
        leash_id: u64,
        beneficiary: &'a AccountId,
        amount: &'a str,
    },
    VigilClaimFailed {
        leash_id: u64,
        beneficiary: &'a AccountId,
        reason: &'a str,
    },
    VigilSettlementCompleted {
        leash_id: u64,
    },
}

impl AgentLeashEvent<'_> {
    pub fn emit(&self) {
        env::log_str(&format!(
            "EVENT_JSON:{}",
            serde_json::to_string(self).expect("event json")
        ));
    }
}
