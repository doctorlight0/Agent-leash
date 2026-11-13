# Agent handoff

Use `git --git-dir=.gitdata/.git --work-tree=.` because the workspace provides an empty read-only `.git/` mount.

- Preservation commit: `8960e3f`.
- Native contract suite: 61 passed.
- Frontend: typecheck/lint/build pass; 6 tests pass.
- Final WASM: `contracts/near/artifacts/agent_leash_near.wasm`.
- SHA-256: `930dec09b96e6f187684db38e44f1d078c535f1147fd526e3641945de609967e`.
- Sandbox host test links with `gcc`/`bfd`; runtime is blocked by the missing sandbox binary/network restriction.
- No Testnet/Mainnet deployment or token selection exists.
- Schema policy is non-upgradeable v1; never perform an in-place schema upgrade.

Next action: run and expand `contracts/near/tests/near_workspaces.rs` in an environment with a real sandbox executable, collect receipts/gas, then follow `contracts/near/TESTNET_DEPLOYMENT.md` using operator-owned accounts.
