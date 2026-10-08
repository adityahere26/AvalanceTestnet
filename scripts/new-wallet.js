import fs from "node:fs";
import { Wallet } from "ethers";

if (fs.existsSync(".env")) {
  console.log(".env already exists — not overwriting. Delete it first if you want a new deployer wallet.");
  process.exit(1);
}

const w = Wallet.createRandom();
fs.writeFileSync(
  ".env",
  `# Deployer wallet — only used once to deploy the contract (testnet only, never put real funds here).
# Not exposed to the browser: Next.js only exposes variables that start with NEXT_PUBLIC_.
PRIVATE_KEY=${w.privateKey}
RPC_URL=https://api.avax-test.network/ext/bc/C/rpc

# Frontend keys (safe to expose to the browser)
# Privy app ID: https://dashboard.privy.io
NEXT_PUBLIC_PRIVY_APP_ID=
# SmoothSend API key (starts with pk_): https://dashboard.smoothsend.xyz
NEXT_PUBLIC_SMOOTHSEND_API_KEY=
`
);
console.log("Created .env with a new deployer wallet.");
console.log("Deployer address:", w.address);
console.log("Fund it once with test AVAX to deploy (players never need any): https://core.app/tools/testnet-faucet/?subnet=c&token=c");
