use near_sdk::{near, PromiseError, PromiseOrValue};

use crate::events::AgentLeashEvent;
use crate::types::PaymentStatus;
use crate::{AgentLeash, AgentLeashExt};

#[near]
impl AgentLeash {
    #[private]
    pub fn on_payment_settled(
        &mut self,
        leash_id: u64,
        payment_id: u64,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> PromiseOrValue<String> {
        let mut leash = self.get_leash_or_panic(leash_id);
        let mut payment = self.get_payment_or_panic(leash_id, payment_id);
        if payment.is_terminal() {
            return PromiseOrValue::Value(payment_status_label(&payment.status).to_string());
        }
        if !matches!(payment.status, PaymentStatus::Settling) {
            return PromiseOrValue::Value(payment_status_label(&payment.status).to_string());
        }
        match result {
            Ok(_) => {
                self.consume_reservation(&mut leash, &mut payment);
                payment.status = PaymentStatus::Settled;
                payment.updated_at_ns = Self::now_ns();
                self.save_payment(&payment);
                self.save_leash(&leash);
                AgentLeashEvent::PaymentSettled {
                    leash_id,
                    payment_id,
                    recipient: &payment.recipient,
                    amount: &payment.amount.to_string(),
                }
                .emit();
                PromiseOrValue::Value("settled".to_string())
            }
            Err(_) => {
                self.release_reservation(&mut leash, &mut payment);
                self.release_payee_daily_spend(&payment);
                payment.status = PaymentStatus::Failed;
                payment.updated_at_ns = Self::now_ns();
                self.save_payment(&payment);
                self.save_leash(&leash);
                AgentLeashEvent::PaymentFailed {
                    leash_id,
                    payment_id,
                    reason: "token transfer failed",
                }
                .emit();
                PromiseOrValue::Value("failed".to_string())
            }
        }
    }
}

fn payment_status_label(status: &PaymentStatus) -> &'static str {
    match status {
        PaymentStatus::Requested => "requested",
        PaymentStatus::PendingApproval => "pending_approval",
        PaymentStatus::Settling => "settling",
        PaymentStatus::Settled => "settled",
        PaymentStatus::Rejected => "rejected",
        PaymentStatus::Failed => "failed",
        PaymentStatus::Cancelled => "cancelled",
        PaymentStatus::Expired => "expired",
    }
}
