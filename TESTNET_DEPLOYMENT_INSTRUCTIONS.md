# Agent Leash — Testnet Deployment Instructions

## 1. Deployment and Initialization

### 1.1 Build the WASM artifact (when disk space permits)

```bash
cd contracts/near
cargo build --target wasm32-unknown-unknown --release --target-dir target-wasm
sha256sum target-wasm/wasm32-unknown-unknown/release/agent_leash_near.wasm
# Expected: 1416b6433f83fb376bc356fcc35ef967d82e8cf8bffbea8ba55968cc5accdcab
# Size: 537949 bytes
```

### 1.2 Deploy and initialize the contract

```bash
near deploy \
  --accountId agent-leash-v2.testnet \
  --wasm contracts/near/target-wasm/wasm32-unknown-unknown/release/agent_leash_near.wasm \
  --init '{"supported_tokens":[{"token_contract":"usdc.testnet","decimals":6}],"required_storage_deposit":null}' \
  --network testnet
```

**Constructor configuration:**
```json
{
  "supported_tokens": [
    {"token_contract": "usdc.testnet", "decimals": 6}
  ],
  "required_storage_deposit": null
}
```

### 1.3 Verify deployment — read-only commands

After deployment, run the following read-only verification commands (do not submit transactions):

#### Deployed code hash:
```bash
near code hash agent-leash-v2.testnet
# Expected: 1416b6433f83fb376bc356fcc35ef967d82e8cf8bffbea8ba55968cc5accdcab
```

#### Contract owner:
```bash
near view agent-leash-v2.testnet get_owner
# Expected: The deploying account ID
```

#### Supported token configuration:
```bash
near view agent-leash-v2.testnet supported_tokens
# Expected: ["usdc.testnet"]
near view agent-leash-v2.testnet get_supported_token_config '{"token_contract":"usdc.testnet"}'
# Expected: {"token_contract":"usdc.testnet","decimals":6,"max_balance_cap":"1000000"}
```

#### Storage requirements:
```bash
near view agent-leash-v2.testnet get_required_storage_deposit
# Expected: <minimum storage deposit in yoctoNEAR>
```

#### Contract balance:
```bash
near view agent-leash-v2.testnet accounts balance
# OR
near accounts
# Expected: Contract has some NEAR balance for gas
```

#### Essential view methods:
```bash
# List leashes
near view agent-leash-v2.testnet list_owner_leashes '{"owner_id":"agent-leash-v2.testnet"}'

# Get a specific leash
near view agent-leash-v2.testnet get_leash '{"leash_id":1}'

# Check supported tokens
near view agent-leash-v2.testnet supported_tokens
```

## 2. Testnet Lifecycle Test Plan

The following tests should be performed after successful deployment and initialization. These mirror the 69 native Rust unit tests and the 6 frontend Vitest tests.

### 2.1 Core Leash Operations

| Test | Description | Expected |
|------|-------------|----------|
| Create leash | `create_leash()` with all parameters | Leash created with ID, payees funded |
| Fund leash | `ft_on_transfer()` with `Fund` memo | Balance increases, capped by `balance_cap` |
| Request payment (allowlisted) | `request_payment()` to an allowlisted payee | Immediate payment, funds reserved |
| Request payment (non-allowlisted, auto-approved) | `request_payment()` to non-allowlisted within `auto_approve_limit` | Auto-approved, immediate payment |
| Request payment (requires approval) | `request_payment()` to non-allowlisted beyond `auto_approve_limit` | Queued as pending approval |
| Approve payment | `approve_payment()` | Payment moves to settling, FT transfer initiated |
| Reject payment | `reject_payment()` | Funds released, payment status = Rejected |
| Expire payment | `expire_payment()` | Funds released, payment status = Expired |
| Pause/resume leash | `pause_leash()` / `resume_leash()` | Paused flag toggled, new payments blocked/unblocked |
| Revoke leash | `revoke()` | Available balance refunded to owner, leash.marked revoked |
| Withdraw available | `withdraw_available()` | Owner withdraws available balance |

### 2.2 Payment Approval Workflow

| Test | Description | Expected |
|------|-------------|----------|
| Request payment beyond auto-approve limit | Queued for owner approval | Payment status = PendingApproval |
| Owner approves | `approve_payment()` | Settlement initiated, FT transfer callback |
| Owner rejects | `reject_payment()` | Funds released, payment status = Rejected |
| Payment expiry | `expire_payment()` after approval expires | Funds released, payment status = Expired |

### 2.3 Schedule Operations

