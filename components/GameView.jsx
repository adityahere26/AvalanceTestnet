"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EXPLORER, isSolo, read, same, short, Status, TURN_TIMEOUT } from "../lib/chain";

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const MARK = ["", "✕", "○"];

export default function GameView({ id, player, send, login, authenticated, onOpen, onFinished }) {
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null); // what we're sending, e.g. "move" or "join"
  const [pendingCell, setPendingCell] = useState(null);
  const [lastTx, setLastTx] = useState(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const prevStatus = useRef(null);

  const load = useCallback(async () => {
    try {
      const g = await read("getGame", [id]);
      setGame(g);
      if (prevStatus.current !== null && prevStatus.current <= Status.Active && g.status > Status.Active) onFinished?.();
      prevStatus.current = g.status;
    } catch (err) {
      setError(err.shortMessage?.includes("GameNotFound") ? "Game not found." : err.shortMessage || err.message);
    }
  }, [id, onFinished]);

  useEffect(() => {
    setGame(null);
    prevStatus.current = null;
    load();
    const poll = setInterval(load, 2000); // see the opponent's moves
    const clock = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);

  async function act(kind, functionName, args, cell = null) {
    if (!authenticated) return login();
    setBusy(kind);
    setPendingCell(cell);
    setError("");
    try {
      const { txHash } = await send(functionName, args);
      setLastTx(txHash);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
      setPendingCell(null);
    }
  }

  async function playAgain() {
    setBusy("again");
    setError("");
    try {
      await send("createSoloGame");
      const mine = await read("getPlayerGames", [player]);
      onOpen(mine[mine.length - 1]);
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  }

  if (!game) {
    return (
      <section className="card">
        {error ? <p className="error">{error}</p> : <p className="muted">Loading game #{id.toString()}…</p>}
        <button className="ghost" onClick={() => onOpen(null)}>← Back to lobby</button>
      </section>
    );
  }

  const solo = isSolo(game);
  const board = game.board.map(Number);
  const me = same(game.playerX, player) ? 1 : same(game.playerO, player) ? 2 : 0;
  const myTurn = game.status === Status.Active && me !== 0 && game.turn === me;
  const winLine = LINES.find((l) => board[l[0]] !== 0 && l.every((c) => board[c] === board[l[0]]));
  const idleFor = now - Number(game.lastMoveAt);
  const canClaim = !solo && game.status === Status.Active && me !== 0 && game.turn !== me && idleFor >= TURN_TIMEOUT;
  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/?game=${id}` : "";

  let headline;
  if (game.status === Status.Waiting) headline = me === 1 ? "Waiting for an opponent to join…" : "This game is open. Join it!";
  else if (game.status === Status.Active)
    headline = me === 0
      ? `${MARK[game.turn]} to move`
      : myTurn
        ? `Your turn (${MARK[me]})`
        : `Opponent's turn. Waiting for ${MARK[game.turn]}…`;
  else if (game.status === Status.Draw) headline = "It's a draw!";
  else if (game.status === Status.Cancelled) headline = "Game cancelled.";
  else {
    const winner = game.status === Status.XWon ? 1 : 2;
    headline =
      me === winner ? "You won! 🎉" : solo && winner === 2 ? "The computer won 🤖" : me === 0 ? `${MARK[winner]} won!` : "You lost.";
  }

  return (
    <section className="card game">
      <div className="gamehead">
        <button className="ghost" onClick={() => onOpen(null)}>← Lobby</button>
        <span className="muted">Game #{id.toString()}</span>
      </div>

      <h1 className="headline">
        {busy === "move" ? (solo ? "Sending your move… the computer replies on-chain" : "Sending your move on-chain…") : headline}
      </h1>

      <div className="players">
        <span className={game.turn === 1 && game.status === Status.Active ? "active" : ""}>
          ✕ {short(game.playerX)} {me === 1 && <b>(you)</b>}
        </span>
        <span className={game.turn === 2 && game.status === Status.Active ? "active" : ""}>
          ○ {solo ? <><span className="icon">🤖</span>Computer</> : game.playerO === "0x0000000000000000000000000000000000000000" ? "—" : short(game.playerO)}{" "}
          {me === 2 && <b>(you)</b>}
        </span>
      </div>

      <div className="board" role="grid" aria-label="Tic-Tac-Toe board">
        {board.map((v, i) => {
          const pending = pendingCell === i;
          const clickable = myTurn && v === 0 && busy === null;
          return (
            <button
              key={i}
              className={`cell ${v === 1 ? "x" : v === 2 ? "o" : ""} ${winLine?.includes(i) ? "win" : ""} ${pending ? "pending" : ""}`}
              disabled={!clickable}
              onClick={() => act("move", "play", [id, i], i)}
              aria-label={`Square ${i + 1}: ${v ? MARK[v] : "empty"}`}
            >
              {pending ? MARK[me] : MARK[v]}
            </button>
          );
        })}
      </div>

      {error && <p className="error">{error}</p>}
      {lastTx && (
        <p className="muted small">
          Last transaction: <a href={`${EXPLORER}/tx/${lastTx}`} target="_blank" rel="noreferrer">view on Snowtrace ↗</a>
        </p>
      )}

      <div className="actions">
        {game.status === Status.Waiting && me === 1 && (
          <>
            <button
              onClick={() => {
                navigator.clipboard.writeText(inviteUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Link copied ✓" : "Copy invite link"}
            </button>
            <button className="ghost" disabled={busy !== null} onClick={() => act("cancel", "cancelGame", [id])}>
              {busy === "cancel" ? "Cancelling…" : "Cancel game"}
            </button>
          </>
        )}
        {game.status === Status.Waiting && me !== 1 && (
          <button disabled={busy !== null || (authenticated && !player)} onClick={() => act("join", "joinGame", [id])}>
            {busy === "join" ? "Joining…" : authenticated ? "Join as ○" : "Log in to join"}
          </button>
        )}
        {!solo && game.status === Status.Active && me !== 0 && !myTurn && (
          canClaim ? (
            <button disabled={busy !== null} onClick={() => act("claim", "claimTimeout", [id])}>
              {busy === "claim" ? "Claiming…" : "Opponent timed out: claim the win"}
            </button>
          ) : (
            <span className="muted small">Your opponent can be timed out in {Math.max(0, TURN_TIMEOUT - idleFor)}s.</span>
          )
        )}
        {game.status > Status.Active && solo && me === 1 && (
          <button disabled={busy !== null} onClick={playAgain}>
            {busy === "again" ? "Starting…" : <><span className="icon">🤖</span>Play again</>}
          </button>
        )}
        {game.status > Status.Active && (
          <button className={solo && me === 1 ? "ghost" : ""} onClick={() => onOpen(null)}>Back to lobby</button>
        )}
      </div>
    </section>
  );
}
