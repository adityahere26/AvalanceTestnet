"use client";

import { useCallback, useEffect, useState } from "react";
import { useGasless } from "../lib/useGasless";
import { EXPLORER, read, short } from "../lib/chain";
import Home from "../components/Home";
import GameView from "../components/GameView";

const REQUIRED_ENV = {
  NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
  NEXT_PUBLIC_SMOOTHSEND_API_KEY: process.env.NEXT_PUBLIC_SMOOTHSEND_API_KEY,
};

export default function Page() {
  const missing = Object.entries(REQUIRED_ENV).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return <Setup missing={missing} />;
  return <App />;
}

function App() {
  const { ready, authenticated, login, logout, player, send } = useGasless();
  const [gameId, setGameId] = useState(null);
  const [losses, setLosses] = useState(null);

  // Keep the open game in the URL (?game=3) so a game can be reopened or shared.
  useEffect(() => {
    const sync = () => {
      const g = new URLSearchParams(window.location.search).get("game");
      setGameId(g !== null && /^\d+$/.test(g) ? BigInt(g) : null);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const openGame = useCallback((id) => {
    window.history.pushState(null, "", id === null ? "/" : `/?game=${id}`);
    setGameId(id);
  }, []);

  const refreshRecord = useCallback(() => {
    if (player) read("riggedStats", [player]).then((s) => setLosses(Number(s[1]))).catch(() => {});
  }, [player]);
  useEffect(refreshRecord, [refreshRecord, gameId]);

  /** Starts a new game against Natalia and opens it. */
  const startGame = useCallback(async () => {
    await send("createRiggedGame");
    const mine = await read("getPlayerGames", [player]);
    openGame(mine[mine.length - 1]);
  }, [send, player, openGame]);

  return (
    <div className="shell">
      <header className="top">
        <button className="wordmark" onClick={() => openGame(null)}>Natalia</button>
        <div className="account">
          {!ready ? (
            <span className="muted">Loading</span>
          ) : !authenticated ? (
            <button className="btn ghost" onClick={login}>Sign in</button>
          ) : (
            <>
              {losses !== null && <span className="record" title="Your wins and losses against Natalia">Record 0–{losses}</span>}
              {player ? (
                <a className="addr" href={`${EXPLORER}/address/${player}`} target="_blank" rel="noreferrer">
                  {short(player)}
                </a>
              ) : (
                <span className="muted">Preparing your wallet</span>
              )}
              <button className="btn ghost small" onClick={logout}>Sign out</button>
            </>
          )}
        </div>
      </header>

      <main>
        {gameId === null ? (
          <Home player={player} authenticated={authenticated} login={login} startGame={startGame} onOpen={openGame} />
        ) : (
          <GameView
            id={gameId}
            player={player}
            send={send}
            startGame={startGame}
            onOpen={openGame}
            onFinished={refreshRecord}
          />
        )}
      </main>

      <footer>
        Every move is a transaction on Avalanche Fuji. Fees are covered, so you never need AVAX.
      </footer>
    </div>
  );
}

function Setup({ missing }) {
  return (
    <div className="shell">
      <main>
        <section className="panel">
          <h1 className="title">Almost ready</h1>
          <p>Add these to your <code>.env</code> file, then restart <code>npm run dev</code>:</p>
          <ul>
            {missing.map((k) => (
              <li key={k}><code>{k}</code></li>
            ))}
          </ul>
          <p className="muted">README.md explains where to get each value.</p>
        </section>
      </main>
    </div>
  );
}
