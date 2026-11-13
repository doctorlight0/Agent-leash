use agent_leash_near::types::{
    balance_cap_ceiling_for_decimals, PaymentStatus, SupportedTokenConfig, DAY_NS,
    MIN_SCHEDULE_INTERVAL_NS,
};
use agent_leash_near::AgentLeash;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::storage_management::StorageManagement;
use near_sdk::json_types::U128;

use near_sdk::mock::MockAction;
use near_sdk::test_utils::{accounts, get_created_receipts, VMContextBuilder};
use near_sdk::{testing_env, Gas, NearToken, PromiseError, PromiseResult, RuntimeFeesConfig};

fn owner() -> near_sdk::AccountId {
    accounts(0)
}
fn other_owner() -> near_sdk::AccountId {
    accounts(5)
}
fn agent() -> near_sdk::AccountId {
    accounts(1)
}
fn payee() -> near_sdk::AccountId {
    accounts(2)
}
fn payee2() -> near_sdk::AccountId {
    accounts(3)
}
fn token() -> near_sdk::AccountId {
    "usdc.testnet".parse().unwrap()
}
fn bad_token() -> near_sdk::AccountId {
    "fake.testnet".parse().unwrap()
}

fn set_ctx(predecessor: near_sdk::AccountId, ts: u64, deposit: u128) {
    let mut b = VMContextBuilder::new();
    b.predecessor_account_id(predecessor.clone())
        .signer_account_id(predecessor)
        .block_timestamp(ts)
        .attached_deposit(NearToken::from_yoctonear(deposit));
    testing_env!(b.build());
}

fn set_ctx_with_promise(predecessor: near_sdk::AccountId, ts: u64, results: Vec<PromiseResult>) {
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

fn init() -> AgentLeash {
    set_ctx(owner(), 1_000, 0);
    AgentLeash::new(
        vec![SupportedTokenConfig {
            token_contract: token(),
            decimals: 6,
        }],
        None,
    )
}

fn init_with_decimals(decimals: u8) -> AgentLeash {
    set_ctx(owner(), 1_000, 0);
    AgentLeash::new(
        vec![SupportedTokenConfig {
            token_contract: token(),
            decimals,
        }],
        None,
    )
}

#[test]
fn empty_token_allowlist_is_a_safe_initial_state() {
    set_ctx(owner(), 1_000, 0);
    let c = AgentLeash::new(Vec::<SupportedTokenConfig>::new(), None);
    assert!(c.supported_tokens().is_empty());
}

fn create_default(contract: &mut AgentLeash) -> u64 {
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

fn fund(contract: &mut AgentLeash, leash_id: u64, amount: u128) {
    set_ctx(token(), 1_100, 0);
    let msg = serde_json::json!({"Fund":{"leash_id": leash_id}}).to_string();
    let unused = contract.ft_on_transfer(owner(), U128(amount), msg);
    match unused {
        near_sdk::PromiseOrValue::Value(v) => assert_eq!(v.0, 0),
        _ => panic!("expected value"),
    }
}

#[test]
fn leash_creation_ownership_assignment_permissions() {
    let mut c = init();
    let id1 = create_default(&mut c);
    let id2 = create_default(&mut c);
    assert_eq!((id1, id2), (1, 2));
    set_ctx(owner(), 1_200, 0);
    c.set_agent(id1, accounts(4));
    c.update_permissions(
        id1,
        U128(50),
        U128(200),
        0,
        Some(10_000_000_000_000),
        true,
        3,
    );
    assert_eq!(c.get_leash(id1).unwrap().agent_id, accounts(4));
}

#[test]
fn funding_valid_and_rejects_invalid() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 400);
    set_ctx(bad_token(), 1_100, 0);
    let msg = serde_json::json!({"Fund":{"leash_id": id}}).to_string();
    assert!(
        matches!(c.ft_on_transfer(owner(), U128(50), msg), near_sdk::PromiseOrValue::Value(v) if v.0 == 50)
    );
    set_ctx(token(), 1_100, 0);
    let msg = serde_json::json!({"Fund":{"leash_id": id}}).to_string();
    assert!(
        matches!(c.ft_on_transfer(agent(), U128(50), msg), near_sdk::PromiseOrValue::Value(v) if v.0 == 50)
    );
}

#[test]
fn spending_reserves_and_settlement_callbacks() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    set_ctx(agent(), 2_000, 0);
    let pid = c.request_payment(id, payee(), U128(40), Some("svc".into()), None);
    assert_eq!(c.get_leash(id).unwrap().reserved_balance.0, 40);
    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        2_100,
        vec![PromiseResult::Successful(vec![])],
    );
    let _ = c.on_payment_settled(id, pid, Ok(()));
    assert_eq!(
        c.get_payment(id, pid).unwrap().status,
        PaymentStatus::Settled
    );
    set_ctx(agent(), 70_000_000_005, 0);
    let pid2 = c.request_payment(id, payee(), U128(30), None, None);
    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        70_000_000_010,
        vec![PromiseResult::Failed],
    );
    let _ = c.on_payment_settled(id, pid2, Err(PromiseError::Failed));
    assert_eq!(
        c.get_payment(id, pid2).unwrap().status,
        PaymentStatus::Failed
    );
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 360);
    let _ = c.on_payment_settled(id, pid2, Ok(()));
    assert_eq!(
        c.get_payment(id, pid2).unwrap().status,
        PaymentStatus::Failed
    );
}

#[test]
#[should_panic(expected = "Over per-payment limit")]
fn per_payment_limit_enforced() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    set_ctx(agent(), 2_000, 0);
    c.request_payment(id, payee(), U128(101), None, None);
}

#[test]
#[should_panic(expected = "recipient_not_allowed")]
fn recipient_allowlist_enforced() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    set_ctx(agent(), 2_000, 0);
    c.request_payment(id, payee2(), U128(10), None, None);
}

#[test]
fn approval_reject_and_reserved_withdrawal_safety() {
    let mut c = init();
    set_ctx(owner(), 1_000, storage_deposit());
    let id = c.create_leash(
        agent(),
        token(),
        U128(100),
        U128(500),
        Some(DAY_NS),
        0,
        Some(10_000_000_000_000),
        true,
        Some(5),
        Some(vec![payee()]),
        U128(1_000_000_000),
    );
    fund(&mut c, id, 100);
    set_ctx(agent(), 2_000, 0);
    let pid = c.request_payment(id, payee(), U128(60), None, Some(9_000_000_000_000));
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 40);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut c = init();
        set_ctx(owner(), 1_000, storage_deposit());
        let id = c.create_leash(
            agent(),
            token(),
            U128(100),
            U128(500),
            Some(DAY_NS),
            0,
            Some(10_000_000_000_000),
            true,
            Some(5),
            Some(vec![payee()]),
            U128(1_000_000_000),
        );
        fund(&mut c, id, 100);
        set_ctx(agent(), 2_000, 0);
        c.request_payment(id, payee(), U128(60), None, Some(9_000_000_000_000));
        set_ctx(owner(), 2_100, 0);
        let _ = c.withdraw_available(id, U128(50), None);
    }))
    .is_err());
    set_ctx(owner(), 2_100, 0);
    c.reject_payment(id, pid);
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 100);
}

