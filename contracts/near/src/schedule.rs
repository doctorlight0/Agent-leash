use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, PromiseOrValue};

use crate::state::{PaymentRecord, Schedule};
use crate::types::{
    PaymentStatus, MAX_SCHEDULES_DEFAULT, MAX_SCHEDULES_PER_LEASH, MIN_SCHEDULE_INTERVAL_NS,
};
use crate::{AgentLeash, AgentLeashExt};

#[near]
impl AgentLeash {
    #[allow(clippy::too_many_arguments)]
    pub fn create_schedule(
        &mut self,
        leash_id: u64,
        recipient: AccountId,
        amount: U128,
        execute_after_ns: u64,
        expires_at_ns: Option<u64>,
        reason: Option<String>,
        interval_ns: u64,
        max_runs: u32,
    ) -> u64 {
        let mut leash = self.get_leash_or_panic(leash_id);
        let caller = env::predecessor_account_id();
        assert!(
            caller == leash.owner_id || caller == leash.agent_id,
            "Only owner or agent"
        );
        assert!(!leash.revoked, "Leash revoked");
        assert!(!leash.paused, "Leash paused");
        assert!(!leash.is_expired(Self::now_ns()), "Leash expired");
        assert!(amount.0 > 0, "Amount must be positive");
        assert!(
            amount.0 <= leash.per_payment_limit,
            "Over per-payment limit"
        );
        if caller == leash.agent_id {
            assert!(
                !leash.approval_required,
                "Agent schedules disabled when owner approval is required"
            );
            assert!(
                self.is_payee_allowed(leash_id, &recipient)
                    || (leash.auto_approve_limit != 0 && amount.0 <= leash.auto_approve_limit),
                "recipient_not_allowed"
            );
        }
        if self.is_payee_allowed(leash_id, &recipient) {
            let config = self
                .payees_map(leash_id)
                .get(&recipient)
                .expect("allowlisted payee config missing");
            assert!(
                amount.0 <= config.effective_per_payment_limit(leash.per_payment_limit),
                "Over per-payment limit"
            );
            if config.daily_cap_active() {
                assert!(amount.0 <= config.daily_cap, "Over payee daily cap");
            }
        }
        if let Some(r) = &reason {
            assert!(r.len() <= crate::types::MAX_REASON_BYTES, "Reason too long");
        }
        if let Some(exp) = expires_at_ns {
            assert!(exp > execute_after_ns, "Schedule expiry before execution");
        }
        // A zero interval is one-shot. max_runs=0 means unlimited only for
        // recurring schedules; one-shot schedules always have exactly one run.
        if interval_ns == 0 {
            assert!(max_runs <= 1, "One-shot max_runs must be 0 or 1");
        } else if interval_ns < MIN_SCHEDULE_INTERVAL_NS {
            panic!(
                "interval too short; minimum is {}",
                MIN_SCHEDULE_INTERVAL_NS
            );
        }
        // Active recurring schedules count against the in-flight schedule cap
        // only while they are due-or-future and not yet terminal.
        let schedules = self.schedules_map(leash_id);
        let active = schedules
            .values()
            .filter(|s| s.active && !s.executed)
            .count() as u32;
        assert!(active < MAX_SCHEDULES_DEFAULT, "Too many schedules");
        assert!(
            (schedules.len() as u32) < MAX_SCHEDULES_PER_LEASH.try_into().unwrap(),
            "Too many schedules stored"
        );
        let storage_before = env::storage_usage();
        // Recurring schedules that are unbounded can in principle live forever.
        // The storage cap is therefore enforced on creation and on each new
        // occurrence generation path is intentionally avoided: we do not pre-
        // create occurrences. Each run creates exactly one payment and advances
        // `next_due_ns` in place, so storage growth is bounded by the active
        // schedule count, not by the run count.

        let schedule_id = leash.next_schedule_id;
        leash.next_schedule_id = leash
            .next_schedule_id
            .checked_add(1)
            .expect("schedule id overflow");
        let schedule = Schedule {
            execute_after_ns,
            leash_id,
            schedule_id,
            creator: caller,
            recipient,
            amount: amount.0,
            interval_ns,
            next_due_ns: execute_after_ns,
            expires_at_ns,
            reason,
            active: true,
            executed: false,
            max_runs,
            runs: 0,
            created_at_ns: Self::now_ns(),
        };
        let mut schedules = schedules;
        schedules.insert(&schedule_id, &schedule);
        self.save_schedules(leash_id, &schedules);
        self.save_leash(&leash);
        self.record_storage_usage(&leash.owner_id, storage_before);
        crate::events::AgentLeashEvent::ScheduleCreated {
            leash_id,
            schedule_id,
            execute_after_ns,
            interval_ns,
            max_runs,
        }
        .emit();
        schedule_id
    }

