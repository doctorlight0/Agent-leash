use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::{assert_one_yocto, env, near, AccountId, Gas, NearToken, Promise, PromiseError};

use crate::state::StorageAccount;
use crate::{AgentLeash, AgentLeashExt};

/// The callback performs one storage-account read and either one write or one
/// removal, plus promise-result decoding. Fifteen Tgas matches the other
/// state-mutating callbacks and provides a conservative explicit budget.
/// Actual sandbox gas consumption remains a deployment-time verification gate.
pub const GAS_FOR_STORAGE_REFUND_CALLBACK: Gas = Gas::from_tgas(15);

#[near]
impl StorageManagement for AgentLeash {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        let payer = env::predecessor_account_id();
        let beneficiary = account_id.unwrap_or_else(|| payer.clone());
        let deposit = env::attached_deposit().as_yoctonear();
        let registration_only = registration_only.unwrap_or(false);

        if let Some(mut account) = self.storage_accounts.get(&beneficiary) {
            assert!(!account.unregistering, "Storage unregister in progress");
            assert_eq!(
                account.pending_refund_amount, 0,
                "Storage refund in progress"
            );
            if deposit > 0 {
                account.total = account
                    .total
                    .checked_add(deposit)
                    .expect("storage balance overflow");
                self.storage_accounts.insert(&beneficiary, &account);
                if registration_only {
                    self.start_storage_refund(&beneficiary, &payer, deposit, false);
                }
            }
        } else {
            let minimum = self.minimum_storage_balance().as_yoctonear();
            assert!(deposit >= minimum, "Attached deposit below storage minimum");
            let before = env::storage_usage();
            let mut account = StorageAccount {
                total: deposit,
                used_bytes: 0,
                next_refund_id: 1,
                pending_refund_id: 0,
                pending_refund_amount: 0,
                unregistering: false,
            };
            self.storage_accounts.insert(&beneficiary, &account);
            account.used_bytes = env::storage_usage()
                .checked_sub(before)
                .expect("storage usage decreased during registration");
            assert!(
                account.total >= Self::storage_cost(account.used_bytes),
                "Storage minimum does not cover registration"
            );
            self.storage_accounts.insert(&beneficiary, &account);
            if registration_only && deposit > minimum {
                self.start_storage_refund(&beneficiary, &payer, deposit - minimum, false);
            }
        }

        self.storage_balance(&beneficiary)
            .expect("storage registration missing")
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        assert_one_yocto();
        let account_id = env::predecessor_account_id();
        let available = self
            .storage_balance(&account_id)
            .expect("Storage account not registered")
            .available
            .as_yoctonear();
        let amount = amount.map(|a| a.as_yoctonear()).unwrap_or(available);
        assert!(amount <= available, "Withdrawal exceeds available storage");
        if amount > 0 {
            self.start_storage_refund(&account_id, &account_id, amount, false);
        }
        self.storage_balance(&account_id)
            .expect("storage registration missing")
    }

    #[payable]
    fn storage_unregister(&mut self, _force: Option<bool>) -> bool {
        assert_one_yocto();
        let account_id = env::predecessor_account_id();
        let Some(account) = self.storage_accounts.get(&account_id) else {
            return false;
        };
        let has_leashes = self
            .leashes_by_owner
            .get(&account_id)
            .is_some_and(|leashes| !leashes.is_empty());
        assert!(!has_leashes, "Cannot unregister while leash state exists");
        assert!(!account.unregistering, "Storage unregister in progress");
        assert_eq!(
            account.pending_refund_amount, 0,
            "Storage refund in progress"
        );
        self.start_storage_refund(&account_id, &account_id, account.total, true);
        true
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        StorageBalanceBounds {
            min: self.minimum_storage_balance(),
            max: None,
        }
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.storage_balance(&account_id)
    }
}

#[near]
impl AgentLeash {
    fn start_storage_refund(
        &mut self,
        account_id: &AccountId,
        recipient: &AccountId,
        amount: u128,
        unregistering: bool,
    ) {
        assert!(amount > 0, "Storage refund must be positive");
        let mut account = self
            .storage_accounts
            .get(account_id)
            .expect("storage_deposit_required");
        assert_eq!(
            account.pending_refund_amount, 0,
            "Storage refund in progress"
        );
        let refund_id = account.next_refund_id;
        account.next_refund_id = account
            .next_refund_id
            .checked_add(1)
            .expect("storage refund ID overflow");
        account.pending_refund_id = refund_id;
        account.pending_refund_amount = amount;
        account.unregistering = unregistering;
        self.storage_accounts.insert(account_id, &account);

        Promise::new(recipient.clone())
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_STORAGE_REFUND_CALLBACK)
                    .on_storage_refund(account_id.clone(), refund_id),
            )
            .detach();
    }

    #[private]
    pub fn on_storage_refund(
        &mut self,
        account_id: AccountId,
        refund_id: u64,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        assert_eq!(
            env::promise_results_count(),
            1,
            "Storage refund callback requires exactly one promise result"
        );
        let Some(mut account) = self.storage_accounts.get(&account_id) else {
            return false;
        };
        if account.pending_refund_id != refund_id || account.pending_refund_amount == 0 {
            return false;
        }
        let amount = account.pending_refund_amount;
        let unregistering = account.unregistering;
        account.pending_refund_amount = 0;
        account.unregistering = false;
        match result {
            Ok(()) => {
                account.total = account
                    .total
                    .checked_sub(amount)
                    .expect("storage refund exceeds balance");
                if unregistering {
                    self.storage_accounts.remove(&account_id);
                } else {
                    self.storage_accounts.insert(&account_id, &account);
                }
                true
            }
            Err(_) => {
                // Leave the deposit credited to the account so the user can
                // retry a failed refund instead of losing the claim.
                self.storage_accounts.insert(&account_id, &account);
                false
            }
        }
    }
}
