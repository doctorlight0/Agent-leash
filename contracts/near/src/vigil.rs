use near_contract_standards::fungible_token::core::ext_ft_core;
use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, Gas, NearToken, PromiseOrValue};

use crate::events::AgentLeashEvent;
use crate::state::{Leash, VigilBeneficiary, VigilConfig};
use crate::types::{
    PaymentStatus, PayrollPaymentStatus, DEFAULT_GRACE_PERIOD_NS, MAX_CHECK_IN_INTERVAL_NS,
    MAX_GRACE_PERIOD_NS, MIN_CHECK_IN_INTERVAL_NS,
};
use crate::{AgentLeash, AgentLeashExt};

pub const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(15);
pub const GAS_FOR_VIGIL_CALLBACK: Gas = Gas::from_tgas(15);

#[near]
impl AgentLeash {
    /// Enable vigil inactivity protection for a leash
    pub fn enable_vigil(
        &mut self,
        leash_id: u64,
        check_in_interval_ns: u64,
        grace_period_ns: Option<u64>,
    ) {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(!leash.revoked, "Leash revoked");
        assert!(!leash.is_expired(Self::now_ns()), "Leash expired");

        // Validate check-in interval
        assert!(
            check_in_interval_ns >= MIN_CHECK_IN_INTERVAL_NS,
            "Check-in interval must be at least 1 day"
        );
        assert!(
            check_in_interval_ns <= MAX_CHECK_IN_INTERVAL_NS,
            "Check-in interval cannot exceed 90 days"
        );
        assert!(
            Self::now_ns().checked_add(check_in_interval_ns).is_some(),
            "Check-in interval causes overflow"
        );

        // Validate grace period
        let grace = grace_period_ns.unwrap_or(DEFAULT_GRACE_PERIOD_NS);
        assert!(grace > 0, "Grace period must be positive");
        assert!(
            grace <= MAX_GRACE_PERIOD_NS,
            "Grace period cannot exceed 30 days"
        );
        assert!(
            check_in_interval_ns.checked_add(grace).is_some(),
            "Combined interval causes overflow"
        );

        let storage_before = env::storage_usage();
        let now = Self::now_ns();

        leash.vigil_active = true;
        leash.check_in_interval_ns = check_in_interval_ns;
        leash.last_check_in_ns = now;

        // Initialize vigil config
        leash.vigil_config = VigilConfig {
            enabled: true,
            check_in_interval_ns,
            grace_period_ns: grace,
            last_check_in_ns: now,
            beneficiaries: Vec::new(),
            total_shares: 0,
            settlement_triggered: false,
            settlement_completed: false,
            payroll_obligations_satisfied: false,
            distributable_snapshot: 0,
            entitlements: Vec::new(),
            claimed: Vec::new(),
            claimed_amount: Vec::new(),
            pending_transfer_ids: Vec::new(),
            next_transfer_id: 1,
        };

        self.save_leash(&leash);
        self.record_storage_usage(&leash.owner_id, storage_before);

        AgentLeashEvent::VigilEnabled {
            leash_id,
            check_in_interval_ns,
            grace_period_ns: grace,
        }
        .emit();
    }

    /// Update vigil check-in interval
    pub fn set_vigil_check_in_interval(&mut self, leash_id: u64, check_in_interval_ns: u64) {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(!leash.revoked, "Leash revoked");
        assert!(!leash.is_expired(Self::now_ns()), "Leash expired");
        assert!(leash.vigil_active, "Vigil not enabled");
        assert!(
            !leash.vigil_config.settlement_triggered,
            "Cannot change interval after settlement triggered"
        );

        assert!(
            check_in_interval_ns >= MIN_CHECK_IN_INTERVAL_NS,
            "Check-in interval must be at least 1 day"
        );
        assert!(
            check_in_interval_ns <= MAX_CHECK_IN_INTERVAL_NS,
            "Check-in interval cannot exceed 90 days"
        );
        assert!(
            Self::now_ns().checked_add(check_in_interval_ns).is_some(),
            "Check-in interval causes overflow"
        );

        let storage_before = env::storage_usage();

        leash.check_in_interval_ns = check_in_interval_ns;
        leash.vigil_config.check_in_interval_ns = check_in_interval_ns;

        self.save_leash(&leash);
        self.record_storage_usage(&leash.owner_id, storage_before);

        AgentLeashEvent::VigilIntervalUpdated {
            leash_id,
            check_in_interval_ns,
        }
        .emit();
    }