#[test]
fn schedule_one_shot_executes_and_terminates() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    set_ctx(owner(), 2_000, 0);
    let sid = c.create_schedule(
        id,
        payee(),
        U128(10),
        5_000_000_000,
        Some(10_000_000_000),
        None,
        0,
        0,
    );
    let sched0 = c.get_schedule(id, sid).unwrap();
    assert_eq!(sched0.max_runs, 0);
    assert_eq!(sched0.interval_ns, 0);
    assert_eq!(sched0.next_due_ns, 5_000_000_000);
    assert!(!sched0.is_recurring());

    // Early execution is rejected because the schedule is not due.
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut c = init();
        let id = create_default(&mut c);
        fund(&mut c, id, 400);
        set_ctx(owner(), 2_000, 0);
        let sid = c.create_schedule(
            id,
            payee(),
            U128(10),
            5_000_000_000,
            Some(10_000_000_000),
            None,
            0,
            0,
        );
        set_ctx(owner(), 4_000, 0);
        let _ = c.execute_schedule(id, sid);
    }))
    .is_err());

    // When due, execution creates a settling payment and marks the schedule
    // executed.
    set_ctx(owner(), 5_000_000_000, 0);
    let _ = c.execute_schedule(id, sid);
    let sched = c.get_schedule(id, sid).unwrap();
    assert!(sched.executed);
    assert!(!sched.active);
    assert_eq!(sched.runs, 1);
    assert_eq!(
        c.get_payment(id, 1).unwrap().status,
        PaymentStatus::Settling
    );
    // One-shot schedules do not execute again.
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        set_ctx(owner(), 5_000_000_000 + 1, 0);
        let _ = c.execute_schedule(id, sid);
    }))
    .is_err());
}

/// Recurring schedules execute multiple times, advancing `next_due_ns` and
/// `runs` on each run, and stop only when the run limit is reached.
#[test]
fn schedule_recurring_runs_and_advances() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    set_ctx(owner(), 2_000, 0);
    let sid = c.create_schedule(
        id,
        payee(),
        U128(10),
        5_000_000_000,
        None,
        None,
        MIN_SCHEDULE_INTERVAL_NS,
        3,
    );
    let sched = c.get_schedule(id, sid).unwrap();
    assert!(sched.is_recurring());
    assert_eq!(sched.max_runs, 3);
    assert_eq!(sched.runs, 0);

    // The first run is due exactly at execute_after_ns.
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut c = init();
        let id = create_default(&mut c);
        fund(&mut c, id, 400);
        set_ctx(owner(), 2_000, 0);
        let sid = c.create_schedule(
            id,
            payee(),
            U128(10),
            5_000_000_000,
            None,
            None,
            MIN_SCHEDULE_INTERVAL_NS,
            3,
        );
        set_ctx(owner(), 5_000_000_000 - 1, 0);
        let _ = c.execute_schedule(id, sid);
    }))
    .is_err());

    // Run 1 is due at execute_after_ns.
    set_ctx(owner(), 5_000_000_000, 0);
    let _ = c.execute_schedule(id, sid);
    let sched = c.get_schedule(id, sid).unwrap();
    assert!(sched.active);
    assert!(!sched.executed);
    assert_eq!(sched.runs, 1);

    // Run 2.
    set_ctx(owner(), 5_000_000_000 + MIN_SCHEDULE_INTERVAL_NS, 0);
    let _ = c.execute_schedule(id, sid);
    let sched = c.get_schedule(id, sid).unwrap();
    assert_eq!(sched.runs, 2);

    // Run 3 reaches the limit and completes the schedule.
    set_ctx(owner(), 5_000_000_000 + MIN_SCHEDULE_INTERVAL_NS * 2, 0);
    let _ = c.execute_schedule(id, sid);
    let sched = c.get_schedule(id, sid).unwrap();
    assert!(!sched.active);
    assert!(sched.executed);
    assert_eq!(sched.runs, 3);
    assert_eq!(
        c.get_payment(id, 3).unwrap().status,
        PaymentStatus::Settling
    );
    assert_eq!(c.get_payment(id, 3).unwrap().payment_id, 3);

    // No further execution.
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        set_ctx(owner(), 5_000_000_000 + MIN_SCHEDULE_INTERVAL_NS * 3, 0);
        let _ = c.execute_schedule(id, sid);
    }))
    .is_err());
}

/// An unlimited recurring schedule keeps running until cancelled or expired.
#[test]
fn schedule_recurring_unlimited_runs() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    set_ctx(owner(), 2_000, 0);
    let sid = c.create_schedule(
        id,
        payee(),
        U128(10),
        5_000_000_000,
        None,
        None,
        MIN_SCHEDULE_INTERVAL_NS,
        0,
    );
    let sched = c.get_schedule(id, sid).unwrap();
    assert!(sched.is_recurring());
    assert_eq!(sched.max_runs, 0);

    set_ctx(owner(), 5_000_000_000, 0);
    let _ = c.execute_schedule(id, sid);
    let sched = c.get_schedule(id, sid).unwrap();
    assert!(sched.active);
    assert!(!sched.executed);
    assert_eq!(sched.runs, 1);

    set_ctx(owner(), 5_000_000_000 + MIN_SCHEDULE_INTERVAL_NS, 0);
    let _ = c.execute_schedule(id, sid);
    let sched = c.get_schedule(id, sid).unwrap();
    assert_eq!(sched.runs, 2);
    assert!(sched.active);
}

/// A recurring schedule cannot execute the same occurrence twice because
/// `next_due_ns` only moves forward.
#[test]
fn schedule_recurring_duplicate_occurrence_rejected() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    set_ctx(owner(), 2_000, 0);
    let sid = c.create_schedule(
        id,
        payee(),
        U128(10),
        5_000_000_000,
        None,
        None,
        MIN_SCHEDULE_INTERVAL_NS,
        2,
    );
    // Run 1 occurs at execute_after_ns.
    set_ctx(owner(), 5_000_000_000, 0);
    let _ = c.execute_schedule(id, sid);
    // After run 1, `next_due_ns` advanced by one interval, so the same
    // timestamp as the previous run is now too early.
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        set_ctx(owner(), 5_000_000_000, 0);
        let _ = c.execute_schedule(id, sid);
    }))
    .is_err());
    // Next occurrence is allowed.
    set_ctx(owner(), 5_000_000_000 + MIN_SCHEDULE_INTERVAL_NS, 0);
    let _ = c.execute_schedule(id, sid);
    assert!(c.get_schedule(id, sid).unwrap().executed);
}

/// A recurring schedule with a short interval still rejects intervals below the
/// minimum configured boundary.
#[test]
#[should_panic(expected = "interval too short")]
fn schedule_recurring_invalid_interval_rejected() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    set_ctx(owner(), 2_000, 0);
    c.create_schedule(
        id,
        payee(),
        U128(10),
        5_000_000_000,
        None,
        None,
        MIN_SCHEDULE_INTERVAL_NS - 1,
        2,
    );
}

#[test]
fn schedule_recurring_next_due_overflow_keeps_state_unchanged() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    let due = u64::MAX - MIN_SCHEDULE_INTERVAL_NS + 1;
    set_ctx(owner(), 2_000, 0);
    let sid = c.create_schedule(
        id,
        payee(),
        U128(10),
        due,
        None,
        None,
        MIN_SCHEDULE_INTERVAL_NS,
        0,
    );

    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        set_ctx(owner(), due, 0);
        let _ = c.execute_schedule(id, sid);
    }))
    .is_err());
    let schedule = c.get_schedule(id, sid).unwrap();
    assert!(schedule.active);
    assert_eq!(schedule.runs, 0);
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 400);
    assert!(c.get_payment(id, 1).is_none());
}

/// A recurring schedule can be cancelled before any run.
#[test]
fn schedule_cancel_before_run() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    set_ctx(owner(), 2_000, 0);
    let sid = c.create_schedule(
        id,
        payee(),
        U128(10),
        5_000_000_000,
        None,
        None,
        MIN_SCHEDULE_INTERVAL_NS,
        2,
    );
    set_ctx(owner(), 2_100, 0);
    c.cancel_schedule(id, sid);
    let sched = c.get_schedule(id, sid).unwrap();
    assert!(!sched.active);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        set_ctx(owner(), 5_000_000_000 + MIN_SCHEDULE_INTERVAL_NS, 0);
        let _ = c.execute_schedule(id, sid);
    }))
    .is_err());
}

