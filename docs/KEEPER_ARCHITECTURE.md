# Keeper Architecture

## Overview

The Agent Leash contract supports **recurring payment schedules** that can be executed permissionlessly by any caller (keeper, bot, cron job, or the agent itself). The `execute_schedule` method is the keeper entry point — it requires no authorization beyond the schedule being active, due, and not expired.

## Schedule Lifecycle

```
Created (active) → Executed (runs incremented) → Terminal (executed or inactive)
```

### One-shot schedules (`interval_ns == 0`)
- Exactly one payment is created
- After execution: `executed = true`, `active = false`, `runs = 1`
- Cannot be re-executed

### Recurring schedules (`interval_ns > 0`)
- Each execution creates one payment and advances `next_due_ns`
- `max_runs == 0` means unlimited runs
- After `max_runs` executions: `executed = true`, `active = false`
- Skips missed periods: if the keeper is late, `next_due_ns` advances by whole intervals to catch up

## Keeper Entry Point: `execute_schedule`

**Method:** `execute_schedule(leash_id, schedule_id)` → `PromiseOrValue<u64>` (payment_id)

**Authorization:** Permissionless — any account may call it.

**Preconditions (all checked before state mutation):**
1. Schedule exists
2. `schedule.executed == false` (not already executed)
3. `schedule.active == true`
4. `now >= schedule.next_due_ns` (due)
5. Schedule not expired
6. Leash not paused
7. Leash not revoked
8. Leash not expired
9. Monthly cap has room
10. Pending payment count < max_pending_payments
11. Cooldown elapsed (if configured)
12. Rolling capacity available
13. Amount ≤ per-payment limit
14. Recipient allowed (or auto-approved)
15. Payee limits validated
16. Sufficient available balance

**On success:**
- Reserves funds from available balance
- Creates a `PaymentRecord` in `Settling` status
- Advances schedule state (runs++, next_due_ns for recurring, or terminal for one-shot)
- Starts async settlement via `start_settlement`
- Emits `ScheduleExecutionRequested` event

**On failure:** No state changes occur (all asserts happen before any mutation).

## Recurring Schedule Catch-up Logic

When a recurring schedule is executed late, `next_due_ns` advances by whole intervals:

```
elapsed = now - next_due_ns
intervals = elapsed / interval_ns + 1
advance = intervals * interval_ns
next_due_ns += advance
```

This ensures missed periods are skipped — the schedule does not back-pay for missed windows.

## Limits

| Limit | Value | Description |
|-------|-------|-------------|
| Max active schedules per leash | 20 | `MAX_SCHEDULES_DEFAULT` — active, non-executed schedules |
| Max stored schedules per leash | 100 | `MAX_SCHEDULES_PER_LEASH` — total including terminal |
| Min schedule interval | 1 hour (3600000000000 ns) | `MIN_SCHEDULE_INTERVAL_NS` |

## Keeper Operation Patterns

### Pattern 1: Polling Keeper
An external service polls `list_leash_schedules` for each leash, filters to active/due schedules, and calls `execute_schedule` for each due one.

### Pattern 2: Event-Driven Keeper
Watch for `ScheduleCreated` events, compute the first `next_due_ns`, and schedule a timer to call `execute_schedule` when due.

### Pattern 3: Agent Self-Execution
The agent account can call `execute_schedule` directly as part of its payment loop. Agent-created schedules are subject to the same allowlist/auto-approve checks as agent payments.

## Schedule Cancellation & Expiry

- **`cancel_schedule(leash_id, schedule_id)`** — Owner or schedule creator may cancel an active, non-executed schedule. Marks it terminal (`active = false`, `executed = true`). Permanent.
- **`expire_schedule(leash_id, schedule_id)`** — Permissionless. Finalizes schedules whose `expires_at_ns` has passed. Returns `true` if a schedule was expired, `false` otherwise.

## Integration with Other Controls

Schedules interact with all leash-level controls:

| Control | Effect on Schedules |
|---------|-------------------|
| Pause | Blocks all `execute_schedule` calls |
| Revoke | Blocks all `execute_schedule` calls |
| Expiry | Blocks all `execute_schedule` calls |
| Cooldown | Blocks `execute_schedule` if within cooldown window |
| Rolling cap | Checked against schedule amount |
| Monthly cap | Checked against schedule amount |
| Per-payment limit | Checked against schedule amount |
| Payee daily cap | Checked against schedule amount |
| Auto-approve limit | Applies to agent-created schedules |
| Allowlist | Applies to agent-created schedules |

## Events

- `ScheduleCreated` — emitted when a schedule is created
- `ScheduleExecutionRequested` — emitted when `execute_schedule` is called (before settlement)
- `ScheduleCancelled` — emitted when a schedule is cancelled
- `ScheduleExpired` — emitted when `expire_schedule` finalizes an expired schedule

## Frontend Integration

The frontend reads schedules via `list_leash_schedules(leash_id)` and displays them on the Recurring tab. Execution is triggered by calling `execute_schedule` through the contract's `call` method. No dedicated keeper UI is included in the initial release — keepers are expected to be external bots or scripts.
