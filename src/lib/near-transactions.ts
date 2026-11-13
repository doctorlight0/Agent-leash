import { actionCreators, type WalletSelector } from '@near-wallet-selector/core'
import { NEAR_ENV } from './near-config'

const TGAS = 1000000000000n
const ONE_YOCTO = '1'

export async function callContract(
  selector: WalletSelector,
  methodName: string,
  args: Record<string, unknown>,
  gasTgas = 60,
  depositYocto = '0',
): Promise<unknown> {
  if (!NEAR_ENV.contractId) throw new Error('NEAR contract ID not configured')
  const wallet = await selector.wallet()
  const action = actionCreators.functionCall(
    methodName,
    args,
    BigInt(gasTgas) * TGAS,
    BigInt(depositYocto),
  )
  return wallet.signAndSendTransaction({
    receiverId: NEAR_ENV.contractId,
    actions: [action],
  })
}

/**
 * Fund a leash via NEP-141 ft_transfer_call. The Agent Leash contract receives
 * funding in ft_on_transfer with msg {"Fund":{"leash_id":<id>}} and refunds on mismatch.
 */
export async function fundLeash(
  selector: WalletSelector,
  tokenContract: string,
  leashId: number,
  amount: string,
): Promise<unknown> {
  if (!NEAR_ENV.contractId) throw new Error('NEAR contract ID not configured')
  const wallet = await selector.wallet()
  const action = actionCreators.functionCall(
    'ft_transfer_call',
    {
      receiver_id: NEAR_ENV.contractId,
      amount,
      msg: JSON.stringify({ Fund: { leash_id: leashId } }),
    },
    80n * TGAS,
    BigInt(ONE_YOCTO),
  )
  return wallet.signAndSendTransaction({
    receiverId: tokenContract,
    actions: [action],
  })
}
