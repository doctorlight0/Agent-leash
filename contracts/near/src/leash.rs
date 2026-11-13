use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId};

use crate::events::AgentLeashEvent;
use crate::state::{Leash, PayeeConfig, VigilConfig};
use crate::types::{
    balance_cap_ceiling_for_decimals, DAY_NS, MAX_INITIAL_PAYEES, MAX_LEASHES_PER_OWNER,
    MAX_PAYEES_PER_LEASH, MAX_PENDING_DEFAULT, MIN_CHECK_IN_INTERVAL_NS,
};
use crate::{AgentLeash, AgentLeashExt};

#[near]
impl AgentLeash {
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn create_leash(
        &mut self,
        agent_id: AccountId,
        token_contract: AccountId,
        per_payment_limit: U128,
        rolling_limit: U128,
        rolling_window_ns: Option<u64>,
        cooldown_ns: u64,
        expires_at_ns: Option<u64>,
        approval_required: bool,
        max_pending_payments: Option<u32>,
        initial_payees: Option<Vec<AccountId>>,
        balance_cap: U128,
    ) -> u64 {
        let owner_id = env::predecessor_account_id();
        let deposit = env::attached_deposit().as_yoctonear();
        self.credit_attached_storage_deposit(&owner_id, deposit);
        let storage_before = env::storage_usage();
        let token_decimals = self.token_decimals_or_panic(&token_contract);
        let balance_cap_ceiling = balance_cap_ceiling_for_decimals(token_decimals)
            .expect("configured token decimals must be valid");
        assert!(
            per_payment_limit.0 > 0,
            "per_payment_limit must be positive"
        );
        assert!(rolling_limit.0 > 0, "rolling_limit must be positive");
        assert!(
            per_payment_limit.0 <= rolling_limit.0,
            "per_payment_limit cannot exceed rolling_limit"
        );
        assert!(
            balance_cap.0 > 0 && balance_cap.0 <= balance_cap_ceiling,
            "balance_cap must be between 1 and the ceiling"
        );
        let rolling_window_ns = rolling_window_ns.unwrap_or(DAY_NS);
        assert!(rolling_window_ns > 0, "rolling window must be positive");
        if let Some(exp) = expires_at_ns {
            assert!(exp > Self::now_ns(), "expiry must be in the future");
        }
        let payees = initial_payees.unwrap_or_default();
        assert!(
            payees.len() <= MAX_INITIAL_PAYEES,
            "too many initial payees"
        );
        let owner_set = self.leashes_by_owner.get(&owner_id).unwrap_or_else(|| {
            near_sdk::collections::UnorderedSet::new(crate::StorageKey::LeashesByOwner {
                owner_id: owner_id.clone(),
            })
        });
        assert!(
            (owner_set.len() as usize) < MAX_LEASHES_PER_OWNER,
            "Too many leashes for owner"
        );
        let max_pending_payments = max_pending_payments.unwrap_or(MAX_PENDING_DEFAULT).max(1);

        let leash_id = self.next_leash_id;
        self.next_leash_id = self
            .next_leash_id
            .checked_add(1)
            .expect("leash id overflow");

        let now = Self::now_ns();
        let leash = Leash {
            leash_id,
            owner_id: owner_id.clone(),
            agent_id: agent_id.clone(),
            token_contract: token_contract.clone(),
            balance_cap: balance_cap.0,
            available_balance: 0,
            reserved_balance: 0,
            per_payment_limit: per_payment_limit.0,
            rolling_limit: rolling_limit.0,
            rolling_window_ns,
            cooldown_ns,
            expires_at_ns,
            approval_required,
            auto_approve_limit: 0,
            paused: false,
            revoked: false,
            max_pending_payments,
            pending_payment_count: 0,
            next_payment_id: 1,
            next_schedule_id: 1,
            last_payment_at_ns: 0,
            check_in_interval_ns: 0,
            last_check_in_ns: 0,
            vigil_active: false,
            monthly_cap: 0,
            period_start_ns: now,
            monthly_spent: 0,
            next_withdrawal_id: 1,
            next_revocation_id: 1,
            payroll_groups: Vec::new(),
            next_payroll_group_id: 1,
            vigil_config: VigilConfig {
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
            },
        };
        self.save_leash(&leash);
        let mut owner_set = owner_set;
        owner_set.insert(&leash_id);
        self.leashes_by_owner.insert(&owner_id, &owner_set);

        let mut payee_map = self.payees_map(leash_id);
        for payee in payees {
            payee_map.insert(
                &payee,
                &PayeeConfig {
                    allowed: true,
                    added_at_ns: now,
                    per_payment_limit: 0,
                    daily_cap: 0,
                    spent: 0,
                    period_start: 0,
                },
            );
        }
        self.save_payees(leash_id, &payee_map);
        self.record_storage_usage(&owner_id, storage_before);
        AgentLeashEvent::LeashCreated {
            leash_id,
            owner_id: &owner_id,
            agent_id: &agent_id,
            token_contract: &token_contract,
        }
        .emit();
        leash_id
    }

