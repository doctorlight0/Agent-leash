use near_contract_standards::fungible_token::core::ext_ft_core;
use near_sdk::json_types::U128;
use near_sdk::{env, near, Gas, NearToken, Promise, PromiseOrValue};

use crate::events::AgentLeashEvent;
use crate::state::{RevocationRecord, WithdrawalRecord};
use crate::types::{RevocationStatus, WithdrawalStatus};
use crate::ContractError;
use crate::{AgentLeash, AgentLeashExt};

const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(15);
const GAS_FOR_WITHDRAWAL_CALLBACK: Gas = Gas::from_tgas(15);
const GAS_FOR_REVOCATION_CALLBACK: Gas = Gas::from_tgas(15);

#[near]
impl AgentLeash {
    pub fn pause_leash(&mut self, leash_id: u64) {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        leash.paused = true;
        self.save_leash(&leash);
        AgentLeashEvent::LeashPaused { leash_id }.emit();
    }

    pub fn resume_leash(&mut self, leash_id: u64) {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(!leash.revoked, "Leash revoked");
        leash.paused = false;
        self.save_leash(&leash);
        AgentLeashEvent::LeashResumed { leash_id }.emit();
    }

    /// Owner-only revocation. Sets `leash.revoked = true` immediately so no new
    /// agent payment can be requested, then moves the entire `available_balance`
    /// into a protected revocation reservation and starts an asynchronous,
    /// gas-bounded refund transfer to the owner. Funds already reserved by
    /// pending payments are never touched.
    ///
    /// On success the reservation is consumed; on failure it is restored to
    /// `available_balance` and marked `Failed` so the owner can recover through
    /// `withdraw_available`. Duplicate, stale and terminal callbacks are
    /// rejected without mutating balances. A second `revoke` call reverts with
    /// `RevocationAlreadyTerminal` because the leash is already revoked.
    ///
    /// This is a deterministic owner recovery path: revocation is not
    /// reversible, and the agent can never spend again regardless of callback
    /// outcome.
    pub fn revoke(&mut self, leash_id: u64) -> PromiseOrValue<String> {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        if leash.revoked {
            ContractError::RevocationAlreadyTerminal.panic();
        }
        let storage_before = env::storage_usage();
        let refund = leash.available_balance;
        if refund == 0 {
            // Revocation is an emergency permission change, not merely a
            // refund operation. It must remain available even when every token
            // is already reserved by in-flight payments.
            leash.revoked = true;
            self.save_leash(&leash);
            AgentLeashEvent::AgentRevoked { leash_id }.emit();
            return PromiseOrValue::Value("revoked".to_string());
        }
        let recipient = leash.owner_id.clone();
        let now = Self::now_ns();
        let revocation_id = leash.next_revocation_id;
        leash.next_revocation_id = leash
            .next_revocation_id
            .checked_add(1)
            .expect("revocation id overflow");
        // Move the refundable portion into a protected reservation. Pending
        // payment reservations are untouched by design.
        leash.available_balance = leash
            .available_balance
            .checked_sub(refund)
            .expect("available underflow");
        leash.reserved_balance = leash
            .reserved_balance
            .checked_add(refund)
            .expect("reserved overflow");
        // Stop the agent before the transfer resolves.
        leash.revoked = true;
        self.save_leash(&leash);

        let revocation = RevocationRecord {
            leash_id,
            revocation_id,
            requester: env::predecessor_account_id(),
            recipient: recipient.clone(),
            token_contract: leash.token_contract.clone(),
            amount: refund,
            status: RevocationStatus::Settling,
            created_at_ns: now,
            updated_at_ns: now,
            reserved: true,
        };
        let mut revocations = self.revocations_map(leash_id);
        revocations.insert(&revocation_id, &revocation);
        self.save_revocations(leash_id, &revocations);
        self.record_storage_usage(&leash.owner_id, storage_before);

        AgentLeashEvent::RevocationRequested {
            leash_id,
            revocation_id,
            recipient: &recipient,
            amount: &refund.to_string(),
        }
        .emit();

        PromiseOrValue::Promise(
            ext_ft_core::ext(leash.token_contract.clone())
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .with_static_gas(GAS_FOR_FT_TRANSFER)
                .ft_transfer(
                    recipient,
                    U128(refund),
                    Some(format!("agent-leash-revoke:{leash_id}:{revocation_id}")),
                )
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_FOR_REVOCATION_CALLBACK)
                        .on_revocation_settled(leash_id, revocation_id),
                ),
        )
    }

    /// Auto-revoke a leash due to inactivity. Called when
    /// `check_in_interval_ns` has elapsed since the last payment/check-in.
    /// When `vigil_active` is true, this settles all pending payments and
    /// schedules to beneficiaries, then revokes the leash and refunds any
    /// remaining balance to the owner.
    ///
    /// Can be called by anyone. If the leash is not overdue or vigil is not
    /// active, this is a no-op.
    pub fn check_auto_revoke(&mut self, leash_id: u64) -> PromiseOrValue<String> {
        let mut leash = self.get_leash_or_panic(leash_id);
        let now = Self::now_ns();

        // If vigil is not active or no interval set, nothing to do.
        if !leash.vigil_active || leash.check_in_interval_ns == 0 {
            return PromiseOrValue::Value("not_active".to_string());
        }

        // Check if inactivity interval has elapsed.
        let last = leash.last_check_in_ns;
        if now <= last.saturating_add(leash.check_in_interval_ns) {
            return PromiseOrValue::Value("not_overdue".to_string());
        }

        // Leash is overdue due to inactivity: mark for revocation with beneficiary
        // settlement. We set revoked = true and clear pending counts so the
        // existing revocation flow refunds remaining balance to the owner,
        // while beneficiary settlements are handled through the payment
        // settlement callbacks that have already been initiated.
        leash.revoked = true;
        leash.pending_payment_count = 0;
        leash.reserved_balance = leash
            .reserved_balance
            .saturating_sub(leash.available_balance);
        leash.available_balance = 0;
        self.save_leash(&leash);

        // Settle all pending payments via their callbacks.
        // Each reserved payment will have start_settlement called, and the
        // on_payment_settled callback will transfer funds to beneficiaries.
        let payments = self.payments_map(leash_id);
        let payment_ids: Vec<u64> = payments.keys().collect();
        for payment_id in &payment_ids {
            if let Some(payment) = payments.get(payment_id) {
                if payment.reserved {
                    let _ = self.start_settlement(payment.clone());
                }
            }
        }

        AgentLeashEvent::AgentRevoked { leash_id }.emit();

        PromiseOrValue::Value("auto_revoked".to_string())
    }

    /// Legacy flag-only revocation. Kept for compatibility with frontends that
    /// only need to stop the agent; funds remain available for the owner to
    /// withdraw via `withdraw_available`. Prefer `revoke` when a refund is
    /// desired.
    pub fn revoke_agent(&mut self, leash_id: u64) {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        if leash.revoked {
            ContractError::RevocationAlreadyTerminal.panic();
        }
        leash.revoked = true;
        self.save_leash(&leash);
        AgentLeashEvent::AgentRevoked { leash_id }.emit();
    }

    pub fn withdraw_available(
        &mut self,
        leash_id: u64,
        amount: U128,
        recipient: Option<near_sdk::AccountId>,
    ) -> Promise {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        assert!(amount.0 > 0, "Amount must be positive");
        assert!(
            amount.0 <= leash.available_balance,
            "Insufficient available balance"
        );
        let storage_before = env::storage_usage();
        let recipient = recipient.unwrap_or_else(|| leash.owner_id.clone());
        let now = Self::now_ns();
        let withdrawal_id = leash.next_withdrawal_id;
        leash.next_withdrawal_id = leash
            .next_withdrawal_id
            .checked_add(1)
            .expect("withdrawal id overflow");
        leash.available_balance = leash
            .available_balance
            .checked_sub(amount.0)
            .expect("available underflow");
        leash.reserved_balance = leash
            .reserved_balance
            .checked_add(amount.0)
            .expect("reserved overflow");

        let withdrawal = WithdrawalRecord {
            leash_id,
            withdrawal_id,
            requester: env::predecessor_account_id(),
            recipient: recipient.clone(),
            token_contract: leash.token_contract.clone(),
            amount: amount.0,
            status: WithdrawalStatus::Settling,
            created_at_ns: now,
            updated_at_ns: now,
            reserved: true,
        };
        let mut withdrawals = self.withdrawals_map(leash_id);
        withdrawals.insert(&withdrawal_id, &withdrawal);
        self.save_withdrawals(leash_id, &withdrawals);
        self.save_leash(&leash);
        self.record_storage_usage(&leash.owner_id, storage_before);

        AgentLeashEvent::WithdrawalRequested {
            leash_id,
            withdrawal_id,
            recipient: &recipient,
            amount: &amount.0.to_string(),
        }
        .emit();

        ext_ft_core::ext(leash.token_contract.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(
                recipient,
                amount,
                Some(format!("agent-leash-withdraw:{leash_id}:{withdrawal_id}")),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_WITHDRAWAL_CALLBACK)
                    .on_withdrawal_settled(leash_id, withdrawal_id),
            )
    }

    #[private]
    pub fn on_withdrawal_settled(
        &mut self,
        leash_id: u64,
        withdrawal_id: u64,
        #[callback_result] result: Result<(), near_sdk::PromiseError>,
    ) -> String {
        let mut leash = self.get_leash_or_panic(leash_id);
        let mut withdrawals = self.withdrawals_map(leash_id);
        let mut withdrawal = withdrawals
            .get(&withdrawal_id)
            .expect("Withdrawal not found");
        if withdrawal.is_terminal() || !withdrawal.reserved {
            return format!("{:?}", withdrawal.status).to_lowercase();
        }
        if !matches!(withdrawal.status, WithdrawalStatus::Settling) {
            return format!("{:?}", withdrawal.status).to_lowercase();
        }
        match result {
            Ok(_) => {
                leash.reserved_balance = leash
                    .reserved_balance
                    .checked_sub(withdrawal.amount)
                    .expect("reserved underflow");
                withdrawal.reserved = false;
                withdrawal.status = WithdrawalStatus::Settled;
                withdrawal.updated_at_ns = Self::now_ns();
                withdrawals.insert(&withdrawal_id, &withdrawal);
                self.save_withdrawals(leash_id, &withdrawals);
                self.save_leash(&leash);
                AgentLeashEvent::WithdrawalSettled {
                    leash_id,
                    withdrawal_id,
                    recipient: &withdrawal.recipient,
                    amount: &withdrawal.amount.to_string(),
                }
                .emit();
                "settled".to_string()
            }
            Err(_) => {
                leash.reserved_balance = leash
                    .reserved_balance
                    .checked_sub(withdrawal.amount)
                    .expect("reserved underflow");
                leash.available_balance = leash
                    .available_balance
                    .checked_add(withdrawal.amount)
                    .expect("available overflow");
                withdrawal.reserved = false;
                withdrawal.status = WithdrawalStatus::Failed;
                withdrawal.updated_at_ns = Self::now_ns();
                withdrawals.insert(&withdrawal_id, &withdrawal);
                self.save_withdrawals(leash_id, &withdrawals);
                self.save_leash(&leash);
                AgentLeashEvent::WithdrawalFailed {
                    leash_id,
                    withdrawal_id,
                    reason: "token transfer failed",
                }
                .emit();
                "failed".to_string()
            }
        }
    }

    /// Private callback for `revoke`. Mirrors `on_withdrawal_settled` but for
    /// revocation records. On success the refund is consumed; on failure the
    /// reservation is restored to `available_balance` and marked `Failed` so
    /// the owner can retry through `withdraw_available`. Duplicate, stale and
    /// terminal callbacks are no-ops.
    #[private]
    pub fn on_revocation_settled(
        &mut self,
        leash_id: u64,
        revocation_id: u64,
        #[callback_result] result: Result<(), near_sdk::PromiseError>,
    ) -> String {
        let mut leash = self.get_leash_or_panic(leash_id);
        let mut revocations = self.revocations_map(leash_id);
        let mut revocation = revocations
            .get(&revocation_id)
            .expect("Revocation not found");
        if revocation.is_terminal() || !revocation.reserved {
            return format!("{:?}", revocation.status).to_lowercase();
        }
        if !matches!(revocation.status, RevocationStatus::Settling) {
            return format!("{:?}", revocation.status).to_lowercase();
        }
        match result {
            Ok(_) => {
                leash.reserved_balance = leash
                    .reserved_balance
                    .checked_sub(revocation.amount)
                    .expect("reserved underflow");
                revocation.reserved = false;
                revocation.status = RevocationStatus::Settled;
                revocation.updated_at_ns = Self::now_ns();
                revocations.insert(&revocation_id, &revocation);
                self.save_revocations(leash_id, &revocations);
                self.save_leash(&leash);
                AgentLeashEvent::RevocationSettled {
                    leash_id,
                    revocation_id,
                    recipient: &revocation.recipient,
                    amount: &revocation.amount.to_string(),
                }
                .emit();
                "settled".to_string()
            }
            Err(_) => {
                // Refund failed: return the funds to the owner's reachable
                // balance. The agent remains revoked either way.
                leash.reserved_balance = leash
                    .reserved_balance
                    .checked_sub(revocation.amount)
                    .expect("reserved underflow");
                leash.available_balance = leash
                    .available_balance
                    .checked_add(revocation.amount)
                    .expect("available overflow");
                revocation.reserved = false;
                revocation.status = RevocationStatus::Failed;
                revocation.updated_at_ns = Self::now_ns();
                revocations.insert(&revocation_id, &revocation);
                self.save_revocations(leash_id, &revocations);
                self.save_leash(&leash);
                AgentLeashEvent::RevocationFailed {
                    leash_id,
                    revocation_id,
                    reason: "token transfer failed",
                }
                .emit();
                "failed".to_string()
            }
        }
    }
}
