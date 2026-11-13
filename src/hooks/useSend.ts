import { useCallback, useState } from 'react'
import { useConfig, useSwitchChain } from 'wagmi'
import { getWalletClient } from 'wagmi/actions'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Account, Chain, Hex, Transport, TransactionReceipt, WalletClient } from 'viem'
import { CHAIN_ID, publicClient, txUrl } from '@/lib/chain'
import { friendlyError, isUserRejection } from '@/lib/errors'

export type WalletClientT = WalletClient<Transport, Chain, Account>
export type Phase = 'idle' | 'wallet' | 'confirming'

/**
 * Sends one wallet transaction with honest status: waiting for the wallet, then
 * waiting for the chain. Switches the wallet to Arc Testnet first when needed.
 */
export function useSend() {
  const config = useConfig()
  const { switchChainAsync } = useSwitchChain()
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('idle')

  const send = useCallback(
    async (label: string, write: (wc: WalletClientT) => Promise<Hex>): Promise<TransactionReceipt | undefined> => {
      try {
        setPhase('wallet')
        await switchChainAsync({ chainId: CHAIN_ID }).catch(() => undefined)
        const wc = (await getWalletClient(config, { chainId: CHAIN_ID })) as unknown as WalletClientT
        const hash = await write(wc)
        setPhase('confirming')
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error('Transaction reverted')
        toast.success(label, {
          action: { label: 'View', onClick: () => window.open(txUrl(hash), '_blank', 'noopener,noreferrer') },
        })
        await queryClient.invalidateQueries()
        return receipt
      } catch (err) {
        if (!isUserRejection(err)) toast.error(friendlyError(err))
        return undefined
      } finally {
        setPhase('idle')
      }
    },
    [config, switchChainAsync, queryClient],
  )

  return { send, phase, busy: phase !== 'idle' }
}
