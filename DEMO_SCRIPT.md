# DEMO_SCRIPT.md — Agent Leash 5-Minute Demonstration

## 1. Introduce the Problem (1 minute)
- AI agents need controlled spending permissions on NEAR
- Without budgeting tools, agents could spend beyond intended limits
- Owners need onchain enforcement of spending rules
- Agent Leash provides onchain leashes with immutable caps and automatic revocation

## 2. Explain the Agent Leash Solution (1 minute)
- Owner creates a "leash" — a spending permit for an agent
- Leash has immutable `balance_cap` — maximum total tokens at any moment
- Per-payment limits, rolling windows, cooldowns, and approval requirements
- Vigil protection: check-ins prevent automatic revocation
- Payroll: monthly worker payment groups
- Beneficiary settlement: remaining funds go to configured beneficiaries after payroll

**Key differentiators from conventional budgeting apps**:
- Onchain enforcement (not just frontend guidance)
- Automatic revocation after inactivity (Vigil)
- Beneficiary settlement (remaining funds to configured parties)
- Immutable balance cap (cannot be exceeded even by owner top-ups)
- Permissionless schedule execution (any keeper can execute)

## 2. Show the Application Workflows (2 minutes)

### Wallet Connection
- Demonstrate wallet connection (MetaMask/MyNearWallet)
- Show account selection and network selection (Testnet)
- *Evidence: Previous repair work fixed wallet init/connect flow*

### Leash Creation
- Input: agent_id, token_contract, per_payment_limit, rolling_limit, etc.
- Click "Create Leash"
- *Evidence: `create_leash()` function exercises; 69 tests cover this flow*

### Funding the Leash
- Send USDC with `Fund` memo to the leash contract
- Balance increases, capped by `balance_cap`
- *Evidence: `ft_on_transfer` funding tested in 69 unit tests*

### Payment Request and Approval
- Agent requests payment (within limits)
- Owner sees pending payment in dashboard
- Owner approves or rejects
- *Evidence: `request_payment()` → `approve_payment()` / `reject_payment()`*

### Schedules
- Create one-shot or recurring schedule
- Schedule executes when due (keeper or owner)
- *Evidence: `create_schedule()` / `execute_schedule()` tested in 69 unit tests*

### Payroll
- Create payroll group with payday and first payment date
- Add workers with salaries
- Execute payroll (reserves funds, creates payments)
- *Evidence: `create_payroll_group()`, `add_payroll_worker()`, `execute_payroll()` tested in 69 unit tests*

### Vigil (Inactivity Protection)
- Enable vigil with check-in interval and grace period
- Owner checks in to reset timer
- After grace period without check-in, settlement triggers
- *Evidence: `enable_vigil()`, `vigil_check_in()`, `check_vigil_overdue()` tested in 69 unit tests*

## 3. Demonstrate Contract-Backed Functionality (1 minute)
- *Note: Full Testnet execution not possible due to deserialization error*
- Show local test results: `cargo test --test agent_leash` → 69/69 passing
- Show contract code hash: `1416b6433f83fb376bc356fcc35ef967d82e8cf8bffbea8ba55968cc5accdcab`
- Show WASM artifact: `contracts/near/target-wasm-repro/wasm32-unknown-unknown/release/agent_leash_near.wasm`
- *Do not simulate blockchain actions or present mock data as real Testnet activity*

## 4. Explain Payroll and Vigil Integration (1 minute)
- **Payroll**: `create_payroll_group()` → add workers → `execute_payroll()` → salaries reserved and paid
- **Vigil**: `enable_vigil(check_in_interval, grace_period)` → owner `vigil_check_in()` → after grace period, `check_vigil_overdue()` triggers settlement
- **Ordering policy**: Payroll obligations settled BEFORE protected remaining funds transfer to beneficiaries
- This is a deliberate security policy — payroll gets paid first, then beneficiaries

## 4. Finish with Project Impact (1 minute)
- AI agents can safely receive controlled spending permissions
- Owners have precise budget enforcement onchain
- Payroll and Vigil integration provides complete financial management
- Project demonstrates NEAR smart contract capabilities for agent economics
- Future: Resolve Testnet init issue for full onchain demonstration

## 5. Do Not Simulate
- Do not send real USDC or simulate token transfers on Testnet
- Do not present mock data as real Testnet execution
- Do not claim Testnet features work if they have not been verified
- Do claim: "Local unit tests pass (69/69), clippy/format clean, production build succeeds"