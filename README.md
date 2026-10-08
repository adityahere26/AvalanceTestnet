# Natalia

A game of tic-tac-toe you will not win. You play against **Natalia**, a computer that cheats in the open. **Every move is an on-chain transaction** on the Avalanche Fuji testnet, and **players never need AVAX**.

Live: https://natalia-game.vercel.app

- **Login:** Privy (email or Google). Every player gets an embedded wallet automatically.
- **Gas:** SmoothSend sponsors every transaction through ERC-4337 smart accounts. It's free on testnet.
- **Stack:** Next.js with no backend. The site is static and can be hosted on Vercel.

## How it works

1. The player logs in with Privy and gets an embedded wallet.
2. SmoothSend gives that wallet a smart account. The smart account's address is the player's identity on-chain; the contract sees it as `msg.sender`.
3. When the player clicks a square, the app:
   - simulates the move so errors like "not your turn" show instantly,
   - has the Privy wallet sign it,
   - sends it to SmoothSend, which pays the gas and puts it on-chain.
4. The board reads the contract every 2 seconds, so you see your opponent's moves. Reads are free.

## Game rules (enforced by `contracts/TicTacToe.sol`)

- **Creating and joining:** anyone can create a game; one other person can join it. X (the creator) moves first.
- **Moves:** the contract checks whose turn it is, that the square is empty, and whether someone has won or drawn.
- **Timeout:** if a player doesn't move for 5 minutes, their opponent can claim the win.
- **Cancelling:** the creator can cancel a game nobody has joined.
- **Stats:** wins, losses and draws are stored on-chain for each player.

### Single-player vs the computer

- **How it plays:** the contract itself is player O. After each of your moves, it replies in the same transaction, so every move is still one gasless transaction.
- **Strategy:** it wins if it can, otherwise blocks, then takes the centre, a corner, then a side. It's strong, but a fork beats it.
- **Stats:** solo results are stored separately in `soloStats` and don't affect two-player stats.

### Natalia's rules (the mode the app uses)

A single-player mode where the computer cheats in the open. The cheating happens in the contract, so it's provably rigged.

| Cheat | When |
|---|---|
| **Steal**: your winning X turns into an O | Every time you're about to win |
| **Double move**: the computer plays twice and you lose your turn | Randomly, about 1 in 3 turns |
| **Erase**: one of your X marks vanishes | Randomly, about 1 in 3 turns |
| **Technicality**: a full board counts as a computer win | Whenever the board fills |

- **Always ends:** every game finishes, because the computer gains at least one ○ per turn and never loses one.
- **Stats:** results go to `riggedStats` (wins always 0).
- **In the app:** the game screen describes each cheat and highlights the square it affected.

The app only offers this mode. The contract also still supports two-player games and a fair computer opponent (below), which the tests cover.

## Setup

### 1. Install and test

```bash
npm install
npm test
```

`npm test` runs the contract test suite on an in-memory chain. It covers two-player, solo and rigged games, including 40 rigged games against a smart player that the computer must win.

`npm run test:gasless` plays real games on Fuji through SmoothSend, using two brand-new wallets with 0 AVAX: one two-player game, one solo game and one rigged game. It needs `.env` to be filled in, and your SmoothSend key must allow the origin `http://localhost:3000` (override with `APP_ORIGIN=...`).

### 2. Get your keys (both free)

| Key | Where |
|---|---|
| `NEXT_PUBLIC_PRIVY_APP_ID` | [dashboard.privy.io](https://dashboard.privy.io): create an app and enable Email and Google login |
| `NEXT_PUBLIC_SMOOTHSEND_API_KEY` | [dashboard.smoothsend.xyz](https://dashboard.smoothsend.xyz): create a project, copy the `pk_…` key, and add `http://localhost:3000` (plus your live URL later) to its allowed origins |

### 3. Deploy the contract (one time only)

```bash
npm run wallet
```

This creates `.env` with a deployer wallet and prints its address. Fund that address with test AVAX: https://core.app/tools/testnet-faucet/?subnet=c&token=c

Next, paste your two keys into `.env`, then run:

```bash
npm run deploy
```

This deploys the contract and saves its address to `lib/deployment.json`. Commit and push that file so the live site uses the new contract. Only the deployer ever needs AVAX, and only for this one step.

### 4. Run it

```bash
npm run dev
```

Open http://localhost:3000. To play against yourself, open a second browser (or an incognito window) and log in with a different email.

### 5. Put it online (optional)

Push the project to GitHub and import it on [Vercel](https://vercel.com). Then add the three `NEXT_PUBLIC_*` variables in Vercel's project settings. Don't add `PRIVATE_KEY`.

In the Privy dashboard, add your Vercel domain to the allowed origins.

## Project layout

| Path | What it is |
|---|---|
| `contracts/TicTacToe.sol` | The game contract |
| `scripts/` | `compile.js`, `deploy.js`, `local-test.js` (contract tests), `gasless-test.js` (live Fuji test), `new-wallet.js` |
| `lib/abi.json` | Contract ABI, written by `npm run compile` |
| `lib/chain.js` | viem client, read helper, friendly error messages |
| `lib/useGasless.js` | Privy + SmoothSend hook: `player` address and a `send()` function |
| `app/` | Next.js layout, providers and page |
| `components/` | `Lobby` and `GameView` |

## Notes

- **`.npmrc` (`legacy-peer-deps`):** the SmoothSend SDK lists Aptos packages as peers, and this Avalanche-only app doesn't need them. The setting also makes Vercel's install work.
- **Move speed:** each move takes about 9 seconds on Fuji, because it goes through SmoothSend's bundler and then gets mined.
- **Mainnet costs:** on mainnet, SmoothSend charges your credits for each sponsored call. See their [billing docs](https://docs.smoothsend.xyz/billing).
