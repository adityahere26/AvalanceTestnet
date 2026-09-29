"use client";

import { useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSmoothSendAvax } from "@smoothsend/sdk/avax";
import { createWalletClient, custom, encodeFunctionData } from "viem";
import { abi, chain, CONTRACT_ADDRESS, friendlyError, publicClient } from "./chain";

/**
 * Privy (login + embedded wallet) + SmoothSend (gas sponsorship) in one hook.
 *
 * - `player` is the user's SmoothSend smart account. The contract sees it as msg.sender.
 * - `send(functionName, args)` runs a contract call gaslessly and waits for it to be mined.
 */
export function useGasless() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const embedded = wallets.find((w) => w.walletClientType === "privy");
  const [walletClient, setWalletClient] = useState(null);

  // Build a viem wallet client on the Privy embedded wallet. SmoothSend uses it to sign
  // the UserOperation hash as raw bytes, which is what the smart account verifies.
  useEffect(() => {
    let cancelled = false;
    if (!embedded) {
      setWalletClient(null);
      return;
    }
    embedded.getEthereumProvider().then((provider) => {
      if (cancelled) return;
      setWalletClient(createWalletClient({ account: embedded.address, chain, transport: custom(provider) }));
    });
    return () => {
      cancelled = true;
    };
  }, [embedded?.address]);

  const { submitCall, smartAccountAddress } = useSmoothSendAvax({
    apiKey: process.env.NEXT_PUBLIC_SMOOTHSEND_API_KEY,
    network: "testnet",
    publicClient,
    walletClient,
    ownerAddress: embedded?.address,
  });

  const player = authenticated && walletClient ? smartAccountAddress : null;

  const send = useMemo(
    () =>
      async function send(functionName, args = []) {
        if (!player) throw new Error("Log in first.");
        try {
          // Simulate as the smart account first: clear errors, and no wasted sponsored gas.
          await publicClient.simulateContract({ address: CONTRACT_ADDRESS, abi, functionName, args, account: player });
          const data = encodeFunctionData({ abi, functionName, args });
          const result = await submitCall({ to: CONTRACT_ADDRESS, data, waitForReceipt: true });
          if (result.receipt && !result.receipt.success) {
            throw new Error(result.receipt.reason || "The transaction was reverted on-chain.");
          }
          return { userOpHash: result.userOpHash, txHash: result.receipt?.receipt?.transactionHash };
        } catch (err) {
          throw new Error(friendlyError(err));
        }
      },
    [player, submitCall]
  );

  return { ready, authenticated, login, logout, player, send };
}