    pub fn add_payee(&mut self, leash_id: u64, payee: AccountId) {
        let leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(!leash.revoked, "Leash revoked");
        let storage_before = env::storage_usage();
        let mut payees = self.payees_map(leash_id);
        assert!(
            payees.get(&payee).is_some() || (payees.len() as usize) < MAX_PAYEES_PER_LEASH,
            "Too many payees"
        );
        payees.insert(
            &payee,
            &PayeeConfig {
                allowed: true,
                added_at_ns: Self::now_ns(),
                per_payment_limit: 0,
                daily_cap: 0,
                spent: 0,
                period_start: 0,
            },
        );
        self.save_payees(leash_id, &payees);
        self.record_storage_usage(&leash.owner_id, storage_before);
        AgentLeashEvent::PayeeAdded {
            leash_id,
            payee: &payee,
        }
        .emit();
    }

    pub fn remove_payee(&mut self, leash_id: u64, payee: AccountId) {
        let leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(!leash.revoked, "Leash revoked");
        let storage_before = env::storage_usage();
        let mut payees = self.payees_map(leash_id);
        let now = Self::now_ns();
        if let Some(mut cfg) = payees.get(&payee) {
            cfg.allowed = false;
            // Removing a payee clears its overrides and spend tracking so the
            // payee starts fresh if it is re-added later.
            cfg.per_payment_limit = 0;
            cfg.daily_cap = 0;
            cfg.spent = 0;
            cfg.period_start = 0;
            payees.insert(&payee, &cfg);
        } else {
            payees.insert(
                &payee,
                &PayeeConfig {
                    allowed: false,
                    added_at_ns: now,
                    per_payment_limit: 0,
                    daily_cap: 0,
                    spent: 0,
                    period_start: 0,
                },
            );
        }
        self.save_payees(leash_id, &payees);
        self.record_storage_usage(&leash.owner_id, storage_before);
        AgentLeashEvent::PayeeRemoved {
            leash_id,
            payee: &payee,
        }
        .emit();
    }

    /// Owner sets per-payee overrides for an allowlisted payee and resets its
    /// spend period. Zero per-payment limit reverts to the leash default; zero
    /// daily cap disables the payee cap. When both overrides are nonzero the
    /// per-payment limit must not exceed the daily cap. The payee's fixed
    /// period starts with the next immediate payment.
    pub fn set_payee_limits(
        &mut self,
        leash_id: u64,
        payee: AccountId,
        per_payment_limit: U128,
        daily_cap: U128,
    ) {
        let leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(!leash.revoked, "Leash revoked");
        let mut payees = self.payees_map(leash_id);
        let mut cfg = payees.get(&payee).expect("Payee not allowlisted");
        assert!(cfg.allowed, "Payee not allowlisted");
        if per_payment_limit.0 != 0 && daily_cap.0 != 0 {
            assert!(
                per_payment_limit.0 <= daily_cap.0,
                "per_payment_limit cannot exceed daily_cap"
            );
        }
        assert!(
            per_payment_limit.0 == 0 || per_payment_limit.0 <= leash.per_payment_limit,
            "per_payment_limit cannot exceed leash limit"
        );
        cfg.per_payment_limit = per_payment_limit.0;
        cfg.daily_cap = daily_cap.0;
        // Changing limits resets the spend period.
        cfg.spent = 0;
        cfg.period_start = 0;
        payees.insert(&payee, &cfg);
        self.save_payees(leash_id, &payees);
        AgentLeashEvent::PayeeLimitsSet {
            leash_id,
            payee: &payee,
            per_payment_limit: &per_payment_limit.0.to_string(),
            daily_cap: &daily_cap.0.to_string(),
        }
        .emit();
    }

