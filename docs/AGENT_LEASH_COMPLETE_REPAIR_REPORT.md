# Agent Leash Complete Repair Report

Generated: 2026-11-12T16:35:24Z

## 1. Executive summary

Local frontend/runtime wiring and native NEAR integration were audited and repaired in-place without resetting the app or replacing NEAR with EVM. The previous wallet integration was split/broken (legacy `near-api-js` `WalletConnection` hook vs unused wallet-selector helper), creating a non-functional/fragile Connect Wallet path and inconsistent state. The hook now uses `@near-wallet-selector/*` with modal-based connection, adapter loading with per-adapter fallback, account subscription, disconnect, and real contract signing through selector wallets. Funding/signing paths were corrected to NEP-141 `ft_transfer_call` + `msg {"Fund":{"leash_id":...}}` and `withdraw_available`. A canonical NEAR contract interface map was added (`src/lib/near-contract.ts`). Key dashboards were updated to remove legacy EVM/connectkit assumptions and to surface connect states/errors. Build, typecheck, lint (scoped), vitest, Rust fmt/clippy/test passed. Integration/sandbox tests and real browser wallet signing on Testnet were **not executed** in this run (no browser extension/wallet credentials and sandbox test runtime/linker constraints observed earlier; no deploy/financial actions performed).

## 2. Original blank-page / Connect Wallet root cause

- **VERIFIED**: No dedicated `/connect` route existed; “Connect Your Wallet” UI was an inline disconnected state in dashboard components (e.g. `Overview`, `Home`, `LeashesList`) rather than a separate page. Blank/empty-connect experience risk came from broken wallet state/provider behavior.
- **FIXED AND VERIFIED (code-level)**: `src/hooks/useNear.tsx` previously attempted legacy `near-api-js` connection + dynamic `WalletConnection` lookup with a fallback stub wallet object and `requestSignIn` redirect flow (MyNearWallet-style) while the repo also contained an unused `@near-wallet-selector` implementation in `src/lib/near-wallet.ts`. This mismatch meant:
  - selector modal UI/styles/dependencies were present but not driving app state,
  - adapter-based connect button behavior was not reliably bound to selector initialization,
  - state updates/disconnect/persistence semantics were inconsistent,
  - duplicate/incomplete initialization paths and fallback objects could leave the UI without a working connect action.
- **FIXED AND VERIFIED**: Replaced with a single wallet-selector-driven provider (`NearWalletProvider`) that initializes once (StrictMode-safe ref guard), subscribes to selector account store, shows modal on connect, signs out on disconnect, and exposes `ready/error/networkId` for visible UI states.

## 3. Exact files changed

### Core wallet/config/integration
- `src/hooks/useNear.tsx` — rewritten to use `@near-wallet-selector/core` selector/modal state, real connect/disconnect, account persistence via selector store, error/ready states, `view` via RPC helper, `call`/`callToken` via wallet `signAndSendTransaction`.
- `src/lib/near-wallet.ts` — hardened selector init (single init promise, per-adapter dynamic import/fallback, modal setup/hide/getter, no hard failure if one adapter missing).
- `src/lib/near-transactions.ts` — corrected typed NEAR actions; `fundLeash` uses `ft_transfer_call` with `{"Fund":{"leash_id":...}}` and 1 yocto; generic `callContract` helper retained for selector-based calls.
- `src/lib/near-contract.ts` — **added** canonical contract method/constants/types map from Rust contract.
- `src/hooks/useNearSend.ts` — fixed funding helper to use `ft_transfer_call` (NEP-141) instead of calling `ft_on_transfer` directly; consistent tx status/toast handling.

### Routing/app shell/UI connect surfaces
- `src/lib/router.ts` — added `/leashes/new`, `/payroll/new` routes and home handling fixes for existing navigation targets.
- `src/App.tsx` — wired create-leash route to `NearCreateLeash`, added safe “not yet implemented form” placeholder for `/payroll/new` (honest, no fake action), preserved NEAR-only config guard.
- `src/components/Header.tsx` — shows network badge, wallet error banner, and connected account state using new hook fields.
- `src/components/WalletButton.tsx` — real connect/disconnect actions, loading/ready states, test id.
- `src/components/Home.tsx` — replaced static CTA-only connect flow with real wallet-aware CTAs and wallet button when disconnected.
- `src/components/Overview.tsx` — explicit disconnected connect state with wallet button, loading/empty states, correct “Create Leash” navigation.

