use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

use crate::state::Leash;
use crate::types::{
    LeashView, PaymentView, PayrollGroupView, PayrollPaymentView, RevocationView, ScheduleView,
    VigilBeneficiaryView, VigilConfigView, WithdrawalView, WorkerView,
};
use crate::{AgentLeash, AgentLeashExt};

#[near]
impl AgentLeash {
    pub fn get_leash(&self, leash_id: u64) -> Option<LeashView> {
        self.leashes.get(&leash_id).map(|l| leash_to_view(&l))
    }

    pub fn get_payment(&self, leash_id: u64, payment_id: u64) -> Option<PaymentView> {
        self.payments_map(leash_id)
            .get(&payment_id)
            .map(|p| PaymentView {
                leash_id: p.leash_id,
                payment_id: p.payment_id,
                requester: p.requester,
                recipient: p.recipient,
                token_contract: p.token_contract,
                amount: U128(p.amount),
                reason: p.reason,
                status: p.status,
                created_at_ns: p.created_at_ns,
                approval_expires_at_ns: p.approval_expires_at_ns,
                reserved: p.reserved,
            })
    }

    pub fn get_withdrawal(&self, leash_id: u64, withdrawal_id: u64) -> Option<WithdrawalView> {
        self.withdrawals_map(leash_id)
            .get(&withdrawal_id)
            .map(|w| WithdrawalView {
                leash_id: w.leash_id,
                withdrawal_id: w.withdrawal_id,
                requester: w.requester,
                recipient: w.recipient,
                token_contract: w.token_contract,
                amount: U128(w.amount),
                status: w.status,
                created_at_ns: w.created_at_ns,
                reserved: w.reserved,
            })
    }

    pub fn get_schedule(&self, leash_id: u64, schedule_id: u64) -> Option<ScheduleView> {
        self.schedules_map(leash_id)
            .get(&schedule_id)
            .map(|s| ScheduleView {
                leash_id: s.leash_id,
                schedule_id: s.schedule_id,
                creator: s.creator,
                recipient: s.recipient,
                amount: U128(s.amount),
                execute_after_ns: s.execute_after_ns,
                interval_ns: s.interval_ns,
                next_due_ns: s.next_due_ns,
                expires_at_ns: s.expires_at_ns,
                reason: s.reason,
                active: s.active,
                executed: s.executed,
                max_runs: s.max_runs,
                runs: s.runs,
            })
    }

    pub fn list_leash_payments(
        &self,
        leash_id: u64,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<PaymentView> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;
        self.payments_map(leash_id)
            .values()
            .skip(from)
            .take(limit)
            .map(|p| PaymentView {
                leash_id: p.leash_id,
                payment_id: p.payment_id,
                requester: p.requester,
                recipient: p.recipient,
                token_contract: p.token_contract,
                amount: U128(p.amount),
                reason: p.reason,
                status: p.status,
                created_at_ns: p.created_at_ns,
                approval_expires_at_ns: p.approval_expires_at_ns,
                reserved: p.reserved,
            })
            .collect()
    }

    pub fn list_leash_schedules(
        &self,
        leash_id: u64,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<ScheduleView> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;
        self.schedules_map(leash_id)
            .values()
            .skip(from)
            .take(limit)
            .map(|s| ScheduleView {
                leash_id: s.leash_id,
                schedule_id: s.schedule_id,
                creator: s.creator,
                recipient: s.recipient,
                amount: U128(s.amount),
                execute_after_ns: s.execute_after_ns,
                interval_ns: s.interval_ns,
                next_due_ns: s.next_due_ns,
                expires_at_ns: s.expires_at_ns,
                reason: s.reason,
                active: s.active,
                executed: s.executed,
                max_runs: s.max_runs,
                runs: s.runs,
            })
            .collect()
    }

    pub fn list_leash_withdrawals(
        &self,
        leash_id: u64,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<WithdrawalView> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;
        self.withdrawals_map(leash_id)
            .values()
            .skip(from)
            .take(limit)
            .map(|w| WithdrawalView {
                leash_id: w.leash_id,
                withdrawal_id: w.withdrawal_id,
                requester: w.requester,
                recipient: w.recipient,
                token_contract: w.token_contract,
                amount: U128(w.amount),
                status: w.status,
                created_at_ns: w.created_at_ns,
                reserved: w.reserved,
            })
            .collect()
    }

    /// Read view of one revocation. Unknown IDs return `None`; unknown leashes
    /// still return `None` rather than panicking, consistent with the other
    /// single-record views.
    pub fn get_revocation(&self, leash_id: u64, revocation_id: u64) -> Option<RevocationView> {
        self.revocations_map(leash_id)
            .get(&revocation_id)
            .map(|r| RevocationView {
                leash_id: r.leash_id,
                revocation_id: r.revocation_id,
                requester: r.requester,
                recipient: r.recipient,
                token_contract: r.token_contract,
                amount: U128(r.amount),
                status: r.status,
                created_at_ns: r.created_at_ns,
                updated_at_ns: r.updated_at_ns,
                reserved: r.reserved,
            })
    }