    /// Update vigil grace period
    pub fn set_vigil_grace_period(&mut self, leash_id: u64, grace_period_ns: u64) {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(!leash.revoked, "Leash revoked");
        assert!(!leash.is_expired(Self::now_ns()), "Leash expired");
        assert!(leash.vigil_active, "Vigil not enabled");
        assert!(
            !leash.vigil_config.settlement_triggered,
            "Cannot change grace period after settlement triggered"
        );

        assert!(grace_period_ns > 0, "Grace period must be positive");
        assert!(
            grace_period_ns <= MAX_GRACE_PERIOD_NS,
            "Grace period cannot exceed 30 days"
        );

        let storage_before = env::storage_usage();

        leash.vigil_config.grace_period_ns = grace_period_ns;

        self.save_leash(&leash);
        self.record_storage_usage(&leash.owner_id, storage_before);

        AgentLeashEvent::VigilGracePeriodUpdated {
            leash_id,
            grace_period_ns,
        }
        .emit();
    }

    /// Set vigil beneficiaries
    pub fn set_vigil_beneficiaries(&mut self, leash_id: u64, beneficiaries: Vec<(AccountId, u32)>) {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(!leash.revoked, "Leash revoked");
        assert!(!leash.is_expired(Self::now_ns()), "Leash expired");
        assert!(leash.vigil_active, "Vigil not enabled");
        assert!(
            !leash.vigil_config.settlement_triggered,
            "Cannot change beneficiaries after settlement triggered"
        );

        assert!(
            !beneficiaries.is_empty(),
            "At least one beneficiary required"
        );
        assert!(beneficiaries.len() <= 100, "Too many beneficiaries");

        let mut total_shares: u32 = 0;
        let mut seen = std::collections::HashSet::new();
        let mut vigil_beneficiaries = Vec::new();

        for (account_id, share) in beneficiaries {
            assert!(share > 0 && share <= 100, "Invalid share percentage");
            assert!(seen.insert(account_id.clone()), "Duplicate beneficiary");
            total_shares = total_shares.checked_add(share).expect("Share overflow");
            assert!(total_shares <= 100, "Total shares cannot exceed 100%");
            vigil_beneficiaries.push(VigilBeneficiary {
                account_id,
                share_percent: share,
            });
        }

        assert!(total_shares == 100, "Total shares must equal 100%");

        let storage_before = env::storage_usage();

        leash.vigil_config.beneficiaries = vigil_beneficiaries;
        leash.vigil_config.total_shares = total_shares;

        self.save_leash(&leash);
        self.record_storage_usage(&leash.owner_id, storage_before);

        AgentLeashEvent::VigilBeneficiariesSet {
            leash_id,
            beneficiary_count: leash.vigil_config.beneficiaries.len() as u32,
        }
        .emit();
    }

    /// Owner check-in to reset the inactivity timer
    pub fn vigil_check_in(&mut self, leash_id: u64) {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(leash.vigil_active, "Vigil not enabled");
        assert!(!leash.revoked, "Leash revoked");
        assert!(!leash.is_expired(Self::now_ns()), "Leash expired");
        assert!(
            !leash.vigil_config.settlement_triggered,
            "Settlement already triggered"
        );

        let now = Self::now_ns();
        let deadline = leash
            .last_check_in_ns
            .saturating_add(leash.check_in_interval_ns);
        let grace_deadline = deadline.saturating_add(leash.vigil_config.grace_period_ns);

        // Can check in anytime before grace period expires
        assert!(
            now <= grace_deadline,
            "Grace period expired, settlement triggered"
        );

        leash.last_check_in_ns = now;
        leash.vigil_config.last_check_in_ns = now;

        self.save_leash(&leash);

        AgentLeashEvent::VigilCheckIn {
            leash_id,
            timestamp_ns: now,
        }
        .emit();
    }

