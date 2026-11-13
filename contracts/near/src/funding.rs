use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use near_sdk::{env, near, serde_json, AccountId, PromiseOrValue};

use crate::events::AgentLeashEvent;
use crate::types::FundingMessage;
use crate::{AgentLeash, AgentLeashExt};

#[near]
impl FungibleTokenReceiver for AgentLeash {
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        if amount.0 == 0 {
            return PromiseOrValue::Value(amount);
        }
        let token_contract = env::predecessor_account_id();
        if !self.supported_tokens.contains(&token_contract) {
            return PromiseOrValue::Value(amount);
        }
        let parsed: Result<FundingMessage, _> = serde_json::from_str(&msg);
        let Ok(FundingMessage::Fund { leash_id }) = parsed else {
            return PromiseOrValue::Value(amount);
        };
        let Some(mut leash) = self.leashes.get(&leash_id) else {
            return PromiseOrValue::Value(amount);
        };
        if leash.owner_id != sender_id {
            return PromiseOrValue::Value(amount);
        }
        if leash.token_contract != token_contract {
            return PromiseOrValue::Value(amount);
        }
        if leash.revoked {
            return PromiseOrValue::Value(amount);
        }
        // Enforce the immutable balance cap. The cap bounds `available +
        // reserved`, i.e. the total tokens the leash holds at one moment, so a
        // top-up that would exceed it is rejected in full and the FT contract
        // refunds the sender. Checked arithmetic prevents overflow.
        let current_total = leash
            .available_balance
            .checked_add(leash.reserved_balance)
            .expect("balance overflow");
        let headroom = leash
            .balance_cap
            .checked_sub(current_total)
            .expect("cap below current total");
        if amount.0 > headroom {
            return PromiseOrValue::Value(amount);
        }
        let Some(new_balance) = leash.available_balance.checked_add(amount.0) else {
            return PromiseOrValue::Value(amount);
        };
        leash.available_balance = new_balance;
        self.save_leash(&leash);
        AgentLeashEvent::Funded {
            leash_id,
            token_contract: &token_contract,
            sender_id: &sender_id,
            amount: &amount.0.to_string(),
            new_balance: &new_balance.to_string(),
        }
        .emit();
        PromiseOrValue::Value(U128(0))
    }
}