| Test | Description | Expected |
|------|-------------|----------|
| Create one-shot schedule | `create_schedule()` with `interval_ns=0` | Schedule created, executes once |
| Create recurring schedule | `create_schedule()` with `interval_ns>0` | Schedule executes periodically |
| Execute schedule | `execute_schedule()` when due | Payment created, funds reserved |
| Schedule expiry | `expire_schedule()` after expiry date | Schedule marked inactive |
| Agent rotation | `set_agent()` with new agent | Stale schedules deactivated, active cap freed |

### 2.4 Payroll Operations

| Test | Description | Expected |
|------|-------------|----------|
| Create payroll group | `create_payroll_group()` with name, token, payday, first payment | Group created with ID |
| Add worker | `add_payroll_worker()` with salary | Worker added to group |
| Execute payroll | `execute_payroll()` | Worker payments created, funds reserved |
| Retry failed payroll | `retry_payroll_payments()` with payment IDs | Failed payments retried |
| Mark payroll obligations satisfied | `mark_payroll_obligations_satisfied()` | Vigil obligations marked satisfied |

### 2.5 Vigil Inactivity Protection

| Test | Description | Expected |
|------|-------------|----------|
| Enable vigil | `enable_vigil()` with interval and grace period | Vigil active, check-in timer started |
| Check in | `vigil_check_in()` | Last check-in timestamp updated |
| Check overdue | `check_vigil_overdue()` | Returns "not_overdue", "in_grace_period", or "settlement_triggered" |
| Claim entitlement | `claim_vigil_entitlement()` after settlement | Beneficiary receives entitlement |
| Disable vigil | `disable_vigil()` before settlement triggered | Vigil deactivated |
| Set beneficiaries | `set_vigil_beneficiaries()` with share percentages | Beneficiaries configured (must total 100%) |

### 2.6 Revocation and Refund Workflow

| Test | Description | Expected |
|------|-------------|----------|
| Revoke with funds reserved | `revoke()` when all tokens reserved | Agent immediately stopped, refund initiated |
| Revoke with all funds available | `revoke()` when tokens available | Full refund to owner |
| Withdraw after revoke | `withdraw_available()` after revoke | Owner withdraws remaining available balance |
| Revocation callback settled | `on_revocation_settled()` callback | Reservation consumed, status = Settled |

### 2.7 Storage Accounting (NEP-145)

| Test | Description | Expected |
|------|-------------|----------|
| Register storage deposit | `storage_deposit()` | Account registered, balance measured |
| Withdraw storage | `storage_withdraw()` | Funds withdrawn, balance reduced |
| Unregister storage | `storage_unregister()` | Blocked if leashes exist; allowed when none |
| Storage refund callback | `on_storage_refund()` | Replay protection, balance updated |

### 2.8 Cross-Contract Interaction

| Test | Description | Expected |
|------|-------------|----------|
| NEP-141 ft_on_transfer funding | USDC transfer with `Fund` memo | Funds accepted if within balance cap |
| Callback settlement | `on_payment_settled()`, `on_revocation_settled()`, `on_withdrawal_settled()`, `on_vigil_claim_settled()` | Callbacks resolve promises, state updated |
| Replay protection | Duplicate callbacks rejected | Terminal/stale callbacks are no-ops |

## 3. Remaining Blockers and Risks

| Blocker | Risk | Mitigation |
|---------|------|------------|
| Deserialization error `CompileError(PrepareError(Deserialization))` | Cannot deploy to Testnet until resolved | Build contract and test on actual NEAR testnet; apply the `required_storage_deposit` handling fix if needed |
| No sandbox executable for integration tests | Cannot run full lifecycle in local VM | Use NEAR testnet sandbox; DNS/network issues prevented sandbox download |
| Selection and review of NEP-141 USDC token | Token contract behavior may differ from expectations | Independently verify `usdc.testnet` NEP-141 implementation; test `ft_on_transfer` failure modes |
| Storage refund gas allocation | Actual gas burnt by `on_storage_refund` callback unknown | Measure actual gas consumption on testnet; adjust `GAS_FOR_STORAGE_REFUND_CALLBACK` if needed |
| Frontend-contract parity | Button renders but may not match contract API | Verify every frontend method/argument/return type against Rust contract |
| Disk space for build | Approximately 500 MB available; cargo build may require more | Approve safe disk-space plan before building |

## 4. Final Readiness Classification

**IMPLEMENTED BUT UNVERIFIED**

The Agent Leash contract is:
- **Implemented**: All source code, tests, and frontend are complete and verified locally
- **Verified by local testing**: 69/69 Rust tests pass, clippy/fmt clean, TypeScript 0 errors, Vitest 6/6 passing, production build succeeds
- **Not verified on Testnet**: Deserialization deployment error prevents Testnet deployment; root cause requires building and testnet authorization
- **Ready for**: Testnet deployment with explicit human authorization and sufficient disk space

Classification: **IMPLEMENTED BUT UNVERIFIED**