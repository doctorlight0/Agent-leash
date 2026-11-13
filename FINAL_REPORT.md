# Agent Leash emergency sprint — final report

Build date: 2026-11-07 (Africa/Lagos). No public-network deployment, account creation, funding, signing, or live-state mutation was performed.

## Executive summary

**IMPLEMENTED BUT UNVERIFIED for submission:** the source, native test suite, frontend, documentation, and reproducible WASM artifact are complete. **BLOCKED:** real NEAR sandbox lifecycle and callback gas-burn measurement because no sandbox executable is installed/cached and network download fails.

## Status matrix

| Area | Status | Evidence |
|---|---|---|
| Repository preservation | VERIFIED | Initial commit `8960e3f`; secrets/generated trees excluded |
| Formatting / Clippy | VERIFIED | `cargo fmt --check`; `cargo clippy --all-targets -- -D warnings` |
| Native contract behavior | FIXED AND VERIFIED | 61 passed, 0 failed |
| Storage-refund callback gas allocation | FIXED AND VERIFIED | explicit 15 Tgas and receipt-allocation regression test |
| Actual callback gas burn | BLOCKED | sandbox binary unavailable |
| Token decimals/cap | FIXED AND VERIFIED | administrator-pinned 0–24 decimals; 0/6/18/24 and overflow tests |
| NEP-141 logic | FIXED AND VERIFIED locally | full-refund rejection and reservation/settlement tests; real token runtime blocked |
| NEP-145 logic | FIXED AND VERIFIED locally | success/failure/replay/restoration/exhaustion/unregister tests; runtime blocked |
| Sandbox lifecycle | BLOCKED | integration binary links; sandbox download DNS failure |
| Frontend | VERIFIED | typecheck, lint, 6 tests, production build |
| WASM reproducibility | VERIFIED | two independent target directories produced identical bytes |
| Migration policy | VERIFIED | explicit non-upgradeable v1 policy |

## Bugs fixed

1. Contract-local Cargo config forced WASM for native Clippy/tests.
2. `schedule.rs` formatting failure.
3. Storage-refund callback had no explicit gas budget.
4. Storage refund did not explicitly reject missing/multiple promise results in the implementation body.
5. Fixed `10^12` raw cap misrepresented exposure for non-six-decimal tokens.
6. `approve_payment` contained a tautological recipient comparison; replaced with leash/token invariants.
7. Emergency `revoke` failed when all tokens were reserved, preventing immediate agent shutdown.
8. Rotating an agent left its schedules active and consuming the active-schedule cap.
9. Two unused payment helper functions required unnecessary dead-code allowances.
10. Frontend hardcoded the six-decimal cap, did not compare metadata to on-chain configuration, and failed lint.
11. Frontend exposed the legacy flag-only revoke and allowed an owner-facing payment button that the contract rejects.
12. Frontend lacked practical schedule, agent rotation, payee, approval-policy, and auto-approval controls.

## Regression coverage added

- approved payment and rolling-window reservation;
- token decimals 0, 6, 18, and 24; maximum values and invalid metadata;
- full NEP-141 rejection/refund;
- explicit storage callback gas;
- missing/multiple callback results;
- storage deposit exhaustion;
- schedule-cap recovery after agent rotation;
- revocation while all funds are pending;
- available/reserved/total custody invariants;
- owner/agent isolation, pause, and recovery.

Existing tests already cover successful/failed storage refunds, replay, restoration, unregister with records, duplicate scheduled occurrences, run exhaustion, schedule overflow, failed settlement, payee limits, revocation reservations, and withdrawal replay.

## Callback gas investigation

`on_storage_refund` has a bounded path: one `LookupMap` read; promise-result validation; and one account write or removal. The callback now receives `Gas::from_tgas(15)`, matching other state-mutating callbacks. Native receipt inspection proves the promise attaches 15 Tgas. Actual sandbox gas used remains unmeasured and is a deployment gate.

## Artifact integrity

- Artifact: `contracts/near/artifacts/agent_leash_near.wasm`
- Size: **389,453 bytes**
- SHA-256: **930dec09b96e6f187684db38e44f1d078c535f1147fd526e3641945de609967e**
- Target: `wasm32-unknown-unknown`
- Command: `cargo build --target wasm32-unknown-unknown --release --target-dir target-wasm`
- Independent rebuild: byte-for-byte identical from `target-wasm-repro`

## Sandbox result

The host integration test binary successfully builds with:

```bash
CARGO_TARGET_DIR=target-x86 \
RUSTFLAGS='-C linker=/usr/bin/gcc -C link-arg=-fuse-ld=bfd -C link-arg=-Wl,--no-as-needed -C link-arg=-lpthread' \
cargo test --target x86_64-unknown-linux-gnu --test near_workspaces --no-run
```

This resolves the previous `pthread_atfork` linker failure. The dependency's build-time installer is disabled, so clean Clippy/builds do not require network access. Running the ignored test still fails immediately because the sandbox runner cannot find a local binary and DNS/network access prevents downloading one: `DownloadError("io: failed to lookup address information: Temporary failure in name resolution")`.

## Frontend result

- `bun run typecheck`: pass
- `bun run lint`: pass
- `bun run test`: 6 passed
- `bun run build`: pass
- Warnings: dependency `eval` warning and an 884 kB JavaScript chunk; neither failed the build.

## Migration decision

Non-upgradeable v1. No `#[migrate]` entry point is provided. A future schema uses a new deployment. Users must finish/reject approvals and callbacks, revoke, withdraw token balances, recover storage claims, and then create/fund replacement leashes. No documentation implies balances migrate automatically.

## Remaining blockers

- Full sandbox lifecycle and actual receipts/state snapshots.
- Runtime gas-burn evidence for `on_storage_refund`.
- Selection and review of a real Testnet NEP-141 token.
- Independent security audit before production use.
- The empty read-only `.git/` workspace mount requires commands to use `git --git-dir=.gitdata/.git --work-tree=.`.

## Reproduction commands

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

## Verdict

**IMPLEMENTED BUT UNVERIFIED** as a hackathon submission: strong local correctness and reproducibility evidence, but not ready for Testnet claims until the real sandbox lifecycle and gas measurements pass.