### Financial/contract-facing dashboards repaired
- `src/components/FundingDashboard.tsx` — rewritten to load owner leashes from connected account, read token decimals, deposit via `ft_transfer_call` funding message, withdraw via `withdraw_available`, show honest base-unit/decimals-aware amounts, and avoid mock balances.
- `src/components/BeneficiariesDashboard.tsx` — rewritten to use actual `get_vigil_config`/`set_vigil_beneficiaries`/`claim_vigil_entitlement` contract methods; removed non-existent `add/remove_vigil_beneficiary` calls and fake edit actions; added owner bulk-set and beneficiary claim flow.
- `src/components/SettingsDashboard.tsx` — async disconnect handling, clarified local-only preference storage/labels, removed misleading save/export implications.

### Utility
- `src/lib/utils.ts` — safer NEAR-friendly address truncation/format helpers (no hardcoded EVM assumptions in formatting behavior), improved date/amount robustness for UI display (legacy 6-dec helper retained with guards).

### Documentation
- `docs/AGENT_LEASH_COMPLETE_REPAIR_REPORT.md` — this report.

## 4. Wallet adapters implemented and tested

**Implemented (selector modules, lazy-loaded with per-adapter fallback):**
- Meteor Wallet (`@near-wallet-selector/meteor-wallet`)
- MyNearWallet (`@near-wallet-selector/my-near-wallet`)
- Sender (`@near-wallet-selector/sender`)
- HERE Wallet (`@near-wallet-selector/here-wallet`)

**Implementation notes:**
- Adapters are loaded individually; a failing/missing adapter does not prevent others from initializing.
- Modal is shown via `setupModal(...).show()` from connect action; `hide` on disconnect/error cleanup path.
- StrictMode-safe init guard prevents duplicate selector initialization/subscriptions.
- Account discovery/state comes from selector store subscription (`active`/first account), enabling reconnect persistence behavior provided by wallet-selector/wallet modules.
- Network identification surfaced in header from `NEAR_ENV.networkId`.

**Tested:**
- **FIXED AND VERIFIED (automated/local static/runtime checks):** `typecheck`, `build`, `vitest`, scoped `lint` passed after integration changes.
- **IMPLEMENTED BUT UNVERIFIED (real wallet/browser signing):** No real browser session with installed NEAR wallet extensions was executed in this environment; modal popup/open behavior, extension prompts, rejection UX, and signed transaction finalization against Testnet wallet providers were not end-to-end verified.

## 5. Contract/frontend method mismatches fixed

**Fixed/normalized (verified by code audit against `contracts/near/src/*`):**
- Funding: frontend funding paths now use NEP-141 `ft_transfer_call` on token contract with `msg: {"Fund":{"leash_id":...}}` (matches `ft_on_transfer`/`FundingMessage::Fund`), not direct `ft_on_transfer` calls and not a non-existent `fund_leash` contract method.
- Withdraw: `withdraw_available` used (correct) with `{ leash_id, amount, recipient }`.
- Owner leash listing: `list_owner_leashes` used (correct) where owner account is known.
- Vigil beneficiaries: removed frontend calls to non-existent `add_vigil_beneficiary` / `remove_vigil_beneficiary`; replaced with contract-supported `set_vigil_beneficiaries` (full list `[account_id, share_percent]`, total 100%) and `get_vigil_config`. `claim_vigil_entitlement` retained (beneficiary-caller method).
- Approvals/payments: `approve_payment` / `reject_payment` / `request_payment` args aligned to contract signatures in repaired components/hooks.
- Canonical interface: added `src/lib/near-contract.ts` enumerating actual view/change methods and key arg shapes from Rust sources to prevent future drift.

