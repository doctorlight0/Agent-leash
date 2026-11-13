use near_contract_standards::fungible_token::core::ext_ft_core;
use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, Gas, NearToken, Promise};

use crate::events::AgentLeashEvent;
use crate::state::{Leash, PayeeConfig, PaymentRecord};
use crate::types::{PaymentStatus, SpendEntry, DAY_NS, MAX_REASON_BYTES};
use crate::{AgentLeash, AgentLeashExt, ContractError};

pub const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(15);
pub const GAS_FOR_SETTLEMENT_CALLBACK: Gas = Gas::from_tgas(15);

#[near]
impl AgentLeash {
    pub fn request_payment(
        &mut self,
        leash_id: u64,
        recipient: AccountId,
        amount: U128,
        reason: Option<String>,
        approval_expires_at_ns: Option<u64>,
    ) -> u64 {
        let mut leash = self.get_leash_or_panic(leash_id);
        let storage_before = env::storage_usage();
        self.assert_agent(&leash);
        let now = Self::now_ns();
        let allowlisted = self.is_payee_allowed(leash_id, &recipient);
        let auto_approved =
            !allowlisted && leash.auto_approve_limit != 0 && amount.0 <= leash.auto_approve_limit;
        // An immediate payment requires the recipient to be payable by the
        // agent AND the owner not to require approval for every payment.
        let immediately_payable = (allowlisted || auto_approved) && !leash.approval_required;

        // Common sanity checks that apply to every path.
        assert!(!leash.paused, "Leash paused");
        assert!(!leash.revoked, "Leash revoked");
        assert!(!leash.is_expired(now), "Leash expired");
        assert!(amount.0 > 0, "Amount must be positive");
        if let Some(r) = &reason {
            assert!(r.len() <= MAX_REASON_BYTES, "Reason too long");
        }
        if leash.cooldown_ns > 0 && leash.last_payment_at_ns > 0 {
            let next_allowed = leash.last_payment_at_ns.saturating_add(leash.cooldown_ns);
            assert!(now >= next_allowed, "Cooldown active");
        }
        // Monthly cap enforcement: check if amount exceeds monthly remaining.
        Self::assert_monthly_cap(&mut leash, amount.0, now);
        assert!(
            leash.pending_payment_count < leash.max_pending_payments,
            "Too many pending payments"
        );
        self.assert_rolling_capacity(&leash, amount.0, now);
        assert!(
            amount.0 <= leash.available_balance,
            "Insufficient available balance"
        );

        if !immediately_payable {
            // The agent cannot pay this recipient immediately. If the owner
            // does not require approval there is no fallback: reject.
            if !leash.approval_required {
                ContractError::RecipientNotAllowed.panic();
            }
            // Owner requires approval: queue the request, reserving funds so
            // the balance is protected while the owner decides. No settlement
            // is started.
            let payment_id = leash.next_payment_id;
            leash.next_payment_id = leash
                .next_payment_id
                .checked_add(1)
                .expect("payment id overflow");
            let expires = approval_expires_at_ns.unwrap_or(now.saturating_add(DAY_NS));
            assert!(expires > now, "Approval expiry must be in the future");
            let mut payment = PaymentRecord {
                leash_id,
                payment_id,
                requester: env::predecessor_account_id(),
                recipient: recipient.clone(),
                token_contract: leash.token_contract.clone(),
                amount: amount.0,
                reason,
                status: PaymentStatus::PendingApproval,
                created_at_ns: now,
                updated_at_ns: now,
                approval_expires_at_ns: Some(expires),
                reserved: false,
                payee_daily_period_start: None,
            };
            self.reserve_for_payment(&mut leash, &mut payment, now);
            payment.status = PaymentStatus::PendingApproval;
            self.save_payment(&payment);
            self.save_leash(&leash);
            self.record_storage_usage(&leash.owner_id, storage_before);
            AgentLeashEvent::PaymentRequested {
                leash_id,
                payment_id,
                recipient: &recipient,
                amount: &amount.0.to_string(),
                status: "pending_approval",
            }
            .emit();
            return payment_id;
        }

        // Immediate payment path: enforce the payee's effective per-payment
        // limit and fixed daily cap, and record the spend.
        let effective_limit = if allowlisted {
            self.payees_map(leash_id)
                .get(&recipient)
                .map(|c| c.effective_per_payment_limit(leash.per_payment_limit))
                .unwrap_or(leash.per_payment_limit)
        } else {
            leash.per_payment_limit
        };
        assert!(amount.0 <= effective_limit, "Over per-payment limit");
        let payee_cfg = self.validate_and_apply_payee_limits(&leash, &recipient, amount.0, now);

        let payment_id = leash.next_payment_id;
        leash.next_payment_id = leash
            .next_payment_id
            .checked_add(1)
            .expect("payment id overflow");

        let mut payment = PaymentRecord {
            leash_id,
            payment_id,
            requester: env::predecessor_account_id(),
            recipient: recipient.clone(),
            token_contract: leash.token_contract.clone(),
            amount: amount.0,
            reason,
            status: PaymentStatus::Settling,
            created_at_ns: now,
            updated_at_ns: now,
            approval_expires_at_ns: None,
            reserved: false,
            payee_daily_period_start: payee_cfg
                .as_ref()
                .filter(|cfg| cfg.daily_cap_active())
                .map(|cfg| cfg.period_start),
        };

        self.reserve_for_payment(&mut leash, &mut payment, now);
        if let Some(cfg) = payee_cfg {
            let mut payees = self.payees_map(leash_id);
            payees.insert(&recipient, &cfg);
            self.save_payees(leash_id, &payees);
        }
        self.save_payment(&payment);
        self.save_leash(&leash);
        self.record_storage_usage(&leash.owner_id, storage_before);
        AgentLeashEvent::PaymentRequested {
            leash_id,
            payment_id,
            recipient: &recipient,
            amount: &amount.0.to_string(),
            status: "settling",
        }
        .emit();

        let _ = self.start_settlement(payment);
        payment_id
    }

