import fs from "node:fs";
import { ContractFactory, JsonRpcProvider, Wallet, formatEther } from "ethers";
import { compile } from "./compile.js";

const { PRIVATE_KEY, RPC_URL } = process.env;
if (!PRIVATE_KEY || !RPC_URL) throw new Error("Missing PRIVATE_KEY or RPC_URL in .env (run `npm run wallet`)");

const provider = new JsonRpcProvider(RPC_URL);
const wallet = new Wallet(PRIVATE_KEY, provider);
const { chainId } = await provider.getNetwork();
const balance = await provider.getBalance(wallet.address);
console.log(`Deployer ${wallet.address} on chain ${chainId}, balance ${formatEther(balance)} AVAX`);
if (balance === 0n) throw new Error("Deployer has 0 AVAX. Use the Fuji faucet first.");

const { abi, bytecode } = compile();
const contract = await new ContractFactory(abi, bytecode, wallet).deploy();
console.log("Deploy tx:", contract.deploymentTransaction().hash);
await contract.waitForDeployment();
const address = await contract.getAddress();

// Save the address to .env so the Next.js app picks it up.
const env = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
const line = `NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`;
fs.writeFileSync(
  ".env",
  /^NEXT_PUBLIC_CONTRACT_ADDRESS=.*$/m.test(env)
    ? env.replace(/^NEXT_PUBLIC_CONTRACT_ADDRESS=.*$/m, line)
    : env.trimEnd() + "\n" + line + "\n"
);
console.log(`Saved ${line} to .env`);
console.log("TicTacToe deployed at:", address);
console.log(`Explorer: https://testnet.snowtrace.io/address/${address}`);
