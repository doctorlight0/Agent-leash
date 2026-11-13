use near_sdk::collections::UnorderedMap;
use near_sdk::{env, AccountId, NearToken};

use crate::state::{
    Leash, PayeeConfig, PaymentRecord, RevocationRecord, Schedule, StorageAccount, WithdrawalRecord,
};
use crate::types::SpendEntry;
use crate::{AgentLeash, StorageKey};

impl AgentLeash {
    pub(crate) fn credit_attached_storage_deposit(
        &mut self,
        account_id: &AccountId,
        deposit: u128,
    ) {
        if let Some(mut account) = self.storage_accounts.get(account_id) {
            assert!(!account.unregistering, "Storage unregister in progress");
            account.total = account
                .total
                .checked_add(deposit)
                .expect("storage balance overflow");
            self.storage_accounts.insert(account_id, &account);
            return;
        }

        assert!(deposit > 0, "storage_deposit_required");
        let before = env::storage_usage();
        let mut account = StorageAccount {
            total: deposit,
            used_bytes: 0,
            next_refund_id: 1,
            pending_refund_id: 0,
            pending_refund_amount: 0,
            unregistering: false,
        };
        self.storage_accounts.insert(account_id, &account);
        account.used_bytes = env::storage_usage()
            .checked_sub(before)
            .expect("storage usage decreased during registration");
        assert!(
            account.total >= Self::storage_cost(account.used_bytes),
            "Insufficient storage deposit for registration"
        );
        self.storage_accounts.insert(account_id, &account);
    }

    pub(crate) fn record_storage_usage(&mut self, account_id: &AccountId, before: u64) {
        let after = env::storage_usage();
        let mut account = self
            .storage_accounts
            .get(account_id)
            .expect("storage_deposit_required");
        assert!(!account.unregistering, "Storage unregister in progress");

        if after >= before {
            let additional = after - before;
            account.used_bytes = account
                .used_bytes
                .checked_add(additional)
                .expect("storage usage overflow");
        } else {
            account.used_bytes = account.used_bytes.saturating_sub(before - after);
        }

        let committed = Self::storage_cost(account.used_bytes)
            .checked_add(account.pending_refund_amount)
            .expect("storage balance overflow");
        assert!(
            account.total >= committed,
            "Insufficient storage deposit for actual usage: total={}, committed={}, used_bytes={}",
            account.total,
            committed,
            account.used_bytes
        );
        self.storage_accounts.insert(account_id, &account);
    }

    pub(crate) fn minimum_storage_balance(&self) -> NearToken {
        NearToken::from_yoctonear(Self::storage_cost(self.storage_account_min_bytes))
    }

    pub(crate) fn storage_balance(
        &self,
        account_id: &AccountId,
    ) -> Option<near_contract_standards::storage_management::StorageBalance> {
        self.storage_accounts.get(account_id).map(|account| {
            let total = account
                .total
                .checked_sub(account.pending_refund_amount)
                .expect("pending refund exceeds storage balance");
            let locked = Self::storage_cost(account.used_bytes);
            let available = if account.unregistering {
                0
            } else {
                total
                    .checked_sub(locked)
                    .expect("storage undercollateralized")
            };
            near_contract_standards::storage_management::StorageBalance {
                total: NearToken::from_yoctonear(total),
                available: NearToken::from_yoctonear(available),
            }
        })
    }

    pub(crate) fn storage_cost(bytes: u64) -> u128 {
        env::storage_byte_cost()
            .as_yoctonear()
            .checked_mul(u128::from(bytes))
            .expect("storage cost overflow")
    }

    pub(crate) fn get_leash_or_panic(&self, leash_id: u64) -> Leash {
        self.leashes.get(&leash_id).expect("Leash not found")
    }

    pub(crate) fn save_leash(&mut self, leash: &Leash) {
        self.leashes.insert(&leash.leash_id, leash);
    }

    pub(crate) fn payees_map(&self, leash_id: u64) -> UnorderedMap<AccountId, PayeeConfig> {
        self.payees
            .get(&leash_id)
            .unwrap_or_else(|| UnorderedMap::new(StorageKey::Payees { leash_id }))
    }

    pub(crate) fn save_payees(
        &mut self,
        leash_id: u64,
        map: &UnorderedMap<AccountId, PayeeConfig>,
    ) {
        self.payees.insert(&leash_id, map);
    }

    pub(crate) fn payments_map(&self, leash_id: u64) -> UnorderedMap<u64, PaymentRecord> {
        self.payments
            .get(&leash_id)
            .unwrap_or_else(|| UnorderedMap::new(StorageKey::Payments { leash_id }))
    }

    pub(crate) fn save_payments(&mut self, leash_id: u64, map: &UnorderedMap<u64, PaymentRecord>) {
        self.payments.insert(&leash_id, map);
    }

    pub(crate) fn withdrawals_map(&self, leash_id: u64) -> UnorderedMap<u64, WithdrawalRecord> {
        self.withdrawals
            .get(&leash_id)
            .unwrap_or_else(|| UnorderedMap::new(StorageKey::Withdrawals { leash_id }))
    }

    pub(crate) fn save_withdrawals(
        &mut self,
        leash_id: u64,
        map: &UnorderedMap<u64, WithdrawalRecord>,
    ) {
        self.withdrawals.insert(&leash_id, map);
    }

    pub(crate) fn revocations_map(&self, leash_id: u64) -> UnorderedMap<u64, RevocationRecord> {
        self.revocations
            .get(&leash_id)
            .unwrap_or_else(|| UnorderedMap::new(StorageKey::Revocations { leash_id }))
    }

    pub(crate) fn save_revocations(
        &mut self,
        leash_id: u64,
        map: &UnorderedMap<u64, RevocationRecord>,
    ) {
        self.revocations.insert(&leash_id, map);
    }

    pub(crate) fn schedules_map(&self, leash_id: u64) -> UnorderedMap<u64, Schedule> {
        self.schedules
            .get(&leash_id)
            .unwrap_or_else(|| UnorderedMap::new(StorageKey::Schedules { leash_id }))
    }

    pub(crate) fn save_schedules(&mut self, leash_id: u64, map: &UnorderedMap<u64, Schedule>) {
        self.schedules.insert(&leash_id, map);
    }

    pub(crate) fn window_entries(&self, leash_id: u64) -> Vec<SpendEntry> {
        self.windows.get(&leash_id).unwrap_or_default()
    }

    pub(crate) fn save_window(&mut self, leash_id: u64, entries: Vec<SpendEntry>) {
        self.windows.insert(&leash_id, &entries);
    }

    pub(crate) fn assert_supported_token(&self, token: &AccountId) {
        assert!(
            self.supported_tokens.contains(token) && self.token_decimals.get(token).is_some(),
            "Unsupported token contract"
        );
    }

    pub(crate) fn token_decimals_or_panic(&self, token: &AccountId) -> u8 {
        self.assert_supported_token(token);
        self.token_decimals
            .get(token)
            .expect("supported token decimals missing")
    }

    pub(crate) fn assert_owner(&self, leash: &Leash) {
        assert_eq!(env::predecessor_account_id(), leash.owner_id, "Only owner");
    }

    pub(crate) fn assert_agent(&self, leash: &Leash) {
        assert_eq!(
            env::predecessor_account_id(),
            leash.agent_id,
            "Only assigned agent"
        );
    }

    pub(crate) fn now_ns() -> u64 {
        env::block_timestamp()
    }
}