    /// Check if vigil is overdue and trigger settlement (callable by anyone)
    pub fn check_vigil_overdue(&mut self, leash_id: u64) -> PromiseOrValue<String> {
        let leash = self.get_leash_or_panic(leash_id);
        let now = Self::now_ns();

        if !leash.vigil_active || leash.check_in_interval_ns == 0 {
            return PromiseOrValue::Value("vigil_not_active".to_string());
        }

        if leash.vigil_config.settlement_triggered {
            return PromiseOrValue::Value("already_triggered".to_string());
        }

        let deadline = leash
            .last_check_in_ns
            .saturating_add(leash.check_in_interval_ns);
        let grace_deadline = deadline.saturating_add(leash.vigil_config.grace_period_ns);

        // Not yet in grace period
        if now <= deadline {
            return PromiseOrValue::Value("not_overdue".to_string());
        }

        // In grace period but not expired
        if now <= grace_deadline {
            return PromiseOrValue::Value("in_grace_period".to_string());
        }

        // Grace period expired - trigger settlement
        if leash.vigil_config.beneficiaries.is_empty() {
            return PromiseOrValue::Value("beneficiaries_not_configured".to_string());
        }
        self.trigger_vigil_settlement_internal(leash_id, leash, now)
    }

    fn trigger_vigil_settlement_internal(
        &mut self,
        leash_id: u64,
        mut leash: Leash,
        _now: u64,
    ) -> PromiseOrValue<String> {
        let protected_balance = leash
            .available_balance
            .checked_add(leash.reserved_balance)
            .expect("protected balance overflow");
        let payroll_obligations = self.calculate_payroll_obligations(leash_id);

        // Phase one only freezes the leash and starts/restarts legitimate
        // payroll obligations. Beneficiary entitlements are calculated later,
        // after every asynchronous liability has reached a terminal state.
        leash.vigil_config.settlement_triggered = true;
        leash.revoked = true;
        leash.vigil_config.payroll_obligations_satisfied = false;
        leash.vigil_config.distributable_snapshot = 0;
        leash.vigil_config.entitlements.clear();
        leash.vigil_config.claimed.clear();
        leash.vigil_config.claimed_amount.clear();
        leash.vigil_config.pending_transfer_ids.clear();
        self.vigil_entitlements.remove(&leash_id);
        self.vigil_claims.remove(&leash_id);
        self.vigil_claimed_amount.remove(&leash_id);

        self.save_leash(&leash);

        AgentLeashEvent::VigilSettlementTriggered {
            leash_id,
            protected_balance: &protected_balance.to_string(),
            payroll_obligations: &payroll_obligations.to_string(),
            distributable_snapshot: "0",
            beneficiary_count: leash.vigil_config.beneficiaries.len() as u32,
        }
        .emit();

        // Pending approvals never became transfers and are cancelled. Existing
        // in-flight transfers are not restarted because NEAR receipts are not
        // atomic and a duplicate promise could pay twice.
        self.cancel_pending_vigil_payments(leash_id);
        self.retry_failed_payroll_obligations(leash_id);
        let _ = self.try_finalize_vigil_settlement(leash_id);

        PromiseOrValue::Value("settlement_triggered".to_string())
    }

    /// Calculate total outstanding payroll obligations
    pub(crate) fn calculate_payroll_obligations(&self, leash_id: u64) -> u128 {
        let payments = self.payroll_payments_map(leash_id);
        let mut total: u128 = 0;

        for payment in payments.values() {
            // Failed transfers remain legitimate obligations even though their
            // reservation was restored to available balance.
            if matches!(
                payment.status,
                PayrollPaymentStatus::Pending
                    | PayrollPaymentStatus::Settling
                    | PayrollPaymentStatus::Failed
            ) {
                total = total
                    .checked_add(payment.amount)
                    .expect("payroll obligations overflow");
            }
        }
        total
    }

    fn cancel_pending_vigil_payments(&mut self, leash_id: u64) {
        let mut leash = self.get_leash_or_panic(leash_id);
        let mut payments = self.payments_map(leash_id);
        let payment_ids: Vec<u64> = payments.keys().collect();
        for payment_id in payment_ids {
            let Some(mut payment) = payments.get(&payment_id) else {
                continue;
            };
            if matches!(
                payment.status,
                PaymentStatus::PendingApproval | PaymentStatus::Requested
            ) && payment.reserved
            {
                self.release_reservation(&mut leash, &mut payment);
                payment.status = PaymentStatus::Cancelled;
                payment.updated_at_ns = Self::now_ns();
                payments.insert(&payment_id, &payment);
            }
        }
        self.save_payments(leash_id, &payments);
        self.save_leash(&leash);
    }

