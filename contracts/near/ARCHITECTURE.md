# Architecture

## Components

- `lib.rs`: persistent contract state, initialization, supported-token administration.
- `leash.rs`: leash creation, payees, permissions, auto-approval, agent rotation.
- `funding.rs`: NEP-141 `ft_on_transfer` validation and funding.
- `payments.rs`, `approval.rs`, `settlement.rs`: validation, reservations, approvals, asynchronous finalization.
- `schedule.rs`: one-shot/recurring schedule lifecycle.
- `emergency.rs`: pause, revocation, withdrawals, and callbacks.
- `storage.rs`, `storage_accounting.rs`: collection helpers and NEP-145 accounting/refunds.
- `state.rs`, `types.rs`, `views.rs`, `events.rs`: state records, API types, reads, and events.

## Custody and reservations

Each leash stores `available_balance` and `reserved_balance`. Funding increases available balance only when the owner, token predecessor, leash token, and immutable cap all match. A payment, withdrawal, or revocation moves tokens from available to reserved before creating an asynchronous promise. Callbacks consume reservations on success or restore them on failure. Monotonic IDs and terminal statuses make duplicate and out-of-order callbacks no-ops.

Approval-required requests are included in the rolling window while reserved. Rejection, expiry, or failed settlement removes the reservation and its rolling entry. Successful settlement leaves the spend entry until the rolling window elapses.

## Token configuration

The contract administrator supplies a trusted token ID and reviewed decimals during initialization or `add_supported_token`. Decimals are immutable and limited to 0–24. The per-leash ceiling is:

`1,000,000 × 10^decimals` base units.

This preserves the same whole-token exposure across zero-, six-, eighteen-, and twenty-four-decimal tokens. The frontend compares live `ft_metadata` against the administrator-pinned value, but the allowlist/configuration remains the on-chain trust boundary.

## Schedules

One-shot schedules use `interval_ns = 0`; recurring schedules require at least one hour. Execution is permissionless when due. The occurrence and next due time are committed before the FT transfer, so a failed transfer cannot replay the same occurrence. Delayed execution skips missed periods. Agent rotation terminally deactivates schedules created by the previous agent, freeing the active-schedule cap.

## Storage

NEP-145 balances are derived from measured storage bytes and `env::storage_byte_cost`. Storage-growing operations charge the leash owner. Refunds reserve a monotonic refund ID and amount, transfer NEAR, then call a private callback with an explicit 15 Tgas budget. Failed transfers restore the claim; replays cannot debit it twice. Unregister is blocked while leash state exists.

## Trust boundaries

- Contract owner: may add trusted token configurations.
- Leash owner: controls one leash, approvals, payees, schedules, pause/revoke, and withdrawals.
- Agent: may request payments and create schedules only within live leash policy.
- Token contract: must be a reviewed NEP-141 implementation selected by the contract owner.
