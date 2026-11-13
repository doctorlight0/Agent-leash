/// Structured, machine-readable contract errors.
///
/// Every public-facing failure path panics with a `ContractError` variant so
/// callers (wallets, indexers, the frontend) can classify rejections without
/// parsing free-form strings. The variant name is the stable contract surface;
/// the human-readable `Display` message is a convenience for logs.
///
/// Variants are grouped by domain so a migration or audit can diff them:
///   * config     - leash creation / permission updates
///   * funding    - NEP-141 deposits
///   * payment    - agent requests, limits, reservations
///   * approval   - owner consent and expiry
///   * schedule   - recurring payments
///   * custody    - revocation, withdrawal, refunds
///   * storage    - NEP-145 deposits and refunds
///   * access     - authorization failures
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContractError {
    // ---- config ----
    UnsupportedToken,
    UnknownTokenDecimals,
    InvalidConfig,
    InvalidAmount,
    InvalidReason,
    TooManyLeashes,
    TooManyPayees,
    TooManyPending,
    TooManySchedules,
    BalanceCapExceeded,
    OverPerPaymentLimit,
    OverRollingLimit,
    OverPayeePerPaymentLimit,
    OverPayeeDailyCap,
    CooldownActive,
    InsufficientBalance,
    InsufficientAvailableBalance,
    ApprovalRequired,
    AlreadyTerminal,
    StaleCallback,
    DuplicateCallback,
    // ---- funding ----
    FundingUnauthorized,
    FundingRevoked,
    FundingCapExceeded,
    FundingTokenMismatch,
    // ---- payment ----
    LeashNotFound,
    PaymentNotFound,
    RecipientNotAllowed,
    Paused,
    Revoked,
    Expired,
    NotAgent,
    NotOwner,
    // ---- approval ----
    PaymentNotPendingApproval,
    ApprovalExpired,
    // ---- schedule ----
    ScheduleNotFound,
    ScheduleNotActive,
    ScheduleNotDue,
    ScheduleExpired,
    ScheduleAlreadyExecuted,
    // ---- custody ----
    RevocationNotFound,
    RevocationAlreadyTerminal,
    RevocationNotOwner,
    WithdrawalNotFound,
    WithdrawalNotOwner,
    // ---- storage ----
    StorageDepositRequired,
    StorageDepositTooSmall,
    StorageRefundUnavailable,
    // ---- access ----
    Unauthorized,
}

impl ContractError {
    /// Stable, snake_case variant name. Used by the frontend and indexers.
    pub fn code(&self) -> &'static str {
        match self {
            ContractError::UnsupportedToken => "unsupported_token",
            ContractError::UnknownTokenDecimals => "unknown_token_decimals",
            ContractError::InvalidConfig => "invalid_config",
            ContractError::InvalidAmount => "invalid_amount",
            ContractError::InvalidReason => "invalid_reason",
            ContractError::TooManyLeashes => "too_many_leashes",
            ContractError::TooManyPayees => "too_many_payees",
            ContractError::TooManyPending => "too_many_pending",
            ContractError::TooManySchedules => "too_many_schedules",
            ContractError::BalanceCapExceeded => "balance_cap_exceeded",
            ContractError::OverPerPaymentLimit => "over_per_payment_limit",
            ContractError::OverRollingLimit => "over_rolling_limit",
            ContractError::OverPayeePerPaymentLimit => "over_payee_per_payment_limit",
            ContractError::OverPayeeDailyCap => "over_payee_daily_cap",
            ContractError::CooldownActive => "cooldown_active",
            ContractError::InsufficientBalance => "insufficient_balance",
            ContractError::InsufficientAvailableBalance => "insufficient_available_balance",
            ContractError::ApprovalRequired => "approval_required",
            ContractError::AlreadyTerminal => "already_terminal",
            ContractError::StaleCallback => "stale_callback",
            ContractError::DuplicateCallback => "duplicate_callback",
            ContractError::FundingUnauthorized => "funding_unauthorized",
            ContractError::FundingRevoked => "funding_revoked",
            ContractError::FundingCapExceeded => "funding_cap_exceeded",
            ContractError::FundingTokenMismatch => "funding_token_mismatch",
            ContractError::LeashNotFound => "leash_not_found",
            ContractError::PaymentNotFound => "payment_not_found",
            ContractError::RecipientNotAllowed => "recipient_not_allowed",
            ContractError::Paused => "paused",
            ContractError::Revoked => "revoked",
            ContractError::Expired => "expired",
            ContractError::NotAgent => "not_agent",
            ContractError::NotOwner => "not_owner",
            ContractError::PaymentNotPendingApproval => "payment_not_pending_approval",
            ContractError::ApprovalExpired => "approval_expired",
            ContractError::ScheduleNotFound => "schedule_not_found",
            ContractError::ScheduleNotActive => "schedule_not_active",
            ContractError::ScheduleNotDue => "schedule_not_due",
            ContractError::ScheduleExpired => "schedule_expired",
            ContractError::ScheduleAlreadyExecuted => "schedule_already_executed",
            ContractError::RevocationNotFound => "revocation_not_found",
            ContractError::RevocationAlreadyTerminal => "revocation_already_terminal",
            ContractError::RevocationNotOwner => "revocation_not_owner",
            ContractError::WithdrawalNotFound => "withdrawal_not_found",
            ContractError::WithdrawalNotOwner => "withdrawal_not_owner",
            ContractError::StorageDepositRequired => "storage_deposit_required",
            ContractError::StorageDepositTooSmall => "storage_deposit_too_small",
            ContractError::StorageRefundUnavailable => "storage_refund_unavailable",
            ContractError::Unauthorized => "unauthorized",
        }
    }
}

impl std::fmt::Display for ContractError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.code())
    }
}

impl std::error::Error for ContractError {}

impl ContractError {
    /// Panic with this structured error. Prefer over `env::panic_str` so the
    /// variant name is the single source of truth for the rejection reason.
    pub fn panic(self) -> ! {
        near_sdk::env::panic_str(&self.to_string());
    }
}
