/**
 * Canonical Agent Leash NEAR contract interface (Rust/near-sdk).
 * Source of truth: contracts/near/src/{lib,views,leash,funding,payments,emergency,approval,payroll,vigil,schedule,types}.rs
 * Use these method names and arg shapes for all frontend view/call integration.
 * Do not invent methods that do not exist in the contract.
 */

export const CONTRACT_METHODS = {
  // Views
  get_leash: 'get_leash',
  get_payment: 'get_payment',
  get_withdrawal: 'get_withdrawal',
  get_schedule: 'get_schedule',
  get_revocation: 'get_revocation',
  get_payroll_group: 'get_payroll_group',
  get_payroll_payment: 'get_payroll_payment',
  get_vigil_config: 'get_vigil_config',
  list_leash_payments: 'list_leash_payments',
  list_leash_schedules: 'list_leash_schedules',
  list_leash_withdrawals: 'list_leash_withdrawals',
  list_leash_revocations: 'list_leash_revocations',
  list_owner_leashes: 'list_owner_leashes',
  list_payroll_groups: 'list_payroll_groups',
  list_payroll_payments: 'list_payroll_payments',
  is_recipient_allowed: 'is_recipient_allowed',
  rolling_spend: 'rolling_spend',
  supported_tokens: 'supported_tokens',
  get_supported_token_config: 'get_supported_token_config',
  storage_balance_of: 'storage_balance_of',
  is_vigil_overdue: 'is_vigil_overdue',
  is_vigil_in_grace_period: 'is_vigil_in_grace_period',
  // Leash management
  create_leash: 'create_leash',
  add_payee: 'add_payee',
  remove_payee: 'remove_payee',
  set_payee_limits: 'set_payee_limits',
  set_auto_approve_limit: 'set_auto_approve_limit',
  update_permissions: 'update_permissions',
  set_agent: 'set_agent',
  pause_leash: 'pause_leash',
  resume_leash: 'resume_leash',
  revoke: 'revoke',
  revoke_agent: 'revoke_agent', // legacy flag-only
  withdraw_available: 'withdraw_available',
  check_auto_revoke: 'check_auto_revoke',
  // Payments / approvals
  request_payment: 'request_payment',
  approve_payment: 'approve_payment',
  reject_payment: 'reject_payment',
  expire_payment: 'expire_payment',
  // Schedules
  create_schedule: 'create_schedule',
  execute_schedule: 'execute_schedule',
  cancel_schedule: 'cancel_schedule',
  expire_schedule: 'expire_schedule',
  // Payroll
  create_payroll_group: 'create_payroll_group',
  add_payroll_worker: 'add_payroll_worker',
  remove_payroll_worker: 'remove_payroll_worker',
  update_payroll_worker_salary: 'update_payroll_worker_salary',
  set_payroll_group_active: 'set_payroll_group_active',
  execute_payroll: 'execute_payroll',
  retry_payroll_payments: 'retry_payroll_payments',
  // Vigil
  enable_vigil: 'enable_vigil',
  disable_vigil: 'disable_vigil',
  set_vigil_check_in_interval: 'set_vigil_check_in_interval',
  set_vigil_grace_period: 'set_vigil_grace_period',
  set_vigil_beneficiaries: 'set_vigil_beneficiaries',
  vigil_check_in: 'vigil_check_in',
  check_vigil_overdue: 'check_vigil_overdue',
  claim_vigil_entitlement: 'claim_vigil_entitlement',
  mark_payroll_obligations_satisfied: 'mark_payroll_obligations_satisfied',
  // Storage (NEP-145 style on contract)
  storage_deposit: 'storage_deposit',
  storage_withdraw: 'storage_withdraw',
} as const

export type U128String = string

export interface LeashView {
  leash_id: number
  owner_id: string
  agent_id: string
  token_contract: string
  balance_cap: U128String
  available_balance: U128String
  reserved_balance: U128String
  per_payment_limit: U128String
  rolling_limit: U128String
  rolling_window_ns: number
  cooldown_ns: number
  expires_at_ns?: number | null
  approval_required: boolean
  paused: boolean
  revoked: boolean
  max_pending_payments: number
  pending_payment_count: number
  next_payment_id: number
  next_schedule_id: number
  next_withdrawal_id: number
  next_revocation_id: number
  check_in_interval_ns: number
  last_check_in_ns: number
  vigil_active: boolean
  monthly_cap: U128String
  period_start_ns: number
  monthly_spent: U128String
}

export interface PaymentView {
  leash_id: number
  payment_id: number
  requester: string
  recipient: string
  token_contract: string
  amount: U128String
  reason?: string | null
  status: string
  created_at_ns: number
  approval_expires_at_ns?: number | null
  reserved: boolean
}

export interface VigilBeneficiaryView {
  account_id: string
  share_percent: number
  entitlement: U128String
  claimed: boolean
  claimed_amount: U128String
}

export interface VigilConfigView {
  enabled: boolean
  check_in_interval_ns: number
  grace_period_ns: number
  last_check_in_ns: number
  deadline_ns: number
  grace_deadline_ns: number
  beneficiaries: VigilBeneficiaryView[]
  settlement_triggered: boolean
  settlement_completed: boolean
  payroll_obligations_satisfied: boolean
  protected_balance: U128String
}

// Funding: NEP-141 ft_transfer_call on token contract -> receiver_id = leash contract, msg = {"Fund":{"leash_id":<u64>}}
// Withdraw: withdraw_available(leash_id, amount: U128, recipient?: AccountId|null)
// create_leash args: agent_id, token_contract, per_payment_limit, rolling_limit, rolling_window_ns?, cooldown_ns, expires_at_ns?, approval_required, max_pending_payments?, initial_payees?, balance_cap
// request_payment args: leash_id, recipient, amount, reason?, approval_expires_at_ns?
// set_vigil_beneficiaries args: leash_id, beneficiaries: [[account_id, share_percent], ...] (100% total)
// claim_vigil_entitlement args: leash_id (caller must be beneficiary)