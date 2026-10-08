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
export const TURN_TIMEOUT = 5 * 60;

/** Free read-only call to the contract. */
export function read(functionName, args = []) {
  return publicClient.readContract({ address: CONTRACT_ADDRESS, abi, functionName, args });
}

const FRIENDLY_ERRORS = {
  NotYourTurn: "It's not your turn.",
  CellTaken: "That square is already taken.",
  BadCell: "That square doesn't exist.",
  NotActive: "This game is not in progress.",
  NotWaiting: "This game already has two players.",
  CannotJoinOwnGame: "You can't join your own game. Share the invite link with a friend.",
  NotPlayer: "Only a player in this game can do that.",
  TimeoutNotReached: "Your opponent still has time to move.",
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

/** What the cheating computer did last (rigged mode). Squares are shown as 1-9. */
export const CHEAT_MESSAGES = {
  1: (c) => `🦹 Nope! You were about to win, so the computer stole square ${c + 1}. It's an ○ now.`,
  2: (c) => `🧽 Your ✕ on square ${c + 1} just… vanished.`,
  3: () => "⏩ The computer played twice. You lost your turn.",
  4: () => "📜 Board full. Draws aren't allowed: the computer wins on a technicality.",
};

/** Single-player games have the contract itself as player O. */
export const isSolo = (game) => same(game?.playerO, CONTRACT_ADDRESS);

export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
