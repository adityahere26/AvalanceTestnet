// Live test on Avalanche Fuji: two brand-new wallets with 0 AVAX play a full game.
// Every action goes through SmoothSend (sponsored gas), exactly like the web app.
// Usage: npm run test:gasless
import { createPublicClient, createWalletClient, encodeFunctionData, formatEther, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { createSmoothSendAvaxClient, predictSimpleAccountAddress } from "@smoothsend/sdk/avax";
import abi from "../lib/abi.json" with { type: "json" };

const { NEXT_PUBLIC_SMOOTHSEND_API_KEY: apiKey, NEXT_PUBLIC_CONTRACT_ADDRESS: address } = process.env;
if (!apiKey || !address) throw new Error("Set NEXT_PUBLIC_SMOOTHSEND_API_KEY and NEXT_PUBLIC_CONTRACT_ADDRESS in .env");

const publicClient = createPublicClient({ chain: avalancheFuji, transport: http() });
const read = (functionName, args = []) => publicClient.readContract({ address, abi, functionName, args });

async function makePlayer(name) {
  const account = privateKeyToAccount(generatePrivateKey()); // fresh, never funded
  const walletClient = createWalletClient({ account, chain: avalancheFuji, transport: http() });
  const client = createSmoothSendAvaxClient({
    apiKey,
    network: "testnet",
    publicClient,
    walletClient,
    corsOrigin: process.env.APP_ORIGIN || "http://localhost:3000", // pk_ keys need the app's origin
  });
  const { simpleAccountFactoryFuji } = await client.submitter.getPublicAaDefaults();
  const smartAccount = await predictSimpleAccountAddress({
    publicClient,
    factory: simpleAccountFactoryFuji,
    owner: account.address,
    salt: 0n,
  });
  console.log(`${name}: owner ${account.address}, smart account ${smartAccount}`);

  async function send(functionName, args = []) {
    await publicClient.simulateContract({ address, abi, functionName, args, account: smartAccount });
    const t = Date.now();
    const data = encodeFunctionData({ abi, functionName, args });
    const res = await client.submitCall({ call: { to: address, data }, waitForReceipt: true });
    if (!res.receipt?.success) throw new Error(`${functionName} failed: ${JSON.stringify(res.receipt)}`);
    console.log(`  ${name} ${functionName}(${args.join(", ")}) ✓ ${((Date.now() - t) / 1000).toFixed(1)}s  tx ${res.transactionHash}`);
    return res;
  }
  return { name, owner: account.address, smartAccount, send };
}

const alice = await makePlayer("Alice (X)");
const bob = await makePlayer("Bob   (O)");

await alice.send("createGame");
const ids = await read("getPlayerGames", [alice.smartAccount]);
const id = ids[ids.length - 1];
console.log(`Game #${id} created`);

await bob.send("joinGame", [id]);

// X 4, O 0, X 2, O 1, X 6 → X wins on the 2-4-6 diagonal
const moves = [[alice, 4], [bob, 0], [alice, 2], [bob, 1], [alice, 6]];
for (const [p, cell] of moves) await p.send("play", [id, cell]);

const game = await read("getGame", [id]);
const [aw, al] = await read("stats", [alice.smartAccount]);
const [bw, bl] = await read("stats", [bob.smartAccount]);
const balances = await Promise.all([alice.owner, alice.smartAccount, bob.owner, bob.smartAccount].map((a) => publicClient.getBalance({ address: a })));

console.log(`\nBoard: ${game.board.join(" ")}  status=${game.status} (2 = X won)`);
console.log(`Alice stats: ${aw}W ${al}L · Bob stats: ${bw}W ${bl}L`);
console.log(`AVAX held by all four player addresses: ${balances.map((b) => formatEther(b)).join(", ")}`);
if (game.status !== 2) throw new Error("Expected X to win");
console.log("\n✓ Full game played gaslessly on Fuji by two 0-AVAX wallets");

// Single-player: Alice vs the contract. The computer replies inside each of her transactions.
console.log("\nSolo game vs the computer:");
await alice.send("createSoloGame");
const soloIds = await read("getPlayerGames", [alice.smartAccount]);
const soloId = soloIds[soloIds.length - 1];
let solo = await read("getGame", [soloId]);
while (solo.status === 1) {
  const cell = solo.board.findIndex((v) => Number(v) === 0);
  await alice.send("play", [soloId, cell]);
  solo = await read("getGame", [soloId]);
  console.log(`    board: ${solo.board.join(" ")}`);
}
const [sw, sl, sd] = await read("soloStats", [alice.smartAccount]);
console.log(`✓ Solo game #${soloId} finished with status ${solo.status} (2 X won, 3 computer won, 4 draw). Solo stats: ${sw}W ${sl}L ${sd}D`);
