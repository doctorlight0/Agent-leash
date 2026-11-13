# Deploying Agent Leash to Arc Mainnet

Arc Studio does not deploy to, sign for, or fund anything on mainnet. You run these steps yourself, from your own wallet, outside Arc Studio. Mainnet uses real USDC and transactions cannot be undone. You are responsible for reviewing everything below before you run it.

## Before you start

- [ ] Get an independent professional audit of `contracts/AgentLeash.sol`. The automated review and the Foundry tests in this project are not a substitute.
- [ ] Try the full flow on testnet with a real second wallet as the agent: payments, approvals, recurring payments, pause and revoke.
- [ ] Use a fresh wallet that you only use for deploying. Keep its key out of chat, code and screenshots.
- [ ] Put a small amount of real USDC on that wallet for network fees. Arc pays fees in USDC. There is no faucet on mainnet.
- [ ] Install [Foundry](https://getfoundry.sh) on your own machine.

## 1. Check the settings

| Setting | Value | Where it comes from |
|---|---|---|
| Network | Arc Mainnet, chain ID 5042 | `src/onchain-facts.ts` |
| RPC | `https://rpc.mainnet.arc.io` | `src/onchain-facts.ts` |
| USDC (6 decimals) | `0x3600000000000000000000000000000000000000` | `src/onchain-facts.ts` |
| Explorer | `https://explorer.arc.io` | `src/onchain-facts.ts` |

Open `src/onchain-facts.ts` and confirm these yourself. Do not trust a copy of an address from anywhere else.

## 2. Deploy

Enter the key without leaving it in your shell history, then build and deploy:

```bash
read -s PRIVATE_KEY && export PRIVATE_KEY

forge build

forge create contracts/AgentLeash.sol:AgentLeash \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --constructor-args 0x3600000000000000000000000000000000000000
```

An encrypted Foundry keystore is safer than a raw key. Import one with `cast wallet import deployer --interactive`, then use `--account deployer` instead of `--private-key $PRIVATE_KEY`.

The output shows `Deployed to:` (the contract address) and `Transaction hash:`. Save both.

## 3. Get the deploy block

```bash
cast receipt <TRANSACTION_HASH> blockNumber --rpc-url https://rpc.mainnet.arc.io
```

## 4. Check the deployed contract

Both commands should print the values shown:

```bash
cast call <CONTRACT_ADDRESS> "usdc()(address)" --rpc-url https://rpc.mainnet.arc.io
# 0x3600000000000000000000000000000000000000

cast call <CONTRACT_ADDRESS> "nextLeashId()(uint256)" --rpc-url https://rpc.mainnet.arc.io
# 1
```

## 5. Point the app at mainnet

In the project's `.env` file, set:

```
VITE_NETWORK=mainnet
VITE_AGENT_LEASH_ADDRESS_MAINNET=<CONTRACT_ADDRESS>
VITE_AGENT_LEASH_DEPLOY_BLOCK_MAINNET=<DEPLOY_BLOCK>
```

Restart the dev server (or rebuild before you host the app). To go back to testnet, set `VITE_NETWORK=testnet`.

On mainnet the app:

- shows a red "Mainnet · real USDC" label,
- hides the built-in demo agent (its key lives in the browser, so it should never hold real USDC),
- asks you to tick a confirmation box before you create a leash.

## 6. First real test

1. Create a leash with a small balance cap (for example 1 USDC), fund about 0.5 USDC, and use a real agent wallet that you control.
2. Make one small payment, then check it on the explorer.
3. Press REVOKE and confirm the money comes back to your wallet.
4. Only then increase the amounts.

## Known limits to keep in mind

- The contract has no admin and cannot be upgraded. A fix means deploying a new contract; leashes on the old one keep running there.
- A leash cannot hold more than its balance cap, which is fixed when you create it (1,000,000 USDC at most).
- If USDC ever blocks a transfer to your wallet, REVOKE still stops the agent, and the balance stays on the leash for you to withdraw later.