**Rechecked/observed mismatches or gaps still present in broader UI (not fully rebuilt):**
- **IMPLEMENTED BUT UNVERIFIED / PARTIAL:** Many legacy dashboard components still contain placeholder/incomplete flows (e.g. activity derived from limited payment views, payroll create UI not fully implemented, some vigil/worker controls simplified or not exposing all contract methods). These do not claim fake success but may not cover every contract capability end-to-end.
- **BLOCKED/OUT OF SCOPE FOR SAFE LOCAL FIX:** Full redesign of every legacy screen into complete, fully-verified CRUD flows for payroll/vigil/schedules would require substantial UI work and real contract/wallet test data; preserved existing design/architecture and avoided unsafe guesses.

## 6. Financial and security fixes

- **FIXED AND VERIFIED:** Removed direct/incorrect funding call pattern that bypassed NEP-141 transfer-call flow (`ft_on_transfer` direct calls in send helpers/funding UI) in favor of `ft_transfer_call` + contract funding message.
- **FIXED AND VERIFIED:** Deposit/withdraw UI no longer assumes mock USDC balances; amounts are read from contract leash state and token metadata decimals where available, parsed to base units before tx.
- **FIXED AND VERIFIED:** Transaction submission helpers gate on wallet connection and report wallet outcome/failure/cancellation; success toasts indicate submission (and funding/withdraw notes callback/finality where relevant), avoiding claiming finalized success before chain confirmation beyond wallet result handling available in client.
- **FIXED AND VERIFIED:** Beneficiary management now uses owner-authorized contract method (`set_vigil_beneficiaries`) and respects contract constraints (full list/100% share total) in UI validation; claim action is explicit beneficiary-caller method.
- **IMPLEMENTED BUT UNVERIFIED:** End-to-end on-chain authorization enforcement under real signed transactions (owner/agent isolation, payroll/vigil settlement callbacks, async callback safety outcomes) not revalidated on live Testnet in this session; contract source remains authoritative and unchanged except build/test checks.

## 7. Test commands and actual results

### Frontend
- `bun run typecheck` — **PASS** (exit 0)
- `bun run build` — **PASS** (exit 0; Vite production build completed; chunk-size warnings only)
- `bun run test` — **PASS** (2 files, 6 tests passed; vitest)
- `bun run lint` (scoped NEAR files per `package.json`) — **PASS** after fixes
- `./scripts/check.sh` (if run) — **NOT RUN AS A SINGLE COMMAND IN FINAL PASS**; individual lint/typecheck steps executed successfully

### Rust / NEAR contract
- `cargo fmt --check` (in `contracts/near`) — **PASS**
- `cargo clippy --all-targets -- -D warnings` (in `contracts/near`) — **PASS** (finished dev profile)
- `cargo test` (in `contracts/near`) — **PARTIAL / BLOCKED for integration test binary**: `cargo test --lib` passed with `0 tests` run (no lib unit tests in crate target as reported); full `cargo test` previously failed linking `near_workspaces` test binary due environment/toolchain issue (`undefined symbol: pthread_atfork` / linker path in sandbox). **Did not claim sandbox/integration pass.**
- `cargo near build --no-docker` — **NOT AVAILABLE** (`cargo-near` not installed in environment)

### Artifacts inspected (existing local WASM builds; no rebuild via cargo-near in this run)
- `target-wasm/wasm32-unknown-unknown/release/agent_leash_near.wasm` — 606K, SHA256 `10ec21b4e4495314e6b373c137f6a3261871db725c0eb11505f2dc5b621d0823`
- `contracts/near/target-wasm/wasm32-unknown-unknown/release/agent_leash_near.wasm` — 381K, SHA256 `930dec09b96e6f187684db38e44f1d078c535f1147fd526e3641945de609967e`

## 8. Build status

- **Frontend production build:** **VERIFIED PASS** (`vite build`)
- **TypeScript:** **VERIFIED PASS**
- **Scoped lint:** **VERIFIED PASS**
- **Rust fmt/clippy:** **VERIFIED PASS**
- **Rust lib tests:** **VERIFIED PASS** (no lib tests)
- **Rust integration/sandbox tests:** **BLOCKED** (linker/runtime environment issue; `cargo-near` unavailable for reproducible WASM release build command requested)

