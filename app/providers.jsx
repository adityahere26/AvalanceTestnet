"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { avalancheFuji } from "viem/chains";

export default function Providers({ children }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return children; // page.jsx shows setup instructions

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google"],
        appearance: { theme: "light", accentColor: "#6d4c7d" },
        embeddedWallets: {
          ethereum: { createOnLogin: "all-users" },
          showWalletUIs: false, // no signing pop-up on every move
        },
        defaultChain: avalancheFuji,
        supportedChains: [avalancheFuji],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
