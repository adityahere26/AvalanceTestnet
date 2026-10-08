"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHEAT_MESSAGES, EXPLORER, isRigged, read, same, Status } from "../lib/chain";
import Mark from "./Mark";

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const NAMES = ["empty", "X", "O"];

export default function GameView({ id, player, send, startGame, onOpen, onFinished }) {
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null); // "move" | "again"
  const [pendingCell, setPendingCell] = useState(null);
  const [lastTx, setLastTx] = useState(null);
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
    setLastTx(null);
    prevStatus.current = null;
    load();
    const poll = setInterval(load, 3000);
    return () => clearInterval(poll);
  }, [load]);

  async function move(cell) {
    setBusy("move");
    setPendingCell(cell);
    setError("");
    try {
      const { txHash } = await send("play", [id, cell]);
      setLastTx(txHash);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
      setPendingCell(null);
    }
  }

  async function again() {
    setBusy("again");
    setError("");
    try {
      await startGame();
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  }

  const back = (
    <button className="link back" onClick={() => onOpen(null)}>
      All games
    </button>
  );

  if (!game) {
    return (
      <section className="panel center">
        {error ? <p className="error">{error}</p> : <p className="muted">Opening game {id.toString()}…</p>}
        {back}
      </section>
    );
  }

  if (!isRigged(game)) {
    return (
      <section className="panel center">
        <p>This game was played in a mode Natalia no longer offers.</p>
        {back}
      </section>
    );
  }

  const board = game.board.map(Number);
  const mine = same(game.playerX, player);
  const active = game.status === Status.Active;
  const myTurn = active && mine;
  const cheat = Number(game.lastCheat);
  const cheatCell = Number(game.lastCheatCell);
  const winLine = LINES.find((l) => board[l[0]] === 2 && l.every((c) => board[c] === 2));

  let headline;
  if (busy === "move") headline = "Natalia is considering…";
  else if (active) headline = mine ? "Your move." : "A game in progress.";
  else headline = mine ? "Natalia wins. As always." : "Natalia wins.";

  return (
    <section className="game">
      <div className="gameBar">
        {back}
        <span className="muted">Game {id.toString()}</span>
      </div>

      <h1 className="title">{headline}</h1>
      <p className="sides">
        <span className="side x">{mine ? "You" : "Player"} · X</span>
        <span className="side o">Natalia · O</span>
      </p>

      {/* key replays the fade-in each time Natalia pulls a new trick */}
      <p className={`note${cheat ? " show" : ""}`} key={Number(game.cheats)} role="status" aria-live="polite">
        {cheat ? CHEAT_MESSAGES[cheat](cheatCell) : " "}
      </p>

      <div className="board" role="grid" aria-label="Board">
        {board.map((v, i) => {
          const pending = pendingCell === i;
          const clickable = myTurn && v === 0 && busy === null;
          const classes = [
            "cell",
            winLine?.includes(i) && "win",
            cheat !== 0 && cheatCell === i && "cheated",
          ].filter(Boolean).join(" ");
          return (
            <button
              key={i}
              className={classes}
              disabled={!clickable}
              onClick={() => move(i)}
              aria-label={`Square ${i + 1}: ${NAMES[pending ? 1 : v]}`}
            >
              {pending ? <Mark value={1} faded /> : <Mark value={v} />}
            </button>
          );
        })}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="gameFoot">
        {lastTx ? (
          <a href={`${EXPLORER}/tx/${lastTx}`} target="_blank" rel="noreferrer">View your last move on Snowtrace</a>
        ) : (
          <span className="muted">
            {Number(game.cheats) > 0
              ? `Natalia has cheated ${game.cheats} ${Number(game.cheats) === 1 ? "time" : "times"} this game.`
              : "Natalia has not cheated yet."}
          </span>
        )}
      </div>

      {!active && (
        <div className="actions">
          {mine && (
            <button className="btn primary" disabled={busy !== null} onClick={again}>
              {busy === "again" ? "Setting the board…" : "Play again"}
            </button>
          )}
          <button className="btn ghost" onClick={() => onOpen(null)}>All games</button>
        </div>
      )}
    </section>
  );
}