## 9. Remaining blockers

1. **Real browser wallet E2E not executed:** no installed/configured NEAR wallet extension or interactive browser wallet session available to confirm modal popup, adapter selection UX, signing prompts, account switching behavior, and post-tx state refresh on Testnet.
2. **NEAR sandbox/integration tests blocked:** `cargo test` integration target (`near_workspaces`) failed to link in this environment; `cargo near build --no-docker` unavailable (`cargo-near` missing).
3. **Legacy screens still partially incomplete:** some dashboards (payroll group creation form, full worker editing flows, richer activity/event indexing, complete vigil UX parity with every contract method, schedule management UI coverage) remain simplified/partially implemented; they avoid fake success but do not provide exhaustive end-to-end management for all contract features.
4. **Live Testnet contract state validation:** no on-chain read/write verification against `agent-leash.testnet` with real wallet signatures performed.
5. **Potential selector modal styling/runtime differences across wallets:** adapter availability depends on user environment (extensions/web wallets); not fully validated here.

## 10. Verification classification

- **VERIFIED**
  - Repo audit performed; existing architecture/design preserved (no reset/rewrite).
  - Wallet hook/provider refactor compiles and is wired through app.
  - Funding path corrected to `ft_transfer_call` with `{"Fund":{"leash_id":...}}`.
  - `withdraw_available` used for withdrawals.
  - Canonical contract method map added from Rust source.
  - `bun run typecheck`, `bun run build`, `bun run test`, scoped `bun run lint`, `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test --lib` passed.

- **FIXED AND VERIFIED**
  - Broken/fragmented wallet integration root cause addressed by replacing legacy wallet flow with selector-based provider + modal connect/disconnect + store subscription.
  - Connect button now triggers real selector modal flow (code-verified) and disconnected states render actionable UI in key surfaces (Home/Overview/Header/Funding/Beneficiaries/Settings).
  - Funding/withdraw UI uses correct NEAR contract interaction patterns and token-aware amount parsing/formatting.

- **IMPLEMENTED BUT UNVERIFIED**
  - Meteor/MyNearWallet/Sender/HERE adapter initialization and modal presentation in a real browser with actual wallet extensions/accounts.
  - Real wallet connection persistence/reconnect, rejection handling, missing-extension UX, account switching behavior across supported wallets.
  - Signed Testnet transactions (create leash, deposit, withdraw, approvals, payroll, vigil operations) and post-finality UI state updates.
  - Full functional completeness of all dashboard actions/buttons across every legacy screen.

- **BLOCKED**
  - NEAR sandbox/integration test execution (`near_workspaces`) due local linker/environment issue.
  - `cargo near build --no-docker` and reproducible release WASM build verification in this environment (tool missing).
  - Any deployment, contract upgrade, or production/Testnet financial transactions (prohibited).

## 11. Final verdict

1. **Local frontend readiness:** **PARTIAL / IMPROVED (not fully production-ready).** Core wallet/connect architecture, NEAR-native integration paths, and build/type/test health are significantly repaired and verified locally at compile/runtime-build level; however, real browser wallet E2E and some feature-complete legacy flows remain unverified/incomplete.
2. **Local contract readiness:** **READY FOR LOCAL CODE REVIEW / PARTIAL VERIFICATION.** Rust sources unchanged functionally in this repair pass except validation via fmt/clippy/lib tests; contract API used as source of truth. Integration tests and fresh reproducible WASM build via `cargo-near` are not fully verified here.
3. **Sandbox integration readiness:** **BLOCKED.** `near_workspaces` integration tests could not be completed due environment linker issue; `cargo-near` unavailable.
4. **Testnet deployment readiness:** **NOT READY TO CLAIM.** No deployment performed, no real wallet-signed Testnet transactions executed, and integration/reproducible build verification incomplete. Successful local compilation/build does **not** establish Testnet or production readiness.

**Honesty statement:** This report does not claim real browser wallet connection or real Testnet transactions were tested. No secrets were accessed or exposed. No deployment, commits, pushes, or financial transfers were performed.