    fn retry_failed_payroll_obligations(&mut self, leash_id: u64) {
        let payments = self.payroll_payments_map(leash_id);
        let mut by_group: Vec<(u64, Vec<u64>)> = Vec::new();
        for payment in payments
            .values()
            .filter(|payment| payment.status == PayrollPaymentStatus::Failed && !payment.reserved)
        {
            if let Some((_, ids)) = by_group
                .iter_mut()
                .find(|(group_id, _)| *group_id == payment.group_id)
            {
                ids.push(payment.payment_id);
            } else {
                by_group.push((payment.group_id, vec![payment.payment_id]));
            }
        }
        for (group_id, payment_ids) in by_group {
            self.retry_payroll_payments(leash_id, group_id, payment_ids);
        }
    }

    /// Permissionless phase-two finalization. This succeeds only after every
    /// legitimate payroll record is settled/cancelled and every other token
    /// reservation (including pre-trigger in-flight payments or withdrawals)
    /// has resolved. Entitlements therefore snapshot only the balance that is
    /// actually available for beneficiaries.
    pub fn finalize_vigil_settlement(&mut self, leash_id: u64) -> bool {
        self.try_finalize_vigil_settlement(leash_id)
    }

    pub(crate) fn try_finalize_vigil_settlement(&mut self, leash_id: u64) -> bool {
        let mut leash = self.get_leash_or_panic(leash_id);
        if !leash.vigil_config.settlement_triggered {
            return false;
        }
        if leash.vigil_config.payroll_obligations_satisfied {
            return true;
        }
        if self.calculate_payroll_obligations(leash_id) != 0 || leash.reserved_balance != 0 {
            return false;
        }
        assert!(
            !leash.vigil_config.beneficiaries.is_empty(),
            "Vigil beneficiaries not configured"
        );

        let distributable = leash.available_balance;
        let mut entitlements = Vec::with_capacity(leash.vigil_config.beneficiaries.len());
        let mut allocated = 0u128;
        for beneficiary in &leash.vigil_config.beneficiaries {
            let share = u128::from(beneficiary.share_percent);
            let amount = distributable
                .checked_mul(share)
                .expect("vigil entitlement overflow")
                / 100;
            allocated = allocated
                .checked_add(amount)
                .expect("vigil entitlement overflow");
            entitlements.push(amount);
        }
        let remainder = distributable
            .checked_sub(allocated)
            .expect("vigil allocation exceeds balance");
        if remainder > 0 {
            entitlements[0] = entitlements[0]
                .checked_add(remainder)
                .expect("vigil entitlement overflow");
        }

        // Zero-value claims need no asynchronous transfer and are terminal
        // immediately. Nonzero claims remain available for beneficiaries.
        let claims: Vec<bool> = entitlements.iter().map(|amount| *amount == 0).collect();
        let claimed_amount = vec![0; entitlements.len()];
        let completed = claims.iter().all(|claimed| *claimed);

        leash.vigil_config.distributable_snapshot = distributable;
        leash.vigil_config.entitlements = entitlements.clone();
        leash.vigil_config.claimed = claims.clone();
        leash.vigil_config.claimed_amount = claimed_amount.clone();
        leash.vigil_config.payroll_obligations_satisfied = true;
        leash.vigil_config.settlement_completed = completed;
        self.vigil_entitlements.insert(&leash_id, &entitlements);
        self.vigil_claims.insert(&leash_id, &claims);
        self.vigil_claimed_amount.insert(&leash_id, &claimed_amount);
        self.save_leash(&leash);

        AgentLeashEvent::VigilPayrollObligationsSatisfied { leash_id }.emit();
        if completed {
            AgentLeashEvent::VigilSettlementCompleted { leash_id }.emit();
        }
        true
    }

