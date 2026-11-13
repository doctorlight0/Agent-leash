use near_contract_standards::fungible_token::core::ext_ft_core;
use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, Gas, NearToken, Promise, PromiseOrValue};

use crate::events::AgentLeashEvent;
use crate::state::{PayrollGroup, PayrollPaymentRecord, Worker};
use crate::types::{
    PayrollPaymentStatus, DAY_NS, MAX_PAYROLL_GROUPS_PER_OWNER, MAX_WORKERS_PER_GROUP,
};
use crate::{AgentLeash, AgentLeashExt};

pub const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(15);
pub const GAS_FOR_PAYROLL_CALLBACK: Gas = Gas::from_tgas(15);

#[near]
impl AgentLeash {
    /// Create a payroll group for monthly worker payments
    #[allow(clippy::too_many_arguments)]
    pub fn create_payroll_group(
        &mut self,
        leash_id: u64,
        name: String,
        token_contract: AccountId,
        payday: u8,
        first_payment_date_ns: u64,
    ) -> u64 {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(!leash.revoked, "Leash revoked");
        assert!((1..=31).contains(&payday), "Payday must be 1-31");
        assert!(
            first_payment_date_ns > Self::now_ns(),
            "First payment date must be in the future"
        );
        assert!(!name.is_empty() && name.len() <= 64, "Invalid group name");

        // Payroll is funded from this leash's custody balance, so a group may
        // not select a different token contract.
        self.assert_supported_token(&token_contract);
        assert_eq!(
            token_contract, leash.token_contract,
            "Payroll token must match leash token"
        );

        // Check payroll group limit
        let groups = self.payroll_groups_map(leash_id);
        assert!(
            (groups.len() as usize) < MAX_PAYROLL_GROUPS_PER_OWNER,
            "Too many payroll groups"
        );

        let storage_before = env::storage_usage();
        let group_id = leash.next_payroll_group_id;
        leash.next_payroll_group_id = leash
            .next_payroll_group_id
            .checked_add(1)
            .expect("payroll group id overflow");

        let group = PayrollGroup {
            group_id,
            owner_id: leash.owner_id.clone(),
            name,
            token_contract: token_contract.clone(),
            payday,
            first_payment_date_ns,
            workers: Vec::new(),
            active: true,
            reserved_balance: 0,
            next_payment_period_ns: first_payment_date_ns,
            created_at_ns: Self::now_ns(),
            next_worker_id: 1,
            next_payment_id: 1,
        };

        let mut groups = groups;
        groups.insert(&group_id, &group);
        self.save_payroll_groups(leash_id, &groups);
        self.save_leash(&leash);
        self.record_storage_usage(&leash.owner_id, storage_before);

        AgentLeashEvent::PayrollGroupCreated {
            leash_id,
            group_id,
            name: &group.name,
            token_contract: &token_contract,
            payday,
            first_payment_date_ns,
        }
        .emit();

        group_id
    }

    /// Add a worker to a payroll group
    pub fn add_payroll_worker(
        &mut self,
        leash_id: u64,
        group_id: u64,
        worker_account: AccountId,
        salary: U128,
    ) -> u64 {
        let leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(!leash.revoked, "Lease revoked");

        let mut groups = self.payroll_groups_map(leash_id);
        let mut group = groups.get(&group_id).expect("Payroll group not found");
        assert!(group.active, "Payroll group not active");
        assert!(salary.0 > 0, "Salary must be positive");
        assert!(
            group.workers.len() < MAX_WORKERS_PER_GROUP,
            "Too many workers in group"
        );
        // Verify worker not already in group
        assert!(
            !group.workers.iter().any(|w| w.account_id == worker_account),
            "Worker already in group"
        );
        // Verify token matches group token
        assert_eq!(
            group.token_contract, leash.token_contract,
            "Worker token must match group token"
        );

        let storage_before = env::storage_usage();
        let worker_id = group.next_worker_id;
        group.next_worker_id = group
            .next_worker_id
            .checked_add(1)
            .expect("worker id overflow");

        let worker = Worker {
            worker_id,
            account_id: worker_account.clone(),
            salary: salary.0,
            token_contract: group.token_contract.clone(),
            active: true,
        };

        group.workers.push(worker);
        groups.insert(&group_id, &group);
        self.save_payroll_groups(leash_id, &groups);
        self.record_storage_usage(&leash.owner_id, storage_before);

        AgentLeashEvent::PayrollWorkerAdded {
            leash_id,
            group_id,
            worker_id,
            worker_account: &worker_account,
            salary: &salary.0.to_string(),
        }
        .emit();

        worker_id
    }