/// A schedule that expires before a run cannot execute.
#[test]
fn schedule_recurring_expired_before_run_rejected() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    set_ctx(owner(), 2_000, 0);
    let sid = c.create_schedule(
        id,
        payee(),
        U128(10),
        5_000_000_000,
        Some(5_000_000_000 + MIN_SCHEDULE_INTERVAL_NS - 1),
        None,
        MIN_SCHEDULE_INTERVAL_NS,
        2,
    );
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        set_ctx(owner(), 5_000_000_000 + MIN_SCHEDULE_INTERVAL_NS, 0);
        let _ = c.execute_schedule(id, sid);
    }))
    .is_err());
    assert!(c.get_schedule(id, sid).unwrap().active);
    set_ctx(owner(), 5_000_000_000 + MIN_SCHEDULE_INTERVAL_NS, 0);
    assert!(c.expire_schedule(id, sid));
    assert!(!c.get_schedule(id, sid).unwrap().active);
}

/// A schedule with exhausted balance cannot execute, which matters for
/// recurring schedules whose future runs may exceed remaining balance.
#[test]
fn schedule_recurring_insufficient_balance_rejected() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 15);
    set_ctx(owner(), 2_000, 0);
    let sid = c.create_schedule(
        id,
        payee(),
        U128(10),
        5_000_000_000,
        None,
        None,
        MIN_SCHEDULE_INTERVAL_NS,
        0,
    );
    // First run succeeds at execute_after_ns.
    set_ctx(owner(), 5_000_000_000, 0);
    let _ = c.execute_schedule(id, sid);
    // Second run would exceed balance.
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        set_ctx(owner(), 5_000_000_000 + MIN_SCHEDULE_INTERVAL_NS, 0);
        let _ = c.execute_schedule(id, sid);
    }))
    .is_err());
}

/// A delayed execution skips missed intervals and advances to the first future
/// occurrence, avoiding a catch-up burst.
#[test]
fn schedule_recurring_delayed_execution_allowed() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    set_ctx(owner(), 2_000, 0);
    let sid = c.create_schedule(
        id,
        payee(),
        U128(10),
        5_000_000_000,
        None,
        None,
        MIN_SCHEDULE_INTERVAL_NS,
        2,
    );
    // Leave it untouched several intervals past the due time.
    let delayed = 5_000_000_000 + MIN_SCHEDULE_INTERVAL_NS * 4 + 1;
    set_ctx(owner(), delayed, 0);
    let _ = c.execute_schedule(id, sid);
    assert!(c.get_schedule(id, sid).unwrap().active);
    assert!(!c.get_schedule(id, sid).unwrap().executed);
    assert_eq!(c.get_schedule(id, sid).unwrap().runs, 1);
    assert_eq!(
        c.get_schedule(id, sid).unwrap().next_due_ns,
        5_000_000_000 + MIN_SCHEDULE_INTERVAL_NS * 5
    );
}

/// A failed transfer restores the funds but consumes the submitted occurrence;
/// the next scheduled occurrence remains available.
#[test]
fn schedule_recurring_failed_payment_does_not_consume_run_limit_wrongly() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    set_ctx(owner(), 2_000, 0);
    let sid = c.create_schedule(
        id,
        payee(),
        U128(10),
        5_000_000_000,
        None,
        None,
        MIN_SCHEDULE_INTERVAL_NS,
        2,
    );
    // Run 1 is due at execute_after_ns.
    set_ctx(owner(), 5_000_000_000, 0);
    let _ = c.execute_schedule(id, sid);
    // Simulate token transfer failure through the payment settlement callback.
    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        5_000_000_000 + 1,
        vec![PromiseResult::Failed],
    );
    let _ = c.on_payment_settled(id, 1, Err(PromiseError::Failed));
    // Payment failed and reservation restored.
    assert_eq!(c.get_payment(id, 1).unwrap().status, PaymentStatus::Failed);
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 400);
    assert_eq!(c.get_schedule(id, sid).unwrap().runs, 1);
    // The following occurrence is due after one interval.
    set_ctx(owner(), 5_000_000_000 + MIN_SCHEDULE_INTERVAL_NS, 0);
    let _ = c.execute_schedule(id, sid);
    assert_eq!(c.get_schedule(id, sid).unwrap().runs, 2);
    assert!(c.get_schedule(id, sid).unwrap().executed);
}

/// Cancelled schedules cannot execute even if they become due later.
#[test]
fn schedule_cancel_terminal_after_run() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    set_ctx(owner(), 2_000, 0);
    let sid = c.create_schedule(
        id,
        payee(),
        U128(10),
        5_000_000_000,
        None,
        None,
        MIN_SCHEDULE_INTERVAL_NS,
        2,
    );
    // Run 1.
    set_ctx(owner(), 5_000_000_000, 0);
    let _ = c.execute_schedule(id, sid);
    // Cancel mid-recurring schedule.
    set_ctx(owner(), 5_000_000_000 + MIN_SCHEDULE_INTERVAL_NS + 1, 0);
    c.cancel_schedule(id, sid);
    assert!(!c.get_schedule(id, sid).unwrap().active);
    // Next due time is irrelevant once cancelled.
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        set_ctx(owner(), 5_000_000_000 + MIN_SCHEDULE_INTERVAL_NS * 2, 0);
        let _ = c.execute_schedule(id, sid);
    }))
    .is_err());
}

/// Agent-created recurring schedules are subject to the live payee limits and
/// the leash-wide per-payment limit at execution time.
#[test]
fn schedule_recurring_agent_uses_payee_limits() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    set_ctx(agent(), 2_000, 0);
    let sid = c.create_schedule(
        id,
        payee(),
        U128(50),
        5_000_000_000,
        None,
        None,
        MIN_SCHEDULE_INTERVAL_NS,
        2,
    );
    set_ctx(owner(), 2_010, storage_deposit());
    c.set_payee_limits(id, payee(), U128(40), U128(0));
    // Over-limit recurring run from the agent is rejected without consuming
    // an occurrence or reserving funds.
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        set_ctx(agent(), 5_000_000_000, 0);
        let _ = c.execute_schedule(id, sid);
    }))
    .is_err());
    assert_eq!(c.get_schedule(id, sid).unwrap().runs, 0);
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 400);
}

/// Owner revocation stops a schedule from executing even while it is due.
#[test]
fn schedule_recurring_stopped_by_revocation() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    set_ctx(owner(), 2_000, storage_deposit());
    let sid = c.create_schedule(
        id,
        payee(),
        U128(10),
        5_000_000_000,
        None,
        None,
        MIN_SCHEDULE_INTERVAL_NS,
        2,
    );
    set_ctx(owner(), 2_010, storage_deposit());
    let _ = c.revoke(id);
    assert!(c.get_leash(id).unwrap().revoked);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        set_ctx(owner(), 5_000_000_000 + MIN_SCHEDULE_INTERVAL_NS, 0);
        let _ = c.execute_schedule(id, sid);
    }))
    .is_err());
}

#[test]
fn agent_schedule_is_invalidated_when_agent_is_reassigned() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 100);
    set_ctx(agent(), 2_000, 0);
    let sid = c.create_schedule(id, payee(), U128(10), 2_000, None, None, 0, 0);
    set_ctx(owner(), 2_001, 0);
    c.set_agent(id, accounts(4));

    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        set_ctx(owner(), 2_002, 0);
        let _ = c.execute_schedule(id, sid);
    }))
    .is_err());
    assert_eq!(c.get_schedule(id, sid).unwrap().runs, 0);
}

#[test]
fn agent_schedule_is_blocked_if_approval_becomes_required() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 100);
    set_ctx(agent(), 2_000, 0);
    let sid = c.create_schedule(id, payee(), U128(10), 2_000, None, None, 0, 0);
    set_ctx(owner(), 2_001, 0);
    c.update_permissions(id, U128(100), U128(500), 0, None, true, 5);

    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        set_ctx(owner(), 2_002, 0);
        let _ = c.execute_schedule(id, sid);
    }))
    .is_err());
    assert_eq!(c.get_schedule(id, sid).unwrap().runs, 0);
}

