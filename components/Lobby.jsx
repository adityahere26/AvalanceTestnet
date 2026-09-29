"use client";

import { useCallback, useEffect, useState } from "react";
import { isSolo, read, same, short, Status } from "../lib/chain";

const STATUS_LABEL = ["Waiting for opponent", "In progress", "X won", "O won", "Draw", "Cancelled"];
const SOLO_LABEL = ["", "In progress", "Player won", "Computer won", "Draw", ""];
const label = (game) => (isSolo(game) ? `vs 🤖 · ${SOLO_LABEL[game.status]}` : STATUS_LABEL[game.status]);

export default function Lobby({ player, send, login, authenticated, onOpen }) {
  const [games, setGames] = useState(null); // [{ id, game }]
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [ids, list] = await read("recentGames", [50n]);
      setGames(ids.map((id, i) => ({ id, game: list[i] })));
    } catch (err) {
      setError(`Could not read games: ${err.shortMessage || err.message}`);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function create(solo = false) {
    if (!authenticated) return login();
    setBusy(solo ? "solo" : "create");
    setError("");
    try {
      await send(solo ? "createSoloGame" : "createGame");
      const mine = await read("getPlayerGames", [player]);
      onOpen(mine[mine.length - 1]);
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  }

  async function join(id) {
    if (!authenticated) return login();
    setBusy(id);
    setError("");
    try {
      await send("joinGame", [id]);
      onOpen(id);
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  }

  const isMine = ({ game }) => same(game.playerX, player) || same(game.playerO, player);
  const open = (games || []).filter(({ game }) => game.status === Status.Waiting && !same(game.playerX, player));
  const mine = (games || []).filter(
    (g) => isMine(g) && (g.game.status === Status.Waiting || g.game.status === Status.Active)
  );
  const recent = (games || []).filter(({ game }) => game.status >= Status.XWon && game.status !== Status.Cancelled).slice(0, 8);

  return (
    <>
      <section className="card hero">
        <div>
          <h1>Play Tic-Tac-Toe on Avalanche</h1>
          <p className="muted">
            Log in with email or Google. You get a wallet automatically, and every move is recorded on-chain for free.
          </p>
        </div>
        <div className="heroButtons">
          <button onClick={() => create(true)} disabled={busy !== null || (authenticated && !player)}>
            {busy === "solo" ? "Starting…" : <><span className="icon">🤖</span>Play vs computer</>}
          </button>
          <button className="ghost" onClick={() => create(false)} disabled={busy !== null || (authenticated && !player)}>
            {busy === "create" ? "Creating on-chain…" : <><span className="icon">👥</span>Play a friend</>}
          </button>
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      {mine.length > 0 && (
        <section className="card">
          <h2>Your games</h2>
          <ul className="games">
            {mine.map(({ id, game }) => (
              <li key={id.toString()}>
                <span>
                  <b>Game #{id.toString()}</b> <span className="muted">· {label(game)}</span>
                </span>
                <button className="ghost" onClick={() => onOpen(id)}>Open</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Open games</h2>
        {games === null ? (
          <p className="muted">Loading…</p>
        ) : open.length === 0 ? (
          <p className="muted">No one is waiting right now. Create a game and share the link with a friend.</p>
        ) : (
          <ul className="games">
            {open.map(({ id, game }) => (
              <li key={id.toString()}>
                <span>
                  <b>Game #{id.toString()}</b> <span className="muted">· created by {short(game.playerX)}</span>
                </span>
                <button onClick={() => join(id)} disabled={busy !== null || (authenticated && !player)}>
                  {busy === id ? "Joining…" : "Join"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {recent.length > 0 && (
        <section className="card">
          <h2>Recently finished</h2>
          <ul className="games">
            {recent.map(({ id, game }) => (
              <li key={id.toString()}>
                <span>
                  <b>Game #{id.toString()}</b> <span className="muted">· {label(game)}</span>
                </span>
                <button className="ghost" onClick={() => onOpen(id)}>View</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
