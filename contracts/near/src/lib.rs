mod approval;
mod emergency;
mod errors;
mod events;
mod funding;
mod leash;
mod payments;
mod payroll;
mod schedule;
mod settlement;
mod state;
mod storage;
mod storage_accounting;
pub mod types;
mod views;
mod vigil;

pub use errors::ContractError;
pub use types::*;

use near_sdk::collections::{LookupMap, UnorderedMap, UnorderedSet};
use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, BorshStorageKey, PanicOnDefault};

use crate::state::{
    Leash, PayeeConfig, PaymentRecord, PayrollGroup, PayrollPaymentRecord, RevocationRecord,
    Schedule, StorageAccount, WithdrawalRecord,
};

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Leashes,
    Payees { leash_id: u64 },
    Payments { leash_id: u64 },
    Schedules { leash_id: u64 },
    Withdrawals { leash_id: u64 },
    Revocations { leash_id: u64 },
    SupportedTokens,
    TokenDecimals,
    Windows { leash_id: u64 },
    LeashesByOwner { owner_id: AccountId },
    StorageAccounts,
    // Payroll
    PayrollGroups { leash_id: u64 },
    PayrollPayments { leash_id: u64 },
    PayrollWorkers { leash_id: u64 },
    // Vigil
    VigilBeneficiaries { leash_id: u64 },
    VigilEntitlements { leash_id: u64 },
    VigilClaims { leash_id: u64 },
    VigilClaimedAmount { leash_id: u64 },
    VigilPendingTransfers { leash_id: u64 },
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct AgentLeash {
    pub owner: AccountId,
    pub next_leash_id: u64,
    pub leashes: UnorderedMap<u64, Leash>,
    pub payees: LookupMap<u64, UnorderedMap<AccountId, PayeeConfig>>,
    pub payments: LookupMap<u64, UnorderedMap<u64, PaymentRecord>>,
    pub schedules: LookupMap<u64, UnorderedMap<u64, Schedule>>,
    pub withdrawals: LookupMap<u64, UnorderedMap<u64, WithdrawalRecord>>,
    pub revocations: LookupMap<u64, UnorderedMap<u64, RevocationRecord>>,
    pub windows: LookupMap<u64, Vec<crate::types::SpendEntry>>,
    pub supported_tokens: UnorderedSet<AccountId>,
    pub token_decimals: LookupMap<AccountId, u8>,
    pub required_storage_deposit: U128,
    pub leashes_by_owner: LookupMap<AccountId, UnorderedSet<u64>>,
    pub storage_accounts: LookupMap<AccountId, StorageAccount>,
    pub storage_account_min_bytes: u64,
    // Payroll
    pub payroll_groups: LookupMap<u64, UnorderedMap<u64, PayrollGroup>>,
    pub payroll_payments: LookupMap<u64, UnorderedMap<u64, PayrollPaymentRecord>>,
    // Vigil
    pub vigil_entitlements: LookupMap<u64, Vec<u128>>,
    pub vigil_claims: LookupMap<u64, Vec<bool>>,
    pub vigil_claimed_amount: LookupMap<u64, Vec<u128>>,
    pub vigil_pending_transfers: LookupMap<u64, Vec<u64>>,
}