/// Schedule views expose the recurring fields.
#[test]
fn schedule_view_shows_recurring_fields() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 400);
    set_ctx(owner(), 2_000, 0);
    let sid = c.create_schedule(
        id,
        payee(),
        U128(10),
        5_000_000_000,
        Some(20_000_000_000),
        Some("monthly".into()),
        MIN_SCHEDULE_INTERVAL_NS,
        2,
    );
    let v = c.get_schedule(id, sid).unwrap();
    assert_eq!(v.execute_after_ns, 5_000_000_000);
    assert!(v.interval_ns > 0);
    assert_eq!(v.next_due_ns, 5_000_000_000);
    assert_eq!(v.expires_at_ns, Some(20_000_000_000));
    assert_eq!(v.max_runs, 2);
    assert_eq!(v.runs, 0);
    assert!(v.reason.is_some());
}

fn storage_deposit() -> u128 {
    1_000_000_000_000_000_000_000_000
}

#[test]
fn nep145_registration_and_minimum_follow_measured_storage() {
    let mut c = init();
    let minimum = c.storage_balance_bounds().min.as_yoctonear();
    set_ctx(owner(), 2_000, minimum);
    let before = near_sdk::env::storage_usage();
    let balance = c.storage_deposit(None, Some(false));
    let used = near_sdk::env::storage_usage() - before;
    let locked = near_sdk::env::storage_byte_cost()
        .as_yoctonear()
        .checked_mul(u128::from(used))
        .unwrap();
    assert_eq!(balance.total.as_yoctonear(), minimum);
    assert!(
        minimum >= locked,
        "minimum {minimum} is below locked storage {locked} ({used} bytes)"
    );
    assert_eq!(balance.available.as_yoctonear(), minimum - locked);
    assert!(balance.available.as_yoctonear() > 0);
    assert_eq!(c.storage_balance_of(owner()).unwrap().total, balance.total);
}

#[test]
fn nep145_storage_withdrawal_restores_failed_refunds_and_rejects_replays() {
    let mut c = init();
    let minimum = c.storage_balance_bounds().min.as_yoctonear();
    let top_up = 20_000_000_000_000_000_000_000;
    set_ctx(owner(), 2_000, minimum + top_up);
    let initial = c.storage_deposit(None, Some(false));

    set_ctx(owner(), 2_010, 1);
    let pending = c.storage_withdraw(Some(NearToken::from_yoctonear(top_up)));
    assert_eq!(
        pending.total.as_yoctonear(),
        initial.total.as_yoctonear() - top_up
    );
    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        2_020,
        vec![PromiseResult::Failed],
    );
    assert!(!c.on_storage_refund(owner(), 1, Err(PromiseError::Failed)));
    let restored = c.storage_balance_of(owner()).unwrap();
    assert_eq!(restored.total, initial.total);
    assert_eq!(restored.available, initial.available);

    set_ctx(owner(), 2_030, 1);
    let _ = c.storage_withdraw(Some(NearToken::from_yoctonear(top_up)));
    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        2_040,
        vec![PromiseResult::Successful(vec![])],
    );
    assert!(c.on_storage_refund(owner(), 2, Ok(())));
    assert!(!c.on_storage_refund(owner(), 2, Err(PromiseError::Failed)));
    assert_eq!(
        c.storage_balance_of(owner()).unwrap().total,
        NearToken::from_yoctonear(minimum)
    );
}

#[test]
fn nep145_deposits_and_withdrawals_are_account_isolated() {
    let mut c = init();
    let minimum = c.storage_balance_bounds().min.as_yoctonear();
    let top_up = 20_000_000_000_000_000_000_000;
    set_ctx(owner(), 2_000, minimum + top_up);
    let _ = c.storage_deposit(Some(other_owner()), Some(false));

    set_ctx(owner(), 2_010, 1);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.storage_withdraw(None);
    }))
    .is_err());
    assert!(c.storage_balance_of(other_owner()).is_some());

    set_ctx(other_owner(), 2_020, 1);
    let available = c.storage_balance_of(other_owner()).unwrap().available;
    let _ = c.storage_withdraw(Some(available));
    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        2_030,
        vec![PromiseResult::Successful(vec![])],
    );
    assert!(c.on_storage_refund(other_owner(), 1, Ok(())));
    assert_eq!(
        c.storage_balance_of(other_owner()).unwrap().available,
        NearToken::from_yoctonear(0)
    );
}

#[test]
fn nep145_unregister_is_blocked_by_leashes_and_refunds_only_after_callback() {
    let mut c = init();
    let id = create_default(&mut c);
    set_ctx(owner(), 2_000, 1);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.storage_unregister(Some(true));
    }))
    .is_err());
    assert!(c.get_leash(id).is_some());

    let mut c = init();
    let minimum = c.storage_balance_bounds().min.as_yoctonear();
    set_ctx(other_owner(), 2_000, minimum);
    let _ = c.storage_deposit(None, Some(false));
    set_ctx(other_owner(), 2_010, 1);
    assert!(c.storage_unregister(Some(false)));
    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        2_020,
        vec![PromiseResult::Failed],
    );
    assert!(!c.on_storage_refund(other_owner(), 1, Err(PromiseError::Failed)));
    assert!(c.storage_balance_of(other_owner()).is_some());

    set_ctx(other_owner(), 2_030, 1);
    assert!(c.storage_unregister(Some(false)));
    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        2_040,
        vec![PromiseResult::Successful(vec![])],
    );
    assert!(c.on_storage_refund(other_owner(), 2, Ok(())));
    assert!(c.storage_balance_of(other_owner()).is_none());
}

#[test]
fn withdrawal_success_callback_safe() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 100);
    set_ctx(owner(), 2_000, storage_deposit());
    let _ = c.withdraw_available(id, U128(40), None);
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 60);
    assert_eq!(c.get_leash(id).unwrap().reserved_balance.0, 40);
    let w = c.get_withdrawal(id, 1).unwrap();
    assert_eq!(
        w.status,
        agent_leash_near::types::WithdrawalStatus::Settling
    );
    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        2_100,
        vec![PromiseResult::Successful(vec![])],
    );
    let status = c.on_withdrawal_settled(id, 1, Ok(()));
    assert_eq!(status, "settled");
    let l = c.get_leash(id).unwrap();
    assert_eq!(l.available_balance.0, 60);
    assert_eq!(l.reserved_balance.0, 0);
    assert_eq!(
        c.get_withdrawal(id, 1).unwrap().status,
        agent_leash_near::types::WithdrawalStatus::Settled
    );
}

#[test]
fn withdrawal_failure_restores_duplicate_stale_safe() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 100);
    set_ctx(owner(), 2_000, storage_deposit());
    let _ = c.withdraw_available(id, U128(40), None);
    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        2_100,
        vec![PromiseResult::Failed],
    );
    let status = c.on_withdrawal_settled(id, 1, Err(PromiseError::Failed));
    assert_eq!(status, "failed");
    let l = c.get_leash(id).unwrap();
    assert_eq!(l.available_balance.0, 100);
    assert_eq!(l.reserved_balance.0, 0);
    // duplicate callback
    let status = c.on_withdrawal_settled(id, 1, Ok(()));
    assert_eq!(status, "failed");
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 100);
    // stale/unknown terminal guard
    let status = c.on_withdrawal_settled(id, 1, Err(PromiseError::Failed));
    assert_eq!(status, "failed");
}

#[test]
#[should_panic(expected = "Insufficient available balance")]
fn withdrawal_insufficient_available_rejected() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 50);
    set_ctx(owner(), 2_000, storage_deposit());
    let _ = c.withdraw_available(id, U128(60), None);
}

#[test]
fn concurrent_withdrawal_reservations_prevent_double_spend() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 100);
    set_ctx(owner(), 2_000, storage_deposit());
    let _ = c.withdraw_available(id, U128(60), None);
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 40);
    set_ctx(owner(), 2_010, storage_deposit());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut c = init();
        let id = create_default(&mut c);
        fund(&mut c, id, 100);
        set_ctx(owner(), 2_000, storage_deposit());
        let _ = c.withdraw_available(id, U128(60), None);
        set_ctx(owner(), 2_010, storage_deposit());
        let _ = c.withdraw_available(id, U128(50), None);
    }));
    assert!(res.is_err());
    // original state still has one valid pending withdrawal
    assert_eq!(c.get_leash(id).unwrap().reserved_balance.0, 60);
}