    /// Claim vigil beneficiary entitlement (callable by beneficiary)
    pub fn claim_vigil_entitlement(&mut self, leash_id: u64) -> PromiseOrValue<String> {
        let _ = self.try_finalize_vigil_settlement(leash_id);
        let mut leash = self.get_leash_or_panic(leash_id);
        let claimant = env::predecessor_account_id();
        let storage_before = env::storage_usage();

        assert!(leash.vigil_active, "Vigil not enabled");
        assert!(
            leash.vigil_config.settlement_triggered,
            "Settlement not triggered"
        );
        assert!(
            !leash.vigil_config.settlement_completed,
            "Settlement already completed"
        );
        assert!(
            leash.vigil_config.payroll_obligations_satisfied,
            "Payroll obligations not yet satisfied"
        );

        // Find beneficiary index
        let beneficiary_idx = leash
            .vigil_config
            .beneficiaries
            .iter()
            .position(|b| b.account_id == claimant);

        let idx = match beneficiary_idx {
            Some(i) => i,
            None => return PromiseOrValue::Value("not_beneficiary".to_string()),
        };

        // Check if already claimed
        let mut claims = self.vigil_claims.get(&leash_id).unwrap_or_default();
        if idx < claims.len() && claims[idx] {
            return PromiseOrValue::Value("already_claimed".to_string());
        }

        // Get entitlement
        let entitlements = self.vigil_entitlements.get(&leash_id).unwrap_or_default();
        if idx >= entitlements.len() {
            return PromiseOrValue::Value("no_entitlement".to_string());
        }

        let amount = entitlements[idx];
        if amount == 0 {
            // Mark as claimed even if zero
            if idx < claims.len() {
                claims[idx] = true;
                self.vigil_claims.insert(&leash_id, &claims);
            }
            return PromiseOrValue::Value("zero_entitlement".to_string());
        }

        assert!(
            leash.available_balance >= amount,
            "Insufficient balance for claim"
        );

        // Reserve the amount
        leash.available_balance = leash
            .available_balance
            .checked_sub(amount)
            .expect("available underflow");
        leash.reserved_balance = leash
            .reserved_balance
            .checked_add(amount)
            .expect("reserved overflow");

        // Update claim status
        if idx < claims.len() {
            claims[idx] = true;
            self.vigil_claims.insert(&leash_id, &claims);
        }

        let mut claimed_amounts = self.vigil_claimed_amount.get(&leash_id).unwrap_or_default();
        if idx < claimed_amounts.len() {
            claimed_amounts[idx] = amount;
            self.vigil_claimed_amount
                .insert(&leash_id, &claimed_amounts);
        }

        // Create pending transfer record
        let transfer_id = leash.vigil_config.next_transfer_id;
        leash.vigil_config.next_transfer_id = leash
            .vigil_config
            .next_transfer_id
            .checked_add(1)
            .expect("transfer id overflow");
        leash.vigil_config.pending_transfer_ids.push(transfer_id);

        self.save_leash(&leash);
        self.record_storage_usage(&leash.owner_id, storage_before);

        // Execute transfer
        PromiseOrValue::Promise(
            ext_ft_core::ext(leash.token_contract.clone())
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .with_static_gas(GAS_FOR_FT_TRANSFER)
                .ft_transfer(
                    claimant.clone(),
                    U128(amount),
                    Some(format!("agent-leash-vigil:{}:{}", leash_id, transfer_id)),
                )
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_FOR_VIGIL_CALLBACK)
                        .on_vigil_claim_settled(leash_id, transfer_id, claimant, amount),
                ),
        )
    }

    #[private]
    pub fn on_vigil_claim_settled(
        &mut self,
        leash_id: u64,
        transfer_id: u64,
        beneficiary: AccountId,
        amount: u128,
        #[callback_result] result: Result<(), near_sdk::PromiseError>,
    ) -> String {
        let mut leash = self.get_leash_or_panic(leash_id);

        match result {
            Ok(_) => {
                // Success: consume reservation
                leash.reserved_balance = leash
                    .reserved_balance
                    .checked_sub(amount)
                    .expect("reserved underflow");

                // Update pending transfers
                leash
                    .vigil_config
                    .pending_transfer_ids
                    .retain(|&id| id != transfer_id);

                // Check if all claims completed
                let claims = self.vigil_claims.get(&leash_id).unwrap_or_default();
                let all_claimed = claims.iter().all(|&c| c);

                if all_claimed && leash.vigil_config.pending_transfer_ids.is_empty() {
                    leash.vigil_config.settlement_completed = true;
                    AgentLeashEvent::VigilSettlementCompleted { leash_id }.emit();
                }

                self.save_leash(&leash);

                AgentLeashEvent::VigilClaimSettled {
                    leash_id,
                    beneficiary: &beneficiary,
                    amount: &amount.to_string(),
                }
                .emit();

                "settled".to_string()
            }
            Err(_) => {
                // Failure: release reservation and unmark claim
                leash.reserved_balance = leash
                    .reserved_balance
                    .checked_sub(amount)
                    .expect("reserved underflow");
                leash.available_balance = leash
                    .available_balance
                    .checked_add(amount)
                    .expect("available overflow");

                leash
                    .vigil_config
                    .pending_transfer_ids
                    .retain(|&id| id != transfer_id);

                let mut claims = self.vigil_claims.get(&leash_id).unwrap_or_default();
                if let Some(idx) = leash
                    .vigil_config
                    .beneficiaries
                    .iter()
                    .position(|b| b.account_id == beneficiary)
                {
                    if idx < claims.len() {
                        claims[idx] = false;
                        self.vigil_claims.insert(&leash_id, &claims);
                    }
                }

                let mut claimed_amounts =
                    self.vigil_claimed_amount.get(&leash_id).unwrap_or_default();
                if let Some(idx) = leash
                    .vigil_config
                    .beneficiaries
                    .iter()
                    .position(|b| b.account_id == beneficiary)
                {
                    if idx < claimed_amounts.len() {
                        claimed_amounts[idx] = 0;
                        self.vigil_claimed_amount
                            .insert(&leash_id, &claimed_amounts);
                    }
                }

                self.save_leash(&leash);

                AgentLeashEvent::VigilClaimFailed {
                    leash_id,
                    beneficiary: &beneficiary,
                    reason: "token transfer failed",
                }
                .emit();

                "failed".to_string()
            }
        }
    }

    /// Mark payroll obligations as satisfied (called after all payroll payments settle)
    pub fn mark_payroll_obligations_satisfied(&mut self, leash_id: u64) {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);

        assert!(leash.vigil_active, "Vigil not enabled");
        assert!(
            leash.vigil_config.settlement_triggered,
            "Settlement not triggered"
        );
        assert!(
            !leash.vigil_config.payroll_obligations_satisfied,
            "Already satisfied"
        );

        // Verify no pending payroll payments
        let payments = self.payroll_payments_map(leash_id);
        let has_pending = payments.values().any(|p| p.reserved && !p.is_terminal());
        assert!(!has_pending, "Pending payroll payments exist");

        let groups = self.payroll_groups_map(leash_id);
        let has_reserved = groups.values().any(|g| g.reserved_balance > 0);
        assert!(!has_reserved, "Payroll groups have reserved balance");

        leash.vigil_config.payroll_obligations_satisfied = true;
        self.save_leash(&leash);

        AgentLeashEvent::VigilPayrollObligationsSatisfied { leash_id }.emit();
    }

    /// Disable vigil (only if not triggered)
    #[payable]
    pub fn disable_vigil(&mut self, leash_id: u64) {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(
            !leash.vigil_config.settlement_triggered,
            "Cannot disable after settlement triggered"
        );

        let storage_before = env::storage_usage();

        leash.vigil_active = false;
        leash.check_in_interval_ns = 0;
        leash.vigil_config = VigilConfig {
            enabled: false,
            check_in_interval_ns: 0,
            grace_period_ns: 0,
            last_check_in_ns: 0,
            beneficiaries: Vec::new(),
            total_shares: 0,
            settlement_triggered: false,
            settlement_completed: false,
            payroll_obligations_satisfied: false,
            distributable_snapshot: 0,
            entitlements: Vec::new(),
            claimed: Vec::new(),
            claimed_amount: Vec::new(),
            pending_transfer_ids: Vec::new(),
            next_transfer_id: 1,
        };

        self.save_leash(&leash);
        self.record_storage_usage(&leash.owner_id, storage_before);

        AgentLeashEvent::VigilDisabled { leash_id }.emit();
    }
}
