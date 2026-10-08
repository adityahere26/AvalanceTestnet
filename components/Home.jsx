"use client";

import { useCallback, useEffect, useState } from "react";
import { isRigged, read, same, short, Status } from "../lib/chain";

const TRICKS = [
  ["She steals", "If you are one move from winning, your square becomes hers."],
  ["She erases", "Now and then, one of your marks simply disappears."],
  ["She moves twice", "Sometimes she takes an extra turn, and you lose yours."],
  ["She refuses draws", "A full board always counts as her win."],
];

export default function Home({ player, authenticated, login, startGame, onOpen }) {
  const [games, setGames] = useState(null); // [{ id, game }], Natalia games only
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [ids, list] = await read("recentGames", [50n]);
      setGames(ids.map((id, i) => ({ id, game: list[i] })).filter(({ game }) => isRigged(game)));
    } catch (err) {
      setError(`Could not load games: ${err.shortMessage || err.message}`);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function begin() {
    if (!authenticated) return login();
    setStarting(true);
    setError("");
    try {
      await startGame();
    } catch (err) {
      setError(err.message);
      setStarting(false);
    }
  }

  const inProgress = (games || []).filter(({ game }) => game.status === Status.Active && same(game.playerX, player));
  const finished = (games || []).filter(({ game }) => game.status > Status.Active).slice(0, 6);

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Tic-tac-toe, reconsidered</p>
        <h1 className="display">You will not win.</h1>
        <p className="lede">
          Natalia plays fair until she doesn't. Every move is settled on-chain, so her cheating is on the record for
          anyone to verify.
        </p>
        <button className="btn primary" onClick={begin} disabled={starting || (authenticated && !player)}>
          {starting ? "Setting the board…" : authenticated ? "Begin a game" : "Sign in to play"}
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="tricks" aria-label="How Natalia cheats">
        {TRICKS.map(([title, text], i) => (
          <div className="trick" key={title}>
            <span className="trickNo">{String(i + 1).padStart(2, "0")}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </section>

      {inProgress.length > 0 && (
        <section className="panel">
          <h2 className="label">Unfinished</h2>
          <ul className="list">
            {inProgress.map(({ id }) => (
              <li key={id.toString()}>
                <span>Game {id.toString()}</span>
                <button className="link" onClick={() => onOpen(id)}>Resume</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {finished.length > 0 && (
        <section className="panel">
          <h2 className="label">Recent games</h2>
          <ul className="list">
            {finished.map(({ id, game }) => (
              <li key={id.toString()}>
                <span>
                  Game {id.toString()}
                  <span className="muted"> · {same(game.playerX, player) ? "you" : short(game.playerX)} lost
                    {Number(game.cheats) > 0 && `, ${game.cheats} ${Number(game.cheats) === 1 ? "trick" : "tricks"}`}
                  </span>
                </span>
                <button className="link" onClick={() => onOpen(id)}>View</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