// ---- revocation custody (Phase One) ----

/// `revoke` stops the agent immediately, moves `available_balance` into a
/// protected reservation, and starts a callback-safe refund to the owner.
#[test]
fn revoke_refunds_available_and_stops_agent() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 100);
    set_ctx(owner(), 2_000, storage_deposit());
    let _ = c.revoke(id);
    let l = c.get_leash(id).unwrap();
    assert!(l.revoked);
    assert_eq!(l.available_balance.0, 0);
    assert_eq!(l.reserved_balance.0, 100);
    let r = c.get_revocation(id, 1).unwrap();
    assert_eq!(
        r.status,
        agent_leash_near::types::RevocationStatus::Settling
    );
    // Agent can no longer request payments.
    set_ctx(agent(), 2_010, 0);
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.request_payment(id, payee(), U128(10), None, None);
    }));
    assert!(res.is_err());
    // Callback success consumes the reservation.
    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        2_100,
        vec![PromiseResult::Successful(vec![])],
    );
    let status = c.on_revocation_settled(id, 1, Ok(()));
    assert_eq!(status, "settled");
    let l = c.get_leash(id).unwrap();
    assert_eq!(l.available_balance.0, 0);
    assert_eq!(l.reserved_balance.0, 0);
    assert_eq!(
        c.get_revocation(id, 1).unwrap().status,
        agent_leash_near::types::RevocationStatus::Settled
    );
}

/// On refund failure the reservation is restored to `available_balance` and
/// the owner can recover through the existing withdrawal mechanism. The agent
/// stays revoked regardless of callback outcome.
#[test]
fn revoke_failure_restores_available_and_keeps_agent_stopped() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 100);
    set_ctx(owner(), 2_000, storage_deposit());
    let _ = c.revoke(id);
    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        2_100,
        vec![PromiseResult::Failed],
    );
    let status = c.on_revocation_settled(id, 1, Err(PromiseError::Failed));
    assert_eq!(status, "failed");
    let l = c.get_leash(id).unwrap();
    assert!(l.revoked);
    assert_eq!(l.available_balance.0, 100);
    assert_eq!(l.reserved_balance.0, 0);
    assert_eq!(
        c.get_revocation(id, 1).unwrap().status,
        agent_leash_near::types::RevocationStatus::Failed
    );
    // Duplicate callback after terminal state is a no-op.
    let status = c.on_revocation_settled(id, 1, Ok(()));
    assert_eq!(status, "failed");
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 100);
    assert_eq!(c.get_leash(id).unwrap().reserved_balance.0, 0);
}

/// A second `revoke` call after revocation is rejected so no second refund can
/// be initiated.
#[test]
#[should_panic(expected = "revocation_already_terminal")]
fn revoke_twice_rejected() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 100);
    set_ctx(owner(), 2_000, storage_deposit());
    let _ = c.revoke(id);
    set_ctx(owner(), 2_010, storage_deposit());
    let _ = c.revoke(id);
}

/// Funds already reserved by an in-flight payment are never touched by
/// revocation: only `available_balance` is refunded.
#[test]
fn revoke_leaves_pending_payment_reservations_intact() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 100);
    // Agent reserves 40 for an immediate (non-approval) payment.
    set_ctx(agent(), 2_000, 0);
    let _ = c.request_payment(id, payee(), U128(40), Some("svc".into()), None);
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 60);
    assert_eq!(c.get_leash(id).unwrap().reserved_balance.0, 40);
    // Owner revokes: only the 60 available moves into the revocation
    // reservation. The payment's 40 stays protected.
    set_ctx(owner(), 2_010, storage_deposit());
    let _ = c.revoke(id);
    let l = c.get_leash(id).unwrap();
    assert!(l.revoked);
    assert_eq!(l.available_balance.0, 0);
    assert_eq!(l.reserved_balance.0, 100); // 40 payment + 60 revocation
    let r = c.get_revocation(id, 1).unwrap();
    assert_eq!(r.amount, U128(60));
    assert_eq!(
        r.status,
        agent_leash_near::types::RevocationStatus::Settling
    );
    // The payment reservation is still tracked and can settle independently.
    let pid = 1;
    let p = c.get_payment(id, pid).unwrap();
    assert!(p.reserved);
    assert_eq!(p.amount, U128(40));
}

// ---- balance cap (Phase One) ----

/// The immutable balance cap bounds `available + reserved`. Funding that would
/// exceed it is rejected in full and the FT contract refunds the sender.
#[test]
fn balance_cap_blocks_over_funding() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 1_000);
    assert_eq!(c.get_leash(id).unwrap().balance_cap.0, 1_000_000_000);
    // Headroom is 1_000_000_000 - 1_000 = 999_999_000.
    fund(&mut c, id, 999_999_000);
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 1_000_000_000);
    // One unit over the cap is rejected and the deposit is returned unused.
    set_ctx(token(), 1_200, 0);
    let msg = serde_json::json!({"Fund":{"leash_id": id}}).to_string();
    let unused = c.ft_on_transfer(owner(), U128(1), msg);
    match unused {
        near_sdk::PromiseOrValue::Value(v) => assert_eq!(v.0, 1),
        _ => panic!("expected unused value"),
    }
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 1_000_000_000);
}

/// The cap counts reserved funds too, so an in-flight payment reduces the
/// funding headroom by the reserved amount.
#[test]
fn balance_cap_counts_reserved_toward_headroom() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 1_000_000_000);
    // Agent reserves 40 for an immediate payment.
    set_ctx(agent(), 2_000, 0);
    let _ = c.request_payment(id, payee(), U128(40), Some("svc".into()), None);
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 999_999_960);
    assert_eq!(c.get_leash(id).unwrap().reserved_balance.0, 40);
    // Headroom is now 0: any funding is rejected.
    set_ctx(token(), 1_200, 0);
    let msg = serde_json::json!({"Fund":{"leash_id": id}}).to_string();
    let unused = c.ft_on_transfer(owner(), U128(10), msg);
    match unused {
        near_sdk::PromiseOrValue::Value(v) => assert_eq!(v.0, 10),
        _ => panic!("expected unused value"),
    }
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 999_999_960);
}

#[test]
#[should_panic(expected = "balance_cap must be between 1 and the ceiling")]
fn balance_cap_zero_rejected() {
    let mut c = init();
    set_ctx(owner(), 1_000, storage_deposit());
    let _ = c.create_leash(
        agent(),
        token(),
        U128(100),
        U128(500),
        Some(DAY_NS),
        60_000_000_000,
        Some(10_000_000_000_000),
        false,
        Some(5),
        Some(vec![payee()]),
        U128(0),
    );
}

#[test]
#[should_panic(expected = "balance_cap must be between 1 and the ceiling")]
fn balance_cap_above_ceiling_rejected() {
    let mut c = init();
    set_ctx(owner(), 1_000, storage_deposit());
    let _ = c.create_leash(
        agent(),
        token(),
        U128(100),
        U128(500),
        Some(DAY_NS),
        60_000_000_000,
        Some(10_000_000_000_000),
        false,
        Some(5),
        Some(vec![payee()]),
        U128(2_000_000_000_000),
    );
}

// ---- per-payee permissions and auto-approval (Phase Two) ----

/// A per-payee per-payment override may be lower than the leash default and is
/// enforced on immediate agent payments.
#[test]
fn payee_per_payment_override_enforced() {
    let mut c = init();
    let id = create_default(&mut c);
    // Leash default per-payment limit is 100. Set a payee override of 40.
    set_ctx(owner(), 1_200, storage_deposit());
    c.set_payee_limits(id, payee(), U128(40), U128(0));
    fund(&mut c, id, 100);
    set_ctx(agent(), 2_000, 0);
    let _ = c.request_payment(id, payee(), U128(40), None, None);
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 60);
    set_ctx(agent(), 2_010, 0);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.request_payment(id, payee(), U128(50), None, None);
    }))
    .is_err());
}

