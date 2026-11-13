# Agent Leash for NEAR

Agent Leash is a multi-tenant custody contract for giving autonomous agents tightly bounded NEP-141 spending authority. Owners retain the funds and define the leash; agents can only request payments that satisfy on-chain limits.

Submission status: local implementation and native tests are complete. The contract is **not deployed** to NEAR Testnet or Mainnet, and real sandbox execution is blocked in this environment because no sandbox binary is available.

## Why it exists

Agents need payment access to buy APIs, services, compute, and recurring subscriptions, but an unrestricted wallet key turns any prompt-injection or software defect into total wallet exposure. Agent Leash limits that exposure with independently enforced controls:

- immutable per-leash balance cap;
- supported-token allowlist with administrator-pinned decimals;
- per-payment and rolling-window limits;
- allowlisted payees, per-payee overrides, and fixed 24-hour sub-limits;
- cooldown, expiry, pause, owner approval, and emergency revocation;
- reservation accounting that prevents asynchronous double spending;
- one-shot and recurring schedules with duplicate-occurrence protection;
- measured NEP-145 storage accounting and callback-safe refunds.

## Core flow

1. The contract administrator initializes trusted NEP-141 token IDs with reviewed decimals (0–24).
2. An owner deposits NEAR storage and creates a leash for one agent and one token.
3. The owner funds it through the token's `ft_transfer_call` with `{"Fund":{"leash_id":...}}`.
4. Agent requests reserve funds before `ft_transfer` starts. Success consumes the reservation; failure restores it.
5. Approval-required requests remain reserved until the owner approves, rejects, or the request expires.
6. Revocation stops new agent activity immediately, including when all funds are already reserved.

The maximum balance cap is one million whole tokens for every supported decimal configuration. The contract converts that limit to base units with checked arithmetic; it does not trust arbitrary token metadata at leash-creation time.

## Run locally

Prerequisites: Bun, Rust, and the `wasm32-unknown-unknown` Rust target.

```bash
bun install
cp .env.near.example .env.local
bun run dev
```

The UI requires `VITE_NEAR_CONTRACT_ID`. Without a deployed contract it shows an explicit configuration warning and does not fabricate data.

## Validate

```bash
cd contracts/near
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --test agent_leash
cargo build --target wasm32-unknown-unknown --release --target-dir target-wasm
sha256sum target-wasm/wasm32-unknown-unknown/release/agent_leash_near.wasm

cd ../..
bun run typecheck
bun run lint
bun run test
bun run build
```

Final artifact: `contracts/near/artifacts/agent_leash_near.wasm` (389,453 bytes), SHA-256 `930dec09b96e6f187684db38e44f1d078c535f1147fd526e3641945de609967e`.

## Documentation

- [Architecture](contracts/near/ARCHITECTURE.md)
- [Security](contracts/near/SECURITY.md)
- [Integration/API](contracts/near/INTEGRATION.md)
- [Controlled Testnet checklist](contracts/near/TESTNET_DEPLOYMENT.md)
- [Final verification report](FINAL_REPORT.md)

## Upgrade policy

This submission is a non-upgradeable v1 state schema. Schema changes require a new deployment and an explicit user migration process; redeployment does not move balances or reservations automatically. See the security and deployment documents before any public deployment.