    /// Remove a worker from a payroll group
    pub fn remove_payroll_worker(&mut self, leash_id: u64, group_id: u64, worker_id: u64) {
        let leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);

        let mut groups = self.payroll_groups_map(leash_id);
        let mut group = groups.get(&group_id).expect("Payroll group not found");
        assert!(group.active, "Payroll group not active");

        let storage_before = env::storage_usage();
        group.workers.retain(|w| w.worker_id != worker_id);
        groups.insert(&group_id, &group);
        self.save_payroll_groups(leash_id, &groups);
        self.record_storage_usage(&leash.owner_id, storage_before);

        AgentLeashEvent::PayrollWorkerRemoved {
            leash_id,
            group_id,
            worker_id,
        }
        .emit();
    }

    /// Update worker salary
    pub fn update_payroll_worker_salary(
        &mut self,
        leash_id: u64,
        group_id: u64,
        worker_id: u64,
        salary: U128,
    ) {
        let leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);

        let mut groups = self.payroll_groups_map(leash_id);
        let mut group = groups.get(&group_id).expect("Payroll group not found");
        assert!(group.active, "Payroll group not active");
        assert!(salary.0 > 0, "Salary must be positive");

        let storage_before = env::storage_usage();
        if let Some(worker) = group.workers.iter_mut().find(|w| w.worker_id == worker_id) {
            worker.salary = salary.0;
        } else {
            env::panic_str("Worker not found");
        }
        groups.insert(&group_id, &group);
        self.save_payroll_groups(leash_id, &groups);
        self.record_storage_usage(&leash.owner_id, storage_before);

        AgentLeashEvent::PayrollWorkerSalaryUpdated {
            leash_id,
            group_id,
            worker_id,
            salary: &salary.0.to_string(),
        }
        .emit();
    }

    /// Set payroll group active/inactive
    pub fn set_payroll_group_active(&mut self, leash_id: u64, group_id: u64, active: bool) {
        let leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);

        let mut groups = self.payroll_groups_map(leash_id);
        let mut group = groups.get(&group_id).expect("Payroll group not found");

        let storage_before = env::storage_usage();
        group.active = active;
        groups.insert(&group_id, &group);
        self.save_payroll_groups(leash_id, &groups);
        self.record_storage_usage(&leash.owner_id, storage_before);

        AgentLeashEvent::PayrollGroupStatusChanged {
            leash_id,
            group_id,
            active,
        }
        .emit();
    }

    /// Payroll draws from the leash's NEP-141-funded available balance. This
    /// compatibility entry point deliberately fails instead of accepting NEAR
    /// or fabricating a successful token reserve operation.
    pub fn fund_payroll_reserve(&mut self, leash_id: u64, group_id: u64) -> PromiseOrValue<U128> {
        let leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(
            self.payroll_groups_map(leash_id).get(&group_id).is_some(),
            "Payroll group not found"
        );
        env::panic_str("Fund the leash with NEP-141 ft_transfer_call; payroll uses leash balance")
    }

    /// Execute payroll for a group (called by keeper or owner)
    pub fn execute_payroll(&mut self, leash_id: u64, group_id: u64) -> PromiseOrValue<Vec<u64>> {
        let mut leash = self.get_leash_or_panic(leash_id);
        let storage_before = env::storage_usage();
        let now = Self::now_ns();

        let mut groups = self.payroll_groups_map(leash_id);
        let mut group = groups.get(&group_id).expect("Payroll group not found");
        assert_eq!(group.owner_id, leash.owner_id, "Payroll owner mismatch");
        assert_eq!(
            group.token_contract, leash.token_contract,
            "Payroll token mismatch"
        );
        assert!(group.active, "Payroll group not active");
        assert!(!leash.revoked, "Leash revoked");
        assert!(!leash.paused, "Leash paused");
        assert!(!leash.is_expired(now), "Leash expired");

        // Check if payroll is due
        assert!(now >= group.next_payment_period_ns, "Payroll not due yet");

        // Calculate period boundaries
        let period_start = group.next_payment_period_ns;
        let period_end = Self::calculate_period_end(period_start, group.payday);

        // Verify we haven't already paid for this period
        let payments = self.payroll_payments_map(leash_id);
        let already_paid = payments
            .values()
            .any(|p| p.group_id == group_id && p.period_start_ns == period_start);
        assert!(!already_paid, "Payroll already executed for this period");

        // Calculate total salary for active workers
        let active_workers: Vec<&Worker> = group.workers.iter().filter(|w| w.active).collect();
        let worker_count = active_workers.len();
        let total_salary = active_workers.iter().fold(0u128, |total, worker| {
            total
                .checked_add(worker.salary)
                .expect("total payroll salary overflow")
        });

        assert!(total_salary > 0, "No active workers with salary");

        // Check available balance
        assert!(
            total_salary <= leash.available_balance,
            "Insufficient available balance for payroll"
        );

        // Check monthly cap
        Self::assert_monthly_cap(&mut leash, total_salary, now);

        // Reserve funds
        leash.available_balance = leash
            .available_balance
            .checked_sub(total_salary)
            .expect("available balance underflow");
        leash.reserved_balance = leash
            .reserved_balance
            .checked_add(total_salary)
            .expect("reserved balance overflow");
        group.reserved_balance = group
            .reserved_balance
            .checked_add(total_salary)
            .expect("group reserved balance overflow");

        // Create payment records for each worker
        let mut payment_ids = Vec::new();
        let mut payroll_payments = self.payroll_payments_map(leash_id);
        let mut settlements = Vec::new();

        for worker in active_workers {
            // Payroll payment IDs must be unique across every group in this
            // leash because the payment map is keyed only by payment_id.
            let payment_id = leash.next_payment_id;
            leash.next_payment_id = leash
                .next_payment_id
                .checked_add(1)
                .expect("payment id overflow");

            let payment = PayrollPaymentRecord {
                group_id,
                payment_id,
                worker_id: worker.worker_id,
                worker_account: worker.account_id.clone(),
                token_contract: group.token_contract.clone(),
                amount: worker.salary,
                period_start_ns: period_start,
                period_end_ns: period_end,
                status: PayrollPaymentStatus::Settling,
                created_at_ns: now,
                settled_at_ns: None,
                reserved: true,
            };

            payroll_payments.insert(&payment_id, &payment);
            payment_ids.push(payment_id);
            settlements.push(payment);
        }

        // Update next payment period
        group.next_payment_period_ns =
            Self::calculate_next_period_start(group.next_payment_period_ns, group.payday);

        groups.insert(&group_id, &group);
        self.save_payroll_groups(leash_id, &groups);
        self.save_payroll_payments(leash_id, &payroll_payments);
        self.save_leash(&leash);
        self.record_storage_usage(&leash.owner_id, storage_before);

        // State is committed before any asynchronous transfer is created.
        for payment in settlements {
            let _ = self.start_payroll_settlement(leash_id, payment);
        }

        AgentLeashEvent::PayrollExecuted {
            leash_id,
            group_id,
            period_start_ns: period_start,
            period_end_ns: period_end,
            total_amount: &total_salary.to_string(),
            worker_count: worker_count as u32,
        }
        .emit();

        PromiseOrValue::Value(payment_ids)
    }

    /// Retry failed payroll payments
    pub fn retry_payroll_payments(&mut self, leash_id: u64, group_id: u64, payment_ids: Vec<u64>) {
        let mut leash = self.get_leash_or_panic(leash_id);
        let storage_before = env::storage_usage();
        let now = Self::now_ns();

        let mut groups = self.payroll_groups_map(leash_id);
        let mut group = groups.get(&group_id).expect("Payroll group not found");
        assert_eq!(group.owner_id, leash.owner_id, "Payroll owner mismatch");
        assert_eq!(
            group.token_contract, leash.token_contract,
            "Payroll token mismatch"
        );
        let mut payroll_payments = self.payroll_payments_map(leash_id);
        let mut settlements = Vec::new();

        for payment_id in payment_ids {
            let mut payment = payroll_payments
                .get(&payment_id)
                .expect("Payment not found");
            assert_eq!(
                payment.group_id, group_id,
                "Payment belongs to different group"
            );
            assert_eq!(
                payment.status,
                PayrollPaymentStatus::Failed,
                "Payment not in failed state"
            );
            assert!(!payment.reserved, "Payment already reserved");
            assert_eq!(
                payment.token_contract, leash.token_contract,
                "Payment token mismatch"
            );

            // Verify balance still available
            assert!(
                payment.amount <= leash.available_balance,
                "Insufficient available balance for retry"
            );

            leash.available_balance = leash
                .available_balance
                .checked_sub(payment.amount)
                .expect("available balance underflow");
            leash.reserved_balance = leash
                .reserved_balance
                .checked_add(payment.amount)
                .expect("reserved balance overflow");
            group.reserved_balance = group
                .reserved_balance
                .checked_add(payment.amount)
                .expect("group reserved balance overflow");

            payment.status = PayrollPaymentStatus::Settling;
            payment.reserved = true;
            payment.created_at_ns = now;
            payment.settled_at_ns = None;
            payroll_payments.insert(&payment_id, &payment);
            settlements.push(payment);
        }

        groups.insert(&group_id, &group);
        self.save_payroll_groups(leash_id, &groups);
        self.save_payroll_payments(leash_id, &payroll_payments);
        self.save_leash(&leash);
        self.record_storage_usage(&leash.owner_id, storage_before);

        for payment in settlements {
            let _ = self.start_payroll_settlement(leash_id, payment);
        }
    }

    /// Calculate the end of a pay period based on payday
    fn calculate_period_end(period_start_ns: u64, _payday: u8) -> u64 {
        period_start_ns
            .checked_add(30 * DAY_NS)
            .expect("payroll period end overflow")
    }

    /// Calculate the next period start based on payday
    fn calculate_next_period_start(current_period_start: u64, _payday: u8) -> u64 {
        current_period_start
            .checked_add(30 * DAY_NS)
            .expect("payroll next period overflow")
    }

    pub(crate) fn start_payroll_settlement(
        &mut self,
        leash_id: u64,
        payment: PayrollPaymentRecord,
    ) -> Promise {
        ext_ft_core::ext(payment.token_contract.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(
                payment.worker_account.clone(),
                U128(payment.amount),
                Some(format!(
                    "agent-leash-payroll:{}:{}",
                    payment.group_id, payment.payment_id
                )),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_PAYROLL_CALLBACK)
                    .on_payroll_settled(leash_id, payment.group_id, payment.payment_id),
            )
    }

    #[private]
    pub fn on_payroll_settled(
        &mut self,
        leash_id: u64,
        group_id: u64,
        payment_id: u64,
        #[callback_result] result: Result<(), near_sdk::PromiseError>,
    ) -> String {
        let mut leash = self.get_leash_or_panic(leash_id);
        let mut groups = self.payroll_groups_map(leash_id);
        let mut group = groups.get(&group_id).expect("Payroll group not found");
        assert_eq!(group.owner_id, leash.owner_id, "Payroll owner mismatch");
        assert_eq!(
            group.token_contract, leash.token_contract,
            "Payroll token mismatch"
        );
        let mut payroll_payments = self.payroll_payments_map(leash_id);
        let mut payment = payroll_payments
            .get(&payment_id)
            .expect("Payment not found");
        assert_eq!(payment.group_id, group_id, "Payment group mismatch");
        assert_eq!(
            payment.token_contract, leash.token_contract,
            "Payment token mismatch"
        );

        if payment.is_terminal() || !payment.reserved {
            return format!("{:?}", payment.status).to_lowercase();
        }
        if !matches!(payment.status, PayrollPaymentStatus::Settling) {
            return format!("{:?}", payment.status).to_lowercase();
        }

        match result {
            Ok(_) => {
                // Success: consume reservation
                leash.reserved_balance = leash
                    .reserved_balance
                    .checked_sub(payment.amount)
                    .expect("reserved underflow");

                group.reserved_balance = group
                    .reserved_balance
                    .checked_sub(payment.amount)
                    .expect("group reserved underflow");
                groups.insert(&group_id, &group);
                self.save_payroll_groups(leash_id, &groups);

                payment.reserved = false;
                payment.status = PayrollPaymentStatus::Settled;
                payment.settled_at_ns = Some(Self::now_ns());
                leash.monthly_spent = leash
                    .monthly_spent
                    .checked_add(payment.amount)
                    .expect("monthly spend overflow");
                payroll_payments.insert(&payment_id, &payment);
                self.save_payroll_payments(leash_id, &payroll_payments);
                self.save_leash(&leash);

                AgentLeashEvent::PayrollPaymentSettled {
                    leash_id,
                    group_id,
                    payment_id,
                    worker_account: &payment.worker_account,
                    amount: &payment.amount.to_string(),
                }
                .emit();

                "settled".to_string()
            }
            Err(_) => {
                // Failure: release reservation
                leash.reserved_balance = leash
                    .reserved_balance
                    .checked_sub(payment.amount)
                    .expect("reserved underflow");
                leash.available_balance = leash
                    .available_balance
                    .checked_add(payment.amount)
                    .expect("available overflow");
                group.reserved_balance = group
                    .reserved_balance
                    .checked_sub(payment.amount)
                    .expect("group reserved underflow");
                groups.insert(&group_id, &group);
                self.save_payroll_groups(leash_id, &groups);

                payment.reserved = false;
                payment.status = PayrollPaymentStatus::Failed;
                payment.settled_at_ns = Some(Self::now_ns());
                payroll_payments.insert(&payment_id, &payment);
                self.save_payroll_payments(leash_id, &payroll_payments);
                self.save_leash(&leash);

                AgentLeashEvent::PayrollPaymentFailed {
                    leash_id,
                    group_id,
                    payment_id,
                    worker_account: &payment.worker_account,
                    reason: "token transfer failed",
                }
                .emit();

                "failed".to_string()
            }
        }
    }
}

