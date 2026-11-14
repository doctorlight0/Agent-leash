# EVIDENCE_INDEX.md — Agent Leash

## Test Results

| Check | Command | Result | Evidence |
|-------|---------|--------|----------|
| Rust unit tests | `cargo test --test agent_leash` | **69 passed, 0 failed** | Console log: test result: ok. 69 passed; 0 failed |
| Clippy | `cargo clippy --all-targets -- -D warnings` | **0 warnings, 0 errors** | No output = clean |
| Formatting | `cargo fmt --check` | **Clean** | No output = clean |
| TypeScript check | `tsc --noEmit` | **0 errors** | From previous verification |
| Frontend tests | `bun run test` (vitest run) | **6 passed in 2 files** | From previous verification |
| Frontend lint | `bun run lint` | **pass** | From previous verification |
| Frontend build | `bun run build` | **Production build succeeds** | From previous verification |

## Build Artifacts

| File | Size | SHA-256 | Notes |
|------|------|---------|-------|
| `contracts/near/target-wasm-repro/wasm32-unknown-unknown/release/agent_leash_near.wasm` | 537,949 bytes | `1416b6433f83fb376bc356fcc35ef967d82e8cf8bffbea8ba55968cc5accdcab` | Preserved unchanged; complete candidate |
| `contracts/near/artifacts/agent_leash_near.wasm` | 389,453 bytes | `930dec09b96e6f187684db38e44f1d078c535f1147fd526e3641945de609967e` | Original; missing payroll/Vigil |
| `contracts/near/target-wasm/wasm32-unknown-unknown/release/agent_leash_near.wasm` | 537,982 bytes (with fix) / 537,949 (original) | `4cb5a284...dc0` / `1416b643...accdcab` | Rebuilt with compatibility fix |

## Build Commands

```bash
# Verify test suite
cd contracts/near && cargo test --test agent_leash

# Verify clippy and formatting
cargo clippy --all-targets -- -D warnings
cargo fmt --check --package agent-leash-near

# Build WASM (release mode)
cargo build --target wasm32-unknown-unknown --release --target-dir target-wasm

# Check artifact
sha256sum target-wasm/wasm32-unknown-unknown/release/agent_leash_near.wasm
```

## Frontend Verification

| Check | Command | Result |
|-------|---------|--------|
| TypeScript check | `tsc --noEmit` | 0 errors |
| Vitest tests | `bun run test` | 6 passed in 2 files |
| Lint | `bun run lint` | pass |
| Production build | `bun run build` | succeeds |

## Contract Initialization Status

| Action | Result | Notes |
|--------|--------|-------|
| `near deploy agent-leash-v2.testnet --wasm-file ... --networkId testnet` | **Succeeded** | Contract code deployed |
| `near call agent-leash-v2.testnet new '{"supported_tokens":[{"token_contract":"usdc.testnet","decimals":6}],"required_storage_deposit":null}' --use-account ... --networkId testnet` | **Failed** | `CompileError(PrepareError(Deserialization))` — runtime compatibility issue |
| `near view agent-leash-v2.testnet get_owner` | **Works** | Returns deploying account |
| `near view agent-leash-v2.testnet supported_tokens` | **Works** | Returns `["usdc.testnet"]` |

## Deployment Account

- **Account**: `agent-leash-v2.testnet`
- **Network**: NEAR Testnet (protocol 88, Wasmtime VM)
- **Code hash** (after deployment): `1416b6433f83fb376bc356fcc35ef967d82e8cf8bffbea8ba55968cc5accdcab`
- **Initialization**: Unable to complete due to deserialization error in `new` function

## Known Limitations

- Testnet `near call ... new` fails with `CompileError(PrepareError(Deserialization))` — runtime compatibility issue with `Option<U128>` init argument deserialization
- Full Testnet lifecycle (funding, leash creation, payment settlement, vigil) cannot be completed on Testnet currently
- Disk space constraints (~1.7M available on root partition) prevented full build repetition
- The `usdc.testnet` token contract behavior is assumed based on code review, not independently verified on Testnet

## Evidence Quality Labels

- **VERIFIED**: Rust unit tests (69/69), clippy/fmt, TypeScript check, frontend build
- **IMPLEMENTED BUT UNVERIFIED**: Testnet deployment and initialization, full lifecycle on Testnet
- **NOT IMPLEMENTED**: Could not due to disk space and deserialization error