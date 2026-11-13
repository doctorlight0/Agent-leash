# Controlled Testnet deployment

Status: **not deployed**. These are operator steps; this sprint did not create accounts, fund accounts, select a live token, sign transactions, or alter chain state.

## Required gates

1. Rebuild and verify `artifacts/agent_leash_near.wasm` against `agent_leash_near.wasm.sha256`.
2. Run the ignored near-workspaces integration test with a real sandbox binary and expand it to the full lifecycle below.
3. Select a trusted Testnet NEP-141 contract and independently verify its code, `ft_metadata`, storage rules, and failure behavior.
4. Initialize `supported_tokens` with objects such as `{"token_contract":"token.testnet","decimals":6}`. The decimal value is a security configuration, not an untrusted runtime discovery.
5. Fund the contract account sufficiently for code/state storage and callback/refund operations.

## Runtime lifecycle checklist

- deploy and initialize;
- register NEP-145 storage;
- create and fund a leash through real `ft_transfer_call`;
- successful and failed payment settlement;
- approval and rejection;
- one-shot and recurring schedules, duplicate occurrence, maximum runs, pause/resume;
- agent rotation and stale schedule deactivation;
- revocation with available funds and with all funds reserved;
- withdrawals and failed withdrawal restoration;
- successful/failed storage refunds, replay, unregister restriction;
- inspect actual gas burnt by `on_storage_refund` and retain receipts/state snapshots.

## Upgrade/migration

Do not deploy this WASM as an in-place upgrade over another schema. v1 uses a new deployment for schema changes. Finish or reject pending approvals, wait for in-flight callbacks, revoke, and withdraw before moving users to a new deployment.