    pub fn execute_schedule(&mut self, leash_id: u64, schedule_id: u64) -> PromiseOrValue<u64> {
        let mut leash = self.get_leash_or_panic(leash_id);
        let storage_before = env::storage_usage();
        let mut schedules = self.schedules_map(leash_id);
        let mut schedule = schedules.get(&schedule_id).expect("Schedule not found");
        let now = Self::now_ns();

        // Terminal guards are checked before any state change so a duplicate or
        // delayed call cannot create a second payment for the same scheduled
        // occurrence.
        if schedule.executed {
            // One-shot schedules are terminal after a single successful or
            // failed run; recurring schedules remain active between runs but
            // each specific occurrence is represented by the in-place state at
            // the moment of execution, so a retry for the same `next_due_ns`
            // is impossible because `next_due_ns` only moves forward.
            env::panic_str("Schedule already executed");
        }
        if !schedule.active {
            env::panic_str("Schedule inactive");
        }
        if now < schedule.next_due_ns {
            env::panic_str("Schedule not due");
        }
        if schedule.is_expired(now) {
            env::panic_str("Schedule expired");
        }
        assert!(!leash.paused, "Leash paused");
        assert!(!leash.revoked, "Leash revoked");
        assert!(!leash.is_expired(now), "Leash expired");
        // Monthly cap enforcement for schedule executions.
        Self::assert_monthly_cap(&mut leash, schedule.amount, now);
        assert!(
            leash.pending_payment_count < leash.max_pending_payments,
            "Too many pending payments"
        );
        if leash.cooldown_ns > 0 && leash.last_payment_at_ns > 0 {
            let next_allowed = leash.last_payment_at_ns.saturating_add(leash.cooldown_ns);
            assert!(now >= next_allowed, "Cooldown active");
        }
        self.assert_rolling_capacity(&leash, schedule.amount, now);
        assert!(
            schedule.amount <= leash.per_payment_limit,
            "Over per-payment limit"
        );
        let allowed = self.is_payee_allowed(leash_id, &schedule.recipient);
        if schedule.creator != leash.owner_id {
            assert_eq!(
                schedule.creator, leash.agent_id,
                "Schedule creator is no longer the assigned agent"
            );
            assert!(
                !leash.approval_required,
                "Agent schedules disabled when owner approval is required"
            );
            assert!(
                allowed
                    || (leash.auto_approve_limit != 0
                        && schedule.amount <= leash.auto_approve_limit),
                "recipient_not_allowed"
            );
        }
        let payee_config =
            self.validate_and_apply_payee_limits(&leash, &schedule.recipient, schedule.amount, now);
        assert!(
            schedule.amount <= leash.available_balance,
            "Insufficient available balance"
        );

        let next_run = schedule
            .runs
            .checked_add(1)
            .expect("schedule runs overflow");
        let next_due = if schedule.interval_ns > 0
            && (schedule.max_runs == 0 || next_run < schedule.max_runs)
        {
            let elapsed = now
                .checked_sub(schedule.next_due_ns)
                .expect("schedule due timestamp invariant");
            let intervals = elapsed
                .checked_div(schedule.interval_ns)
                .and_then(|n| n.checked_add(1))
                .expect("schedule interval count overflow");
            let advance = schedule
                .interval_ns
                .checked_mul(intervals)
                .expect("schedule next_due overflow");
            Some(
                schedule
                    .next_due_ns
                    .checked_add(advance)
                    .expect("schedule next_due overflow"),
            )
        } else {
            None
        };

        let payment_id = leash.next_payment_id;
        leash.next_payment_id = leash
            .next_payment_id
            .checked_add(1)
            .expect("payment id overflow");
        let mut payment = PaymentRecord {
            leash_id,
            payment_id,
            requester: schedule.creator.clone(),
            recipient: schedule.recipient.clone(),
            token_contract: leash.token_contract.clone(),
            amount: schedule.amount,
            reason: schedule.reason.clone(),
            status: PaymentStatus::Settling,
            created_at_ns: now,
            updated_at_ns: now,
            approval_expires_at_ns: None,
            reserved: false,
            payee_daily_period_start: payee_config
                .as_ref()
                .filter(|cfg| cfg.daily_cap_active())
                .map(|cfg| cfg.period_start),
        };

        self.reserve_for_payment(&mut leash, &mut payment, now);
        if let Some(config) = payee_config {
            let mut payees = self.payees_map(leash_id);
            payees.insert(&schedule.recipient, &config);
            self.save_payees(leash_id, &payees);
        }

        // Claim and advance the occurrence before starting the async transfer.
        // A failed transfer still consumes the occurrence, so retries cannot
        // pay the same schedule occurrence twice.
        if schedule.interval_ns == 0 {
            schedule.runs = 1;
            schedule.executed = true;
            schedule.active = false;
        } else if let Some(next_due) = next_due {
            schedule.runs = next_run;
            schedule.next_due_ns = next_due;
        } else {
            schedule.runs = next_run;
            schedule.active = false;
            schedule.executed = true;
        }

        schedules.insert(&schedule_id, &schedule);
        self.save_schedules(leash_id, &schedules);
        self.save_payment(&payment);
        self.save_leash(&leash);
        self.record_storage_usage(&leash.owner_id, storage_before);
        crate::events::AgentLeashEvent::ScheduleExecutionRequested {
            leash_id,
            schedule_id,
            payment_id,
            run: schedule.runs,
        }
        .emit();
        PromiseOrValue::Promise(self.start_settlement(payment))
    }