    /// Enforces the payee's effective per-payment limit and fixed daily cap,
    /// and records the spend if both pass. Agent approvals bypass this check;
    /// scheduled payments use it when they execute.
    ///
    /// Returns the updated `PayeeConfig` to persist, or `None` when the payee
    /// has no overrides and no spend to track.
    pub(crate) fn validate_and_apply_payee_limits(
        &self,
        leash: &Leash,
        payee: &AccountId,
        amount: u128,
        now_ns: u64,
    ) -> Option<PayeeConfig> {
        let mut cfg = self.payees_map(leash.leash_id).get(payee)?;
        if !cfg.allowed {
            return None;
        }
        let effective = cfg.effective_per_payment_limit(leash.per_payment_limit);
        assert!(amount <= effective, "Over per-payment limit");
        if cfg.daily_cap_active() {
            // Fixed 24-hour period starting at the payee's first payment.
            if cfg.period_start == 0 || now_ns >= cfg.period_start.saturating_add(DAY_NS) {
                cfg.spent = 0;
                cfg.period_start = now_ns;
            }
            let remaining = cfg.daily_cap.saturating_sub(cfg.spent);
            assert!(amount <= remaining, "Over payee daily cap");
            cfg.spent = cfg.spent.checked_add(amount).expect("payee spent overflow");
        }
        Some(cfg)
    }

    pub(crate) fn reserve_for_payment(
        &mut self,
        leash: &mut Leash,
        payment: &mut PaymentRecord,
        now_ns: u64,
    ) {
        assert!(
            leash.available_balance >= payment.amount,
            "Insufficient available balance"
        );
        leash.available_balance = leash
            .available_balance
            .checked_sub(payment.amount)
            .expect("balance underflow");
        leash.reserved_balance = leash
            .reserved_balance
            .checked_add(payment.amount)
            .expect("reserved overflow");
        leash.pending_payment_count = leash
            .pending_payment_count
            .checked_add(1)
            .expect("pending overflow");
        payment.reserved = true;
        payment.updated_at_ns = now_ns;
        let mut window = self.window_entries(leash.leash_id);
        window.push(SpendEntry {
            ts_ns: now_ns,
            amount: payment.amount,
            payment_id: payment.payment_id,
        });
        window.retain(|e| now_ns.saturating_sub(e.ts_ns) < self.effective_window_ns(leash));
        self.save_window(leash.leash_id, window);
    }