#[test]
fn payee_override_cannot_raise_global_per_payment_limit() {
    let mut c = init();
    let id = create_default(&mut c);
    set_ctx(owner(), 1_200, storage_deposit());
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.set_payee_limits(id, payee(), U128(101), U128(200));
    }))
    .is_err());
}

/// A per-payee fixed daily cap is enforced and resets when the period elapses.
#[test]
fn payee_daily_cap_enforced() {
    let mut c = init();
    set_ctx(owner(), 1_000, storage_deposit());
    let id = c.create_leash(
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
    );
    set_ctx(owner(), 1_200, storage_deposit());
    c.set_payee_limits(id, payee(), U128(50), U128(50));
    fund(&mut c, id, 100);
    set_ctx(agent(), 2_000, 0);
    let _ = c.request_payment(id, payee(), U128(50), None, None);
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 50);
    // Second payment in the same period is blocked by the payee cap.
    set_ctx(agent(), 2_010, 0);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.request_payment(id, payee(), U128(10), None, None);
    }))
    .is_err());
    // After a new period the cap resets.
    set_ctx(agent(), 2_000 + DAY_NS + 1, 0);
    let _ = c.request_payment(id, payee(), U128(50), None, None);
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 0);
}

#[test]
fn failed_payment_releases_payee_daily_reservation() {
    let mut c = init();
    let id = create_default(&mut c);
    set_ctx(owner(), 1_200, storage_deposit());
    c.set_payee_limits(id, payee(), U128(50), U128(50));
    fund(&mut c, id, 100);

    set_ctx(agent(), 2_000, 0);
    let failed = c.request_payment(id, payee(), U128(50), None, None);
    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        2_001,
        vec![PromiseResult::Failed],
    );
    let _ = c.on_payment_settled(id, failed, Err(PromiseError::Failed));

    set_ctx(agent(), 2_002, 0);
    let next = c.request_payment(id, payee(), U128(50), None, None);
    assert_eq!(
        c.get_payment(id, next).unwrap().status,
        PaymentStatus::Settling
    );
}

/// Setting payee limits resets the spend period.
#[test]
fn payee_limits_reset_period() {
    let mut c = init();
    set_ctx(owner(), 1_000, storage_deposit());
    let id = c.create_leash(
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
    );
    set_ctx(owner(), 1_200, storage_deposit());
    c.set_payee_limits(id, payee(), U128(50), U128(50));
    fund(&mut c, id, 100);
    set_ctx(agent(), 2_000, 0);
    let _ = c.request_payment(id, payee(), U128(50), None, None);
    // Owner changes limits: period resets, cap is available again.
    set_ctx(owner(), 2_100, storage_deposit());
    c.set_payee_limits(id, payee(), U128(50), U128(50));
    set_ctx(agent(), 2_110, 0);
    let _ = c.request_payment(id, payee(), U128(50), None, None);
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 0);
}

/// Auto-approval lets a non-allowlisted payee be paid immediately when the
/// amount is within the auto-approval ceiling.
#[test]
fn auto_approve_allows_non_allowlisted() {
    let mut c = init();
    let id = create_default(&mut c);
    set_ctx(owner(), 1_200, storage_deposit());
    c.set_auto_approve_limit(id, U128(50));
    fund(&mut c, id, 100);
    set_ctx(agent(), 2_000, 0);
    let pid = c.request_payment(id, payee2(), U128(50), None, None);
    assert_eq!(
        c.get_payment(id, pid).unwrap().status,
        PaymentStatus::Settling
    );
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 50);
}

/// Auto-approval is clamped to the leash per-payment limit.
#[test]
fn auto_approve_bounded_by_per_payment_limit() {
    let mut c = init();
    let id = create_default(&mut c);
    set_ctx(owner(), 1_200, storage_deposit());
    // per_payment_limit is 100; setting auto-approve above it is rejected.
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.set_auto_approve_limit(id, U128(200));
    }))
    .is_err());
}

/// With auto-approval at zero, a non-allowlisted payee cannot be paid
/// immediately when approval is not required.
#[test]
fn auto_approve_rejected_when_zero() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 100);
    set_ctx(agent(), 2_000, 0);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.request_payment(id, payee2(), U128(10), None, None);
    }))
    .is_err());
}

/// When approval is required, every payment (allowlisted or not) is queued as
/// PendingApproval with funds reserved, and the owner can approve or reject.
#[test]
fn approval_required_reserves_funds() {
    let mut c = init();
    let id = create_default(&mut c);
    set_ctx(owner(), 1_200, storage_deposit());
    c.update_permissions(
        id,
        U128(100),
        U128(500),
        0,
        Some(10_000_000_000_000),
        true,
        3,
    );
    fund(&mut c, id, 100);
    set_ctx(agent(), 2_000, 0);
    let pid = c.request_payment(id, payee(), U128(60), None, Some(2_000_000_000_000));
    assert_eq!(
        c.get_payment(id, pid).unwrap().status,
        PaymentStatus::PendingApproval
    );
    assert!(c.get_payment(id, pid).unwrap().reserved);
    assert_eq!(c.get_leash(id).unwrap().available_balance.0, 40);
    assert_eq!(c.get_leash(id).unwrap().reserved_balance.0, 60);
}

#[test]
fn approved_payment_remains_in_rolling_window_until_failure_or_settlement() {
    let mut c = init();
    set_ctx(owner(), 1_000, storage_deposit());
    let id = c.create_leash(
        agent(),
        token(),
        U128(100),
        U128(100),
        Some(DAY_NS),
        0,
        None,
        true,
        Some(5),
        Some(vec![payee()]),
        U128(1_000),
    );
    fund(&mut c, id, 200);

    set_ctx(agent(), 2_000, 0);
    let payment_id = c.request_payment(id, payee(), U128(60), None, None);
    assert_eq!(c.rolling_spend(id), U128(60));
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.request_payment(id, payee(), U128(50), None, None);
    }))
    .is_err());

    set_ctx(owner(), 2_001, 0);
    let _ = c.approve_payment(id, payment_id);
    assert_eq!(c.rolling_spend(id), U128(60));
    assert_eq!(
        c.get_payment(id, payment_id).unwrap().status,
        PaymentStatus::Settling
    );

    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        2_002,
        vec![PromiseResult::Failed],
    );
    let _ = c.on_payment_settled(id, payment_id, Err(PromiseError::Failed));
    assert_eq!(c.rolling_spend(id), U128(0));
}

#[test]
fn token_decimal_configuration_derives_safe_human_unit_ceiling() {
    let configured_tokens: Vec<(near_sdk::AccountId, u8)> = [0u8, 6, 18, 24]
        .into_iter()
        .map(|decimals| {
            (
                format!("token-{decimals}.testnet").parse().unwrap(),
                decimals,
            )
        })
        .collect();
    set_ctx(owner(), 1_000, 0);
    let mut c = AgentLeash::new(
        configured_tokens
            .iter()
            .map(|(token_contract, decimals)| SupportedTokenConfig {
                token_contract: token_contract.clone(),
                decimals: *decimals,
            })
            .collect(),
        None,
    );
    for (token_contract, decimals) in configured_tokens {
        let expected = balance_cap_ceiling_for_decimals(decimals).unwrap();
        let config = c
            .get_supported_token_config(token_contract.clone())
            .unwrap();
        assert_eq!(config.decimals, decimals);
        assert_eq!(config.max_balance_cap, U128(expected));

        set_ctx(owner(), 1_100, storage_deposit());
        let id = c.create_leash(
            agent(),
            token_contract,
            U128(1),
            U128(1),
            Some(DAY_NS),
            0,
            None,
            false,
            Some(1),
            Some(vec![payee()]),
            U128(expected),
        );
        assert_eq!(c.get_leash(id).unwrap().balance_cap, U128(expected));
    }
}

