import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const root = path.resolve(import.meta.dirname, "..");

export function compile() {
  const source = fs.readFileSync(path.join(root, "contracts/TicTacToe.sol"), "utf8");
  const input = {
    language: "Solidity",
    sources: { "TicTacToe.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter((e) => e.severity === "error");
  if (errors.length) {
    errors.forEach((e) => console.error(e.formattedMessage));
    throw new Error("Compilation failed");
  }
  const c = output.contracts["TicTacToe.sol"].TicTacToe;
  const artifact = { abi: c.abi, bytecode: "0x" + c.evm.bytecode.object };
  fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
  fs.writeFileSync(path.join(root, "artifacts/TicTacToe.json"), JSON.stringify(artifact, null, 2));
  // The Next.js app imports the ABI from here.
  fs.writeFileSync(path.join(root, "lib/abi.json"), JSON.stringify(c.abi, null, 2));
  return artifact;
}

if (process.argv[1] === import.meta.filename) {
  compile();
  console.log("Compiled -> artifacts/TicTacToe.json");
}