#[near]
impl AgentLeash {
    #[init]
    pub fn new(
        supported_tokens: Vec<SupportedTokenConfig>,
        required_storage_deposit: Option<U128>,
    ) -> Self {
        let _ = required_storage_deposit;
        assert!(!env::state_exists(), "Already initialized");
        let mut tokens = UnorderedSet::new(StorageKey::SupportedTokens);
        let mut token_decimals = LookupMap::new(StorageKey::TokenDecimals);
        for config in supported_tokens {
            assert!(
                balance_cap_ceiling_for_decimals(config.decimals).is_some(),
                "Unsupported token decimals"
            );
            if let Some(existing) = token_decimals.get(&config.token_contract) {
                assert_eq!(existing, config.decimals, "Conflicting token decimals");
            }
            tokens.insert(&config.token_contract);
            token_decimals.insert(&config.token_contract, &config.decimals);
        }
        let mut storage_accounts = LookupMap::new(StorageKey::StorageAccounts);
        let max_storage_account_id: AccountId = format!("{}.x", "a".repeat(62))
            .parse()
            .expect("valid maximum-length account ID");
        let storage_sample = StorageAccount {
            total: 0,
            used_bytes: 0,
            next_refund_id: 0,
            pending_refund_id: 0,
            pending_refund_amount: 0,
            unregistering: false,
        };
        let storage_before = env::storage_usage();
        storage_accounts.insert(&max_storage_account_id, &storage_sample);
        let storage_account_min_bytes = env::storage_usage()
            .checked_sub(storage_before)
            .expect("storage usage decreased during minimum measurement");
        storage_accounts.remove(&max_storage_account_id);
        Self {
            owner: env::predecessor_account_id(),
            next_leash_id: 1,
            leashes: UnorderedMap::new(StorageKey::Leashes),
            payees: LookupMap::new(StorageKey::Payees { leash_id: 0 }),
            payments: LookupMap::new(StorageKey::Payments { leash_id: 0 }),
            schedules: LookupMap::new(StorageKey::Schedules { leash_id: 0 }),
            withdrawals: LookupMap::new(StorageKey::Withdrawals { leash_id: 0 }),
            revocations: LookupMap::new(StorageKey::Revocations { leash_id: 0 }),
            windows: LookupMap::new(StorageKey::Windows { leash_id: 0 }),
            supported_tokens: tokens,
            token_decimals,
            // Retained in serialized state and the init signature for compatibility.
            // NEP-145 accounting below derives required balances from storage use.
            required_storage_deposit: U128(0),
            leashes_by_owner: LookupMap::new(StorageKey::LeashesByOwner {
                owner_id: env::predecessor_account_id(),
            }),
            storage_accounts,
            storage_account_min_bytes,
            // Payroll
            payroll_groups: LookupMap::new(StorageKey::PayrollGroups { leash_id: 0 }),
            payroll_payments: LookupMap::new(StorageKey::PayrollPayments { leash_id: 0 }),
            // Vigil
            vigil_entitlements: LookupMap::new(StorageKey::VigilEntitlements { leash_id: 0 }),
            vigil_claims: LookupMap::new(StorageKey::VigilClaims { leash_id: 0 }),
            vigil_claimed_amount: LookupMap::new(StorageKey::VigilClaimedAmount { leash_id: 0 }),
            vigil_pending_transfers: LookupMap::new(StorageKey::VigilPendingTransfers {
                leash_id: 0,
            }),
        }
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn supported_tokens(&self) -> Vec<AccountId> {
        self.supported_tokens.iter().collect()
    }

    pub fn add_supported_token(&mut self, token_contract: AccountId, decimals: u8) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Only contract owner"
        );
        assert!(
            balance_cap_ceiling_for_decimals(decimals).is_some(),
            "Unsupported token decimals"
        );
        if let Some(existing) = self.token_decimals.get(&token_contract) {
            assert_eq!(existing, decimals, "Token decimals are immutable");
            return;
        }
        let before = env::storage_usage();
        self.supported_tokens.insert(&token_contract);
        self.token_decimals.insert(&token_contract, &decimals);
        self.record_storage_usage(&self.owner.clone(), before);
    }

    pub fn get_supported_token_config(
        &self,
        token_contract: AccountId,
    ) -> Option<SupportedTokenConfigView> {
        self.token_decimals
            .get(&token_contract)
            .and_then(|decimals| {
                balance_cap_ceiling_for_decimals(decimals).map(|max_balance_cap| {
                    SupportedTokenConfigView {
                        token_contract,
                        decimals,
                        max_balance_cap: U128(max_balance_cap),
                    }
                })
            })
    }

    pub fn get_required_storage_deposit(&self) -> U128 {
        U128(self.minimum_storage_balance().as_yoctonear())
    }
}