    /// Owner sets the auto-approval ceiling for non-allowlisted payees. Zero
    /// disables auto-approval. The value is clamped to the leash per-payment
    /// limit so auto-approval can never exceed it.
    pub fn set_auto_approve_limit(&mut self, leash_id: u64, amount: U128) {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(!leash.revoked, "Leash revoked");
        assert!(
            amount.0 <= leash.per_payment_limit,
            "auto_approve_limit cannot exceed per_payment_limit"
        );
        leash.auto_approve_limit = amount.0;
        self.save_leash(&leash);
        AgentLeashEvent::AutoApproveLimitSet {
            leash_id,
            amount: &amount.0.to_string(),
        }
        .emit();
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_permissions(
        &mut self,
        leash_id: u64,
        per_payment_limit: U128,
        rolling_limit: U128,
        cooldown_ns: u64,
        expires_at_ns: Option<u64>,
        approval_required: bool,
        max_pending_payments: u32,
    ) {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(!leash.revoked, "Leash revoked");
        assert!(
            per_payment_limit.0 > 0 && rolling_limit.0 > 0,
            "limits must be positive"
        );
        assert!(
            per_payment_limit.0 <= rolling_limit.0,
            "per_payment_limit cannot exceed rolling_limit"
        );
        assert!(
            max_pending_payments >= leash.pending_payment_count,
            "max_pending_payments below outstanding pending payments"
        );
        if let Some(exp) = expires_at_ns {
            assert!(
                exp > Self::now_ns() || Some(exp) == leash.expires_at_ns,
                "invalid expiry"
            );
        }
        // Lowering the per-payment limit also clamps auto-approval so it can
        // never exceed the new limit.
        if leash.auto_approve_limit > per_payment_limit.0 {
            leash.auto_approve_limit = per_payment_limit.0;
            AgentLeashEvent::AutoApproveLimitSet {
                leash_id,
                amount: &per_payment_limit.0.to_string(),
            }
            .emit();
        }
        leash.per_payment_limit = per_payment_limit.0;
        leash.rolling_limit = rolling_limit.0;
        leash.cooldown_ns = cooldown_ns;
        leash.expires_at_ns = expires_at_ns;
        leash.approval_required = approval_required;
        leash.max_pending_payments = max_pending_payments.max(1);
        self.save_leash(&leash);
        AgentLeashEvent::LimitsUpdated {
            leash_id,
            per_payment_limit: &per_payment_limit.0.to_string(),
            rolling_limit: &rolling_limit.0.to_string(),
            cooldown_ns: &cooldown_ns.to_string(),
        }
        .emit();
        AgentLeashEvent::PermissionsUpdated {
            leash_id,
            approval_required,
            max_pending_payments: leash.max_pending_payments,
        }
        .emit();
    }

    pub fn set_agent(&mut self, leash_id: u64, agent_id: AccountId) {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(!leash.revoked, "Leash revoked");
        assert_eq!(
            leash.pending_payment_count, 0,
            "Cannot reassign agent with pending payments"
        );
        let old_agent = leash.agent_id.clone();
        let mut schedules = self.schedules_map(leash_id);
        let stale_schedule_ids: Vec<u64> = schedules
            .iter()
            .filter_map(|(schedule_id, schedule)| {
                (schedule.active
                    && !schedule.executed
                    && schedule.creator == old_agent
                    && schedule.creator != leash.owner_id)
                    .then_some(schedule_id)
            })
            .collect();
        let had_stale_schedules = !stale_schedule_ids.is_empty();
        for schedule_id in stale_schedule_ids {
            if let Some(mut schedule) = schedules.get(&schedule_id) {
                schedule.active = false;
                schedule.executed = true;
                schedules.insert(&schedule_id, &schedule);
                AgentLeashEvent::ScheduleCancelled {
                    leash_id,
                    schedule_id,
                }
                .emit();
            }
        }
        if had_stale_schedules {
            self.save_schedules(leash_id, &schedules);
        }
        let new_agent = agent_id.clone();
        leash.agent_id = agent_id;
        self.save_leash(&leash);
        AgentLeashEvent::AgentSet {
            leash_id,
            agent_id: &new_agent,
        }
        .emit();
    }

    pub(crate) fn is_payee_allowed(&self, leash_id: u64, payee: &AccountId) -> bool {
        self.payees_map(leash_id)
            .get(payee)
            .is_some_and(|c| c.allowed)
    }

    #[payable]
    pub fn check_in(&mut self, leash_id: u64) -> bool {
        let mut leash = self.get_leash_or_panic(leash_id);
        assert!(!leash.revoked, "Leash revoked");
        assert!(!leash.is_expired(Self::now_ns()), "Leash expired");
        let now = Self::now_ns();
        leash.last_check_in_ns = now;
        leash.vigil_active = true;
        self.save_leash(&leash);
        true
    }

    pub fn set_check_in_interval(&mut self, leash_id: u64, check_in_interval_ns: u64) {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(!leash.revoked, "Leash revoked");
        assert!(
            check_in_interval_ns == 0 || check_in_interval_ns >= MIN_CHECK_IN_INTERVAL_NS,
            "Invalid interval: must be 0 or >= 1 day"
        );
        assert!(
            env::block_timestamp()
                .checked_add(check_in_interval_ns)
                .is_some(),
            "Invalid interval"
        );
        leash.check_in_interval_ns = check_in_interval_ns;
        self.save_leash(&leash);
    }
}
