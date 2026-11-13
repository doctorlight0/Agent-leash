# Initial Preservation Inventory

Recorded before contract or frontend source changes on 2026-11-07 (Africa/Lagos).

## Repository state

- No usable Git repository or commits were present.
- The workspace exposes an empty read-only `.git/` mount, so Git metadata is stored in `.gitdata/` and commands use `git --git-dir=.gitdata --work-tree=.`.
- Sensitive/local paths identified without reading their contents: `.env`, `.aws/`, `.codex/`, and `.agents/`.
- Safe configuration template retained: `.env.near.example`.

## Source inventory

- NEAR contract implementation: 15 Rust modules, 3,178 lines.
- Native contract test: `contracts/near/tests/agent_leash.rs`, 1,436 lines.
- Sandbox test and runtime note: `contracts/near/tests/near_workspaces.rs` and `sandbox_runtime.md`.
- Frontend: 54 files under `src/`.
- Project scripts: 5 files under `scripts/`.
- Vendored Foundry test library: 68 files under `lib/forge-std/`.

## Generated or local-only material excluded

- `node_modules/` (about 1.1 GiB)
- `dist/`
- `contracts/out/` and `contracts/cache/`
- `contracts/near/target/`, `target-wasm/`, `target-x86/`, and `test-target/`
- trace/console logs and environment files

## Baseline artifact

- Path: `contracts/near/target-wasm/wasm32-unknown-unknown/release/agent_leash_near.wasm`
- Size: 377,500 bytes
- SHA-256: `166e7a2790b1d256a5962106f10e30a24817353362385b5d86f96730833f30e5`

This inventory describes the pre-change workspace; final artifact and validation data belong in `FINAL_REPORT.md`.