// Helper methods for storage
impl AgentLeash {
    pub(crate) fn payroll_groups_map(
        &self,
        leash_id: u64,
    ) -> near_sdk::collections::UnorderedMap<u64, PayrollGroup> {
        self.payroll_groups.get(&leash_id).unwrap_or_else(|| {
            near_sdk::collections::UnorderedMap::new(crate::StorageKey::PayrollGroups { leash_id })
        })
    }

    pub(crate) fn save_payroll_groups(
        &mut self,
        leash_id: u64,
        map: &near_sdk::collections::UnorderedMap<u64, PayrollGroup>,
    ) {
        self.payroll_groups.insert(&leash_id, map);
    }

    pub(crate) fn payroll_payments_map(
        &self,
        leash_id: u64,
    ) -> near_sdk::collections::UnorderedMap<u64, PayrollPaymentRecord> {
        self.payroll_payments.get(&leash_id).unwrap_or_else(|| {
            near_sdk::collections::UnorderedMap::new(crate::StorageKey::PayrollPayments {
                leash_id,
            })
        })
    }

    pub(crate) fn save_payroll_payments(
        &mut self,
        leash_id: u64,
        map: &near_sdk::collections::UnorderedMap<u64, PayrollPaymentRecord>,
    ) {
        self.payroll_payments.insert(&leash_id, map);
    }
}
