//! In-source unit tests for the Agent Leash contract.
//!
//! These tests live inside the library crate so `cargo test --lib` discovers
//! them. They exercise the public write API directly against the near-sdk
//! unit-testing VM, mirroring the behaviour asserted by the integration
//! suite in `tests/agent_leash.rs`.

use near_sdk::json_types::U128;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, NearToken, PromiseError, PromiseResult, RuntimeFeesConfig};

use crate::types::{SupportedTokenConfig, DAY_NS};

fn owner() -> near_sdk::AccountId {
    accounts(0)
}
fn agent() -> near_sdk::AccountId {
    accounts(1)
}
fn payee() -> near_sdk::AccountId {
    accounts(2)
}
fn token() -> near_sdk::AccountId {
    "usdc.testnet".parse().unwrap()
}

fn set_ctx(predecessor: near_sdk::AccountId, ts: u64, deposit: u128) {
    let mut b = VMContextBuilder::new();
    b.predecessor_account_id(predecessor.clone())
        .signer_account_id(predecessor)
        .block_timestamp(ts)
        .attached_deposit(NearToken::from_yoctonear(deposit));
    testing_env!(b.build());
}

fn set_ctx_with_promise(
    predecessor: near_sdk::AccountId,
    ts: u64,
    results: Vec<PromiseResult>,
) {
    let mut b = VMContextBuilder::new();
    b.predecessor_account_id(predecessor.clone())
        .signer_account_id(predecessor)
        .current_account_id("current.testnet".parse().unwrap())
        .block_timestamp(ts);
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        results
    );
}

fn init() -> super::AgentLeash {
    set_ctx(owner(), 1_000, 0);
    super::AgentLeash::new(
        vec![SupportedTokenConfig {
            token_contract: token(),
            decimals: 6,
        }],
        None,
    )
}

fn storage_deposit() -> u128 {
    1_000_000_000_000_000_000_000_000
}

fn create_default(contract: &mut super::AgentLeash) -> u64 {
    set_ctx(owner(), 1_000, 1);
    set_ctx(owner(), 1_000, storage_deposit());
    contract.create_leash(
        agent(),
        token(),
        U128(100),
        U128(500),
        Some(DAY_NS),
        60_000_000_000,
        None,
        false,
        Some(5),
        Some(vec![payee()]),
        U128(1_000_000_000),
    )
}

fn fund(contract: &mut super::AgentLeash, leash_id: u64, amount: u128) {
    set_ctx(token(), 1_100, 0);
    let msg = serde_json::json!({"Fund":{"leash_id": leash_id}}).to_string();
    let unused = contract.ft_on_transfer(owner(), U128(amount), msg);
    match unused {
        near_sdk::PromiseOrValue::Value(v) => assert_eq!(v.0, 0),
        _ => panic!("expected value"),
    }
}