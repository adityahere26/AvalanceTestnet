"use client";

import { useCallback, useEffect, useState } from "react";
import { useGasless } from "../lib/useGasless";
import { EXPLORER, read, short } from "../lib/chain";
import Lobby from "../components/Lobby";
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
  const [stats, setStats] = useState(null);

  // Keep the open game in the URL (?game=3) so invite links work.
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

  const refreshStats = useCallback(() => {
    if (player)
      Promise.all([read("stats", [player]), read("soloStats", [player]), read("riggedStats", [player])])
        .then(([pvp, solo, rigged]) => setStats({ pvp, solo, rigged }))
        .catch(() => {});
  }, [player]);
  useEffect(refreshStats, [refreshStats, gameId]);

  return (
    <main>
      <header className="top">
        <button className="brand" onClick={() => openGame(null)}>
          <span className="logo">✕○</span> Gasless Tic-Tac-Toe
        </button>
        <div className="account">
          {!ready ? (
            <span className="muted">Loading…</span>
          ) : !authenticated ? (
            <button onClick={login}>Log in to play</button>
          ) : (
            <>
              {stats && (
                <span className="stats" title="Wins-losses-draws vs friends and vs the computer; losses vs the cheater">
                  👥 {stats.pvp[0]}-{stats.pvp[1]}-{stats.pvp[2]} · 🤖 {stats.solo[0]}-{stats.solo[1]}-{stats.solo[2]} · 😈 {stats.rigged[1]}L
                </span>
              )}
              {player ? (
                <a className="mono" href={`${EXPLORER}/address/${player}`} target="_blank" rel="noreferrer">
                  {short(player)}
                </a>
              ) : (
                <span className="muted">Setting up wallet…</span>
              )}
              <button className="ghost" onClick={logout}>Log out</button>
            </>
          )}
        </div>
      </header>

      {gameId === null ? (
        <Lobby player={player} send={send} login={login} authenticated={authenticated} onOpen={openGame} />
      ) : (
        <GameView
          id={gameId}
          player={player}
          send={send}
          login={login}
          authenticated={authenticated}
          onOpen={openGame}
          onFinished={refreshStats}
        />
      )}

      <footer className="muted">
        Every move is an on-chain transaction on Avalanche Fuji. Gas is sponsored by SmoothSend, so you never need AVAX.
      </footer>
    </main>
  );
}

function Setup({ missing }) {
  return (
    <main>
      <div className="card">
        <h1>Almost ready</h1>
        <p>Add these to your <code>.env</code> file, then restart <code>npm run dev</code>:</p>
        <ul>
          {missing.map((k) => (
            <li key={k}><code>{k}</code></li>
          ))}
        </ul>
        <p className="muted">See README.md for where to get each value.</p>
      </div>
    </main>
  );
}