    pub fn list_leash_revocations(
        &self,
        leash_id: u64,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<RevocationView> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;
        self.revocations_map(leash_id)
            .values()
            .skip(from)
            .take(limit)
            .map(|r| RevocationView {
                leash_id: r.leash_id,
                revocation_id: r.revocation_id,
                requester: r.requester,
                recipient: r.recipient,
                token_contract: r.token_contract,
                amount: U128(r.amount),
                status: r.status,
                created_at_ns: r.created_at_ns,
                updated_at_ns: r.updated_at_ns,
                reserved: r.reserved,
            })
            .collect()
    }

    pub fn list_owner_leashes(&self, owner_id: AccountId) -> Vec<u64> {
        self.leashes_by_owner
            .get(&owner_id)
            .map(|s| s.iter().collect())
            .unwrap_or_default()
    }

    pub fn is_recipient_allowed(&self, leash_id: u64, recipient: AccountId) -> bool {
        self.is_payee_allowed(leash_id, &recipient)
    }

    pub fn rolling_spend(&self, leash_id: u64) -> U128 {
        let leash = self.get_leash_or_panic(leash_id);
        let now = Self::now_ns();
        let window_ns = if leash.rolling_window_ns == 0 {
            crate::types::DAY_NS
        } else {
            leash.rolling_window_ns
        };
        let spent = self
            .window_entries(leash_id)
            .iter()
            .filter(|e| now.saturating_sub(e.ts_ns) < window_ns)
            .fold(0u128, |acc, e| acc.saturating_add(e.amount));
        U128(spent)
    }
}

fn leash_to_view(l: &Leash) -> LeashView {
    LeashView {
        leash_id: l.leash_id,
        owner_id: l.owner_id.clone(),
        agent_id: l.agent_id.clone(),
        token_contract: l.token_contract.clone(),
        balance_cap: U128(l.balance_cap),
        available_balance: U128(l.available_balance),
        reserved_balance: U128(l.reserved_balance),
        per_payment_limit: U128(l.per_payment_limit),
        rolling_limit: U128(l.rolling_limit),
        rolling_window_ns: l.rolling_window_ns,
        cooldown_ns: l.cooldown_ns,
        expires_at_ns: l.expires_at_ns,
        approval_required: l.approval_required,
        paused: l.paused,
        revoked: l.revoked,
        max_pending_payments: l.max_pending_payments,
        pending_payment_count: l.pending_payment_count,
        next_payment_id: l.next_payment_id,
        next_schedule_id: l.next_schedule_id,
        next_withdrawal_id: l.next_withdrawal_id,
        next_revocation_id: l.next_revocation_id,
        check_in_interval_ns: l.check_in_interval_ns,
        last_check_in_ns: l.last_check_in_ns,
        vigil_active: l.vigil_active,
        monthly_cap: U128(l.monthly_cap),
        period_start_ns: l.period_start_ns,
        monthly_spent: U128(l.monthly_spent),
    }
}

/// Payroll view methods
#[near]
impl AgentLeash {
    pub fn get_payroll_group(&self, leash_id: u64, group_id: u64) -> Option<PayrollGroupView> {
        self.payroll_groups_map(leash_id).get(&group_id).map(|g| {
            let total_monthly: u128 = g
                .workers
                .iter()
                .filter(|w| w.active)
                .map(|w| w.salary)
                .sum();
            PayrollGroupView {
                group_id: g.group_id,
                owner_id: g.owner_id.clone(),
                name: g.name.clone(),
                token_contract: g.token_contract.clone(),
                payday: g.payday,
                first_payment_date_ns: g.first_payment_date_ns,
                workers: g
                    .workers
                    .iter()
                    .map(|w| WorkerView {
                        account_id: w.account_id.clone(),
                        salary: U128(w.salary),
                        token_contract: w.token_contract.clone(),
                        active: w.active,
                    })
                    .collect(),
                active: g.active,
                reserved_balance: U128(g.reserved_balance),
                next_payment_period_ns: g.next_payment_period_ns,
                created_at_ns: g.created_at_ns,
                total_monthly_salary: U128(total_monthly),
            }
        })
    }

    pub fn list_payroll_groups(&self, leash_id: u64) -> Vec<PayrollGroupView> {
        self.payroll_groups_map(leash_id)
            .values()
            .map(|g| {
                let total_monthly: u128 = g
                    .workers
                    .iter()
                    .filter(|w| w.active)
                    .map(|w| w.salary)
                    .sum();
                PayrollGroupView {
                    group_id: g.group_id,
                    owner_id: g.owner_id.clone(),
                    name: g.name.clone(),
                    token_contract: g.token_contract.clone(),
                    payday: g.payday,
                    first_payment_date_ns: g.first_payment_date_ns,
                    workers: g
                        .workers
                        .iter()
                        .map(|w| WorkerView {
                            account_id: w.account_id.clone(),
                            salary: U128(w.salary),
                            token_contract: w.token_contract.clone(),
                            active: w.active,
                        })
                        .collect(),
                    active: g.active,
                    reserved_balance: U128(g.reserved_balance),
                    next_payment_period_ns: g.next_payment_period_ns,
                    created_at_ns: g.created_at_ns,
                    total_monthly_salary: U128(total_monthly),
                }
            })
            .collect()
    }