#[test]
fn token_decimal_configuration_rejects_invalid_and_overflowing_metadata() {
    assert!(balance_cap_ceiling_for_decimals(24).is_some());
    assert!(balance_cap_ceiling_for_decimals(25).is_none());
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = init_with_decimals(25);
    }))
    .is_err());
}

#[test]
fn balance_cap_above_decimal_adjusted_ceiling_is_rejected() {
    let configured_tokens: Vec<(near_sdk::AccountId, u8)> = [0u8, 6, 18, 24]
        .into_iter()
        .map(|decimals| {
            (
                format!("ceiling-{decimals}.testnet").parse().unwrap(),
                decimals,
            )
        })
        .collect();
    set_ctx(owner(), 1_000, 0);
    let mut c = AgentLeash::new(
        configured_tokens
            .iter()
            .map(|(token_contract, decimals)| SupportedTokenConfig {
                token_contract: token_contract.clone(),
                decimals: *decimals,
            })
            .collect(),
        None,
    );
    for (token_contract, decimals) in configured_tokens {
        let ceiling = balance_cap_ceiling_for_decimals(decimals).unwrap();
        set_ctx(owner(), 1_100, storage_deposit());
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.create_leash(
                agent(),
                token_contract.clone(),
                U128(1),
                U128(1),
                Some(DAY_NS),
                0,
                None,
                false,
                Some(1),
                Some(vec![payee()]),
                U128(ceiling.checked_add(1).unwrap()),
            );
        }))
        .is_err());
    }
}

#[test]
fn nep141_rejections_return_the_full_unused_amount() {
    let mut c = init();
    let id = create_default(&mut c);
    set_ctx(token(), 1_100, 0);
    for msg in [
        "not-json".to_string(),
        serde_json::json!({"Fund":{"leash_id": id + 999}}).to_string(),
    ] {
        assert!(matches!(
            c.ft_on_transfer(owner(), U128(77), msg),
            near_sdk::PromiseOrValue::Value(v) if v == U128(77)
        ));
    }
    let valid = serde_json::json!({"Fund":{"leash_id": id}}).to_string();
    assert!(matches!(
        c.ft_on_transfer(agent(), U128(77), valid),
        near_sdk::PromiseOrValue::Value(v) if v == U128(77)
    ));
    assert_eq!(c.get_leash(id).unwrap().available_balance, U128(0));
}

#[test]
fn storage_refund_promise_has_explicit_callback_gas() {
    let mut c = init();
    let minimum = c.storage_balance_bounds().min.as_yoctonear();
    let top_up = 20_000_000_000_000_000_000_000;
    set_ctx(owner(), 2_000, minimum + top_up);
    let _ = c.storage_deposit(None, Some(false));
    set_ctx(owner(), 2_010, 1);
    let _ = c.storage_withdraw(Some(NearToken::from_yoctonear(top_up)));

    let callback_gas = get_created_receipts()
        .into_iter()
        .flat_map(|receipt| receipt.actions)
        .find_map(|action| match action {
            MockAction::FunctionCallWeight {
                method_name,
                prepaid_gas,
                ..
            } if method_name == b"on_storage_refund" => Some(prepaid_gas),
            _ => None,
        });
    assert_eq!(callback_gas, Some(Gas::from_tgas(15)));
}

#[test]
fn storage_refund_callback_rejects_missing_or_unexpected_results() {
    let mut c = init();
    let minimum = c.storage_balance_bounds().min.as_yoctonear();
    let top_up = 20_000_000_000_000_000_000_000;
    for (account_id, results) in [
        (owner(), Vec::<PromiseResult>::new()),
        (
            other_owner(),
            vec![PromiseResult::Failed, PromiseResult::Successful(vec![])],
        ),
    ] {
        set_ctx(account_id.clone(), 2_000, minimum + top_up);
        let _ = c.storage_deposit(None, Some(false));
        set_ctx(account_id.clone(), 2_010, 1);
        let _ = c.storage_withdraw(Some(NearToken::from_yoctonear(top_up)));
        set_ctx_with_promise("current.testnet".parse().unwrap(), 2_020, results);
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.on_storage_refund(account_id.clone(), 1, Err(PromiseError::Failed));
        }))
        .is_err());
    }
}

#[test]
fn storage_deposit_exhaustion_blocks_state_growth() {
    let mut c = init();
    let minimum = c.storage_balance_bounds().min.as_yoctonear();
    set_ctx(owner(), 2_000, minimum);
    let _ = c.storage_deposit(None, Some(false));
    set_ctx(owner(), 2_010, 0);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.create_leash(
            agent(),
            token(),
            U128(1),
            U128(1),
            Some(DAY_NS),
            0,
            None,
            false,
            Some(1),
            Some(vec![payee()]),
            U128(1),
        );
    }))
    .is_err());
}

#[test]
fn rotating_agent_deactivates_its_schedules_and_releases_active_cap() {
    let mut c = init();
    let id = create_default(&mut c);
    set_ctx(agent(), 2_000, 0);
    let mut schedule_ids = Vec::new();
    for offset in 0..20 {
        schedule_ids.push(c.create_schedule(
            id,
            payee(),
            U128(1),
            5_000_000_000 + offset,
            None,
            None,
            0,
            0,
        ));
    }
    let new_agent = accounts(4);
    set_ctx(owner(), 2_100, 0);
    c.set_agent(id, new_agent.clone());
    for schedule_id in schedule_ids {
        let schedule = c.get_schedule(id, schedule_id).unwrap();
        assert!(!schedule.active);
        assert!(schedule.executed);
    }

    set_ctx(new_agent, 2_200, 0);
    let replacement = c.create_schedule(id, payee(), U128(1), 6_000_000_000, None, None, 0, 0);
    assert!(c.get_schedule(id, replacement).unwrap().active);
}

#[test]
fn revocation_succeeds_when_all_funds_are_reserved() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 40);
    set_ctx(agent(), 2_000, 0);
    let payment_id = c.request_payment(id, payee(), U128(40), None, None);
    assert_eq!(c.get_leash(id).unwrap().available_balance, U128(0));

    set_ctx(owner(), 2_001, 0);
    assert!(matches!(
        c.revoke(id),
        near_sdk::PromiseOrValue::Value(ref status) if status == "revoked"
    ));
    assert!(c.get_leash(id).unwrap().revoked);
    assert_eq!(c.get_leash(id).unwrap().reserved_balance, U128(40));

    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        2_002,
        vec![PromiseResult::Failed],
    );
    let _ = c.on_payment_settled(id, payment_id, Err(PromiseError::Failed));
    let leash = c.get_leash(id).unwrap();
    assert!(leash.revoked);
    assert_eq!(leash.available_balance, U128(40));
    assert_eq!(leash.reserved_balance, U128(0));
}

#[test]
fn available_reserved_and_total_custody_invariants_hold_across_callbacks() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 100);

    set_ctx(agent(), 2_000, 0);
    let payment_id = c.request_payment(id, payee(), U128(30), None, None);
    let leash = c.get_leash(id).unwrap();
    assert_eq!(leash.available_balance.0 + leash.reserved_balance.0, 100);
    assert_eq!(leash.pending_payment_count, 1);

    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        2_001,
        vec![PromiseResult::Successful(vec![])],
    );
    let _ = c.on_payment_settled(id, payment_id, Ok(()));
    let leash = c.get_leash(id).unwrap();
    assert_eq!(leash.available_balance.0 + leash.reserved_balance.0, 70);
    assert_eq!(leash.pending_payment_count, 0);

    set_ctx(owner(), 2_002, 0);
    let _ = c.withdraw_available(id, U128(20), None);
    let leash = c.get_leash(id).unwrap();
    assert_eq!(leash.available_balance.0 + leash.reserved_balance.0, 70);
    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        2_003,
        vec![PromiseResult::Failed],
    );
    let _ = c.on_withdrawal_settled(id, 1, Err(PromiseError::Failed));
    let leash = c.get_leash(id).unwrap();
    assert_eq!(leash.available_balance.0 + leash.reserved_balance.0, 70);
}

