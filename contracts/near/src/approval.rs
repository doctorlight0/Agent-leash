use near_sdk::{env, near, Promise};

use crate::events::AgentLeashEvent;
use crate::types::PaymentStatus;
use crate::{AgentLeash, AgentLeashExt};

#[near]
impl AgentLeash {
    pub fn approve_payment(&mut self, leash_id: u64, payment_id: u64) -> Promise {
        let leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        let mut payment = self.get_payment_or_panic(leash_id, payment_id);
        assert!(!payment.is_terminal(), "Payment already terminal");
        assert_eq!(
            payment.status,
            PaymentStatus::PendingApproval,
            "Payment not pending approval"
        );
        assert_eq!(
            payment.requester, leash.agent_id,
            "Approval bound to original agent request"
        );
        assert_eq!(
            payment.leash_id, leash_id,
            "Payment belongs to a different leash"
        );
        assert_eq!(
            payment.token_contract, leash.token_contract,
            "Payment token does not match leash"
        );
        if let Some(exp) = payment.approval_expires_at_ns {
            assert!(Self::now_ns() < exp, "Approval expired");
        }
        assert!(!leash.paused, "Leash paused");
        assert!(!leash.revoked, "Leash revoked");
        assert!(!leash.is_expired(Self::now_ns()), "Leash expired");
        assert!(payment.reserved, "Funds not reserved");

        payment.status = PaymentStatus::Settling;
        payment.updated_at_ns = Self::now_ns();
        self.save_payment(&payment);
        AgentLeashEvent::PaymentApproved {
            leash_id,
            payment_id,
            approver: &env::predecessor_account_id(),
        }
        .emit();
        self.start_settlement(payment)
    }

    pub fn reject_payment(&mut self, leash_id: u64, payment_id: u64) {
        let mut leash = self.get_leash_or_panic(leash_id);
        self.assert_owner(&leash);
        let mut payment = self.get_payment_or_panic(leash_id, payment_id);
        assert!(!payment.is_terminal(), "Payment already terminal");
        assert_eq!(
            payment.status,
            PaymentStatus::PendingApproval,
            "Payment not pending approval"
        );
        self.release_reservation(&mut leash, &mut payment);
        payment.status = PaymentStatus::Rejected;
        payment.updated_at_ns = Self::now_ns();
        self.save_payment(&payment);
        self.save_leash(&leash);
        AgentLeashEvent::PaymentRejected {
            leash_id,
            payment_id,
            approver: &env::predecessor_account_id(),
        }
        .emit();
    }

    pub fn expire_payment(&mut self, leash_id: u64, payment_id: u64) {
        let mut leash = self.get_leash_or_panic(leash_id);
        let mut payment = self.get_payment_or_panic(leash_id, payment_id);
        assert!(!payment.is_terminal(), "Payment already terminal");
        assert_eq!(
            payment.status,
            PaymentStatus::PendingApproval,
            "Payment not pending approval"
        );
        let exp = payment
            .approval_expires_at_ns
            .expect("Approval has no expiry");
        assert!(Self::now_ns() >= exp, "Approval not expired");
        self.release_reservation(&mut leash, &mut payment);
        payment.status = PaymentStatus::Expired;
        payment.updated_at_ns = Self::now_ns();
        self.save_payment(&payment);
        self.save_leash(&leash);
    }
}
