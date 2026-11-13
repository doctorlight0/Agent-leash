# Security notes

## Enforced invariants

- Cross-leash authorization is owner/agent scoped; payment approval validates leash and token identity.
- `available + reserved` never exceeds the immutable balance cap through accepted funding.
- Reservations prevent concurrent payment/withdrawal/revocation double spending.
- Failed FT transfers restore balances; successful transfers consume reservations exactly once.
- Revocation is available even when all tokens are already reserved and permanently blocks new agent activity.
- Funding rejection returns the full NEP-141 amount as unused.
- Token decimals are administrator-pinned, immutable, bounded to 24, and used in checked cap calculation.
- Schedule timestamps/run counters use checked arithmetic; occurrences are claimed before settlement.
- Storage refunds use an explicit 15 Tgas callback, exactly one promise result, a monotonic ID, failure restoration, and replay protection.
- Storage unregister is blocked while persistent leash records remain.

## Callback gas finding

The original storage-refund promise omitted `.with_static_gas(...)`. That left the callback budget dependent on generated SDK defaults and provided no auditable worst-case allowance. It now receives 15 Tgas. Native receipt inspection verifies the attached gas and tests successful refund, failed transfer, restoration, replay, and missing/multiple promise-result rejection.

Actual runtime gas consumption is **unverified** because the local sandbox binary is unavailable. Fifteen Tgas is consistent with the other state-mutating callbacks and covers a bounded path of one account read plus one write/removal, but sandbox receipt measurement remains a deployment gate.

## Upgrade policy

The v1 schema is explicitly non-upgradeable. There is no `#[migrate]` entry point. Deploy schema changes to a new account, pause/revoke old leashes, let callbacks finish, withdraw all available/restored token balances and NEAR storage claims, then create and fund new leashes. Outstanding reservations do not move automatically and must reach a terminal state on the old contract.

## Remaining risks

- Real sandbox/Testnet NEP-141 and NEP-145 receipt execution is not verified.
- The selected token implementation and configured decimals must be reviewed by the deployment operator.
- Native tests do not prove cross-contract gas sufficiency or token-specific registration behavior.
- Payment/schedule history consumes owner-funded storage; operators should monitor storage availability.
- No independent third-party audit has been performed.
