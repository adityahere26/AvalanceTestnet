import { BaseError, ContractFunctionRevertedError, createPublicClient, http } from "viem";
import { avalancheFuji } from "viem/chains";
import abi from "./abi.json";
import deployment from "./deployment.json";

export { abi };
export const chain = avalancheFuji;
export const CONTRACT_ADDRESS = deployment.address; // written by `npm run deploy`
export const EXPLORER = "https://testnet.snowtrace.io";

export const publicClient = createPublicClient({ chain, transport: http() });

export const Status = { Waiting: 0, Active: 1, XWon: 2, OWon: 3, Draw: 4, Cancelled: 5 };

/** Free read-only call to the contract. */
export function read(functionName, args = []) {
  return publicClient.readContract({ address: CONTRACT_ADDRESS, abi, functionName, args });
}

const FRIENDLY_ERRORS = {
  NotYourTurn: "This isn't your game.",
  CellTaken: "That square is already taken.",
  BadCell: "That square doesn't exist.",
  NotActive: "This game is already over.",
  GameNotFound: "Game not found.",
};

/** Turn a viem/contract error into a short message for players. */
export function friendlyError(err) {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    const name = revert?.data?.errorName;
    if (name && FRIENDLY_ERRORS[name]) return FRIENDLY_ERRORS[name];
    return err.shortMessage || err.message;
  }
  return err?.message || String(err);
}

export const Mode = { PvP: 0, Solo: 1, Rigged: 2 };
export const isRigged = (game) => Number(game?.mode) === Mode.Rigged;

/** What Natalia did last. Squares are shown to players as 1-9. */
export const CHEAT_MESSAGES = {
  1: (c) => `You were one move from winning. Natalia took square ${c + 1} for herself.`,
  2: (c) => `Your mark on square ${c + 1} has quietly disappeared.`,
  3: () => "Natalia moved twice. You lost your turn.",
  4: () => "The board is full. Natalia does not accept draws.",
};

export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