    /// Cancel a schedule and mark it terminal. Cancellation is permanent and
    /// prevents any future execution, including delayed or retried calls.
    pub fn cancel_schedule(&mut self, leash_id: u64, schedule_id: u64) {
        let leash = self.get_leash_or_panic(leash_id);
        let caller = env::predecessor_account_id();
        let mut schedules = self.schedules_map(leash_id);
        let mut schedule = schedules.get(&schedule_id).expect("Schedule not found");
        assert!(
            caller == leash.owner_id || caller == schedule.creator,
            "Unauthorized"
        );
        assert!(schedule.active && !schedule.executed, "Schedule not active");
        schedule.active = false;
        schedule.executed = true;
        schedules.insert(&schedule_id, &schedule);
        self.save_schedules(leash_id, &schedules);
        crate::events::AgentLeashEvent::ScheduleCancelled {
            leash_id,
            schedule_id,
        }
        .emit();
    }

    /// Finalize a schedule whose expiry timestamp has passed. Anyone may call
    /// this; no payment is created and terminal schedules cannot be revived.
    pub fn expire_schedule(&mut self, leash_id: u64, schedule_id: u64) -> bool {
        let mut schedules = self.schedules_map(leash_id);
        let Some(mut schedule) = schedules.get(&schedule_id) else {
            return false;
        };
        if !schedule.active || schedule.executed || !schedule.is_expired(Self::now_ns()) {
            return false;
        }
        schedule.active = false;
        schedule.executed = true;
        schedules.insert(&schedule_id, &schedule);
        self.save_schedules(leash_id, &schedules);
        crate::events::AgentLeashEvent::ScheduleExpired {
            leash_id,
            schedule_id,
        }
        .emit();
        true
    }
}