    pub(crate) fn release_reservation(&mut self, leash: &mut Leash, payment: &mut PaymentRecord) {
        if !payment.reserved {
            return;
        }
        leash.reserved_balance = leash
            .reserved_balance
            .checked_sub(payment.amount)
            .expect("reserved underflow");
        leash.available_balance = leash
            .available_balance
            .checked_add(payment.amount)
            .expect("available overflow");
        leash.pending_payment_count = leash
            .pending_payment_count
            .checked_sub(1)
            .expect("pending underflow");
        payment.reserved = false;
        payment.updated_at_ns = Self::now_ns();
        let mut window = self.window_entries(leash.leash_id);
        window.retain(|e| e.payment_id != payment.payment_id);
        self.save_window(leash.leash_id, window);
    }

    pub(crate) fn assert_monthly_cap(leash: &mut Leash, amount: u128, now_ns: u64) {
        // If no monthly cap, skip.
        if leash.monthly_cap == 0 {
            return;
        }
        leash.calculate_monthly_spent_reset(now_ns);
        // Check if the amount exceeds the remaining monthly cap.
        let remaining = leash
            .monthly_cap
            .checked_sub(leash.monthly_spent)
            .expect("monthly cap underflow");
        assert!(amount <= remaining, "Over monthly cap");
    }

    pub(crate) fn consume_reservation(&mut self, leash: &mut Leash, payment: &mut PaymentRecord) {
        if !payment.reserved {
            return;
        }
        leash.reserved_balance = leash
            .reserved_balance
            .checked_sub(payment.amount)
            .expect("reserved underflow");
        leash.pending_payment_count = leash
            .pending_payment_count
            .checked_sub(1)
            .expect("pending underflow");
        payment.reserved = false;
        payment.updated_at_ns = Self::now_ns();
        // Track monthly spending.
        leash.monthly_spent = leash
            .monthly_spent
            .checked_add(payment.amount)
            .expect("monthly spend overflow");
        leash.last_payment_at_ns = Self::now_ns();
    }

    pub(crate) fn release_payee_daily_spend(&mut self, payment: &PaymentRecord) {
        let Some(period_start) = payment.payee_daily_period_start else {
            return;
        };
        let mut payees = self.payees_map(payment.leash_id);
        let Some(mut config) = payees.get(&payment.recipient) else {
            return;
        };
        if config.period_start == period_start && config.spent >= payment.amount {
            config.spent = config
                .spent
                .checked_sub(payment.amount)
                .expect("payee spend underflow");
            payees.insert(&payment.recipient, &config);
            self.save_payees(payment.leash_id, &payees);
        }
    }

    pub(crate) fn assert_rolling_capacity(&self, leash: &Leash, amount: u128, now_ns: u64) {
        let window_ns = self.effective_window_ns(leash);
        let window = self.window_entries(leash.leash_id);
        let spent: u128 = window
            .iter()
            .filter(|e| now_ns.saturating_sub(e.ts_ns) < window_ns)
            .map(|e| e.amount)
            .fold(0u128, |acc, a| {
                acc.checked_add(a).expect("rolling overflow")
            });
        let total = spent.checked_add(amount).expect("rolling overflow");
        assert!(total <= leash.rolling_limit, "Over rolling limit");
    }

    pub(crate) fn effective_window_ns(&self, leash: &Leash) -> u64 {
        if leash.rolling_window_ns == 0 {
            DAY_NS
        } else {
            leash.rolling_window_ns
        }
    }

    pub(crate) fn save_payment(&mut self, payment: &PaymentRecord) {
        let mut payments = self.payments_map(payment.leash_id);
        payments.insert(&payment.payment_id, payment);
        self.save_payments(payment.leash_id, &payments);
    }

    pub(crate) fn get_payment_or_panic(&self, leash_id: u64, payment_id: u64) -> PaymentRecord {
        self.payments_map(leash_id)
            .get(&payment_id)
            .expect("Payment not found")
    }

    pub(crate) fn start_settlement(&mut self, payment: PaymentRecord) -> Promise {
        ext_ft_core::ext(payment.token_contract.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(
                payment.recipient.clone(),
                U128(payment.amount),
                Some(format!(
                    "agent-leash:{}:{}",
                    payment.leash_id, payment.payment_id
                )),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_SETTLEMENT_CALLBACK)
                    .on_payment_settled(payment.leash_id, payment.payment_id),
            )
    }
}
