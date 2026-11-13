# NEAR integration

## Initialization

```json
{
  "supported_tokens": [
    {"token_contract": "token.testnet", "decimals": 6}
  ],
  "required_storage_deposit": null
}
```

`required_storage_deposit` is retained for interface compatibility; measured NEP-145 accounting determines actual requirements.

## Important methods

- `supported_tokens()` and `get_supported_token_config(token_contract)`
- `storage_deposit`, `storage_withdraw`, `storage_unregister`, `storage_balance_of`
- payable `create_leash(...)`
- `add_payee`, `remove_payee`, `set_payee_limits`, `set_auto_approve_limit`
- `update_permissions`, `set_agent`, `pause_leash`, `resume_leash`, `revoke`
- `request_payment`, `approve_payment`, `reject_payment`, `expire_payment`
- `create_schedule`, `execute_schedule`, `cancel_schedule`, `expire_schedule`
- `withdraw_available`

## Funding

Call the supported FT's `ft_transfer_call` with one yoctoNEAR and:

```json
{
  "receiver_id": "agent-leash.testnet",
  "amount": "1000000",
  "msg": "{\"Fund\":{\"leash_id\":1}}"
}
```

Any unsupported token, invalid message/leash, owner mismatch, revoked leash, token mismatch, overflow, or cap excess returns the full amount unused.

The active React UI uses NEAR Wallet Selector, RPC view calls, exact `BigInt` token conversion, on-chain token configuration checks, transaction loading/error states, owner approvals and controls, agent requests, schedules, storage deposits/withdrawals, funding, revocation, and public read-only routes. It requires a configured contract ID and never substitutes mock chain data.