#[test]
fn owner_agent_isolation_and_pause_recovery_are_enforced() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 50);

    set_ctx(other_owner(), 2_000, 0);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.pause_leash(id);
    }))
    .is_err());
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.request_payment(id, payee(), U128(1), None, None);
    }))
    .is_err());

    set_ctx(owner(), 2_001, 0);
    c.pause_leash(id);
    set_ctx(agent(), 2_002, 0);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.request_payment(id, payee(), U128(1), None, None);
    }))
    .is_err());
    set_ctx(owner(), 2_003, 0);
    c.resume_leash(id);
    set_ctx(agent(), 2_004, 0);
    let payment_id = c.request_payment(id, payee(), U128(1), None, None);
    assert_eq!(
        c.get_payment(id, payment_id).unwrap().status,
        PaymentStatus::Settling
    );
}

#[test]
fn vigil_enable_check_in_overdue_auto_revoke() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 500);

    // 1 day check-in interval, 1 hour grace (both within min/max bounds)
    let interval_ns = 24 * 60 * 60 * 1_000_000_000; // 1 day
    let grace_ns = 60 * 60 * 1_000_000_000; // 1 hour

    set_ctx(owner(), 2_000, 0);
    c.enable_vigil(id, interval_ns, Some(grace_ns));

    set_ctx(owner(), 2_001, 0);
    let config = c.get_vigil_config(id).unwrap();
    assert!(config.enabled);
    assert_eq!(config.check_in_interval_ns, interval_ns);

    // Check in resets the deadline (owner only, as assert_owner requires)
    set_ctx(owner(), 3_000, 0);
    c.vigil_check_in(id);

    // Not yet overdue (still within interval)
    set_ctx(owner(), 3_100, 0);
    let result = c.check_vigil_overdue(id);
    match result {
        near_sdk::PromiseOrValue::Value(s) => assert_eq!(s, "not_overdue"),
        _ => panic!("expected value"),
    }

    // Configure beneficiaries before checking overdue (required for settlement)
    c.set_vigil_beneficiaries(id, vec![(accounts(4), 100)]);

    // Past interval + grace - should trigger settlement
    set_ctx(owner(), 3_000 + interval_ns + grace_ns + 1, 0);
    let result = c.check_vigil_overdue(id);
    match result {
        near_sdk::PromiseOrValue::Value(s) => assert_eq!(s, "settlement_triggered"),
        _ => panic!("expected value"),
    }

    let leash = c.get_leash(id).unwrap();
    assert!(leash.revoked);
}

#[test]
fn vigil_disable_rejects_non_owner() {
    let mut c = init();
    let id = create_default(&mut c);

    let interval_ns = 24 * 60 * 60 * 1_000_000_000; // 1 day
    let grace_ns = 60 * 60 * 1_000_000_000; // 1 hour

    set_ctx(owner(), 2_000, 0);
    c.enable_vigil(id, interval_ns, Some(grace_ns));

    set_ctx(agent(), 2_001, 0);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.disable_vigil(id);
    }))
    .is_err());

    set_ctx(owner(), 2_002, 0);
    c.disable_vigil(id);
    let config = c.get_vigil_config(id).unwrap();
    assert!(!config.enabled);
}

#[test]
fn vigil_beneficiaries_and_claim_entitlement() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 500);

    let interval_ns = 24 * 60 * 60 * 1_000_000_000; // 1 day
    let grace_ns = 60 * 60 * 1_000_000_000; // 1 hour

    set_ctx(owner(), 2_000, 0);
    c.enable_vigil(id, interval_ns, Some(grace_ns));
    c.set_vigil_beneficiaries(id, vec![(payee(), 70), (payee2(), 30)]);

    // Trigger overdue -> settlement (past interval + grace)
    set_ctx(owner(), 3_000 + interval_ns + grace_ns + 1, 0);
    let _ = c.check_vigil_overdue(id);

    let config = c.get_vigil_config(id).unwrap();
    assert!(config.settlement_triggered);
    assert_eq!(config.beneficiaries.len(), 2);

    // Claim entitlement
    set_ctx(payee(), 4_000, 0);
    let _ = c.claim_vigil_entitlement(id);

    let config = c.get_vigil_config(id).unwrap();
    assert!(config.beneficiaries[0].claimed);
}

#[test]
fn payee_add_remove_and_limits() {
    let mut c = init();
    let id = create_default(&mut c);

    set_ctx(owner(), 2_000, 0);
    c.add_payee(id, payee());
    assert!(c.is_recipient_allowed(id, payee()));

    c.add_payee(id, payee2());
    assert!(c.is_recipient_allowed(id, payee2()));

    // Set per-payee limits
    c.set_payee_limits(id, payee(), U128(10), U128(100));

    // Remove payee
    c.remove_payee(id, payee());
    assert!(!c.is_recipient_allowed(id, payee()));
    assert!(c.is_recipient_allowed(id, payee2()));
}

#[test]
fn set_auto_approve_limit_enforced() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 500);

    set_ctx(owner(), 2_000, 0);
    c.set_auto_approve_limit(id, U128(25));

    // Auto-approve limit cannot exceed per-payment limit
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.set_auto_approve_limit(id, U128(200));
    }))
    .is_err());
}

#[test]
fn cooldown_blocks_payment_until_elapsed() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 500);

    let base_ts = 100_000_000_000_000;
    set_ctx(agent(), base_ts, 0);
    let _ = c.request_payment(id, payee(), U128(10), None, None);
    set_ctx_with_promise(
        "current.testnet".parse().unwrap(),
        base_ts + 1_000,
        vec![PromiseResult::Successful(vec![])],
    );
    let _ = c.on_payment_settled(id, 1, Ok(()));

    // Immediate retry (1 ns later) should hit cooldown (60s = 60_000_000_000 ns)
    set_ctx(agent(), base_ts + 1, 0);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.request_payment(id, payee(), U128(10), None, None);
    }))
    .is_err());

    // After cooldown elapses (2x cooldown), payment succeeds
    set_ctx(agent(), base_ts + 60_000_000_000 * 2, 0);
    let pid = c.request_payment(id, payee(), U128(10), None, None);
    assert_eq!(
        c.get_payment(id, pid).unwrap().status,
        PaymentStatus::Settling
    );
}

#[test]
fn payroll_group_create_worker_execute() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 1000);

    set_ctx(owner(), 2_000, 0);
    let group_id = c.create_payroll_group(
        id,
        "Engineering".to_string(),
        token(),
        15,
        3_000_000_000_000,
    );
    assert_eq!(group_id, 1);

    c.add_payroll_worker(id, group_id, payee(), U128(100));
    c.add_payroll_worker(id, group_id, payee2(), U128(200));

    // Advance past first payment date
    set_ctx(owner(), 3_100_000_000_000, 0);
    let payment_ids = c.execute_payroll(id, group_id);
    match payment_ids {
        near_sdk::PromiseOrValue::Value(ids) => assert_eq!(ids.len(), 2),
        _ => panic!("expected value"),
    }

    let leash = c.get_leash(id).unwrap();
    assert_eq!(leash.reserved_balance.0, 300);
}

#[test]
fn schedule_skips_missed_periods_on_late_execution() {
    let mut c = init();
    let id = create_default(&mut c);
    fund(&mut c, id, 1000);

    // 1 hour interval (minimum allowed)
    let interval_ns = 60 * 60 * 1_000_000_000;

    set_ctx(owner(), 2_000, 0);
    let schedule_id = c.create_schedule(
        id,
        payee(),
        U128(10),
        2_100_000_000_000, // execute_after_ns
        None,
        None,
        interval_ns,
        0, // max_runs = unlimited
    );

    // Execute late (well past the first due time)
    set_ctx(owner(), 2_100_000_000_000 + interval_ns * 3 + 1, 0);
    let _ = c.execute_schedule(id, schedule_id);

    let schedule = c.get_schedule(id, schedule_id).unwrap();
    assert_eq!(schedule.runs, 1);
    assert!(schedule.next_due_ns > 2_100_000_000_000);
}
