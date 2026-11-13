# Agent Leash NEAR contract

Rust/near-sdk implementation of multi-leash NEP-141 custody for autonomous agents. No Testnet or Mainnet deployment is claimed.

## Verified locally

- `cargo fmt --check`: pass
- `cargo clippy --all-targets -- -D warnings`: pass
- `cargo test --test agent_leash`: 61 passed
- release WASM build: pass
- byte-for-byte independent rebuild: pass

```bash
cargo build --target wasm32-unknown-unknown --release --target-dir target-wasm
sha256sum target-wasm/wasm32-unknown-unknown/release/agent_leash_near.wasm
```

Pinned artifact: `artifacts/agent_leash_near.wasm`, 389,453 bytes, SHA-256 `930dec09b96e6f187684db38e44f1d078c535f1147fd526e3641945de609967e`.

The near-workspaces host binary builds with GNU `bfd`, but runtime execution is blocked because this environment has no NEAR sandbox executable and cannot download one. Native callback simulation is not described as runtime verification.

See `ARCHITECTURE.md`, `SECURITY.md`, `INTEGRATION.md`, and `TESTNET_DEPLOYMENT.md`.