    pub fn get_payroll_payment(
        &self,
        leash_id: u64,
        payment_id: u64,
    ) -> Option<PayrollPaymentView> {
        self.payroll_payments_map(leash_id)
            .get(&payment_id)
            .map(|p| PayrollPaymentView {
                group_id: p.group_id,
                payment_id: p.payment_id,
                worker_id: p.worker_id,
                worker_account: p.worker_account.clone(),
                token_contract: p.token_contract.clone(),
                amount: U128(p.amount),
                period_start_ns: p.period_start_ns,
                period_end_ns: p.period_end_ns,
                status: p.status.clone(),
                created_at_ns: p.created_at_ns,
                settled_at_ns: p.settled_at_ns,
                reserved: p.reserved,
            })
    }

    pub fn list_payroll_payments(
        &self,
        leash_id: u64,
        group_id: Option<u64>,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<PayrollPaymentView> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;
        self.payroll_payments_map(leash_id)
            .values()
            .filter(|p| group_id.is_none() || p.group_id == group_id.unwrap())
            .skip(from)
            .take(limit)
            .map(|p| PayrollPaymentView {
                group_id: p.group_id,
                payment_id: p.payment_id,
                worker_id: p.worker_id,
                worker_account: p.worker_account.clone(),
                token_contract: p.token_contract.clone(),
                amount: U128(p.amount),
                period_start_ns: p.period_start_ns,
                period_end_ns: p.period_end_ns,
                status: p.status.clone(),
                created_at_ns: p.created_at_ns,
                settled_at_ns: p.settled_at_ns,
                reserved: p.reserved,
            })
            .collect()
    }
}

/// Vigil view methods
#[near]
impl AgentLeash {
    pub fn get_vigil_config(&self, leash_id: u64) -> Option<VigilConfigView> {
        self.leashes.get(&leash_id).map(|leash| {
            let deadline = leash
                .last_check_in_ns
                .saturating_add(leash.check_in_interval_ns);
            let grace_deadline = deadline.saturating_add(leash.vigil_config.grace_period_ns);

            let entitlements = self.vigil_entitlements.get(&leash_id).unwrap_or_default();
            let claims = self.vigil_claims.get(&leash_id).unwrap_or_default();
            let claimed_amounts = self.vigil_claimed_amount.get(&leash_id).unwrap_or_default();

            let beneficiaries = leash
                .vigil_config
                .beneficiaries
                .iter()
                .enumerate()
                .map(|(i, b)| VigilBeneficiaryView {
                    account_id: b.account_id.clone(),
                    share_percent: b.share_percent,
                    entitlement: U128(entitlements.get(i).copied().unwrap_or(0)),
                    claimed: claims.get(i).copied().unwrap_or(false),
                    claimed_amount: U128(claimed_amounts.get(i).copied().unwrap_or(0)),
                })
                .collect();

            VigilConfigView {
                enabled: leash.vigil_config.enabled,
                check_in_interval_ns: leash.vigil_config.check_in_interval_ns,
                grace_period_ns: leash.vigil_config.grace_period_ns,
                last_check_in_ns: leash.vigil_config.last_check_in_ns,
                deadline_ns: deadline,
                grace_deadline_ns: grace_deadline,
                beneficiaries,
                settlement_triggered: leash.vigil_config.settlement_triggered,
                settlement_completed: leash.vigil_config.settlement_completed,
                payroll_obligations_satisfied: leash.vigil_config.payroll_obligations_satisfied,
                protected_balance: U128(
                    leash
                        .available_balance
                        .saturating_add(leash.reserved_balance),
                ),
            }
        })
    }

    pub fn is_vigil_overdue(&self, leash_id: u64) -> bool {
        self.leashes
            .get(&leash_id)
            .map(|leash| {
                if !leash.vigil_active || leash.check_in_interval_ns == 0 {
                    return false;
                }
                let now = Self::now_ns();
                let deadline = leash
                    .last_check_in_ns
                    .saturating_add(leash.check_in_interval_ns);
                let grace_deadline = deadline.saturating_add(leash.vigil_config.grace_period_ns);
                now > grace_deadline
            })
            .unwrap_or(false)
    }

    pub fn is_vigil_in_grace_period(&self, leash_id: u64) -> bool {
        self.leashes
            .get(&leash_id)
            .map(|leash| {
                if !leash.vigil_active || leash.check_in_interval_ns == 0 {
                    return false;
                }
                let now = Self::now_ns();
                let deadline = leash
                    .last_check_in_ns
                    .saturating_add(leash.check_in_interval_ns);
                let grace_deadline = deadline.saturating_add(leash.vigil_config.grace_period_ns);
                now > deadline && now <= grace_deadline
            })
            .unwrap_or(false)
    }
}
